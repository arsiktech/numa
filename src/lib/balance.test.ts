import { describe, expect, it } from "vitest";
import { balanceScale, buildBalance } from "./balance";
import type { Asset, Holding, Liability, MarketQuote } from "./types";

const NOW = Date.UTC(2026, 9, 12, 9, 0);
const rates = { EUR: 1, USD: 1.12 };

const asset = (id: string, balance: number, kind: Asset["kind"] = "cash", currency: Asset["currency"] = "EUR"): Asset => ({
  id, portfolioId: "p", name: id, kind, balance, currency, updatedAt: NOW
});
const debt = (id: string, balance: number, currency: Liability["currency"] = "EUR"): Liability => ({
  id, portfolioId: "p", name: id, kind: "loan", balance, currency, updatedAt: NOW
});
const holding = (symbol: string, quantity: number, costBasis: number, kind: Holding["kind"] = "etf"): Holding => ({
  id: symbol, portfolioId: "p", symbol, name: symbol, kind, quantity, costBasis, currency: "USD", acquiredAt: NOW
});
const quote = (symbol: string, price: number, changePercent = 0, updatedAt = NOW - 60_000): MarketQuote => ({
  symbol, price, changePercent, provider: "finnhub", updatedAt
});

describe("buildBalance", () => {
  it("reconciles every total to the displayed rows, to the cent", () => {
    // Three USD holdings whose unrounded conversions would drift by a cent.
    const holdings = [holding("VOO", 38, 20000), holding("AAPL", 60, 15000, "stock"), holding("VTI", 3, 900)];
    const quotes = { VOO: quote("VOO", 715.59), AAPL: quote("AAPL", 336.64), VTI: quote("VTI", 381.94) };
    const b = buildBalance({
      assets: [asset("Everyday", 8420.15), asset("Savings", 24000)],
      holdings, liabilities: [debt("Card", 1180.4), debt("Car", 9600)],
      quotes, currency: "EUR", rates, now: NOW
    });
    const rowCents = b.groups.filter(g => g.side === "own").flatMap(g => g.items).reduce((s, i) => s + Math.round(i.value * 100), 0);
    expect(Math.round(b.own * 100)).toBe(rowCents);
    for (const group of b.groups) {
      expect(Math.round(group.value * 100)).toBe(group.items.reduce((s, i) => s + Math.round(i.value * 100), 0));
    }
    expect(Math.round(b.net * 100)).toBe(Math.round(b.own * 100) - Math.round(b.owe * 100));
    expect(b.owe).toBe(10780.4);
  });

  it("orders owned groups largest first and keeps debt last", () => {
    const b = buildBalance({
      // 1 BTC at $60,000 is about €53,571, so the flat must be larger to lead.
      assets: [asset("Cash", 100), asset("Flat", 80000, "real_estate")],
      holdings: [holding("BTC", 1, 5000, "crypto")], liabilities: [debt("Loan", 10)],
      quotes: { BTC: quote("BTC", 60000) }, currency: "EUR", rates, now: NOW
    });
    expect(b.groups.map(g => g.id)).toEqual(["property", "crypto", "cash", "debt"]);
  });

  it("makes totals unavailable instead of zero when a rate is missing", () => {
    const b = buildBalance({
      assets: [asset("Euro", 1000), asset("Pounds", 500, "cash", "GBP")],
      holdings: [], liabilities: [], quotes: {}, currency: "EUR", rates: { EUR: 1 }, now: NOW
    });
    expect(b.available).toBe(false);
    expect(Number.isNaN(b.net)).toBe(true);
    expect(balanceScale(b)).toBeNull();
  });

  it("treats an unconvertible wallet value as unavailable, not as missing", () => {
    const b = buildBalance({
      assets: [asset("Cash", 1000)], holdings: [], liabilities: [], quotes: {},
      currency: "EUR", rates, wallets: [{ id: "w", label: "Ledger", assets: NaN, debts: 0, fresh: true }], now: NOW
    });
    expect(b.available).toBe(false);
  });

  it("lists each counted wallet and its borrowing as its own row", () => {
    const b = buildBalance({
      assets: [], holdings: [], liabilities: [], quotes: {}, currency: "EUR", rates, now: NOW,
      wallets: [{ id: "w1", label: "Ledger", assets: 1200.5, debts: 200, fresh: false }]
    });
    const crypto = b.groups.find(g => g.id === "crypto")!;
    expect(crypto.items[0]).toMatchObject({ id: "w1", source: "wallet", name: "Ledger", note: "stale-balance", value: 1200.5 });
    expect(b.groups.find(g => g.id === "debt")!.items[0]).toMatchObject({ name: "Ledger borrowing", value: 200 });
    expect(b.net).toBe(1000.5);
  });

  it("values an unpriced holding at cost and says so", () => {
    const b = buildBalance({
      assets: [], holdings: [holding("XYZ", 10, 1120, "stock")], liabilities: [],
      quotes: {}, currency: "EUR", rates, now: NOW
    });
    const item = b.groups[0]!.items[0]!;
    expect(item.note).toBe("at-cost");
    expect(item.value).toBe(1000);
  });

  it("flags a stale quote and leaves it out of today's market move", () => {
    const old = NOW - 40 * 60 * 60 * 1000;
    const b = buildBalance({
      assets: [], holdings: [holding("VOO", 1, 500)], liabilities: [],
      quotes: { VOO: quote("VOO", 560, 2, old) }, currency: "EUR", rates, now: NOW
    });
    expect(b.groups[0]!.items[0]!.note).toBe("stale-price");
    expect(b.marketsToday).toBeNull();
  });

  it("derives today's market move from the quote's daily change", () => {
    const b = buildBalance({
      assets: [], holdings: [holding("VOO", 1, 500)], liabilities: [],
      quotes: { VOO: quote("VOO", 112, 12) }, currency: "EUR", rates, now: NOW
    });
    // 112 USD is 100 EUR; up 12% today means it opened at 89.29 EUR.
    expect(b.marketsToday).toBeCloseTo(10.71, 2);
  });

  it("reports an empty start", () => {
    expect(buildBalance({ assets: [], holdings: [], liabilities: [], quotes: {}, currency: "EUR", rates, now: NOW }).empty).toBe(true);
  });
});

describe("balanceScale", () => {
  it("puts own and owe on one scale with the remainder as net worth", () => {
    const b = buildBalance({ assets: [asset("Cash", 1000)], holdings: [], liabilities: [debt("Loan", 250)], quotes: {}, currency: "EUR", rates, now: NOW });
    expect(balanceScale(b)).toEqual({ scale: 1000, ownGap: 0, left: 750, shortfall: 0 });
  });

  it("scales to debt when you owe more than you own", () => {
    const b = buildBalance({ assets: [asset("Cash", 400)], holdings: [], liabilities: [debt("Loan", 1000)], quotes: {}, currency: "EUR", rates, now: NOW });
    expect(balanceScale(b)).toEqual({ scale: 1000, ownGap: 600, left: 0, shortfall: 600 });
  });
});

describe("manual fund compatibility balance", () => {
  it("keeps manual assets in investments without a ticker, unit price or market return", () => {
    const fund = { ...asset("synthetic-fund", 234.56, "other"), investmentType: "fund" as const };
    const b = buildBalance({ assets: [fund], holdings: [], liabilities: [], quotes: {}, currency: "EUR", rates, now: NOW });
    expect(b.groups).toHaveLength(1);
    expect(b.groups[0]).toMatchObject({ id: "investments", value: 234.56, items: [{ id: fund.id, source: "asset", value: 234.56 }] });
    expect(b.groups[0].items[0].unitPrice).toBeUndefined();
    expect(b.groups[0].items[0].detail).toBeUndefined();
    expect(b.net).toBe(234.56);
    expect(b.marketsToday).toBeNull();
  });
});
