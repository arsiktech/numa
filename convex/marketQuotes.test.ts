import { afterEach, describe, expect, it, vi } from "vitest";
import { listQuoteSymbols, storeQuotes, MAX_REFRESH_SYMBOLS } from "./marketQuotes";
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
