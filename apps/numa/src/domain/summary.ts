import type { CategoryId, Debt, Holding, Valuation } from './types';

export const CATEGORY_ORDER: CategoryId[] = ['crypto', 'stocks', 'business', 'property', 'cash', 'things'];

/** The value a holding contributes to totals, or null when it is unknown. Missing prices fall back to the last known value. */
export function countedValue(v: Valuation): { cents: number; stale: boolean } | null {
  if (v.kind === 'missing') return v.lastKnownCents === null ? null : { cents: v.lastKnownCents, stale: true };
  return { cents: v.valueCents, stale: false };
}

export function isStale(v: Valuation, now: Date): boolean {
  if (v.kind === 'missing') return true;
  if (v.kind !== 'manual') return false;
  const ageDays = (now.getTime() - new Date(v.asOf).getTime()) / 86_400_000;
  return ageDays > v.remindAfterDays;
}

export type CategorySummary = { category: CategoryId; cents: number; liquidCents: number; cashCents: number; share: number; marketCents: number; marketLiquidCents: number; marketCashCents: number };

export type Summary = {
  ownCents: number;
  oweCents: number;
  netCents: number;
  /** Cash plus what can be sold within a week, before anything owed. */
  liquidCents: number;
  /** `liquidCents` minus everything owed. Negative when the debts are bigger; never clamped. */
  liquidAfterDebtsCents: number;
  cashCents: number;
  categories: CategorySummary[];
  /** Holdings left out of every total because nothing is known about their value. */
  unknown: Holding[];
  /** Holdings counted at a last known value or past their manual reminder. */
  stale: Holding[];
};

export function summarize(holdings: Holding[], debts: Debt[], now: Date): Summary {
  const byCat = new Map<CategoryId, { cents: number; liquid: number; cash: number; market: number; marketLiquid: number; marketCash: number }>();
  const unknown: Holding[] = [];
  const stale: Holding[] = [];
  for (const h of holdings) {
    const counted = countedValue(h.valuation);
    if (!counted) { unknown.push(h); continue; }
    if (counted.stale || isStale(h.valuation, now)) stale.push(h);
    const acc = byCat.get(h.category) ?? { cents: 0, liquid: 0, cash: 0, market: 0, marketLiquid: 0, marketCash: 0 };
    acc.cents += counted.cents;
    // Pledged collateral backs a loan, so it is owned but not liquid until the loan is repaid.
    if (h.liquidity.kind === 'liquid' || h.liquidity.kind === 'cash') acc.liquid += counted.cents;
    if (h.liquidity.kind === 'cash') acc.cash += counted.cents;
    // A last-known quote can still anchor retrieved history; a cost-only fallback cannot.
    const marketAnchor = h.valuation.kind === 'missing' ? h.valuation.lastKnownAt !== null : h.valuation.kind !== 'manual';
    if ((h.category === 'stocks' || h.category === 'crypto') && marketAnchor) {
      acc.market += counted.cents;
      if (h.liquidity.kind === 'liquid' || h.liquidity.kind === 'cash') acc.marketLiquid += counted.cents;
      if (h.liquidity.kind === 'cash') acc.marketCash += counted.cents;
    }
    byCat.set(h.category, acc);
  }
  const ownCents = [...byCat.values()].reduce((s, a) => s + a.cents, 0);
  const oweCents = debts.reduce((s, d) => s + d.balanceCents, 0);
  const categories = CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => {
    const a = byCat.get(c)!;
    return { category: c, cents: a.cents, liquidCents: a.liquid, cashCents: a.cash, share: ownCents ? a.cents / ownCents : 0, marketCents: a.market, marketLiquidCents: a.marketLiquid, marketCashCents: a.marketCash };
  });
  const liquidCents = categories.reduce((s, c) => s + c.liquidCents, 0);
  return {
    ownCents,
    oweCents,
    netCents: ownCents - oweCents,
    liquidCents,
    liquidAfterDebtsCents: liquidCents - oweCents,
    cashCents: categories.reduce((s, c) => s + c.cashCents, 0),
    categories,
    unknown,
    stale,
  };
}
