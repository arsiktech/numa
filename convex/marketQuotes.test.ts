import { afterEach, describe, expect, it, vi } from "vitest";
import { listQuoteSymbols, storeQuotes, MAX_REFRESH_SYMBOLS } from "./marketQuotes";
import { fetchCoinbaseQuotes } from "./lib/marketQuoteProviders";
import { refreshQuoteSoon } from "./lib/quoteRefresh";
import { privacyFixture } from "../src/test/privacyFixture";
afterEach(() => vi.restoreAllMocks());

describe("market quote refresh storage", () => {
  it("lists distinct priceable symbols only, capped", async () => {
    const f = privacyFixture();
    f.seed("holdings", "h1", { symbol: "aapl" });
    f.seed("holdings", "h2", { symbol: "AAPL" });
    f.seed("holdings", "h3", { symbol: "BTC" });
    f.seed("holdings", "h4", { symbol: "VWCE.DE.X" });
    expect(await f.call(listQuoteSymbols)).toEqual(["AAPL", "BTC"]);
    for (let i = 0; i < MAX_REFRESH_SYMBOLS + 5; i++) f.seed("holdings", `x${i}`, { symbol: `T${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}` });
    expect((await f.call(listQuoteSymbols)).length).toBe(MAX_REFRESH_SYMBOLS);
  });

  it("upserts one row per symbol and never moves a quote backwards", async () => {
    const f = privacyFixture();
    const q = (price: number, updatedAt: number) => ({ symbol: "AAPL", price, changePercent: 0, provider: "finnhub" as const, updatedAt });
    expect(await f.call(storeQuotes, { quotes: [q(100, 2000)] })).toEqual({ written: 1 });
    expect(await f.call(storeQuotes, { quotes: [q(90, 1000)] })).toEqual({ written: 0 });
    expect(await f.call(storeQuotes, { quotes: [q(110, 3000)] })).toEqual({ written: 1 });
    const rows = f.all("marketQuotes");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ price: 110, updatedAt: 3000 });
  });

  it("rejects non-positive prices instead of storing zero", async () => {
    const f = privacyFixture();
    await f.call(storeQuotes, { quotes: [{ symbol: "AAPL", price: 0, changePercent: 0, provider: "finnhub", updatedAt: 1 }] });
    expect(f.all("marketQuotes")).toHaveLength(0);
  });
});

describe("crypto prices when CoinGecko is unavailable", () => {
  it("reads Coinbase's 24h stats, with the change from 24 hours ago, and skips what it can't price", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      if (url.includes("/BTC-USD/")) return { ok: true, json: async () => ({ open: "80000", last: "84000" }) };
      if (url.includes("/ETH-USD/")) return { ok: true, json: async () => ({ open: "x", last: "0" }) };
      return { ok: false, json: async () => ({}) };
    };
    const quotes = await fetchCoinbaseQuotes(["BTC", "ETH", "SOL", "AAPL"], fetchImpl, 5000);
    expect(urls).toHaveLength(3);
    expect(quotes).toEqual([{ symbol: "BTC", price: 84000, changePercent: 5, provider: "coinbase", updatedAt: 5000 }]);
  });
});

describe("a newly saved holding", () => {
  const ctxWith = (quote: object | null) => {
    const runs: unknown[] = [];
    const ctx = {
      db: { query: () => ({ withIndex: () => ({ unique: async () => quote }) }) },
      scheduler: { runAfter: async (ms: number) => { runs.push(ms); } }
    } as any;
    return { ctx, runs };
  };

  it("fetches prices now when its symbol has no recent quote", async () => {
    const none = ctxWith(null);
    await refreshQuoteSoon(none.ctx, "BTC");
    expect(none.runs).toEqual([0]);
    const old = ctxWith({ updatedAt: Date.now() - 60 * 60 * 1000 });
    await refreshQuoteSoon(old.ctx, "AAPL");
    expect(old.runs).toEqual([0]);
  });

  it("doesn't refetch a fresh quote or try symbols no provider prices", async () => {
    const fresh = ctxWith({ updatedAt: Date.now() - 60 * 1000 });
    await refreshQuoteSoon(fresh.ctx, "BTC");
    const odd = ctxWith(null);
    await refreshQuoteSoon(odd.ctx, "VWCE.DE.X");
    expect([...fresh.runs, ...odd.runs]).toEqual([]);
  });

  it("never fetches live prices on a test backend that seeds its own", async () => {
    vi.stubEnv("NUMA_QUOTES_OFFLINE", "1");
    const none = ctxWith(null);
    await refreshQuoteSoon(none.ctx, "BTC");
    vi.unstubAllEnvs();
    expect(none.runs).toEqual([]);
  });
});
