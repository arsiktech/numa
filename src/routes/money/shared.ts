import type { PeriodPreset } from "@/lib/period";
import type { RecurringTransaction } from "@/lib/types";

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
