import { describe, expect, it } from "vitest";
import {
  computeOwedMatrix,
  forecastMonthlySpend,
  holdingGain,
  holdingValue,
  rollupCashflow,
  rollupCategories,
  rollupNetWorth
} from "./analytics";
import { getPeriodRange } from "./period";
import type {
  Asset,
  Category,
  Holding,
  Liability,
  MarketQuote,
  Membership,
  Settlement,
  Transaction
} from "./types";

const NOW = new Date("2026-05-15T12:00:00Z").getTime();
const range = getPeriodRange("month", new Date(NOW));

const portfolioId = "pf_test";
const me = "user_me";
const her = "user_her";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? "tx_x",
    portfolioId,
    occurredAt: partial.occurredAt ?? NOW,
    description: partial.description ?? "",
    categoryId: partial.categoryId,
    kind: partial.kind ?? "expense",
    amount: partial.amount ?? 0,
    currency: partial.currency ?? "EUR",
    createdByUserId: partial.createdByUserId ?? me,
    splits: partial.splits,
    notes: partial.notes
  };
}

describe("FX-aware rollups", () => {
  // USD ≈ 1.08 EUR per 1 EUR is the canonical rate we use everywhere.
  const rates = { EUR: 1, USD: 1.08 };

  it("converts a USD expense into an EUR portfolio at the ECB rate", () => {
    const result = rollupCashflow(
      [tx({ id: "u1", kind: "expense", amount: 100, currency: "USD" })],
      range,
      { rates, currency: "EUR" }
    );
    // 100 USD / 1.08 USD-per-EUR = 92.5925… EUR
    expect(result.expense).toBeCloseTo(92.59, 2);
  });

  it("leaves a same-currency expense alone", () => {
    const result = rollupCashflow(
      [tx({ id: "e1", kind: "expense", amount: 100, currency: "EUR" })],
      range,
      { rates, currency: "EUR" }
    );
    expect(result.expense).toBe(100);
  });

  it("preserves legacy behavior when rates/currency are omitted", () => {
    const result = rollupCashflow(
      [tx({ id: "u1", kind: "expense", amount: 100, currency: "USD" })],
      range
    );
    expect(result.expense).toBe(100);
  });

  it("converts net worth components", () => {
    const assets: Asset[] = [
      { id: "a1", portfolioId, name: "Cash", kind: "cash", balance: 1080, currency: "USD", updatedAt: NOW }
    ];
    const result = rollupNetWorth(assets, [], [], {}, { rates, currency: "EUR" });
    expect(result.liquid).toBeCloseTo(1000, 2);
  });

  it("converts categories", () => {
    const cats: Category[] = [
      { id: "c1", portfolioId, name: "Food", kind: "expense", icon: "u", color: "peach", sortOrder: 0 }
    ];
    const result = rollupCategories(
      [tx({ id: "u1", kind: "expense", amount: 108, currency: "USD", categoryId: "c1" })],
      cats,
      range,
      "expense",
      { rates, currency: "EUR" }
    );
    expect(result[0]!.total).toBeCloseTo(100, 2);
  });
});

describe("rollupCashflow", () => {
  it("sums income, expense and net for the period", () => {
    const result = rollupCashflow(
      [
        tx({ id: "1", kind: "income", amount: 5000 }),
        tx({ id: "2", kind: "expense", amount: 1500 }),
        tx({ id: "3", kind: "expense", amount: 500 }),
        // outside the period
        tx({ id: "4", kind: "income", amount: 9999, occurredAt: new Date("2024-01-01").getTime() })
      ],
      range
    );
    expect(result.income).toBe(5000);
    expect(result.expense).toBe(2000);
    expect(result.net).toBe(3000);
    expect(result.margin).toBeCloseTo(0.6, 5);
  });

  it("returns zero margin with no income", () => {
    const result = rollupCashflow([tx({ id: "1", kind: "expense", amount: 200 })], range);
    expect(result.margin).toBe(0);
    expect(result.net).toBe(-200);
  });
});

describe("rollupNetWorth", () => {
  const quotes: Record<string, MarketQuote> = {
    AAPL: { symbol: "AAPL", price: 200, changePercent: 1, provider: "mock", updatedAt: NOW }
  };
  const holdings: Holding[] = [
    {
      id: "h1",
      portfolioId,
      symbol: "AAPL",
      name: "Apple",
      kind: "stock",
      quantity: 10,
      costBasis: 1500,
      currency: "USD",
      acquiredAt: NOW
    }
  ];
  const assets: Asset[] = [
    { id: "a1", portfolioId, name: "Cash", kind: "cash", balance: 5000, currency: "EUR", updatedAt: NOW },
    { id: "a2", portfolioId, name: "Vespa", kind: "vehicle", balance: 2500, currency: "EUR", updatedAt: NOW }
  ];
  const liabilities: Liability[] = [
    { id: "l1", portfolioId, name: "Card", kind: "credit_card", balance: 800, currency: "EUR", updatedAt: NOW }
  ];

  it("computes net worth from live quotes plus cash and assets minus liabilities", () => {
    const result = rollupNetWorth(assets, holdings, liabilities, quotes);
    expect(result.liquid).toBe(5000);
    expect(result.invested).toBe(2000); // 10 shares × $200
    expect(result.hardAssets).toBe(2500);
    expect(result.liabilities).toBe(800);
    expect(result.netWorth).toBe(5000 + 2000 + 2500 - 800);
  });

  it("falls back to cost basis when no quote present", () => {
    const value = holdingValue(holdings[0]!, {});
    expect(value).toBe(1500);
  });

  it("treats live-quote market value as USD even when the holding is recorded in EUR", () => {
    const rates = { EUR: 1, USD: 1.08 };
    const eurHolding: Holding = {
      id: "h_eur",
      portfolioId,
      symbol: "AAPL",
      name: "Apple",
      kind: "stock",
      quantity: 10,
      costBasis: 1500,
      currency: "EUR",
      acquiredAt: NOW
    };
    const result = rollupNetWorth([], [eurHolding], [], quotes, { rates, currency: "EUR" });
    // 10 × $200 = $2000 market value, converted from USD — not re-tagged as EUR.
    expect(result.invested).toBeCloseTo(2000 / 1.08, 2);
    // Gain follows the same model: USD market value and EUR cost basis both
    // land in EUR before subtracting.
    expect(holdingGain(eurHolding, quotes, { rates, currency: "EUR" })).toBeCloseTo(
      2000 / 1.08 - 1500,
      2
    );
  });

  it("values fractional no-quote holdings at full cost basis with zero gain", () => {
    const fractional: Holding = {
      id: "h_frac",
      portfolioId,
      symbol: "BTC",
      name: "Bitcoin",
      kind: "crypto",
      quantity: 0.5,
      costBasis: 1000,
      currency: "EUR",
      acquiredAt: NOW
    };
    expect(holdingValue(fractional, {})).toBe(1000);
    expect(holdingGain(fractional, {})).toBe(0);
  });
});

describe("rollupCategories", () => {
  const categories: Category[] = [
    { id: "c_food", portfolioId, name: "Food", kind: "expense", icon: "utensils", color: "peach", sortOrder: 0 },
    { id: "c_rent", portfolioId, name: "Rent", kind: "expense", icon: "home", color: "lavender", sortOrder: 1 },
    { id: "c_pay", portfolioId, name: "Salary", kind: "income", icon: "briefcase", color: "mint", sortOrder: 2 }
  ];

  it("rolls up totals and shares per category for the period", () => {
    const result = rollupCategories(
      [
        tx({ id: "1", kind: "expense", amount: 100, categoryId: "c_food" }),
        tx({ id: "2", kind: "expense", amount: 50, categoryId: "c_food" }),
        tx({ id: "3", kind: "expense", amount: 850, categoryId: "c_rent" })
      ],
      categories,
      range,
      "expense"
    );
    expect(result[0]!.category.id).toBe("c_rent");
    expect(result[0]!.total).toBe(850);
    expect(result[1]!.category.id).toBe("c_food");
    expect(result[1]!.total).toBe(150);
    const sumShare = result.reduce((s, r) => s + r.share, 0);
    expect(sumShare).toBeCloseTo(1, 5);
  });
});

describe("computeOwedMatrix", () => {
  const memberships: Membership[] = [
    { id: "m1", portfolioId, userId: me, ownershipBps: 6000, role: "owner", displayName: "Me", joinedAt: NOW },
    { id: "m2", portfolioId, userId: her, ownershipBps: 4000, role: "editor", displayName: "Her", joinedAt: NOW }
  ];
  const settlements: Settlement[] = [];

  it("settles the balance by ownership when no splits are set", () => {
    const result = computeOwedMatrix(
      [
        // Me paid €100, ownership 60/40 → I should be owed 40 from her.
        tx({ id: "1", kind: "expense", amount: 100, createdByUserId: me })
      ],
      memberships,
      settlements,
      range
    );
    const meRow = result.find((r) => r.userId === me)!;
    const herRow = result.find((r) => r.userId === her)!;
    expect(meRow.paid).toBe(100);
    expect(meRow.share).toBe(60);
    expect(meRow.owed).toBe(40);
    expect(herRow.paid).toBe(0);
    expect(herRow.share).toBe(40);
    expect(herRow.owed).toBe(-40);
  });

  it("converts mixed-currency expenses before computing the matrix", () => {
    const result = computeOwedMatrix(
      [
        // Her paid USD 100 in an EUR portfolio at 1.08 → €92.59 owed.
        tx({ id: "1", kind: "expense", amount: 100, currency: "USD", createdByUserId: her })
      ],
      memberships,
      [],
      range,
      { rates: { EUR: 1, USD: 1.08 }, currency: "EUR" }
    );
    const meRow = result.find((r) => r.userId === me)!;
    const herRow = result.find((r) => r.userId === her)!;
    // EUR 92.59 paid, split 60/40 (default ownership). Me owes EUR 55.55.
    expect(herRow.paid).toBeCloseTo(92.59, 1);
    expect(meRow.paid).toBe(0);
    expect(meRow.share).toBeCloseTo(55.56, 1);
    expect(herRow.share).toBeCloseTo(37.04, 1);
  });

  it("honors per-transaction splits over ownership", () => {
    const result = computeOwedMatrix(
      [
        tx({
          id: "1",
          kind: "expense",
          amount: 100,
          createdByUserId: me,
          splits: [
            { userId: me, bps: 5000 },
            { userId: her, bps: 5000 }
          ]
        })
      ],
      memberships,
      settlements,
      range
    );
    const meRow = result.find((r) => r.userId === me)!;
    const herRow = result.find((r) => r.userId === her)!;
    expect(meRow.share).toBe(50);
    expect(herRow.share).toBe(50);
    expect(meRow.owed).toBe(50);
    expect(herRow.owed).toBe(-50);
  });
});


describe("recorded monthly forecast", () => {
  it("excludes future-dated expenses from spent so far", () => {
    const now = new Date(2026, 8, 15, 12);
    const result = forecastMonthlySpend([
      tx({ amount: 100, occurredAt: new Date(2026, 8, 1).getTime() }),
      tx({ amount: 20, occurredAt: now.getTime() }),
      tx({ amount: 9000, occurredAt: now.getTime() + 1 }),
      tx({ amount: 50, occurredAt: new Date(2026, 7, 31).getTime() })
    ], undefined, now);
    expect(result.spentSoFar).toBe(120);
    expect(result.projected).toBe(240);
    expect(result.lastMonth).toBe(50);
  });
});
