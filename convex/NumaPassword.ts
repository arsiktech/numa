import {
  ConvexCredentials,
  type ConvexCredentialsUserConfig
} from "@convex-dev/auth/providers/ConvexCredentials";
import type { PasswordConfig } from "@convex-dev/auth/providers/Password";
import {
  type GenericActionCtxWithAuthConfig,
  type GenericDoc,
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
  signInViaProvider
} from "@convex-dev/auth/server";
import type {
  DocumentByName,
  GenericDataModel,
  WithoutSystemFields
} from "convex/server";
import type { Value } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import { hashAuthEmail } from "./lib/authEmailRateLimit";

const RESET_RESPONSE_FLOOR_MS = 2_000;

export function passwordResetDelayMs(
  startedAt: number,
  now: number,
  floorMs = RESET_RESPONSE_FLOOR_MS
) {
  return Math.max(0, floorMs - (now - startedAt));
}

async function finishResetFloor(startedAt: number) {
  const delay = passwordResetDelayMs(startedAt, Date.now());
  if (delay > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Convex Auth's stock Password provider retrieves the account before its
 * reset sender runs. That makes unknown emails observable and lets them skip
 * the sender's limiter. This compatible provider changes only reset
 * initiation: it consumes the limiter first and normalizes known, unknown,
 * limited, and delivery-failure outcomes to the same non-signing response.
 */
export function NumaPassword<DataModel extends GenericDataModel>(
  config: PasswordConfig<DataModel> = {}
) {
  const provider = config.id ?? "password";
  return ConvexCredentials<DataModel>({
    id: "password",
    authorize: async (params, ctx) => {
      const flow = params.flow as string;
      const passwordToValidate = flow === "signUp"
        ? params.password as string
        : flow === "reset-verification"
          ? params.newPassword as string
          : null;
      if (passwordToValidate !== null) {
        if (config.validatePasswordRequirements) {
          config.validatePasswordRequirements(passwordToValidate);
        } else {
          validateDefaultPasswordRequirements(passwordToValidate);
        }
      }
      const profile = config.profile?.(params, ctx) ?? defaultProfile(params);
      const { email } = profile;
      const secret = params.password as string;
      let account: GenericDoc<DataModel, "authAccounts">;
      let user: GenericDoc<DataModel, "users">;

      if (flow === "signUp") {
        if (secret === undefined) throw new Error("Missing password for sign up");
        const created = await createAccount(ctx, {
          provider,
          account: { id: email, secret },
          profile: profile as unknown as WithoutSystemFields<DocumentByName<DataModel, "users">>,
          shouldLinkViaEmail: config.verify !== undefined,
          shouldLinkViaPhone: false
        });
        ({ account, user } = created);
      } else if (flow === "signIn") {
        if (secret === undefined) throw new Error("Missing password for sign in");
        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email, secret }
        });
        if (retrieved === null) throw new Error("Invalid credentials");
        ({ account, user } = retrieved);
      } else if (flow === "reset") {
        return await requestEnumerationSafeReset(ctx, config, provider, email, params);
      } else if (flow === "reset-verification") {
        if (!config.reset) throw new Error(`Password reset is not enabled for ${provider}`);
        if (params.newPassword === undefined) {
          throw new Error("Missing new password for reset verification");
        }
        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email }
        });
        if (!retrieved) throw new Error("Invalid code");
        const result = await signInViaProvider(ctx, config.reset, { params });
        if (result === null || retrieved.account.userId !== result.userId) {
          throw new Error("Invalid code");
        }
        const resetSecret = params.newPassword as string;
        await modifyAccountCredentials(ctx, {
          provider,
          account: { id: email, secret: resetSecret }
        });
        await invalidateSessions(ctx, {
          userId: result.userId,
          except: [result.sessionId]
        });
        return result;
      } else if (flow === "email-verification") {
        if (!config.verify) throw new Error(`Email verification is not enabled for ${provider}`);
        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email }
        });
        if (!retrieved) throw new Error("Invalid code");
        return await signInViaProvider(ctx, config.verify, {
          accountId: retrieved.account._id,
          params
        });
      } else {
        throw new Error("Missing or invalid password flow");
      }

      if (config.verify && !account.emailVerified) {
        return await signInViaProvider(ctx, config.verify, {
          accountId: account._id,
          params
        });
      }
      return { userId: user._id };
    },
    crypto: defaultPasswordCrypto,
    extraProviders: [config.reset, config.verify],
    ...config
  });
}

async function requestEnumerationSafeReset<DataModel extends GenericDataModel>(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  config: PasswordConfig<DataModel>,
  provider: string,
  email: string,
  params: Record<string, Value | undefined>
) {
  const startedAt = Date.now();
  if (!config.reset) {
    await finishResetFloor(startedAt);
    return null;
  }
  return await runEnumerationSafeReset({
    consume: async () => {
      // Deliberately before retrieveAccount. Unknown addresses consume the
      // same per-identity and deployment budget as known ones.
      await ctx.runMutation(internal.authEmailRateLimits.consume, {
        kind: "password-reset",
        identityHash: await hashAuthEmail(email)
      });
    },
    lookup: async () => await retrieveAccount(ctx, {
      provider,
      account: { id: email }
    }),
    send: async (retrieved) => {
      await signInViaProvider(ctx, config.reset!, {
        accountId: retrieved.account._id,
        params
      });
    },
    finish: async () => await finishResetFloor(startedAt)
  });
}

export async function runEnumerationSafeReset<T>({
  consume,
  lookup,
  send,
  finish
}: {
  consume: () => Promise<void>;
  lookup: () => Promise<T | null>;
  send: (account: T) => Promise<void>;
  finish: () => Promise<void>;
}) {
  try {
    await consume();
  } catch {
    await finish();
    return null;
  }
  try {
    const account = await lookup();
    if (account) await send(account);
  } catch {
    // Known, unknown, and delivery failures intentionally converge.
  }
  await finish();
  return null;
}

const defaultPasswordCrypto: ConvexCredentialsUserConfig["crypto"] = {
  async hashSecret(password: string) {
    return await new Scrypt().hash(password);
  },
  async verifySecret(password: string, hash: string) {
    return await new Scrypt().verify(hash, password);
  }
};

function validateDefaultPasswordRequirements(password: string) {
  if (!password || password.length < 8) throw new Error("Invalid password");
}

function defaultProfile(params: Record<string, unknown>) {
  return { email: params.email as string };
}
