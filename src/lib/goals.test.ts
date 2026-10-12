import { describe, expect, it } from "vitest";
import { computeGoalProgress, migrateGoalShape } from "./goals";
import type { NetWorthGoal } from "./types";

const rates = { EUR: 1, USD: 1.08 };

function goal(patch: Partial<NetWorthGoal>): NetWorthGoal {
  return {
    id: "goal",
    portfolioId: "pf",
    scope: "net_worth",
    target: 1000,
    currency: "EUR",
    startAt: 1000,
    createdAt: 1000,
    ...patch
  };
}

const emptyInput = {
  netWorth: 0,
  netWorthCurrency: "EUR" as const,
  transactions: [],
  categories: [],
  assets: [],
  holdings: [],
  quotes: {},
  rates
};

describe("goal progress", () => {
  it("tracks income category totals since goal creation", () => {
    const result = computeGoalProgress(
      goal({ scope: "income_category", categoryId: "cat-ai", target: 7000 }),
      {
        ...emptyInput,
        categories: [{ id: "cat-ai", portfolioId: "pf", name: "AI agents", kind: "income", icon: "sparkles", color: "mint", sortOrder: 0 }],
        transactions: [
          { id: "old", portfolioId: "pf", occurredAt: 900, description: "Old", kind: "income", amount: 5000, currency: "EUR", categoryId: "cat-ai", createdByUserId: "u" },
          { id: "new", portfolioId: "pf", occurredAt: 1200, description: "New", kind: "income", amount: 3000, currency: "EUR", categoryId: "cat-ai", createdByUserId: "u" },
          { id: "expense", portfolioId: "pf", occurredAt: 1300, description: "Cost", kind: "expense", amount: 1000, currency: "EUR", categoryId: "cat-ai", createdByUserId: "u" }
        ]
      }
    );

    expect(result.current).toBe(3000);
    expect(result.pct).toBeCloseTo(42.857, 2);
  });

  it("tracks monthly income goals from booked and scheduled income", () => {
    const result = computeGoalProgress(
      goal({ scope: "monthly_income", target: 50000 }),
      {
        ...emptyInput,
        now: Date.UTC(2026, 6, 10),
        categories: [
          {
            id: "cat-product",
            portfolioId: "pf",
            name: "Product",
            kind: "income",
            icon: "sparkles",
            color: "mint",
            sortOrder: 0
          }
        ],
        transactions: [
          {
            id: "income",
            portfolioId: "pf",
            occurredAt: Date.UTC(2026, 6, 3),
            description: "Booked",
            kind: "income",
            amount: 12000,
            currency: "EUR",
            categoryId: "cat-product",
            createdByUserId: "u"
          }
        ],
        recurring: [
          {
            id: "retainer",
            portfolioId: "pf",
            description: "Retainer",
            kind: "income",
            amount: 8000,
            currency: "EUR",
            cadence: "monthly",
            startAt: Date.UTC(2026, 6, 1),
            nextRunAt: Date.UTC(2026, 6, 20),
            active: true,
            createdAt: Date.UTC(2026, 5, 1)
          }
        ]
      }
    );

    expect(result.current).toBe(20000);
    expect(result.pct).toBe(40);
    expect(result.detail).toBe("Booked plus scheduled income this month");
  });

  it("tracks asset value goals", () => {
    const result = computeGoalProgress(
      goal({ scope: "asset_value", assetId: "cash", target: 10000 }),
      {
        ...emptyInput,
        assets: [{ id: "cash", portfolioId: "pf", name: "Cash", kind: "cash", balance: 4200, currency: "EUR", updatedAt: 1000 }]
      }
    );

    expect(result.current).toBe(4200);
    expect(result.remaining).toBe(5800);
  });

  it("tracks holding value goals with quote and cost basis fallback", () => {
    const quoted = computeGoalProgress(
      goal({ scope: "holding_value", holdingId: "btc", target: 200000, currency: "USD" }),
      {
        ...emptyInput,
        holdings: [{ id: "btc", portfolioId: "pf", symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: 2, costBasis: 60000, currency: "USD", acquiredAt: 1000 }],
        quotes: { BTC: { symbol: "BTC", price: 70000, changePercent: 1, provider: "mock", updatedAt: 1000 } }
      }
    );
    const fallback = computeGoalProgress(
      goal({ scope: "holding_value", holdingId: "btc", target: 200000, currency: "USD" }),
      {
        ...emptyInput,
        holdings: [{ id: "btc", portfolioId: "pf", symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: 2, costBasis: 60000, currency: "USD", acquiredAt: 1000 }]
      }
    );

    expect(quoted.current).toBe(140000);
    expect(fallback.current).toBe(60000);
  });

  it("migrates legacy net worth goals", () => {
    expect(
      migrateGoalShape({
        id: "legacy",
        portfolioId: "pf",
        target: 250000,
        currency: "EUR",
        createdAt: 123
      }).scope
    ).toBe("net_worth");
    expect(migrateGoalShape({ createdAt: 123 }).startAt).toBe(123);
  });
});
