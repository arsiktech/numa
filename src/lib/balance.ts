import { isManualFund } from "../../convex/lib/finance";
import { holdingValue, holdingValueCurrency } from "./analytics";
import { convertCurrency, UNKNOWN_FX_RATES, type FxRates } from "./fx";
import { quoteIsCurrent } from "@/services/marketData";
import type { Asset, CurrencyCode, Holding, Liability, MarketQuote } from "./types";

/**
 * The Balance home: everything you own, everything you owe, and what is left.
 *
 * Every row is rounded to cents first and every total is the sum of the
 * displayed rows, so the screen always reconciles to the cent. A row whose
 * currency cannot be converted is NaN, never zero; any NaN makes the totals
 * unavailable instead of quietly wrong.
 */
export type BalanceGroupId = "cash" | "investments" | "crypto" | "property" | "debt";

export type BalanceItemNote = "at-cost" | "stale-price" | "stale-balance";

export type BalanceItemSource = "asset" | "holding" | "liability" | "wallet";

export interface BalanceItem {
  id: string;
  /** Which record this row edits. Wallet rows summarise every tracked wallet. */
  source: BalanceItemSource;
  name: string;
  /** Quantity and ticker for holdings, e.g. "38 VOO". */
  detail?: string;
  /** Unit price in the quote currency when a quote exists. */
  unitPrice?: number;
  note?: BalanceItemNote;
  value: number;
}

export interface BalanceGroup {
  id: BalanceGroupId;
  side: "own" | "owe";
  value: number;
  items: BalanceItem[];
}

export interface BalanceSummary {
  currency: CurrencyCode;
  own: number;
  owe: number;
  net: number;
  /** False when any row needs an exchange rate we do not have. */
  available: boolean;
  /** Owned groups first (largest first), then debt. Empty groups are dropped. */
  groups: BalanceGroup[];
  /** Today's market move on priced holdings, or null without a current quote. */
  marketsToday: number | null;
  empty: boolean;
}

export interface BalanceWallet {
  id: string;
  label: string;
  assets: number;
  debts: number;
  fresh: boolean;
}

export interface BalanceInput {
  assets: Asset[];
  holdings: Holding[];
  liabilities: Liability[];
  quotes: Record<string, MarketQuote>;
  currency: CurrencyCode;
  rates?: FxRates | null;
  /** Public crypto wallets counted in net worth, already converted to `currency`.
   *  A value without an exchange rate is NaN and makes totals unavailable. */
  wallets?: BalanceWallet[];
  now?: number;
}

const cents = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN);
const sum = (values: number[]) => cents(values.reduce((total, value) => total + value, 0));

export function buildBalance(input: BalanceInput): BalanceSummary {
  const rates = input.rates ?? UNKNOWN_FX_RATES;
  const now = input.now ?? Date.now();
  const to = (amount: number, from: CurrencyCode) => cents(convertCurrency(amount, from, input.currency, rates));

  const investments: BalanceItem[] = [];
  const cash: BalanceItem[] = [];
  const property: BalanceItem[] = [];
  for (const asset of input.assets) {
    const item: BalanceItem = { id: asset.id, source: "asset", name: asset.name, value: to(asset.balance, asset.currency) };
    (asset.kind === "cash" ? cash : isManualFund(asset) ? investments : property).push(item);
  }

  const crypto: BalanceItem[] = [];
  let marketsToday = 0;
  let pricedToday = false;
  for (const holding of input.holdings) {
    const quote = input.quotes[holding.symbol];
    const valueCurrency = holdingValueCurrency(holding, quote);
    const value = to(holdingValue(holding, input.quotes), valueCurrency);
    const current = quoteIsCurrent(quote, now);
    const item: BalanceItem = {
      id: holding.id,
      source: "holding",
      name: holding.name || holding.symbol,
      detail: `${holding.quantity} ${holding.symbol}`,
      unitPrice: quote?.price,
      note: !quote ? "at-cost" : current ? undefined : "stale-price",
      value
    };
    (holding.kind === "crypto" ? crypto : investments).push(item);
    if (quote && current && Number.isFinite(quote.changePercent) && Number.isFinite(value)) {
      // value already includes today's move: value - value / (1 + p) is the change.
      marketsToday += value - value / (1 + quote.changePercent / 100);
      pricedToday = true;
    }
  }
  // A wallet amount without an exchange rate is NaN: keep it so totals turn unavailable.
  const present = (value: number) => Number.isNaN(value) || Math.abs(value) > 0.004;
  for (const wallet of input.wallets ?? []) {
    if (present(wallet.assets)) {
      crypto.push({
        id: wallet.id,
        source: "wallet",
        name: wallet.label,
        detail: "Public wallet",
        note: wallet.fresh ? undefined : "stale-balance",
        value: cents(wallet.assets)
      });
    }
  }

  const debt: BalanceItem[] = input.liabilities.map((liability) => ({
    id: liability.id,
    source: "liability" as const,
    name: liability.name,
    value: to(liability.balance, liability.currency)
  }));
  for (const wallet of input.wallets ?? []) {
    if (present(wallet.debts)) {
      debt.push({ id: wallet.id, source: "wallet", name: `${wallet.label} borrowing`, value: cents(wallet.debts) });
    }
  }

  const owned: BalanceGroup[] = (
    [
      ["cash", cash],
      ["investments", investments],
      ["crypto", crypto],
      ["property", property]
    ] as const
  )
    .filter(([, items]) => items.length > 0)
    .map(([id, items]) => ({ id, side: "own" as const, value: sum(items.map((item) => item.value)), items }))
    .sort((a, b) => (Number.isFinite(b.value) ? b.value : 0) - (Number.isFinite(a.value) ? a.value : 0));
  const debtGroup: BalanceGroup[] = debt.length
    ? [{ id: "debt", side: "owe", value: sum(debt.map((item) => item.value)), items: debt }]
    : [];

  const own = sum(owned.map((group) => group.value));
  const owe = debtGroup.length ? debtGroup[0]!.value : 0;
  const available = Number.isFinite(own) && Number.isFinite(owe);
  return {
    currency: input.currency,
    own,
    owe,
    net: available ? cents(own - owe) : NaN,
    available,
    groups: [...owned, ...debtGroup],
    marketsToday: pricedToday ? cents(marketsToday) : null,
    empty: owned.length === 0 && debtGroup.length === 0
  };
}

/**
 * Bar geometry on one shared scale: the wider of own and owe is 100%.
 * Returns flex weights so both rows line up exactly.
 */
export function balanceScale(summary: BalanceSummary) {
  const scale = Math.max(summary.own, summary.owe);
  if (!summary.available || scale <= 0) return null;
  return {
    scale,
    ownGap: scale - summary.own,
    left: Math.max(0, summary.net),
    shortfall: Math.max(0, -summary.net)
  };
}
