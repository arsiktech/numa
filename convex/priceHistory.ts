import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { rateLimitExpiresAt } from "./lib/privacyRetention";
import { GRID, fetchSeries, type ChartRange, type Get, type Series } from "./lib/priceHistory";

/**
 * Price history behind the chart's day, week, month and year lines. Shared across people: a
 * symbol's history is fetched once per range and kept until it is due again, so opening the
 * chart never waits on the providers more than it has to.
 */

declare const process: { env: Record<string, string | undefined> };

const TIMEOUT_MS = 10_000;
const MAX_SYMBOLS = 30;
const CALLS_PER_MINUTE = 30;
const rangeValidator = v.union(v.literal("1D"), v.literal("1W"), v.literal("1M"), v.literal("1Y"));
const observationValidator = v.optional(v.object({
  t: v.array(v.number()), p: v.array(v.number()),
  source: v.union(v.literal("coinbase"), v.literal("yahoo")),
  granularityMs: v.number(), fetchedAt: v.number()
}));

const get: Get = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Numa Pro)" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
};

export const cached = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }): Promise<Array<(Series & { key: string; fetchedAt: number }) | null>> =>
    await Promise.all(keys.map(async (key) => {
      const row = await ctx.db.query("priceHistory").withIndex("by_key", (q) => q.eq("key", key)).unique();
      return row ? { key, fetchedAt: row.fetchedAt, t: row.t, p: row.p, ...(row.observations ? { observations: row.observations } : {}) } : null;
    })),
});

export const store = internalMutation({
  args: { key: v.string(), t: v.array(v.number()), p: v.array(v.number()), fetchedAt: v.number(), observations: observationValidator },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("priceHistory").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (row) await ctx.db.patch(row._id, { t: args.t, p: args.p, fetchedAt: args.fetchedAt, observations: args.observations });
    else await ctx.db.insert("priceHistory", args);
    return null;
  },
});

export const consume = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<boolean> => {
    const now = Date.now(), windowMs = 60_000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `price-history:${userId}:${windowStart}`;
    const bucket = await ctx.db.query("rateLimitBuckets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!bucket) {
      await ctx.db.insert("rateLimitBuckets", { key, route: "price-history", identityHash: String(userId), windowStart, windowMs, limit: CALLS_PER_MINUTE, count: 1, updatedAt: now, expiresAt: rateLimitExpiresAt(windowStart, windowMs) });
      return true;
    }
    if (bucket.count >= CALLS_PER_MINUTE) return false;
    await ctx.db.patch(bucket._id, { count: bucket.count + 1, updatedAt: now });
    return true;
  },
});

/** History for the signed-in person's priced holdings, in US dollars, on the range's grid. */
export const series = action({
  args: { range: rangeValidator, symbols: v.array(v.object({ symbol: v.string(), kind: v.union(v.literal("crypto"), v.literal("stock")) })) },
  handler: async (ctx, { range, symbols }): Promise<Record<string, Series>> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to see your chart" });
    if (process.env.NUMA_QUOTES_OFFLINE === "1") return {};
    if (!(await ctx.runMutation(internal.priceHistory.consume, { userId }))) return {};
    const wanted = [...new Map(symbols.slice(0, MAX_SYMBOLS).map((s) => [`${s.kind}:${s.symbol.toUpperCase()}`, s])).values()];
    const keys = wanted.map((s) => `${s.kind}:${s.symbol.toUpperCase()}:${range}`);
    const now = Date.now();
    const rows = await ctx.runQuery(internal.priceHistory.cached, { keys });
    const out: Record<string, Series> = {};
    await Promise.all(wanted.map(async (s, i) => {
      const row = rows[i];
      const saved: Series | null = row ? { t: row.t, p: row.p, ...(row.observations ? { observations: row.observations } : {}) } : null;
      if (row && saved && now - row.fetchedAt >= 0 && now - row.fetchedAt < GRID[range as ChartRange].ttl) { out[s.symbol.toUpperCase()] = saved; return; }
      const fresh = await fetchSeries(s.symbol, s.kind, range as ChartRange, now, get);
      if (fresh) {
        out[s.symbol.toUpperCase()] = fresh;
        await ctx.runMutation(internal.priceHistory.store, { key: keys[i], ...fresh, fetchedAt: now });
      } else if (saved) {
        // The provider didn't answer: an older history is better than a flat line.
        out[s.symbol.toUpperCase()] = saved;
      }
    }));
    return out;
  },
});
