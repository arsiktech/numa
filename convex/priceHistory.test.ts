// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fetchSeries, gridFor, resample, type Get } from "./lib/priceHistory";

const NOW = Date.UTC(2026, 9, 18, 14, 37);

describe("price history", () => {
  it("lays a day out every 10 minutes, a week every hour, a month every 4 hours and a year every day", () => {
    expect(gridFor("1D", NOW).length).toBe(145);
    expect(gridFor("1W", NOW).length).toBe(169);
    expect(gridFor("1M", NOW).length).toBe(181);
    expect(gridFor("1Y", NOW).length).toBe(366);
    const day = gridFor("1D", NOW);
    expect(day[1] - day[0]).toBe(600_000);
    expect(day.at(-1)).toBe(Date.UTC(2026, 9, 18, 14, 30));
  });

  it("gives each grid time the last price at or before it", () => {
    expect(resample([10, 20, 30], [1, 2, 3], [5, 10, 15, 25, 40])).toEqual([1, 1, 1, 2, 3]);
    expect(resample([10, 20], [NaN, 0], [15])).toBeNull();
  });

  it("reads Coinbase candles by their close, and asks for a month of hours in pieces", async () => {
    const urls: string[] = [];
    const get: Get = async (url) => {
      urls.push(url);
      const start = Date.parse(new URL(url).searchParams.get("start")!) / 1000;
      return [[start, 1, 3, 1.5, 2, 9], [start - 3600, 1, 3, 1.5, 1, 9]];
    };
    const s = await fetchSeries("WETH", "crypto", "1M", NOW, get);
    expect(urls.length).toBe(3);
    expect(urls[0]).toContain("/products/ETH-USD/candles?granularity=3600");
    expect(s?.t.length).toBe(181);
    expect(s?.p.every((p) => p === 1 || p === 2)).toBe(true);
  });

  it("reads Yahoo closes in dollars, starting from the previous close, and skips other currencies", async () => {
    const t0 = Math.floor((NOW - 3 * 3600_000) / 1000);
    const chart = (currency: string) => ({ chart: { result: [{ meta: { chartPreviousClose: 100, currency }, timestamp: [t0, t0 + 300], indicators: { quote: [{ close: [101, null] }] } }] } });
    const s = await fetchSeries("TSLA", "stock", "1D", NOW, async () => chart("USD"));
    expect(s?.p[0]).toBe(100);
    expect(s?.p.at(-1)).toBe(101);
    expect(await fetchSeries("VWCE.DE", "stock", "1D", NOW, async () => chart("EUR"))).toBeNull();
  });

  it("keeps stablecoins and unknown symbols out, and survives a provider error", async () => {
    let calls = 0;
    const get: Get = async () => { calls++; throw new Error("down"); };
    expect(await fetchSeries("USDC", "crypto", "1D", NOW, get)).toBeNull();
    expect(calls).toBe(0);
    expect(await fetchSeries("BTC", "crypto", "1D", NOW, get)).toBeNull();
    expect(await fetchSeries("bad symbol!", "stock", "1D", NOW, get)).toBeNull();
  });
});
