import { describe, expect, it } from "vitest";
import { currentMonthBudgetSpend } from "./categoryBudgets";
import type { Category, Transaction } from "./types";

const now = Date.parse("2026-09-12T12:00:00Z");
const food: Category = { id: "food", portfolioId: "pf", name: "Food", kind: "expense", icon: "tag", color: "mint", sortOrder: 0, monthlyLimit: 100, monthlyLimitCurrency: "EUR" };
const expense = (patch: Partial<Transaction> = {}): Transaction => ({ id: "tx", portfolioId: "pf", kind: "expense", amount: 10.01, currency: "EUR", occurredAt: now, description: "Food", categoryId: "food", createdByUserId: "user", ...patch });

describe("web monthly budget denomination", () => {
  it("uses the persisted cap currency after the portfolio default changes", () => {
    const rows = [expense({ amount: 0.1 }), expense({ amount: 0.2 })];
    expect(currentMonthBudgetSpend([food], rows, "USD", now).get("food")).toBe(0.3);
    expect(currentMonthBudgetSpend([{ ...food, monthlyLimitCurrency: undefined }], [expense({ currency: "USD" })], "USD", now).get("food")).toBe(10.01);
  });
  it("marks foreign or invalid spending unavailable rather than converting or ignoring it", () => {
    for (const patch of [{ currency: "USD" as const }, { amount: NaN }, { amount: -1 }, { amount: Infinity }]) {
      expect(currentMonthBudgetSpend([food], [expense(), expense(patch)], "USD", now).get("food")).toBeNull();
    }
    // Once incomplete, a later matching expense does not turn it into a subtotal.
    expect(currentMonthBudgetSpend([food], [expense({ currency: "USD" }), expense()], "USD", now).get("food")).toBeNull();
  });
  it("uses UTC half-open months, excludes future records and isolates each category and portfolio", () => {
    const rows = [
      expense({ occurredAt: Date.parse("2026-09-01T00:00:00Z"), amount: 1.005 }),
      expense({ occurredAt: Date.parse("2026-08-31T23:59:59.999Z"), currency: "USD" }),
      expense({ occurredAt: Date.parse("2026-10-01T00:00:00Z"), currency: "USD" }),
      expense({ occurredAt: now + 1, currency: "USD" }),
      expense({ portfolioId: "other", currency: "USD" }),
      expense({ categoryId: "other", currency: "USD" }),
      expense({ kind: "income", currency: "USD" })
    ];
    expect(currentMonthBudgetSpend([food], rows, "USD", now).get("food")).toBe(1.01);
    expect(currentMonthBudgetSpend([food], [], "USD", now).get("food")).toBe(0);
  });
});
