import type { PeriodPreset } from "@/lib/period";
import type { RecurringTransaction } from "@/lib/types";

export type Tab = "cashflow" | "earnings" | "expenses" | "categories" | "budgets" | "recurring" | "transactions";

export const TAB_LABEL_KEYS: Record<Tab, "money.cashflow" | "money.earnings" | "money.expenses" | "money.categories" | "money.budgets" | "money.recurring" | "money.transactions"> = {
  cashflow: "money.cashflow",
  earnings: "money.earnings",
  expenses: "money.expenses",
  categories: "money.categories",
  budgets: "money.budgets",
  recurring: "money.recurring",
  transactions: "money.transactions"
};

export const ADVANCED_TAB_VALUES: Tab[] = [
  "cashflow",
  "earnings",
  "expenses",
  "categories",
  "budgets",
  "recurring",
  "transactions"
];

// Light mode collapses Money to the views that map cleanly onto its
// "expense tracker + budgeting" pitch: the history list, monthly budgets and
// recurring rules ("rent lands in 3 days"). Categories management still
// happens inline via the per-row edit; the explicit Categories tab is
// Advanced.
export const LIGHT_TAB_VALUES: Tab[] = ["transactions", "budgets", "recurring"];

/**
 * Period presets surfaced in the MonAI-style "this month" pill. Kept in sync
 * with the canonical list in `src/lib/period.ts` so the dropdown stays a thin
 * wrapper over the existing URL-backed period machinery.
 */
export const PERIOD_OPTIONS: { value: PeriodPreset; labelKey: "money.period.week" | "money.period.month" | "money.period.lastMonth" | "money.period.30d" | "money.period.thisQuarter" | "money.period.lastQuarter" | "money.period.year" | "money.period.lastYear" }[] = [
  { value: "week", labelKey: "money.period.week" },
  { value: "month", labelKey: "money.period.month" },
  { value: "last-month", labelKey: "money.period.lastMonth" },
  { value: "30d", labelKey: "money.period.30d" },
  { value: "this-quarter", labelKey: "money.period.thisQuarter" },
  { value: "last-quarter", labelKey: "money.period.lastQuarter" },
  { value: "year", labelKey: "money.period.year" },
  { value: "last-year", labelKey: "money.period.lastYear" }
];

/** Filter for the MonAI hero — "both" shows net, the others isolate one side. */
export type HeroFilter = "both" | "expense" | "income";

export function cadenceLabel(c: RecurringTransaction["cadence"]) {
  switch (c) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "yearly":
      return "Yearly";
  }
}
