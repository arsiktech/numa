import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  fetchCoinbaseQuotes,
  fetchCoinGeckoQuotes,
  fetchFinnhubQuotes,
  isCryptoSymbol,
  isUsEquitySymbol,
  normalizeSymbols
} from "./lib/marketQuoteProviders";

declare const process: {
  env: Record<string, string | undefined>;
};

/** Hard ceiling per run: keeps Finnhub's free plan (60 calls/min) safe. */
export const MAX_REFRESH_SYMBOLS = 50;

/**
 * Distinct priceable symbols across all holdings. Only tickers leave this
 * function; no balances, quantities or owners. Full scan is fine at current
 * scale and the cron runs at most every 15 minutes.
 */
export const listQuoteSymbols = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const holdings = await ctx.db.query("holdings").collect();
    return normalizeSymbols(holdings.map((holding) => holding.symbol))
      .filter((symbol) => isCryptoSymbol(symbol) || isUsEquitySymbol(symbol))
      .sort()
      .slice(0, MAX_REFRESH_SYMBOLS);
  }
});

const quoteValidator = v.object({
  symbol: v.string(),
  price: v.number(),
  changePercent: v.number(),
  provider: v.union(v.literal("coingecko"), v.literal("coinbase"), v.literal("finnhub")),
  updatedAt: v.number()
});

/** Upsert one row per symbol; never moves a quote backwards in time. */
export const storeQuotes = internalMutation({
  args: { quotes: v.array(quoteValidator) },
  handler: async (ctx, { quotes }): Promise<{ written: number }> => {
    let written = 0;
    for (const quote of quotes) {
      if (!Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.updatedAt)) continue;
      const existing = await ctx.db
        .query("marketQuotes")
        .withIndex("by_symbol", (q) => q.eq("symbol", quote.symbol))
        .unique();
      if (existing && existing.updatedAt > quote.updatedAt) continue;
      if (existing) await ctx.db.patch(existing._id, quote);
      else await ctx.db.insert("marketQuotes", quote);
      written += 1;
    }
    return { written };
  }
});

export const refreshQuotes = internalAction({
  args: {},
  handler: async (ctx): Promise<{ symbols: number; written: number }> => {
    if (process.env.NUMA_QUOTES_OFFLINE) return { symbols: 0, written: 0 };
    const symbols: string[] = await ctx.runQuery(internal.marketQuotes.listQuoteSymbols, {});
    if (symbols.length === 0) return { symbols: 0, written: 0 };
    const now = Date.now();
    const fetchImpl = (input: string, init?: { signal?: AbortSignal }) => fetch(input, init);
    const [crypto, equities] = await Promise.allSettled([
      fetchCoinGeckoQuotes(symbols, fetchImpl, now),
      fetchFinnhubQuotes(symbols, process.env.FINNHUB_API_KEY ?? "", fetchImpl, now)
    ]);
    const quotes = [
      ...(crypto.status === "fulfilled" ? crypto.value : []),
      ...(equities.status === "fulfilled" ? equities.value : [])
    ];
    // Crypto CoinGecko didn't price (it rate-limits shared cloud addresses) comes from Coinbase.
    const priced = new Set(quotes.map((q) => q.symbol));
    const missing = symbols.filter((symbol) => isCryptoSymbol(symbol) && !priced.has(symbol));
    if (missing.length) quotes.push(...await fetchCoinbaseQuotes(missing, fetchImpl, now).catch(() => []));
    if (quotes.length === 0) return { symbols: symbols.length, written: 0 };
    const { written }: { written: number } = await ctx.runMutation(internal.marketQuotes.storeQuotes, { quotes });
    return { symbols: symbols.length, written };
  }
});
