import type {
  Asset,
  CurrencyCode,
  Holding,
  Liability,
  MarketQuote,
  Transaction
} from "./types";
import { UNKNOWN_FX_RATES, type FxRates } from "./fx";
import { holdingGain, rollupCategories, rollupCashflow, rollupNetWorth } from "./analytics";

export type MovementFeedKind = "cashflow" | "market" | "capital" | "shared" | "prompt";

export interface CapitalMovementDriver {
  key: "cashflow" | "market" | "manual" | "shared";
  label: string;
  amount: number;
}

export interface CapitalMovementFeedItem {
  id: string;
  kind: MovementFeedKind;
  text: string;
  amount?: number;
}

export interface CapitalMovementSummary {
  netWorth: number;
  monthDelta: number;
  cashflowDriver: number;
  marketDriver: number;
  manualDriver: number;
  sharedDriver: number;
  drivers: CapitalMovementDriver[];
  movementFeed: CapitalMovementFeedItem[];
}

export interface CapitalMovementInput {
  assets: Asset[];
  holdings: Holding[];
  liabilities: Liability[];
  transactions: Transaction[];
  quotes: Record<string, MarketQuote>;
  currency: CurrencyCode;
  rates?: FxRates | null;
  sharedDriver?: number;
  externalInvested?: number;
  externalLiabilities?: number;
  now?: Date;
}

function monthRange(now: Date) {
  return {
    selection: { preset: "month" as const },
    label: "This month",
    shortLabel: "Month",
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
}

export function buildCapitalMovement(input: CapitalMovementInput): CapitalMovementSummary {
  const now = input.now ?? new Date();
  const range = monthRange(now);
  const rates = input.rates ?? UNKNOWN_FX_RATES;
  const fx = { rates, currency: input.currency };
  const baseWorth = rollupNetWorth(
    input.assets,
    input.holdings,
    input.liabilities,
    input.quotes,
    fx
  );
  const externalInvested = input.externalInvested ?? 0;
  const externalLiabilities = input.externalLiabilities ?? 0;
  const worth = {
    ...baseWorth,
    invested: baseWorth.invested + externalInvested,
    liabilities: baseWorth.liabilities + externalLiabilities,
    netWorth: baseWorth.netWorth + externalInvested - externalLiabilities
  };
  const cashflow = rollupCashflow(input.transactions, range, fx);
  // holdingGain(…, fx) converts market value from its quote currency (USD when
  // live) and cost basis from holding.currency — converting the raw gain from
  // holding.currency here would mislabel USD-quoted value (QA 2026-06-24).
  const marketDriver = input.holdings.reduce(
    (sum, holding) => sum + holdingGain(holding, input.quotes, fx),
    0
  );
  const sharedDriver = input.sharedDriver ?? 0;
  const manualDriver = worth.liquid + worth.hardAssets - worth.liabilities;
  const monthDelta = cashflow.net + marketDriver + sharedDriver;
  const expenseCategories = rollupCategories(input.transactions, [], range, "expense", fx);
  const topExpense = expenseCategories[0];

  const movementFeed: CapitalMovementFeedItem[] = [];
  if (Math.abs(cashflow.net) > 0.005) {
    movementFeed.push({
      id: "cashflow",
      kind: "cashflow",
      text:
        cashflow.net >= 0
          ? "Income added more than spending removed this month."
          : "Spending is pulling net worth down this month.",
      amount: cashflow.net
    });
  }
  if (Math.abs(marketDriver) > 0.005) {
    movementFeed.push({
      id: "market",
      kind: "market",
      text: marketDriver >= 0 ? "Holdings are adding value." : "Holdings are lower than cost basis.",
      amount: marketDriver
    });
  }
  if (Math.abs(sharedDriver) > 0.005) {
    movementFeed.push({
      id: "shared",
      kind: "shared",
      text:
        sharedDriver >= 0
          ? "Shared money currently leans in your favor."
          : "Shared obligations reduce your available worth.",
      amount: sharedDriver
    });
  }
  if (topExpense && topExpense.total > 0) {
    movementFeed.push({
      id: "top-category",
      kind: "cashflow",
      text: `${topExpense.category.name} is the biggest spending driver this month.`,
      amount: -topExpense.total
    });
  }
  if (movementFeed.length === 0) {
    movementFeed.push({
      id: "missing-capital",
      kind: "prompt",
      text: "Add cash, debt, investments, or a shared pod to explain your capital movement."
    });
  }

  return {
    netWorth: worth.netWorth,
    monthDelta,
    cashflowDriver: cashflow.net,
    marketDriver,
    manualDriver,
    sharedDriver,
    drivers: [
      { key: "cashflow", label: "Cashflow", amount: cashflow.net },
      { key: "market", label: "Markets", amount: marketDriver },
      { key: "manual", label: "Assets and debt", amount: manualDriver },
      { key: "shared", label: "Shared money", amount: sharedDriver }
    ],
    movementFeed
  };
}

export function daysLeftInMonth(now = new Date()): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, end - now.getDate() + 1);
}
