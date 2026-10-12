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
