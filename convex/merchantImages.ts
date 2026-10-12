import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/access";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Shared cache of AI-generated merchant studio shots (transparent PNGs in
 * Convex file storage). The generation pipeline lives in
 * `/api/merchant-image` (auth + rate limits + provider call); this module is
 * only the cache: hash-keyed rows pointing at storage.
 *
 * Write path is server-to-server ONLY — every mutation takes the shared
 * `NUMA_PUSH_INTERNAL_SECRET` bearer (same posture as push fanout and webhook
 * ingest), so no browser can mint storage uploads or poison the cache.
 * Read path is any signed-in user: the images are generic product art shared
 * across accounts by design (that's what "never pay twice" means); keys are
 * normalized merchant labels, never amounts, dates, or account data.
 */

function assertInternalCaller(secret: string | undefined): void {
  const expected = process.env.NUMA_PUSH_INTERNAL_SECRET ?? "";
  if (!expected) {
    throw new ConvexError({
      code: "MISCONFIGURED",
      message: "NUMA_PUSH_INTERNAL_SECRET is not set on the Convex deployment"
    });
  }
  if (!secret || secret !== expected) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Bad internal secret" });
  }
}

/** Server-to-server: look up one cached render (URL) by key. */
export const lookup = query({
  args: { internalSecret: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    const row = await ctx.db
      .query("merchantImages")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!row) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    return url ? { key: row.key, url } : null;
  }
});

/** Server-to-server: mint a short-lived upload URL for a freshly generated PNG. */
export const uploadUrl = mutation({
  args: { internalSecret: v.string() },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    return await ctx.storage.generateUploadUrl();
  }
});

/** Server-to-server: record the finished render. Last write wins per key. */
export const save = mutation({
  args: {
    internalSecret: v.string(),
    key: v.string(),
    storageId: v.id("_storage"),
    prompt: v.string(),
    model: v.string()
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    const existing = await ctx.db
      .query("merchantImages")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      // A concurrent generation won the race — keep the first render and drop
      // the duplicate file so storage never accumulates orphans.
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      return existing._id;
    }
    return await ctx.db.insert("merchantImages", {
      key: args.key,
      storageId: args.storageId,
      prompt: args.prompt,
      model: args.model,
      createdAt: Date.now()
    });
  }
});

/**
 * Client read: resolve cached render URLs for a batch of keys. Only returns
 * hits — the client falls back to the hand-drawn still-life for misses.
 */
export const urlsForKeys = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const keys = [...new Set(args.keys)].slice(0, 120);
    const out: Array<{ key: string; url: string }> = [];
    for (const key of keys) {
      const row = await ctx.db
        .query("merchantImages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!row) continue;
      const url = await ctx.storage.getUrl(row.storageId);
      if (url) out.push({ key, url });
    }
    return out;
  }
});
