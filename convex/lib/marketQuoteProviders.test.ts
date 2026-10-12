import { describe, expect, it, vi } from "vitest";
import {
  MARKET_CLOSURE_GRACE_MS,
  confirmedQuoteTime,
  fetchCoinGeckoQuotes,
  fetchFinnhubQuote,
  fetchFinnhubQuotes,
  isUsEquitySymbol,
  normalizeSymbols
} from "./marketQuoteProviders";

const NOW = Date.UTC(2026, 9, 12, 9, 0); // Monday 09:00 UTC
const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe("symbol rules", () => {
  it("accepts ordinary and class-suffixed US tickers, rejects crypto and junk", () => {
    for (const symbol of ["AAPL", "VOO", "BRK.B", "BF-B", "QQQ"]) expect(isUsEquitySymbol(symbol)).toBe(true);
    for (const symbol of ["BTC", "ETH", "", "aapl", "VWCE.DE.X", "TOOLONGX", "../x"]) expect(isUsEquitySymbol(symbol)).toBe(false);
  });
  it("normalizes, upper-cases and de-duplicates", () => {
    expect(normalizeSymbols([" aapl", "AAPL", "voo ", ""])).toEqual(["AAPL", "VOO"]);
  });
});

describe("Finnhub", () => {
  it("prices any US ticker and sends only the symbol and key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ c: 512.34, dp: -0.4, t: NOW / 1000 - 600 }));
    const quote = await fetchFinnhubQuote("VTI", "key", fetchImpl, NOW);
    expect(quote).toEqual({ symbol: "VTI", price: 512.34, changePercent: -0.4, provider: "finnhub", updatedAt: NOW });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect([...url.searchParams.keys()].sort()).toEqual(["symbol", "token"]);
  });
  it("treats an unknown symbol (c=0, t=0) as unpriced, never zero", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ c: 0, d: null, dp: null, t: 0 }));
    expect(await fetchFinnhubQuote("ZZZZ", "key", fetchImpl, NOW)).toBeNull();
  });
  it("does nothing without a key", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchFinnhubQuotes(["AAPL"], "", fetchImpl, NOW)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("keeps other tickers when one request fails", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(ok({ c: 100, dp: 1, t: NOW / 1000 }));
    const quotes = await fetchFinnhubQuotes(["AAPL", "VOO", "BTC"], "key", fetchImpl, NOW);
    expect(quotes.map((quote) => quote.symbol)).toEqual(["VOO"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("weekend handling", () => {
  it("keeps Friday's close current over a weekend", async () => {
    const fridayClose = Date.UTC(2026, 9, 9, 20, 0) / 1000;
    const fetchImpl = vi.fn().mockResolvedValue(ok({ c: 200, dp: 0.1, t: fridayClose }));
    const quote = await fetchFinnhubQuote("AAPL", "key", fetchImpl, NOW);
    expect(quote?.updatedAt).toBe(NOW);
  });
  it("leaves a long-halted ticker with its real, stale trade time", () => {
    const old = NOW - MARKET_CLOSURE_GRACE_MS - 1;
    expect(confirmedQuoteTime(old, NOW)).toBe(old);
  });
});

describe("CoinGecko", () => {
  it("returns only requested crypto with the provider's time", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      bitcoin: { usd: 60000, usd_24h_change: 2, last_updated_at: NOW / 1000 - 30 },
      ethereum: { usd: 3000, usd_24h_change: 1, last_updated_at: NOW / 1000 }
    }));
    const quotes = await fetchCoinGeckoQuotes(["BTC", "AAPL"], fetchImpl, NOW);
    expect(quotes).toEqual([{ symbol: "BTC", price: 60000, changePercent: 2, provider: "coingecko", updatedAt: NOW - 30000 }]);
  });
  it("skips missing or non-positive prices", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ bitcoin: { usd: 0 } }));
    expect(await fetchCoinGeckoQuotes(["BTC", "ETH"], fetchImpl, NOW)).toEqual([]);
  });
});
