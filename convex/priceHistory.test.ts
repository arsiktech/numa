// @vitest-environment node
import { getFunctionName } from "convex/server";
import type { ActionCtx } from "./_generated/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { privacyFixture } from "../src/test/privacyFixture";
import { cached, consume, series, store } from "./priceHistory";
import { fetchSeries, gridFor, resample, type Get, type Series } from "./lib/priceHistory";

const NOW = Date.UTC(2026, 9, 18, 14, 37);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("price history", () => {
  it("lays a day out every 10 minutes, a week every hour, a month every 4 hours and a year every day", () => {
    expect(gridFor("1D", NOW).length).toBe(145);
    expect(gridFor("1W", NOW).length).toBe(169);
    expect(gridFor("1M", NOW).length).toBe(181);
    expect(gridFor("1Y", NOW).length).toBe(366);
    const day = gridFor("1D", NOW);
    expect(day[1] - day[0]).toBe(600_000);
    expect(day[day.length - 1]).toBe(Date.UTC(2026, 9, 18, 14, 30));
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
    expect(s?.p[s.p.length - 1]).toBe(101);
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

describe("price-history cache evidence", () => {
  const draw = { t: [NOW - 600_000, NOW], p: [90, 100] };
  const observations = { t: [NOW - 900_000, NOW - 300_000], p: [90, 100], source: "coinbase" as const, granularityMs: 300_000, fetchedAt: NOW };
  function fixture() {
    const db = privacyFixture();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.stubEnv("NUMA_QUOTES_OFFLINE", "0");
    // Real registered handlers over the existing synthetic transactional DB. Only
    // the action transport/context is adapted; cache/rate/store logic stays real.
    type ActionContext = ActionCtx;
    const context: Pick<ActionContext, 'auth' | 'runQuery' | 'runMutation'> = {
      auth: { getUserIdentity: async () => ({ subject: "user|synthetic-session", issuer: "synthetic", tokenIdentifier: "synthetic-user" }) },
      runQuery: async (_ref, ...args) => db.call(cached, args[0] ?? {}),
      runMutation: async (ref, ...args) => {
        const name = getFunctionName(ref);
        if (name === "priceHistory:consume") return db.call(consume, args[0] ?? {});
        if (name === "priceHistory:store") return db.call(store, args[0] ?? {});
        throw new Error(`Unexpected synthetic mutation ${name}`);
      },
    };
    const handler: unknown = Reflect.get(series, "_handler");
    if (typeof handler !== "function") throw new Error("Expected registered Convex action handler in test adapter");
    const run = () => handler(context, { range: "1D", symbols: [{ symbol: "BTC", kind: "crypto" }] }) as Promise<Record<string, Series>>;
    return { db, run };
  }

  it("serves a fresh old cache row without inventing provenance or bypassing its TTL", async () => {
    const f = fixture();
    f.db.seed("priceHistory", "old-cache", { key: "crypto:BTC:1D", ...draw, fetchedAt: NOW - 60_000 });
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Synthetic provider must not be called"));
    expect(await f.run()).toEqual({ BTC: draw }); expect(fetch).not.toHaveBeenCalled();
    expect((await f.db.call(cached, { keys: ["crypto:BTC:1D"] }))[0].observations).toBeUndefined();
  });

  it("returns fresh provenance unchanged and never stamps a cache hit with a newer observation time", async () => {
    const f = fixture();
    const observed = { ...observations, fetchedAt: NOW - 60_000, t: [NOW - 900_000], p: [90] };
    f.db.seed("priceHistory", "verified-cache", { key: "crypto:BTC:1D", ...draw, observations: observed, fetchedAt: NOW - 60_000 });
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Synthetic provider must not be called"));
    expect(await f.run()).toEqual({ BTC: { ...draw, observations: observed } }); expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes an old unverified row only when due, persisting raw observations with the new drawing", async () => {
    const f = fixture();
    f.db.seed("priceHistory", "old-cache", { key: "crypto:BTC:1D", ...draw, fetchedAt: NOW - 300_000 });
    const start = Math.floor(NOW / 300_000) * 300_000 - 300_000;
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([[start / 1000, 90, 110, 95, 100, 1]]), { status: 200 }));
    const result = await f.run();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.BTC.observations).toEqual({ t: [start], p: [100], source: "coinbase", granularityMs: 300_000, fetchedAt: NOW });
    const saved = (await f.db.call(cached, { keys: ["crypto:BTC:1D"] }))[0];
    expect(saved).toMatchObject({ ...result.BTC, fetchedAt: NOW });
  });

  it("retains the exact original evidence and age on stale provider fallback, including unverified old rows", async () => {
    const f = fixture();
    const oldTime = NOW - 86_400_000;
    const observed = { ...observations, t: observations.t.map((t) => t - 86_400_000), fetchedAt: oldTime };
    f.db.seed("priceHistory", "stale-cache", { key: "crypto:BTC:1D", ...draw, observations: observed, fetchedAt: oldTime });
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Synthetic provider outage"));
    expect(await f.run()).toEqual({ BTC: { ...draw, observations: observed } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await f.db.call(cached, { keys: ["crypto:BTC:1D"] }))[0].fetchedAt).toBe(oldTime);
    await f.db.call(store, { key: "crypto:BTC:1D", ...draw, fetchedAt: oldTime });
    expect(await f.run()).toEqual({ BTC: draw });
    expect((await f.db.call(cached, { keys: ["crypto:BTC:1D"] }))[0].observations).toBeUndefined();
  });

  it("still obeys the existing per-user rate limit before requesting provider data", async () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) expect(await f.db.call(consume, { userId: "user" })).toBe(true);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Synthetic provider must not be called"));
    expect(await f.run()).toEqual({}); expect(fetch).not.toHaveBeenCalled();
  });
});
