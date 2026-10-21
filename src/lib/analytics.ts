import { isManualFund } from "../../convex/lib/finance";
import type {
  Asset,
  Category,
  CurrencyCode,
  Holding,
  Liability,
  MarketQuote,
  Membership,
  Portfolio,
  Settlement,
  Transaction
} from "./types";
import type { PeriodRange } from "./period";
import { isWithin } from "./period";
import { convertCurrency, type FxRates } from "./fx";

/**
 * Common optional conversion target. When both fields are provided, the rollup
 * converts mixed-currency amounts to `currency` before summing. When omitted
 * (the legacy callsites), the rollup behaves exactly as before — amounts are
 * summed as-is. Keeps signatures backwards compatible.
 */
interface FxOpts {
  rates?: FxRates;
  currency?: CurrencyCode;
}

/** Convert a value if both rates+target are present, otherwise return as-is. */
function maybeConvert(
  amount: number,
  from: CurrencyCode,
  opts?: FxOpts
): number {
  if (!opts || !opts.rates || !opts.currency) return amount;
  return convertCurrency(amount, from, opts.currency, opts.rates);
}

export interface CashflowRollup {
  income: number;
  expense: number;
  net: number;
  margin: number; // ratio 0..1 of net / income
}

export function rollupCashflow(
  transactions: Transaction[],
  range: PeriodRange,
  fx?: FxOpts
): CashflowRollup {
  const filtered = transactions.filter((t) => isWithin(range, t.occurredAt));
  const income = filtered
    .filter((t) => t.kind === "income")
    .reduce((sum, t) => sum + maybeConvert(t.amount, t.currency, fx), 0);
  const expense = filtered
    .filter((t) => t.kind === "expense")
    .reduce((sum, t) => sum + maybeConvert(t.amount, t.currency, fx), 0);
  const net = income - expense;
  const margin = income > 0 ? net / income : 0;
  return { income, expense, net, margin };
}

export interface DuplicateGroup {
  /** Transactions that look like duplicates of each other (same amount + similar description + close in time). */
  txs: Transaction[];
  reason: string;
}

/**
 * Find potential duplicate transactions in a portfolio.
 *
 * Heuristic — groups by (kind, currency, amount rounded to cents) and within each
 * group flags pairs that:
 *   1. Are within 3 days of each other, AND
 *   2. Have descriptions that are case-insensitive equal OR one contains the other.
 *
 * False positives are fine — the UI lets the user dismiss. Goal is to surface
 * obvious "I scanned and also manually logged the same coffee" cases.
 */
export function findDuplicateTransactions(transactions: Transaction[]): DuplicateGroup[] {
  const DAY = 1000 * 60 * 60 * 24;
  const THRESHOLD = DAY * 3;
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = `${tx.kind}|${tx.currency}|${Math.round(tx.amount * 100)}`;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }
  const dupGroups: DuplicateGroup[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Sort by occurredAt so neighbor comparisons are O(n).
    list.sort((a, b) => a.occurredAt - b.occurredAt);
    const visited = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      if (visited.has(list[i]!.id)) continue;
      const cluster: Transaction[] = [list[i]!];
      const baseDesc = list[i]!.description.trim().toLowerCase();
      for (let j = i + 1; j < list.length; j++) {
        if (visited.has(list[j]!.id)) continue;
        if (list[j]!.occurredAt - list[i]!.occurredAt > THRESHOLD) break;
        const otherDesc = list[j]!.description.trim().toLowerCase();
        if (!baseDesc || !otherDesc) continue;
        const matches =
          baseDesc === otherDesc ||
          baseDesc.includes(otherDesc) ||
          otherDesc.includes(baseDesc);
        if (matches) {
          cluster.push(list[j]!);
          visited.add(list[j]!.id);
        }
      }
      if (cluster.length >= 2) {
        visited.add(list[i]!.id);
        dupGroups.push({
          txs: cluster,
          reason: `${cluster.length}× ${cluster[0]!.description} · same amount within ${
            Math.round((cluster[cluster.length - 1]!.occurredAt - cluster[0]!.occurredAt) / DAY) + 1
          } days`
        });
      }
    }
  }
  return dupGroups;
}

export interface SpendForecast {
  /** Spend so far this calendar month (current month only — not the global picker's range). */
  spentSoFar: number;
  /** 1..31 — which day of the month we're on. */
  dayOfMonth: number;
  /** Days in this calendar month. */
  daysInMonth: number;
  /** Linear extrapolation: spentSoFar * (daysInMonth / dayOfMonth). */
  projected: number;
  /** Total spent last calendar month — for the delta callout. */
  lastMonth: number;
  /** projected - lastMonth. Positive = pacing higher than last month. */
  deltaVsLastMonth: number;
}

/**
 * Quick linear forecast for the current calendar month based on the daily
 * spend rate so far. Not a regression — just a "at this rate" intuition.
 * Compares against the previous full calendar month so the user sees if
 * they're pacing higher or lower than usual.
 */
export function forecastMonthlySpend(
  transactions: Transaction[],
  fx?: FxOpts,
  now = new Date()
): SpendForecast {
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();
  const prevStart = new Date(year, month - 1, 1).getTime();
  const prevEnd = monthStart;

  let spentSoFar = 0;
  let lastMonth = 0;
  for (const tx of transactions) {
    if (tx.kind !== "expense") continue;
    const converted = maybeConvert(tx.amount, tx.currency, fx);
    if (tx.occurredAt >= monthStart && tx.occurredAt < monthEnd && tx.occurredAt <= now.getTime()) {
      spentSoFar += converted;
    } else if (tx.occurredAt >= prevStart && tx.occurredAt < prevEnd) {
      lastMonth += converted;
    }
  }
  const projected = dayOfMonth > 0 ? spentSoFar * (daysInMonth / dayOfMonth) : 0;
  return {
    spentSoFar,
    dayOfMonth,
    daysInMonth,
    projected,
    lastMonth,
    deltaVsLastMonth: projected - lastMonth
  };
}

/**
 * Live quotes (Stooq, CoinGecko, …) are USD-denominated regardless of the
 * holding's own currency; only the no-quote cost-basis fallback is in the
 * holding's currency. Anyone converting a holding's market value must convert
 * from this currency — not `holding.currency` — whenever a quote is present.
 */
export const QUOTE_CURRENCY: CurrencyCode = "USD";

/** The currency `holdingValue` is denominated in for the given quote (if any). */
export function holdingValueCurrency(
  holding: Holding,
  quote: MarketQuote | undefined
): CurrencyCode {
  return quote ? QUOTE_CURRENCY : holding.currency;
}

export function holdingValue(holding: Holding, quotes: Record<string, MarketQuote>) {
  const quote = quotes[holding.symbol];
  // No-quote fallback prices the position at cost, for any quantity — the
  // unclamped divide keeps fractional holdings (0.5 BTC) at full cost basis.
  const price =
    quote?.price ?? (holding.quantity > 0 ? holding.costBasis / holding.quantity : 0);
  return price * holding.quantity;
}

export function holdingGain(
  holding: Holding,
  quotes: Record<string, MarketQuote>,
  fx?: FxOpts
) {
  // Market value (USD when quoted) and cost basis (holding currency) must be
  // brought to a common currency before subtracting. Without fx opts this
  // degrades to the legacy same-currency assumption.
  const value = maybeConvert(
    holdingValue(holding, quotes),
    holdingValueCurrency(holding, quotes[holding.symbol]),
    fx
  );
  return value - maybeConvert(holding.costBasis, holding.currency, fx);
}

export interface NetWorthBreakdown {
  liquid: number; // cash + savings (assets with kind=cash)
  invested: number; // holdings at market plus manually valued funds
  hardAssets: number; // non-cash, non-market assets
  liabilities: number;
  netWorth: number;
}

export function rollupNetWorth(
  assets: Asset[],
  holdings: Holding[],
  liabilities: Liability[],
  quotes: Record<string, MarketQuote>,
  fx?: FxOpts
): NetWorthBreakdown {
  const liquid = assets
    .filter((a) => a.kind === "cash")
    .reduce((sum, a) => sum + maybeConvert(a.balance, a.currency, fx), 0);
  const hardAssets = assets
    .filter((a) => a.kind !== "cash" && !isManualFund(a))
    .reduce((sum, a) => sum + maybeConvert(a.balance, a.currency, fx), 0);
  const manualInvested = assets.filter(isManualFund)
    .reduce((sum, a) => sum + maybeConvert(a.balance, a.currency, fx), 0);
  const invested = manualInvested + holdings.reduce(
    (sum, h) =>
      sum + maybeConvert(holdingValue(h, quotes), holdingValueCurrency(h, quotes[h.symbol]), fx),
    0
  );
  const debts = liabilities.reduce(
    (sum, l) => sum + maybeConvert(l.balance, l.currency, fx),
    0
  );
  return {
    liquid,
    invested,
    hardAssets,
    liabilities: debts,
    netWorth: liquid + invested + hardAssets - debts
  };
}

/**
 * Per-portfolio "what's mine in this pot" view from the current user's perspective.
 * A shared portfolio with 60% ownership means I get 60% of its net worth attributed
 * to me, the other 40% sits with my collaborators.
 */
export interface PortfolioShareRow {
  portfolio: Portfolio;
  /** My membership share, in basis points (0..10_000). Personal portfolios = 10_000. */
  ownershipBps: number;
  /** The portfolio's full net worth (everyone's combined). */
  portfolioNetWorth: number;
  /** Just my slice — `portfolioNetWorth * ownershipBps / 10_000`. */
  myShare: number;
  breakdown: NetWorthBreakdown;
  /** The breakdown but only my slice. */
  myBreakdown: NetWorthBreakdown;
}

export interface MyShareSummary {
  /** Sum of my slices across every portfolio I'm a member of. */
  total: number;
  liquid: number;
  invested: number;
  hardAssets: number;
  liabilities: number;
  rows: PortfolioShareRow[];
}

/**
 * Roll up "what's mine, total, across every portfolio I belong to."
 *
 * For each portfolio I'm a member of:
 *   slice = portfolioNetWorth × (myMembership.ownershipBps / 10_000)
 *
 * Personal portfolios collapse to 100%. Shared/family portfolios contribute only
 * the share my membership owns. Portfolios I'm NOT a member of are skipped entirely.
 *
 * Each portfolio's breakdown is computed in its OWN defaultCurrency first. Then,
 * when summing across portfolios into the cross-portfolio totals, every slice is
 * converted into `fx.currency` (typically the active portfolio's currency) so
 * `myShare.total` is a consistent number rather than a meaningless USD+EUR mash-up.
 */
export function computeMyShareAcrossPortfolios(
  currentUserId: string,
  portfolios: Portfolio[],
  memberships: Membership[],
  assets: Asset[],
  holdings: Holding[],
  liabilities: Liability[],
  quotes: Record<string, MarketQuote>,
  fx?: FxOpts
): MyShareSummary {
  const rows: PortfolioShareRow[] = [];
  for (const portfolio of portfolios) {
    // Native business spaces represent entity records, not a personal asset.
    // Never infer 100% economic ownership from the compatibility owner role or
    // double-count a business already represented as a personal investment.
    if (portfolio.spaceKind === "business") continue;
    const myMembership = memberships.find(
      (m) => m.portfolioId === portfolio.id && m.userId === currentUserId
    );
    if (!myMembership) continue;
    const pAssets = assets.filter((a) => a.portfolioId === portfolio.id);
    const pHoldings = holdings.filter((h) => h.portfolioId === portfolio.id);
    const pLiabilities = liabilities.filter((l) => l.portfolioId === portfolio.id);
    // Per-portfolio rollup is presented in the portfolio's own defaultCurrency.
    const perPortfolioFx: FxOpts | undefined = fx?.rates
      ? { rates: fx.rates, currency: portfolio.defaultCurrency }
      : undefined;
    const breakdown = rollupNetWorth(
      pAssets,
      pHoldings,
      pLiabilities,
      quotes,
      perPortfolioFx
    );
    const factor = myMembership.ownershipBps / 10_000;
    const myBreakdown: NetWorthBreakdown = {
      liquid: breakdown.liquid * factor,
      invested: breakdown.invested * factor,
      hardAssets: breakdown.hardAssets * factor,
      liabilities: breakdown.liabilities * factor,
      netWorth: breakdown.netWorth * factor
    };
    rows.push({
      portfolio,
      ownershipBps: myMembership.ownershipBps,
      portfolioNetWorth: breakdown.netWorth,
      myShare: myBreakdown.netWorth,
      breakdown,
      myBreakdown
    });
  }
  // Sort biggest contribution to smallest by my-share absolute value
  rows.sort((a, b) => Math.abs(b.myShare) - Math.abs(a.myShare));
  // Cross-portfolio totals — each row is in its own portfolio currency, so we
  // must convert every slice into the caller-supplied target currency before
  // summing. Without conversion, summing across mismatched currencies is the
  // exact bug this whole change is fixing.
  const convertSlice = (amount: number, from: CurrencyCode) =>
    maybeConvert(amount, from, fx);
  return {
    total: rows.reduce(
      (s, r) => s + convertSlice(r.myBreakdown.netWorth, r.portfolio.defaultCurrency),
      0
    ),
    liquid: rows.reduce(
      (s, r) => s + convertSlice(r.myBreakdown.liquid, r.portfolio.defaultCurrency),
      0
    ),
    invested: rows.reduce(
      (s, r) => s + convertSlice(r.myBreakdown.invested, r.portfolio.defaultCurrency),
      0
    ),
    hardAssets: rows.reduce(
      (s, r) => s + convertSlice(r.myBreakdown.hardAssets, r.portfolio.defaultCurrency),
      0
    ),
    liabilities: rows.reduce(
      (s, r) => s + convertSlice(r.myBreakdown.liabilities, r.portfolio.defaultCurrency),
      0
    ),
    rows
  };
}

export interface CategoryRollup {
  category: Category;
  total: number;
  count: number;
  share: number; // 0..1
}

export function rollupCategories(
  transactions: Transaction[],
  categories: Category[],
  range: PeriodRange,
  kind: "income" | "expense",
  fx?: FxOpts
): CategoryRollup[] {
  const inRange = transactions.filter(
    (t) => t.kind === kind && isWithin(range, t.occurredAt)
  );
  const totals = new Map<string | undefined, { total: number; count: number }>();
  for (const tx of inRange) {
    const entry = totals.get(tx.categoryId) ?? { total: 0, count: 0 };
    entry.total += maybeConvert(tx.amount, tx.currency, fx);
    entry.count += 1;
    totals.set(tx.categoryId, entry);
  }
  const grand = Array.from(totals.values()).reduce((s, e) => s + e.total, 0) || 1;
  return categories
    .filter((c) => c.kind === kind)
    .map((category) => {
      const entry = totals.get(category.id) ?? { total: 0, count: 0 };
      return { category, total: entry.total, count: entry.count, share: entry.total / grand };
    })
    .sort((a, b) => b.total - a.total);
}

export interface SnapshotPoint {
  takenAt: number;
  netWorth: number;
  liquid: number;
  invested: number;
  hardAssets: number;
  liabilities: number;
}

export interface OwedRow {
  userId: string;
  displayName: string;
  paid: number; // they paid this much for the portfolio in period
  share: number; // owed this much based on ownership/splits
  owed: number; // share - paid; negative = they owe; positive = they're owed
}

export function computeOwedMatrix(
  transactions: Transaction[],
  memberships: Membership[],
  settlements: Settlement[],
  range: PeriodRange,
  fx?: FxOpts
): OwedRow[] {
  const memberIndex = new Map(memberships.map((m) => [m.userId, m] as const));
  const paid = new Map<string, number>();
  const share = new Map<string, number>();

  const inRange = transactions.filter(
    (t) => t.kind === "expense" && isWithin(range, t.occurredAt)
  );

  for (const tx of inRange) {
    const amount = maybeConvert(tx.amount, tx.currency, fx);
    paid.set(tx.createdByUserId, (paid.get(tx.createdByUserId) ?? 0) + amount);
    if (tx.splits && tx.splits.length > 0) {
      const totalBps = tx.splits.reduce((s, sp) => s + sp.bps, 0) || 10000;
      for (const split of tx.splits) {
        const portion = (amount * split.bps) / totalBps;
        share.set(split.userId, (share.get(split.userId) ?? 0) + portion);
      }
    } else {
      for (const m of memberships) {
        const portion = (amount * m.ownershipBps) / 10000;
        share.set(m.userId, (share.get(m.userId) ?? 0) + portion);
      }
    }
  }

  for (const settlement of settlements) {
    if (settlement.occurredAt < range.start.getTime() || settlement.occurredAt > range.end.getTime())
      continue;
    const amount = maybeConvert(settlement.amount, settlement.currency, fx);
    paid.set(settlement.fromUserId, (paid.get(settlement.fromUserId) ?? 0) + amount);
    paid.set(settlement.toUserId, (paid.get(settlement.toUserId) ?? 0) - amount);
  }

  return memberships.map((m) => {
    const member = memberIndex.get(m.userId)!;
    const paidByUser = paid.get(m.userId) ?? 0;
    const shareForUser = share.get(m.userId) ?? 0;
    return {
      userId: m.userId,
      displayName: member.displayName,
      paid: paidByUser,
      share: shareForUser,
      owed: paidByUser - shareForUser
    };
  });
}
