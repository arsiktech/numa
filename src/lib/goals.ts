import type {
  Asset,
  Category,
  Holding,
  MarketQuote,
  NetWorthGoal,
  RecurringTransaction,
  Transaction
} from "./types";
import type { CurrencyCode } from "./money";
import { convertCurrency, UNKNOWN_FX_RATES, type FxRates } from "./fx";
import { holdingValue, holdingValueCurrency } from "./analytics";
import { buildMonthlyIncomePace } from "./monthlyIncome";

export interface GoalProgressInput {
  netWorth: number;
  netWorthCurrency: CurrencyCode;
  transactions: Transaction[];
  recurring?: RecurringTransaction[];
  categories: Category[];
  assets: Asset[];
  holdings: Holding[];
  quotes: Record<string, MarketQuote>;
  rates?: FxRates | null;
  now?: number | Date;
}

export interface GoalProgress {
  current: number;
  target: number;
  pct: number;
  remaining: number;
  label: string;
  detail: string;
}

function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates?: FxRates | null) {
  return convertCurrency(amount, from, to, rates ?? UNKNOWN_FX_RATES);
}

export function goalScope(goal: NetWorthGoal) {
  return goal.scope ?? "net_worth";
}

export function computeGoalProgress(goal: NetWorthGoal, input: GoalProgressInput): GoalProgress {
  const scope = goalScope(goal);
  const startAt = goal.startAt ?? goal.createdAt;
  let current = 0;
  let fallbackLabel = "Goal";
  let detail = "Progress";

  if (scope === "net_worth") {
    current = convert(input.netWorth, input.netWorthCurrency, goal.currency, input.rates);
    fallbackLabel = `Reach ${goal.currency} ${goal.target.toLocaleString()}`;
    detail = "Net worth";
  }

  if (scope === "monthly_income") {
    const pace = buildMonthlyIncomePace({
      transactions: input.transactions,
      recurring: input.recurring ?? [],
      categories: input.categories,
      currency: goal.currency,
      rates: input.rates,
      now: input.now
    });
    current = pace.paceAmount;
    fallbackLabel = "Monthly income";
    detail =
      pace.scheduledThisMonth > 0
        ? "Booked plus scheduled income this month"
        : "Booked income this month";
  }

  if (scope === "income_category") {
    const category = input.categories.find((c) => c.id === goal.categoryId);
    current = input.transactions
      .filter(
        (tx) =>
          tx.kind === "income" &&
          tx.categoryId === goal.categoryId &&
          tx.occurredAt >= startAt
      )
      .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, goal.currency, input.rates), 0);
    fallbackLabel = category ? `${category.name} income` : "Income category";
    detail = `Income since ${new Date(startAt).toLocaleDateString()}`;
  }

  if (scope === "asset_value") {
    const asset = input.assets.find((a) => a.id === goal.assetId);
    current = asset ? convert(asset.balance, asset.currency, goal.currency, input.rates) : 0;
    fallbackLabel = asset?.name ?? "Asset value";
    detail = asset ? "Current asset value" : "Missing asset";
  }

  if (scope === "holding_value") {
    const holding = input.holdings.find((h) => h.id === goal.holdingId);
    current = holding
      ? convert(
          holdingValue(holding, input.quotes),
          holdingValueCurrency(holding, input.quotes[holding.symbol]),
          goal.currency,
          input.rates
        )
      : 0;
    fallbackLabel = holding?.name ?? "Holding value";
    detail = holding ? "Current holding value" : "Missing holding";
  }

  const pct = goal.target > 0 ? Math.max(0, Math.min(100, (current / goal.target) * 100)) : 0;
  return {
    current,
    target: goal.target,
    pct,
    remaining: Math.max(0, goal.target - current),
    label: goal.label ?? fallbackLabel,
    detail
  };
}

export function migrateGoalShape(goal: Partial<NetWorthGoal>): NetWorthGoal {
  const createdAt = goal.createdAt ?? Date.now();
  return {
    id: goal.id ?? `goal-${createdAt}`,
    portfolioId: goal.portfolioId ?? "",
    scope: goal.scope ?? "net_worth",
    target: goal.target ?? 0,
    currency: goal.currency ?? "EUR",
    startAt: goal.startAt ?? createdAt,
    deadline: goal.deadline,
    label: goal.label,
    categoryId: goal.categoryId,
    assetId: goal.assetId,
    holdingId: goal.holdingId,
    createdAt
  };
}
