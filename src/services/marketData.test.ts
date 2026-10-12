import { afterEach, expect, it, vi } from "vitest";
import { fetchMarketQuotes } from "./marketData";
afterEach(() => vi.unstubAllGlobals());
it("surfaces HTTP and malformed market failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(fetchMarketQuotes(["AAPL"])).rejects.toThrow(/503/);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  await expect(fetchMarketQuotes(["AAPL"])).rejects.toThrow(/unavailable/);
});
it("keeps the source timestamp and rejects mock, stale and undated quotes", async () => {
  const updatedAt = new Date(Date.now() - 60_000).toISOString();
  const quote = { symbol: "AAPL", price: 100, changePercent: 2, provider: "stooq", updatedAt };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: {
    AAPL: quote, BTC: { ...quote, symbol: "BTC", provider: "mock" },
    VOO: { ...quote, symbol: "VOO", updatedAt: "2020-01-01T00:00:00Z" },
    SPY: { ...quote, symbol: "SPY", updatedAt: undefined }
  } }) }));
  expect(await fetchMarketQuotes(["AAPL", "BTC", "VOO", "SPY"])).toEqual([{ ...quote, updatedAt: Date.parse(updatedAt) }]);
});
it("requests every symbol in bounded batches", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: {} }) });
  vi.stubGlobal("fetch", fetch);
  await fetchMarketQuotes(Array.from({ length: 41 }, (_, i) => `SYM${i}`));
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2]?.[0]).toContain("SYM40");
});
