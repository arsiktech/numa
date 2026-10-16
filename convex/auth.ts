import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import Apple from "@auth/core/providers/apple";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { APPLE_KEYS_URL, verifyAppleIdentityToken, type AppleJwk } from "./lib/appleIdentity";
import { allowedRedirect } from "./lib/authRedirect";
import { assertPasswordPolicy } from "./lib/passwordPolicy";
import { assertExistingAccount } from "./lib/access";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";
import { ResendOTPVerify } from "./ResendOTPVerify";
import { NumaPassword } from "./NumaPassword";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Convex's bundled type lib doesn't include the Node `process` global by
// default — declare the minimal shape we need so this file compiles under
// the app's `tsc -b` pass.
declare const process: {
  env: Record<string, string | undefined>;
};

// OAuth providers are only enabled when their env credentials are present —
// Convex Auth wraps them at runtime, but if AUTH_GOOGLE_ID is missing the
// sign-in URL just 500s. By filtering by env, we keep dev/CI green even when
// only Password is configured.
const providers = [
  NumaPassword({
    // Email-code password reset is enabled only when a Resend key is present
    // (same env-gating pattern as the OAuth providers below). The client asks
    // authConfig.flags whether to show "Forgot password?".
    ...(process.env.AUTH_RESEND_KEY ? { reset: ResendOTPPasswordReset } : {}),
    // Sign-up email verification, gated the same way. With `verify` set,
    // signUp (and signIn against an unverified account) emails an OTP and the
    // client signIn promise resolves { signingIn: false } until the user
    // confirms with flow "email-verification".
    ...(process.env.AUTH_RESEND_KEY ? { verify: ResendOTPVerify } : {}),
    profile(params) {
      const email = normalizeEmail(params.email) ?? "";
      const name = (params.name as string | undefined) ?? email;
      if (params.flow === "signUp") {
        assertPasswordPolicy(params.password as string, {
          email,
          displayName: name
        });
      } else if (params.flow === "reset-verification") {
        assertPasswordPolicy(params.newPassword as string, {
          email
        });
      }
      return {
        email,
        name
      };
    }
  })
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    // @ts-expect-error — provider unions differ slightly; convexAuth accepts mixed
    Google({
      // Slim the profile to what we actually use; everything else is just bloat
      // we'd be storing in the `users` table.
      profile(profile: { sub: string; email: string; name?: string; picture?: string }) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name ?? profile.email
        };
      }
    })
  );
}

if (
  process.env.AUTH_APPLE_ID &&
  process.env.AUTH_APPLE_SECRET
) {
  providers.push(
    // @ts-expect-error — same union mismatch
    Apple({
      // Apple's profile callback receives the parsed id_token. Apple only sends
      // the name on the FIRST sign-in (and only when the user keeps it); after
      // that we have to fall back to email-derived name. Apple also omits a
      // picture URL entirely — there will never be an avatar from Apple auth.
      profile(profile: { sub: string; email?: string; name?: string }) {
        const email = profile.email ?? `${profile.sub}@privaterelay.appleid.com`;
        return {
          id: profile.sub,
          email,
          name: profile.name ?? email.split("@")[0]!
        };
      }
    })
  );
}

/**
 * Apple issues sign-in tokens for the iPhone app's bundle ID, and for the web's Services ID when
 * someone signs in on numaworth.com. Both belong to the same team, so Apple gives a person the same
 * `sub` in both and they reach the same account.
 */
const APPLE_AUDIENCES = ["com.arsiktech.numa", "com.arsiktech.numa.web"];
let appleKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function appleSigningKeys(refresh: boolean): Promise<AppleJwk[]> {
  if (!refresh && appleKeys && Date.now() - appleKeys.fetchedAt < 60 * 60 * 1000) return appleKeys.keys;
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error("Apple sign-in is unavailable right now. Try again.");
  const body = (await res.json()) as { keys?: AppleJwk[] };
  appleKeys = { keys: Array.isArray(body.keys) ? body.keys : [], fetchedAt: Date.now() };
  return appleKeys.keys;
}

// Sign in with Apple from the iPhone app's own sheet, or Apple's popup on the web. Either sends Apple's identity token and
// the one-time nonce it hashed into it; nothing here needs an Apple secret key.
providers.push(
  ConvexCredentials({
    id: "apple-native",
    authorize: async (credentials, ctx) => {
      const token = typeof credentials.identityToken === "string" ? credentials.identityToken : "";
      const nonce = typeof credentials.nonce === "string" ? credentials.nonce : "";
      if (!token || !nonce || token.length > 8_000 || nonce.length > 200) return null;
      const verify = async (refresh: boolean) =>
        verifyAppleIdentityToken(token, { audience: APPLE_AUDIENCES, nonce, keys: await appleSigningKeys(refresh), now: Date.now() });
      // Apple rotates its keys; fetch them again once if the token names one we haven't seen.
      const identity = await verify(false).catch((error: Error) => (error.message === "unknown key" ? verify(true) : Promise.reject(error)));
      const given = typeof credentials.name === "string" ? credentials.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      const email = identity.email ?? undefined;
      const { user } = await createAccount(ctx, {
        provider: "apple-native",
        account: { id: identity.sub },
        profile: {
          ...(email ? { email } : null),
          name: given || (email ? email.split("@")[0] : "Apple user"),
          // Read by createOrUpdateUser: only a verified, non-relay address links to an existing account.
          ...({ emailVerified: identity.emailVerified } as object),
        },
        shouldLinkViaEmail: identity.emailVerified && !identity.privateEmail,
      });
      return { userId: user._id };
    },
  })
);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    async beforeSessionCreation(ctx, { userId }) {
      await assertExistingAccount(ctx, userId);
    },
    // The phone apps sign in through the system browser sheet, which hands
    // their own URL scheme back to the app; web lands on the site or a Pages
    // preview. See lib/authRedirect.ts.
    async redirect({ redirectTo }) {
      return allowedRedirect(redirectTo, process.env.SITE_URL ?? "");
    },
    async createOrUpdateUser(ctx, args) {
      const signedInUserId = await getAuthUserId(ctx);
      if (signedInUserId) await assertExistingAccount(ctx, signedInUserId);
      const email = normalizeEmail(args.profile.email);
      const name = typeof args.profile.name === "string" ? args.profile.name : undefined;
      const image = typeof args.profile.image === "string" ? args.profile.image : undefined;
      const dangerousEmailLinking =
        (args.provider as { allowDangerousEmailAccountLinking?: boolean })
          .allowDangerousEmailAccountLinking;
      const emailVerified =
        args.profile.emailVerified ??
        ((args.type === "oauth" || args.provider.type === "oidc") &&
          dangerousEmailLinking !== false);

      if (
        signedInUserId &&
        args.existingUserId &&
        signedInUserId !== args.existingUserId
      ) {
        throw new Error("This provider is already linked to another Numa Pro account.");
      }

      if (args.existingUserId) {
        await assertExistingAccount(ctx, args.existingUserId);
        const linkedVerifiedUserId =
          args.type === "credentials" && email
            ? await safeVerifiedUserRelinkTarget(ctx, args.existingUserId, email)
            : null;
        if (linkedVerifiedUserId) {
          await assertExistingAccount(ctx, linkedVerifiedUserId);
          await ctx.db.patch(linkedVerifiedUserId, {
            ...(email ? { email } : null),
            ...(name ? { name } : null),
            ...(image ? { image } : null),
            ...(emailVerified && email ? { emailVerificationTime: Date.now() } : null)
          });
          return linkedVerifiedUserId;
        }
        await ctx.db.patch(args.existingUserId, {
          ...(email ? { email } : null),
          ...(name ? { name } : null),
          ...(image ? { image } : null),
          ...(emailVerified && email ? { emailVerificationTime: Date.now() } : null)
        });
        return args.existingUserId;
      }

      if (signedInUserId && args.type === "oauth") {
        const currentUser = await ctx.db.get(signedInUserId);
        const currentEmail = normalizeEmail(currentUser?.email);
        if (currentEmail && email && currentEmail !== email) {
          throw new Error("Use the same email address as this Numa Pro account.");
        }
        await ctx.db.patch(signedInUserId, {
          ...(email ? { email } : null),
          ...(name ? { name } : null),
          ...(image ? { image } : null),
          ...(emailVerified && email ? { emailVerificationTime: Date.now() } : null)
        });
        return signedInUserId;
      }

      const existingUserId =
        email && (args.shouldLink || emailVerified || args.type === "email")
          ? await uniqueVerifiedUserIdByEmail(ctx, email)
          : null;
      if (existingUserId) {
        await assertExistingAccount(ctx, existingUserId);
        await ctx.db.patch(existingUserId, {
          ...(name ? { name } : null),
          ...(image ? { image } : null),
          ...(emailVerified && email ? { emailVerificationTime: Date.now() } : null)
        });
        return existingUserId;
      }

      return await ctx.db.insert("users", {
        ...(email ? { email } : null),
        ...(name ? { name } : null),
        ...(image ? { image } : null),
        ...(emailVerified && email ? { emailVerificationTime: Date.now() } : null)
      });
    }
  }
});

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : undefined;
}

async function uniqueVerifiedUserIdByEmail(
  ctx: QueryCtx,
  email: string
): Promise<Id<"users"> | null> {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
    .take(2);
  return users.length === 1 ? users[0]!._id : null;
}

async function safeVerifiedUserRelinkTarget(
  ctx: QueryCtx,
  existingUserId: Id<"users">,
  email: string
) {
  const existingUser = await ctx.db.get(existingUserId);
  if (!existingUser || existingUser.emailVerificationTime) return null;

  const verifiedUserId = await uniqueVerifiedUserIdByEmail(ctx, email);
  if (!verifiedUserId || verifiedUserId === existingUserId) return null;

  if (await userHasProductLinks(ctx, existingUserId)) return null;
  return verifiedUserId;
}

async function userHasProductLinks(ctx: QueryCtx, userId: Id<"users">) {
  const [ownedPortfolio, portfolioMembership, ownedPod, linkedPodMember] =
    await Promise.all([
      ctx.db
        .query("portfolios")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .first(),
      ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("moneyPods")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
        .first(),
      ctx.db
        .query("podMembers")
        .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
        .first()
    ]);
  return Boolean(ownedPortfolio || portfolioMembership || ownedPod || linkedPodMember);
}
