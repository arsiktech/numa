import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type AnyCtx = QueryCtx | MutationCtx;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function verifiedIdentityEmail(identity: {
  email?: string;
  emailVerified?: boolean;
}): string {
  const email = typeof identity.email === "string" ? normalizeEmail(identity.email) : "";
  if (!email) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Verified email is required"
    });
  }
  if (identity.emailVerified !== true) {
    throw new ConvexError({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before opening Numa Pro on iOS"
    });
  }
  return email;
}

async function uniqueUserByEmail(ctx: AnyCtx, email: string): Promise<Doc<"users"> | null> {
  const matches = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .collect();
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  const verified = matches.filter((user) => user.emailVerificationTime !== undefined);
  if (verified.length === 1) return verified[0]!;
  throw new ConvexError({
    code: "AMBIGUOUS_EMAIL",
    message: "Multiple Numa Pro users share this email"
  });
}

/** An unexpired bearer is not proof that its account still exists. Reading
 * the durable deletion marker in the same mutation also makes writes conflict
 * with the first destructive chunk, so no new owned data can appear mid-drain. */
export async function assertExistingAccount(
  ctx: AnyCtx,
  userId: Id<"users">,
  options: { allowDeletionStarted?: boolean } = {}
): Promise<void> {
  if (!await ctx.db.get(userId)) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Account no longer exists. Sign in again." });
  }
  if (!options.allowDeletionStarted) {
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (profile?.deletionStartedAt !== undefined) {
      throw new ConvexError({ code: "ACCOUNT_DELETION_STARTED", message: "Account deletion has started. New account activity is unavailable." });
    }
  }
}

/**
 * Returns the authed userId, throws ConvexError("UNAUTHENTICATED") if anonymous.
 * Supports Convex Auth sessions first, then any explicitly configured external
 * OIDC provider linked by verified email.
 */
export async function requireUser(ctx: AnyCtx, options: { allowDeletionStarted?: boolean } = {}): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId) { await assertExistingAccount(ctx, userId, options); return userId; }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
  }
  const email = verifiedIdentityEmail(identity);
  const linkedUser = await uniqueUserByEmail(ctx, email);
  if (!linkedUser) {
    throw new ConvexError({
      code: "USER_NOT_INITIALISED",
      message: "Open Numa Pro once to initialise your account"
    });
  }
  await assertExistingAccount(ctx, linkedUser._id, options);
  return linkedUser._id;
}

/**
 * Mutation-only variant that can create/link the Numa user row for a verified
 * external OIDC identity. Query functions should use requireUser.
 */
export async function ensureUser(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId) { await assertExistingAccount(ctx, userId); return userId; }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
  }
  const email = verifiedIdentityEmail(identity);
  const existing = await uniqueUserByEmail(ctx, email);
  if (existing) {
    await assertExistingAccount(ctx, existing._id);
    const patch: Partial<Doc<"users">> = {};
    if (existing.emailVerificationTime === undefined) {
      patch.emailVerificationTime = Date.now();
    }
    if (!existing.name && typeof identity.name === "string") {
      patch.name = identity.name;
    }
    if (!existing.image && typeof identity.pictureUrl === "string") {
      patch.image = identity.pictureUrl;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }
    return existing._id;
  }

  return await ctx.db.insert("users", {
    email,
    emailVerificationTime: Date.now(),
    name:
      typeof identity.name === "string" && identity.name.trim()
        ? identity.name.trim()
        : email.split("@")[0]!,
    image: typeof identity.pictureUrl === "string" ? identity.pictureUrl : undefined
  });
}

export interface MembershipAccess {
  userId: Id<"users">;
  membership: Doc<"memberships">;
  role: "owner" | "editor" | "viewer";
}

/**
 * Throws if the authed user is not a member of `portfolioId`.
 * Returns the membership document and resolved role.
 */
export async function requireMember(
  ctx: AnyCtx,
  portfolioId: Id<"portfolios">
): Promise<MembershipAccess> {
  const userId = await requireUser(ctx);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("portfolioId"), portfolioId))
    .unique();
  if (!membership) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Not a member of this portfolio"
    });
  }
  return { userId, membership, role: membership.role };
}

/**
 * Throws unless the authed user is an editor or owner of `portfolioId`.
 */
export async function requireEditor(
  ctx: AnyCtx,
  portfolioId: Id<"portfolios">
): Promise<MembershipAccess> {
  const access = await requireMember(ctx, portfolioId);
  if (access.role !== "owner" && access.role !== "editor") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Editor or owner role required"
    });
  }
  return access;
}

/**
 * Throws unless the authed user is the owner of `portfolioId`.
 */
export async function requireOwner(
  ctx: AnyCtx,
  portfolioId: Id<"portfolios">
): Promise<MembershipAccess> {
  const access = await requireMember(ctx, portfolioId);
  if (access.role !== "owner") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Owner role required"
    });
  }
  return access;
}
