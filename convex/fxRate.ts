import { internal } from "./_generated/api";
import { internalAction, query } from "./_generated/server";

const KEY = "fx:EURUSD";

/** The one shared euro-dollar rate. Devices read this instead of each calling the rate service. */
export const read = query({
  args: {},
  handler: async (ctx): Promise<{ usdPerEur: number; asOf: string } | null> => {
    const row = await ctx.db.query("priceHistory").withIndex("by_key", (q) => q.eq("key", KEY)).unique();
    if (!row || !(row.p[0] > 0)) return null;
    return { usdPerEur: row.p[0], asOf: new Date(row.t[0] ?? row.fetchedAt).toISOString().slice(0, 10) };
  },
});

export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<number | null> => {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD", { signal: AbortSignal.timeout(8_000) }).catch(() => null);
    if (!response?.ok) return null;
    const body = await response.json().catch(() => null) as { rates?: { USD?: unknown }; date?: unknown } | null;
    const usd = body?.rates?.USD;
    const date = body?.date;
    if (typeof usd !== "number" || !(usd > 0) || typeof date !== "string") return null;
    const t = Date.parse(`${date}T00:00:00.000Z`);
    await ctx.runMutation(internal.priceHistory.store, { key: KEY, t: [Number.isFinite(t) ? t : Date.now()], p: [usd], fetchedAt: Date.now() });
    return usd;
  },
});
