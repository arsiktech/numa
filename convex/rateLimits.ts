import { v, ConvexError } from "convex/values";
import { rateLimitExpiresAt } from "./lib/privacyRetention";
import { mutation, query } from "./_generated/server";

declare const process: {
  env: Record<string, string | undefined>;
};

function requireServerSecret(provided: string) {
  const expected =
    process.env.NUMA_RATE_LIMIT_INTERNAL_SECRET ??
    process.env.NUMA_PUSH_INTERNAL_SECRET;
  if (!expected || provided !== expected) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
}

function bucketKey(route: string, identityHash: string, windowStart: number) {
  return `${route}:${identityHash}:${windowStart}`;
}

export const consume = mutation({
  args: {
    serverSecret: v.string(),
    route: v.string(),
    identityHash: v.string(),
    limit: v.number(),
    windowMs: v.number(),
    now: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (!args.route || args.route.length > 120 || !args.identityHash || args.identityHash.length > 128) {
      throw new ConvexError({ code: "INVALID_RATE_LIMIT", message: "Rate-limit identity and route must be bounded" });
    }
    if (!Number.isFinite(args.limit) || args.limit <= 0) {
      throw new ConvexError({ code: "INVALID_RATE_LIMIT", message: "limit must be positive" });
    }
    if (!Number.isFinite(args.windowMs) || args.windowMs < 1000) {
      throw new ConvexError({ code: "INVALID_RATE_LIMIT", message: "windowMs must be at least 1000" });
    }

    const now = args.now ?? Date.now();
    const windowStart = Math.floor(now / args.windowMs) * args.windowMs;
    const key = bucketKey(args.route, args.identityHash, windowStart);
    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!existing) {
      await ctx.db.insert("rateLimitBuckets", {
        key,
        route: args.route,
        identityHash: args.identityHash,
        windowStart,
        windowMs: args.windowMs,
        limit: args.limit,
        count: 1,
        updatedAt: now,
        expiresAt: rateLimitExpiresAt(windowStart, args.windowMs)
      });
      return {
        allowed: true,
        remaining: Math.max(0, args.limit - 1),
        resetAt: windowStart + args.windowMs
      };
    }

    if (existing.count >= existing.limit) {
      await ctx.db.patch(existing._id, { updatedAt: now });
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.windowStart + existing.windowMs
      };
    }

    const count = existing.count + 1;
    await ctx.db.patch(existing._id, {
      count,
      limit: args.limit,
      windowMs: args.windowMs,
      ...(existing.expiresAt !== undefined ? {
        expiresAt: Math.max(existing.expiresAt, rateLimitExpiresAt(existing.windowStart, args.windowMs))
      } : {}),
      updatedAt: now
    });
    return {
      allowed: true,
      remaining: Math.max(0, args.limit - count),
      resetAt: existing.windowStart + existing.windowMs
    };
  }
});

export const preview = query({
  args: {
    serverSecret: v.string(),
    route: v.string(),
    identityHash: v.string(),
    windowMs: v.number(),
    now: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const now = args.now ?? Date.now();
    const windowStart = Math.floor(now / args.windowMs) * args.windowMs;
    const key = bucketKey(args.route, args.identityHash, windowStart);
    const bucket = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return bucket ?? null;
  }
});
