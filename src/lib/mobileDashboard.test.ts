import { describe, expect, it } from "vitest";
import { buildMobileDashboard, valueDashboardHolding } from "../../convex/lib/mobileDashboard";

const NOW_MS = new Date("2026-05-18T12:00:00Z").getTime();

describe("buildMobileDashboard", () => {
  it("normalizes dashboard values to the portfolio currency", () => {
    const dashboard = buildMobileDashboard({
      portfolio: { defaultCurrency: "EUR" },
      transactions: [
        {
          occurredAt: NOW_MS,
          kind: "income",
          amount: 500,
          currency: "EUR"
        },
        {
          occurredAt: NOW_MS,
          kind: "expense",
          amount: 108,
          currency: "USD"
        },
        {
          occurredAt: new Date("2026-06-01T00:00:00Z").getTime(),
          kind: "expense",
          amount: 999,
          currency: "EUR"
        }
      ],
      assets: [
        { kind: "cash", balance: 108, currency: "USD" },
        { kind: "vehicle", balance: 500, currency: "EUR" }
      ],
      liabilities: [{ balance: 108, currency: "USD" }],
      holdings: [
        {
          holding: {
            symbol: "BTC",
            quantity: 1,
            costBasis: 200,
            currency: "EUR"
          },
          quote: {
            symbol: "BTC",
            price: 260,
            changePercent: 3,
            provider: "mock",
            updatedAt: NOW_MS
          }
        }
      ],
      goals: [{ _id: "goal_1" }],
      nowMs: NOW_MS
    });

    expect(dashboard.currency).toBe("EUR");
    expect(dashboard.monthIncome).toBe(500);
    expect(dashboard.monthExpenses).toBe(100);
    expect(dashboard.monthCashflow).toBe(400);
    expect(dashboard.invested).toBeCloseTo(240.74, 2);
    expect(dashboard.drivers.market).toBeCloseTo(40.74, 2);
    expect(dashboard.monthDelta).toBeCloseTo(440.74, 2);
    expect(dashboard.liquid).toBe(100);
    expect(dashboard.hardAssets).toBe(500);
    expect(dashboard.liabilities).toBe(100);
    expect(dashboard.netWorth).toBeCloseTo(740.74, 2);
    expect(dashboard.transactionCount).toBe(3);
    expect(dashboard.goalCount).toBe(1);
  });

  it("reports missing and stale quote coverage", () => {
    const dashboard = buildMobileDashboard({
      portfolio: { defaultCurrency: "EUR" },
      transactions: [],
      assets: [],
      liabilities: [],
      holdings: [
        {
          holding: {
            symbol: "BTC",
            quantity: 1,
            costBasis: 200,
            currency: "EUR"
          },
          quote: {
            symbol: "BTC",
            price: 260,
            changePercent: 3,
            provider: "mock",
            updatedAt: NOW_MS - 2_000
          }
        },
        {
          holding: {
            symbol: "AAPL",
            quantity: 2,
            costBasis: 300,
            currency: "USD"
          },
          quote: null
        }
      ],
      goals: [],
      nowMs: NOW_MS,
      quoteStaleMs: 1_000
    });

    expect(dashboard.dataQuality.quoteCount).toBe(1);
    expect(dashboard.dataQuality.missingQuoteCount).toBe(2);
    expect(dashboard.dataQuality.staleQuoteCount).toBe(1);
    expect(dashboard.dataQuality.missingQuoteSymbols).toEqual(["BTC", "AAPL"]);
    expect(dashboard.dataQuality.validUntil).toBe(NOW_MS + 5 * 60 * 1000);
    expect(dashboard.dataQuality.staleQuoteSymbols).toEqual(["BTC"]);
    expect(dashboard.dataQuality.fxRateSource).toBe("backend-fallback");
  });
});

describe("valueDashboardHolding", () => {
  it("uses total cost basis as the no-quote fallback for fractional holdings", () => {
    const valuation = valueDashboardHolding(
      {
        symbol: "BTC",
        quantity: 0.5,
        costBasis: 1000,
        currency: "EUR"
      },
      null,
      "EUR",
      NOW_MS
    );

    expect(valuation.marketPrice).toBe(2000);
    expect(valuation.marketValue).toBe(1000);
    expect(valuation.costBasis).toBe(1000);
    expect(valuation.gain).toBe(0);
    expect(valuation.hasQuote).toBe(false);
    expect(valuation.quoteStale).toBe(false);
  });
});

describe("manual fund dashboard classification", () => {
  it("moves value from hard assets to invested exactly once without changing manual driver or returns", () => {
    const input = { portfolio: { defaultCurrency: "EUR" as const }, transactions: [], liabilities: [{ balance: 10, currency: "EUR" as const }], holdings: [], goals: [], nowMs: NOW_MS };
    const asset = { kind: "other" as const, balance: 108, currency: "USD" as const };
    const before = buildMobileDashboard({ ...input, assets: [asset] });
    const after = buildMobileDashboard({ ...input, assets: [{ ...asset, investmentType: "fund" }] });
    expect(before).toMatchObject({ liquid: 0, invested: 0, hardAssets: 100, netWorth: 90 });
    expect(after).toMatchObject({ liquid: 0, invested: 100, hardAssets: 0, netWorth: 90, monthIncome: 0, monthDelta: 0, drivers: { cashflow: 0, manual: 90, market: 0 }, movementFeed: [] });
    expect(after.drivers).toEqual(before.drivers);
    expect(after.dataQuality).toMatchObject({ quoteCount: 0, missingQuoteCount: 0 });
  });
});

describe("manual funds beside quoted holdings", () => {
  it("adds the manual value once while market gain remains quote-derived", () => {
    const dashboard = buildMobileDashboard({ portfolio: { defaultCurrency: "USD" }, transactions: [], assets: [{ kind: "other", investmentType: "fund", balance: 234.56, currency: "USD" }, { kind: "other", balance: 10, currency: "USD" }], liabilities: [], holdings: [{ holding: { symbol: "SYNTH", quantity: 2, costBasis: 100, currency: "USD" }, quote: { symbol: "SYNTH", price: 60, changePercent: 1, provider: "finnhub", updatedAt: NOW_MS } }], goals: [], nowMs: NOW_MS });
    expect(dashboard).toMatchObject({ invested: 354.56, hardAssets: 10, netWorth: 364.56, monthDelta: 20, drivers: { market: 20, manual: 244.56 }, monthIncome: 0 });
    expect(dashboard.dataQuality).toMatchObject({ quoteCount: 1, missingQuoteCount: 0 });
  });
});
