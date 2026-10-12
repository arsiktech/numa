import type { CategorySummary, Summary } from '@/domain/summary';
import type { CategoryId } from '@/domain/types';
import type { Point } from './series';

/** What you own and owe at one moment, shaped for the composition bar. */
export type Composition = {
  categories: CategorySummary[];
  ownCents: number;
  oweCents: number;
  netCents: number;
  /** Block names that replace the usual category names, for a snapshot's coarse split. */
  names?: Partial<Record<CategoryId, string>>;
};

// Only market-priced things move between snapshots and within a day.
const MARKET: CategoryId[] = ['crypto', 'stocks'];

function withShares(categories: CategorySummary[], ownCents: number): CategorySummary[] {
  return categories
    .filter((c) => c.cents > 0)
    .map((c) => ({ ...c, share: ownCents > 0 ? c.cents / ownCents : 0 }));
}

function scaled(categories: CategorySummary[], factor: number): CategorySummary[] {
  return categories.map((c) => ({
    ...c,
    cents: Math.round(c.cents * factor),
    liquidCents: Math.round(c.liquidCents * factor),
    cashCents: Math.round(c.cashCents * factor),
  }));
}

/**
 * The composition under the finger. Today is the live summary. A saved snapshot shows the
 * split it recorded. Other points (inside a day, or carried between snapshots) keep debts
 * and non-market things as they are and let crypto and stocks absorb the difference; when
 * that cannot work, or for the made-up demo history, every block scales together.
 */
export function compositionAt(point: Point | null, current: Summary, source: 'demo' | 'cloud'): Composition {
  const live = { categories: current.categories, ownCents: current.ownCents, oweCents: current.oweCents, netCents: current.netCents };
  if (!point) return live;

  if (point.parts) {
    const { liquidCents, investedCents, hardCents, oweCents } = point.parts;
    const ownCents = liquidCents + investedCents + hardCents;
    const blocks: CategorySummary[] = [
      { category: 'cash', cents: liquidCents, liquidCents, cashCents: liquidCents, share: 0 },
      { category: 'stocks', cents: investedCents, liquidCents: investedCents, cashCents: 0, share: 0 },
      { category: 'property', cents: hardCents, liquidCents: 0, cashCents: 0, share: 0 },
    ];
    return {
      categories: withShares(blocks, ownCents),
      ownCents, oweCents, netCents: ownCents - oweCents,
      names: { cash: 'Liquid', stocks: 'Invested', property: 'Property & things' },
    };
  }

  const ownCents = point.cents + current.oweCents;
  const result = (categories: CategorySummary[]) => ({ categories: withShares(categories, ownCents), ownCents, oweCents: current.oweCents, netCents: point.cents });
  if (ownCents <= 0 || current.ownCents <= 0) return result([]);

  const delta = ownCents - current.ownCents;
  const market = current.categories.filter((c) => MARKET.includes(c.category));
  const marketCents = market.reduce((s, c) => s + c.cents, 0);
  if (source === 'cloud' && marketCents > 0 && marketCents + delta >= 0) {
    const factor = (marketCents + delta) / marketCents;
    return result(current.categories.map((c) => (MARKET.includes(c.category) ? scaled([c], factor)[0] : c)));
  }
  return result(scaled(current.categories, ownCents / current.ownCents));
}
