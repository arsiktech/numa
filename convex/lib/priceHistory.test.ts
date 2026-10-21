// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fetchSeries, gridFor, type ChartRange, type Get } from "./priceHistory";

const NOW = Date.UTC(2026, 9, 21, 14, 37);

describe("raw price-history provenance", () => {
  it.each<[ChartRange, number]>([["1D", 1], ["1W", 1], ["1M", 3], ["1Y", 2]])("preserves useful %s Coinbase coverage with bounded, floor-aligned padding", async (range, requests) => {
    const urls: string[] = [];
    const baseline = gridFor(range, NOW)[0];
    const get: Get = async (url) => {
      urls.push(url);
      const q = new URL(url).searchParams;
      const step = Number(q.get("granularity")) * 1000;
      const start = Date.parse(q.get("start")!), end = Date.parse(q.get("end")!);
      expect(Math.ceil((end - start) / step) + 1).toBeLessThan(300);
      const rows: number[][] = [];
      for (let t = Math.ceil(start / step) * step; t <= end; t += step) rows.push([t / 1000, 90, 110, 99, t + step <= baseline ? 100 : 105, 1]);
      return rows.reverse(); // Synthetic Coinbase payload, including the in-progress candle.
    };
    const s = await fetchSeries("BTC", "crypto", range, NOW, get);
    expect(urls).toHaveLength(requests);
    expect(s?.t).toEqual(gridFor(range, NOW)); expect(s?.p[0]).toBe(100);
    const o = s!.observations!;
    expect(o).toMatchObject({ source: "coinbase", fetchedAt: NOW });
    expect(o.t.map((t) => t + o.granularityMs)).toContain(baseline);
    expect(o.t.every((t, i) => t + o.granularityMs <= NOW && (i === 0 || t > o.t[i - 1]))).toBe(true);
    expect(o.t).toHaveLength(new Set(o.t).size);
  });

  it("filters invalid/future timestamps, invalid prices and incomplete closes before drawing or recording evidence", async () => {
    const step = 300_000, complete = Math.floor(NOW / step) * step - step;
    const row = (t: unknown, p: unknown) => [t, 1, 1000, 10, p, 1];
    const s = await fetchSeries("BTC", "crypto", "1D", NOW, async () => [
      row(complete / 1000, 10), row(complete / 1000, 10), row(NaN, 999), row(Infinity, 999), row(-1, 999),
      row((complete + step) / 1000, 999), row((NOW + step) / 1000, 999),
      row((complete - step) / 1000, NaN), row((complete - 2 * step) / 1000, Infinity),
      row((complete - 3 * step) / 1000, 0), row((complete - 4 * step) / 1000, -10), row("bad", 999),
    ]);
    expect(s?.observations).toEqual({ t: [complete], p: [10], source: "coinbase", granularityMs: step, fetchedAt: NOW });
    expect(new Set(s?.p)).toEqual(new Set([10]));
  });

  it("retains Yahoo raw candle starts, never previous-close padding or incomplete future closes", async () => {
    const first = NOW - 2 * 3_600_000;
    const s = await fetchSeries("EXM", "stock", "1D", NOW, async () => ({ chart: { result: [{
      meta: { currency: "USD", chartPreviousClose: 90 },
      timestamp: [first / 1000, (first + 300_000) / 1000, (NOW - 60_000) / 1000, (NOW + 300_000) / 1000, NaN],
      indicators: { quote: [{ close: [100, null, 999, 1000, 2000] }] },
    }] } }));
    expect(s?.p[0]).toBe(90); expect(s?.p[s.p.length - 1]).toBe(100);
    expect(s?.observations).toEqual({ t: [first], p: [100], source: "yahoo", granularityMs: 300_000, fetchedAt: NOW });
    expect(s?.observations?.t).not.toContain(first - 1);
  });

  it("excludes a Yahoo daily close until its conservative full candle interval has ended", async () => {
    const old = NOW - 2 * 86_400_000, ongoing = NOW - 3_600_000;
    const s = await fetchSeries("EXM", "stock", "1Y", NOW, async () => ({ chart: { result: [{
      meta: { currency: "USD" }, timestamp: [old / 1000, ongoing / 1000], indicators: { quote: [{ close: [100, 999] }] },
    }] } }));
    expect(s?.observations?.t).toEqual([old]);
    expect(s?.observations?.granularityMs).toBe(86_400_000);
    expect(s?.p[s.p.length - 1]).toBe(100);
  });
});
