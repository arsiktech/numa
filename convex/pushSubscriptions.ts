import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/access";

// Convex's bundled type lib doesn't include the Node `process` global by
// default — declare the minimal shape we need so this file compiles cleanly
// under both the Convex toolchain and the app's `tsc -b` pass.
declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Shared secret used by /api/push-send (and only it) to read other users'
 * subscriptions and prune dead ones. Set on the Convex deployment as
 * `NUMA_PUSH_INTERNAL_SECRET`. Matches the same env var on Vercel.
 *
 * We deliberately do NOT use `internalQuery` / `internalMutation` here —
 * those require admin auth on the calling client, which means juggling
 * Convex deploy keys in Vercel. A shared bearer is just as safe (the
 * function is never called from a browser), with much simpler ops.
 */
function assertInternalCaller(token: string | undefined): void {
  const expected = process.env.NUMA_PUSH_INTERNAL_SECRET ?? "";
  if (!expected) {
    throw new ConvexError({
      code: "MISCONFIGURED",
      message: "NUMA_PUSH_INTERNAL_SECRET is not set on the Convex deployment"
    });
  }
  if (!token || token !== expected) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Bad token" });
  }
}

/**
 * Upsert a Web Push subscription for the current user, deduped by endpoint.
 *
 * Endpoint is the natural unique key — every browser/device generates a unique
 * one. If a row with the same endpoint already exists we just refresh keys and
 * reassign ownership to the current user (handles the "logged out / logged in
 * as someone else on the same device" case cleanly).
 */
export const register = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!args.endpoint || !args.p256dh || !args.auth) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "endpoint, p256dh and auth are required"
      });
    }
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent
      });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: Date.now()
    });
  }
});

/** Delete the current user's row for `endpoint`. No-op if missing or foreign. */
export const unregister = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (!existing) return;
    if (existing.userId !== userId) return;
    await ctx.db.delete(existing._id);
  }
});

/** Current user's own subscriptions — handy for "this device is enabled" UI. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      id: r._id,
      endpoint: r.endpoint,
      userAgent: r.userAgent,
      createdAt: r.createdAt
    }));
  }
});

/**
 * Server-only fanout helper. Called by /api/push-send via ConvexHttpClient.
 * Guarded by `serverSecret`; not callable from the browser.
 */
export const listForUser = query({
  args: {
    userId: v.id("users"),
    serverSecret: v.string()
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.serverSecret);
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  }
});

/**
 * Prune a dead subscription after web-push returns 404/410. Same shared-secret
 * gate as `listForUser` — never expose to clients.
 */
export const pruneByEndpoint = mutation({
  args: {
    endpoint: v.string(),
    serverSecret: v.string()
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.serverSecret);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  }
});
