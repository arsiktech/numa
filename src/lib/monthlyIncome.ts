import { convertCurrency, UNKNOWN_FX_RATES, type FxRates } from "./fx";
import type { Category, CurrencyCode, RecurringTransaction, Transaction } from "./types";

const WEEKS_PER_MONTH = 52 / 12;

export type MonthlyIncomeContributionKind = "earned" | "scheduled";

export interface MonthlyIncomeContribution {
  id: string;
  label: string;
  amount: number;
  kind: MonthlyIncomeContributionKind;
  detail: string;
  share: number;
}

export interface MonthlyIncomePace {
  currency: CurrencyCode;
  earnedThisMonth: number;
  scheduledThisMonth: number;
  paceAmount: number;
  recurringRunRate: number;
  contributors: MonthlyIncomeContribution[];
  monthStart: number;
  monthEnd: number;
  daysLeft: number;
}

export interface MonthlyIncomePaceInput {
  transactions: Transaction[];
  recurring: RecurringTransaction[];
  categories: Category[];
  currency: CurrencyCode;
  rates?: FxRates | null;
  now?: number | Date;
}

function asDate(value: number | Date | undefined) {
  if (value instanceof Date) return value;
  return new Date(value ?? Date.now());
}

function toTarget(amount: number, from: CurrencyCode, to: CurrencyCode, rates?: FxRates | null) {
  return convertCurrency(amount, from, to, rates ?? UNKNOWN_FX_RATES);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function cadenceToMonthly(amount: number, cadence: RecurringTransaction["cadence"]) {
  switch (cadence) {
    case "weekly":
      return amount * WEEKS_PER_MONTH;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
  }
}

function advanceCadence(ts: number, cadence: RecurringTransaction["cadence"]) {
  const date = new Date(ts);
  switch (cadence) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "yearly":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
  return date.getTime();
}

function occurrenceLabel(ts: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}

export function buildMonthlyIncomePace(input: MonthlyIncomePaceInput): MonthlyIncomePace {
  const now = asDate(input.now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const todayStart = startOfDay(now);
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));
  const earnedByCategory = new Map<
    string,
    { label: string; amount: number; count: number }
  >();

  for (const tx of input.transactions) {
    if (tx.kind !== "income") continue;
    if (tx.occurredAt < monthStart || tx.occurredAt >= monthEnd) continue;
    const category = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined;
    const key = category?.id ?? "uncategorized";
    const current = earnedByCategory.get(key) ?? {
      label: category?.name ?? "Uncategorized income",
      amount: 0,
      count: 0
    };
    current.amount += toTarget(tx.amount, tx.currency, input.currency, input.rates);
    current.count += 1;
    earnedByCategory.set(key, current);
  }

  const earnedContributors: MonthlyIncomeContribution[] = Array.from(earnedByCategory.entries()).map(
    ([id, row]) => ({
      id: `earned:${id}`,
      label: row.label,
      amount: row.amount,
      kind: "earned",
      detail: `${row.count} booked ${row.count === 1 ? "income" : "income items"} this month`,
      share: 0
    })
  );

  const scheduledContributors: MonthlyIncomeContribution[] = [];
  let recurringRunRate = 0;

  for (const row of input.recurring) {
    if (!row.active || row.kind !== "income") continue;
    if (row.endAt && row.endAt < todayStart) continue;
    const converted = toTarget(row.amount, row.currency, input.currency, input.rates);
    recurringRunRate += cadenceToMonthly(converted, row.cadence);

    let next = row.nextRunAt;
    let guard = 0;
    while (next < monthEnd && guard < 64) {
      if ((!row.endAt || next <= row.endAt) && next >= todayStart) {
        scheduledContributors.push({
          id: `scheduled:${row.id}:${next}`,
          label: row.description,
          amount: converted,
          kind: "scheduled",
          detail: `${row.cadence} income due ${occurrenceLabel(next)}`,
          share: 0
        });
      }
      const advanced = advanceCadence(next, row.cadence);
      if (advanced <= next) break;
      next = advanced;
      guard += 1;
    }
  }

  const earnedThisMonth = earnedContributors.reduce((sum, row) => sum + row.amount, 0);
  const scheduledThisMonth = scheduledContributors.reduce((sum, row) => sum + row.amount, 0);
  const paceAmount = earnedThisMonth + scheduledThisMonth;
  const contributors = [...earnedContributors, ...scheduledContributors]
    .sort((a, b) => b.amount - a.amount)
    .map((row) => ({
      ...row,
      share: paceAmount > 0 ? Math.min(100, Math.max(0, (row.amount / paceAmount) * 100)) : 0
    }));

  return {
    currency: input.currency,
    earnedThisMonth,
    scheduledThisMonth,
    paceAmount,
    recurringRunRate,
    contributors,
    monthStart,
    monthEnd,
    daysLeft: Math.max(0, Math.ceil((monthEnd - now.getTime()) / 86400000))
  };
}
