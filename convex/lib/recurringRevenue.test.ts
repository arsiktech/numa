import { describe, expect, it } from "vitest";
import { computeRecurringRevenue, type RevenueRule } from "./recurringRevenue";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const base: RevenueRule = {
  id: "r", description: "Rule", kind: "income", amount: 100, currency: "USD",
  cadence: "monthly", startAt: NOW - 1000, active: true
};
const rule = (patch: Partial<RevenueRule>): RevenueRule => ({ ...base, ...patch });

describe("recurring revenue", () => {
  it("normalizes subscription and retainer cadences into MRR and derives ARR from it", () => {
    const result = computeRecurringRevenue([
      rule({ id: "m", amount: 99, revenueType: "subscription", incomeSource: "Acme" }),
      rule({ id: "y", amount: 1200, cadence: "yearly", revenueType: "subscription", incomeSource: "Acme" }),
      rule({ id: "q", amount: 300, cadence: "quarterly", revenueType: "retainer", incomeSource: "Beta" }),
      rule({ id: "w", amount: 12, cadence: "weekly", revenueType: "retainer", incomeSource: "Gamma" })
    ], { currency: "USD", now: NOW });
    // 99 + 100 + 100 + 12 × 52 / 12 = 351
    expect(result.mrr).toBe(351);
    expect(result.arr).toBe(4212);
    expect(result.qualifyingRules).toBe(4);
    expect(result.revenueSources).toEqual([
      { source: "Acme", monthly: 199, rules: 2 },
      { source: "Beta", monthly: 100, rules: 1 },
      { source: "Gamma", monthly: 52, rules: 1 }
    ]);
  });

  it("never annualizes unmarked income, expenses, inactive, ended or future rules", () => {
    const result = computeRecurringRevenue([
      rule({ id: "salary", description: "Salary", amount: 5000 }),
      rule({ id: "rent", kind: "expense", amount: 2000, revenueType: "subscription" }),
      rule({ id: "paused", active: false, revenueType: "subscription" }),
      rule({ id: "churned", endAt: NOW - 1, revenueType: "subscription" }),
      rule({ id: "signed", startAt: NOW + 86_400_000, revenueType: "retainer" })
    ], { currency: "USD", now: NOW });
    expect(result.mrr).toBe(0);
    expect(result.arr).toBe(0);
    expect(result.scheduledMonthlyIncome).toBe(5000);
    expect(result.incomeSources).toEqual([{ source: "Salary", monthly: 5000, rules: 1 }]);
    expect(result.excluded.map(row => [row.id, row.reason])).toEqual([
      ["paused", "inactive"], ["churned", "ended"], ["signed", "not_started"]
    ]);
  });

  it("converts other currencies with a rate and reports them when no rate exists", () => {
    const rules = [
      rule({ id: "usd", amount: 100, revenueType: "subscription" }),
      rule({ id: "eur", amount: 100, currency: "EUR", revenueType: "subscription" })
    ];
    const withRate = computeRecurringRevenue(rules, { currency: "USD", now: NOW, rates: { EUR: 1, USD: 1.1 } });
    expect(withRate.mrr).toBe(210);
    const withoutRate = computeRecurringRevenue(rules, { currency: "USD", now: NOW });
    expect(withoutRate.mrr).toBe(100);
    expect(withoutRate.excluded).toEqual([{ id: "eur", description: "Rule", reason: "no_rate" }]);
  });

  it("sums in cents so fractional amounts do not drift", () => {
    const result = computeRecurringRevenue(
      Array.from({ length: 10 }, (_, i) => rule({ id: `c${i}`, amount: 0.1, revenueType: "subscription" })),
      { currency: "USD", now: NOW }
    );
    expect(result.mrr).toBe(1);
    expect(result.arr).toBe(12);
  });

  it("reports an invalid stored amount instead of counting it as zero", () => {
    const result = computeRecurringRevenue([rule({ id: "bad", amount: Number.NaN, revenueType: "subscription" })], { currency: "USD", now: NOW });
    expect(result.mrr).toBe(0);
    expect(result.excluded).toEqual([{ id: "bad", description: "Rule", reason: "invalid_amount" }]);
  });
});
