import { describe, expect, it } from "vitest";
import { buildMonthlyIncomePace } from "./monthlyIncome";
import type { Category, RecurringTransaction, Transaction } from "./types";

const categories: Category[] = [
  {
    id: "cat-product",
    portfolioId: "pf",
    name: "Product",
    kind: "income",
    icon: "sparkles",
    color: "mint",
    sortOrder: 0
  },
  {
    id: "cat-consulting",
    portfolioId: "pf",
    name: "Consulting",
    kind: "income",
    icon: "briefcase",
    color: "lavender",
    sortOrder: 1
  }
];

function tx(patch: Partial<Transaction>): Transaction {
  return {
    id: "tx",
    portfolioId: "pf",
    occurredAt: Date.UTC(2026, 6, 1),
    description: "Income",
    kind: "income",
    amount: 0,
    currency: "EUR",
    createdByUserId: "u",
    ...patch
  };
}

function recurring(patch: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: "rec",
    portfolioId: "pf",
    description: "Retainer",
    kind: "income",
    amount: 0,
    currency: "EUR",
    cadence: "monthly",
    startAt: Date.UTC(2026, 6, 1),
    nextRunAt: Date.UTC(2026, 6, 20),
    active: true,
    createdAt: Date.UTC(2026, 5, 1),
    ...patch
  };
}

describe("monthly income pace", () => {
  it("combines booked income and scheduled recurring income before month end", () => {
    const result = buildMonthlyIncomePace({
      now: Date.UTC(2026, 6, 10),
      currency: "EUR",
      categories,
      transactions: [
        tx({ id: "booked", amount: 12000, categoryId: "cat-product" }),
        tx({ id: "expense", kind: "expense", amount: 3000, categoryId: "cat-product" }),
        tx({ id: "old", amount: 9000, occurredAt: Date.UTC(2026, 5, 30), categoryId: "cat-product" })
      ],
      recurring: [
        recurring({ id: "monthly", description: "Agency retainer", amount: 15000 }),
        recurring({
          id: "weekly",
          description: "Affiliate weekly",
          amount: 1000,
          cadence: "weekly",
          nextRunAt: Date.UTC(2026, 6, 17)
        })
      ]
    });

    expect(result.earnedThisMonth).toBe(12000);
    expect(result.scheduledThisMonth).toBe(18000);
    expect(result.paceAmount).toBe(30000);
    expect(result.recurringRunRate).toBeCloseTo(19333.33, 2);
    expect(result.contributors.map((row) => row.label)).toEqual([
      "Agency retainer",
      "Product",
      "Affiliate weekly",
      "Affiliate weekly",
      "Affiliate weekly"
    ]);
  });

  it("keeps an empty account free of invented income", () => {
    const result = buildMonthlyIncomePace({
      now: Date.UTC(2026, 6, 10), currency: "EUR", categories: [], transactions: [], recurring: []
    });
    expect(result.paceAmount).toBe(0);
    expect(result.recurringRunRate).toBe(0);
    expect(result.contributors).toEqual([]);
  });
});
