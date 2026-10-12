import { ConvexError, v } from "convex/values";
import { rateLimitExpiresAt } from "./lib/privacyRetention";
import { internalMutation } from "./_generated/server";
import {
  AUTH_EMAIL_RATE_LIMIT,
  AUTH_EMAIL_GLOBAL_RATE_LIMIT,
  AUTH_EMAIL_RATE_WINDOW_MS,
  authEmailLimitExceeded,
  type AuthEmailKind
} from "./lib/authEmailRateLimit";

function bucketKey(kind: AuthEmailKind, identityHash: string, windowStart: number) {
  return `auth-email:${kind}:${identityHash}:${windowStart}`;
}

function globalBucketKey(windowStart: number) {
  return `auth-email:global:${windowStart}`;
}

export const consume = internalMutation({
  args: {
    kind: v.union(v.literal("verification"), v.literal("password-reset")),
    identityHash: v.string()
  },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.identityHash)) throw new ConvexError("Invalid email identity hash");
    const now = Date.now();
    const windowStart = Math.floor(now / AUTH_EMAIL_RATE_WINDOW_MS) * AUTH_EMAIL_RATE_WINDOW_MS;
    const key = bucketKey(args.kind, args.identityHash, windowStart);
    const globalKey = globalBucketKey(windowStart);
    const [existing, globalExisting] = await Promise.all([
      ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
      ctx.db
        .query("rateLimitBuckets")
        .withIndex("by_key", (q) => q.eq("key", globalKey))
        .unique()
    ]);

    if (
      (existing && authEmailLimitExceeded(existing.count, AUTH_EMAIL_RATE_LIMIT)) ||
      (globalExisting && authEmailLimitExceeded(globalExisting.count, AUTH_EMAIL_GLOBAL_RATE_LIMIT))
    ) {
      throw new ConvexError({
        code: "AUTH_EMAIL_RATE_LIMITED",
        message: "Too many email requests. Wait 15 minutes before trying again."
      });
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        updatedAt: now
      });
    } else {
      await ctx.db.insert("rateLimitBuckets", {
        key,
        route: `auth-email:${args.kind}`,
        identityHash: args.identityHash,
        windowStart,
        windowMs: AUTH_EMAIL_RATE_WINDOW_MS,
        limit: AUTH_EMAIL_RATE_LIMIT,
        count: 1,
        expiresAt: rateLimitExpiresAt(windowStart, AUTH_EMAIL_RATE_WINDOW_MS),
        updatedAt: now
      });
    }

    if (globalExisting) {
      await ctx.db.patch(globalExisting._id, {
        count: globalExisting.count + 1,
        updatedAt: now
      });
    } else {
      await ctx.db.insert("rateLimitBuckets", {
        key: globalKey,
        route: "auth-email:global",
        identityHash: "deployment",
        windowStart,
        windowMs: AUTH_EMAIL_RATE_WINDOW_MS,
        limit: AUTH_EMAIL_GLOBAL_RATE_LIMIT,
        count: 1,
        expiresAt: rateLimitExpiresAt(windowStart, AUTH_EMAIL_RATE_WINDOW_MS),
        updatedAt: now
      });
    }
  }
});
