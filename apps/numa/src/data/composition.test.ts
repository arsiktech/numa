import type { CloudSnapshot, CloudHolding } from '@/cloud/api';
import { fromSnapshot } from './fromSnapshot';
import { itemsFrom } from './items';
import { denseSeries, gridFor, pricedPiecesOf } from './intraday';
import type { CategorySummary, Summary } from '@/domain/summary';
import { summarize } from '@/domain/summary';
import type { Holding } from '@/domain/types';
import { compositionAt } from './composition';

const cat = (category: CategorySummary['category'], cents: number): CategorySummary => ({ category, cents, liquidCents: cents, cashCents: category === 'cash' ? cents : 0, share: 0, marketCents: category === 'stocks' || category === 'crypto' ? cents : 0, marketLiquidCents: category === 'stocks' || category === 'crypto' ? cents : 0, marketCashCents: 0 });
const current: Summary = {
  ownCents: 100_000, oweCents: 20_000, netCents: 80_000, liquidCents: 100_000, cashCents: 30_000,
  categories: [cat('cash', 30_000), cat('crypto', 50_000), cat('property', 20_000)], unknown: [], stale: [],
} as Summary;

describe('compositionAt', () => {
  it('is today when nothing is under the finger', () => {
    expect(compositionAt(null, current, 'cloud')).toMatchObject({ ownCents: 100_000, oweCents: 20_000, netCents: 80_000 });
  });

  it('shows the split a saved snapshot recorded, with its own debts', () => {
    const c = compositionAt({ t: 1, cents: 50_000, parts: { liquidCents: 20_000, investedCents: 30_000, hardCents: 10_000, oweCents: 10_000 } }, current, 'cloud');
    expect(c.ownCents).toBe(60_000);
    expect(c.oweCents).toBe(10_000);
    expect(c.netCents).toBe(50_000);
    expect(c.categories.map((x) => [x.category, x.cents])).toEqual([['cash', 20_000], ['stocks', 30_000], ['property', 10_000]]);
    expect(c.names?.stocks).toBe('Invested');
  });

  it('lets crypto and stocks absorb a move inside the day, with cash and debts unchanged', () => {
    const c = compositionAt({ t: 1, cents: 70_000 }, current, 'cloud');
    expect(c.ownCents).toBe(90_000);
    expect(c.oweCents).toBe(20_000);
    expect(c.categories.find((x) => x.category === 'cash')?.cents).toBe(30_000);
    expect(c.categories.find((x) => x.category === 'crypto')?.cents).toBe(40_000);
    expect(c.categories.reduce((s, x) => s + x.cents, 0)).toBe(90_000);
  });

  it('scales every block when the market alone cannot explain the difference', () => {
    const c = compositionAt({ t: 1, cents: 10_000 }, current, 'cloud');
    expect(c.ownCents).toBe(30_000);
    expect(c.categories.find((x) => x.category === 'cash')?.cents).toBe(9_000);
  });

  it('scales the demo together', () => {
    const c = compositionAt({ t: 1, cents: 180_000 }, current, 'demo');
    expect(c.ownCents).toBe(200_000);
    expect(c.categories.find((x) => x.category === 'property')?.cents).toBe(40_000);
  });

  it('shows nothing owned rather than negative blocks', () => {
    expect(compositionAt({ t: 1, cents: -30_000 }, current, 'cloud').categories).toEqual([]);
  });
});

describe('mixed quoted and manual stock categories', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const h = (id: string, cents: number, manual: boolean, liquidity: Holding['liquidity'], category: Holding['category'] = 'stocks'): Holding => ({ id, name: id, category, liquidity, valuation: manual ? { kind: 'manual', valueCents: cents, asOf: now.toISOString(), remindAfterDays: 180 } : { kind: 'synced', valueCents: cents, asOf: now.toISOString(), source: 'Synthetic quote' } });
  it.each([false, true])('moves only the quoted subset with differing liquidity, reversed=%s', (reversed) => {
    const holdings = [h('fund', 30_000, true, { kind: reversed ? 'illiquid' : 'liquid' }), h('quoted', 20_000, false, { kind: reversed ? 'liquid' : 'illiquid' }), h('cash', 10_000, true, { kind: 'cash' }, 'cash')];
    const summary = summarize(holdings, [], now);
    expect(summary.categories.find((c) => c.category === 'stocks')).toMatchObject({ cents: 50_000, marketCents: 20_000, marketLiquidCents: reversed ? 20_000 : 0 });
    const c = compositionAt({ t: 1, cents: 50_000 }, summary, 'cloud');
    expect(c.categories.find((c) => c.category === 'stocks')).toMatchObject({ cents: 40_000, liquidCents: reversed ? 10_000 : 30_000, cashCents: 0, marketCents: 10_000, marketLiquidCents: reversed ? 10_000 : 0 });
    expect(c.categories.reduce((s, c) => s + c.cents, 0)).toBe(c.ownCents);
    expect(c.categories.find((c) => c.category === 'cash')?.cents).toBe(10_000);
  });
  it('scales quoted crypto too, and never assigns a market subset to manual funds', () => {
    const summary = summarize([h('fund', 30_000, true, { kind: 'liquid' }), h('stock', 20_000, false, { kind: 'liquid' }), h('coin', 10_000, false, { kind: 'cash' }, 'crypto')], [], now);
    const c = compositionAt({ t: 1, cents: 45_000 }, summary, 'cloud');
    expect(c.categories.find((c) => c.category === 'stocks')).toMatchObject({ cents: 40_000, liquidCents: 40_000, marketCents: 10_000 });
    expect(c.categories.find((c) => c.category === 'crypto')).toMatchObject({ cents: 5000, liquidCents: 5000, cashCents: 5000, marketCents: 5000 });
    expect(summarize([h('fund', 30_000, true, { kind: 'liquid' })], [], now).categories[0].marketCents).toBe(0);
  });
});

describe('market subset accounting boundaries', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  it('admits live and delayed quotes but not manual or missing prices', () => {
    const valuations: Holding['valuation'][] = [
      { kind: 'live', valueCents: 1000, asOf: now.toISOString() },
      { kind: 'delayed', valueCents: 2000, asOf: now.toISOString(), delayMinutes: 15 },
      { kind: 'manual', valueCents: 3000, asOf: now.toISOString(), remindAfterDays: 180 },
      { kind: 'missing', lastKnownCents: 4000, lastKnownAt: null },
    ];
    const summary = summarize(valuations.map((valuation, i) => ({ id: String(i), name: 'Synthetic', category: 'stocks' as const, liquidity: { kind: 'liquid' as const }, valuation })), [], now);
    expect(summary.categories[0]).toMatchObject({ cents: 10_000, marketCents: 3000, marketLiquidCents: 3000 });
    expect(compositionAt({ t: 1, cents: 13_000 }, summary, 'cloud').categories[0]).toMatchObject({ cents: 13_000, marketCents: 6000, liquidCents: 13_000 });
    expect(compositionAt({ t: 1, cents: 7000 }, summary, 'cloud').categories[0]).toMatchObject({ cents: 7000, marketCents: 0, liquidCents: 7000 });
  });
});


describe('actual price-history admission beside a manual fund', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const t = now.getTime();
  function snapshot(kind: CloudHolding['kind'], costOnly = false): CloudSnapshot {
    return {
      portfolio: { id: 'synthetic-space', name: 'Synthetic', defaultCurrency: 'USD' },
      assets: [{ id: 'manual-fund', name: 'Synthetic mutual fund', kind: 'other', investmentType: 'fund', balance: 300, currency: 'USD', updatedAt: t }],
      holdings: [{ id: 'quoted', symbol: 'SYNTH', name: 'Synthetic quoted holding', kind, quantity: 1, costBasis: 200, currency: 'USD', acquiredAt: t - 86400000, marketPrice: 200, changePercent: 0, quoteProvider: costOnly ? null : 'finnhub', quoteUpdatedAt: costOnly ? null : t - 2 * 86400000, quoteStale: !costOnly }],
      categories: [], transactions: [], liabilities: [], wealthSnapshots: [],
    };
  }
  it.each(['crypto', 'stock'] as const)('keeps manual value fixed when a stale %s quote still has price history', (kind) => {
    const s = snapshot(kind);
    const data = fromSnapshot(s, null, now);
    const summary = summarize(data.holdings, data.debts, now);
    const pieces = pricedPiecesOf(itemsFrom(s, data, t));
    expect(pieces).toEqual([{ symbol: 'SYNTH', kind, valueCents: 20_000 }]);
    const grid = gridFor('1D', t);
    const points = denseSeries('1D', t, summary.netCents, pieces, { SYNTH: { t: grid, p: grid.map((_, i) => i === grid.length - 1 ? 200 : 100) } })!;
    expect(points[0].cents).toBe(40_000);
    const composition = compositionAt(points[0], summary, 'cloud');
    const stocks = composition.categories.find(c => c.category === 'stocks')!;
    expect(stocks.cents - stocks.marketCents).toBe(30_000);
    expect(composition.categories.reduce((sum, c) => sum + c.marketCents, 0)).toBe(10_000);
    expect(composition.ownCents).toBe(points[0].cents);
    expect(data.holdings.find(h => h.id === 'quoted')?.valuation.kind).toBe('missing');
    expect(data.holdings.find(h => h.id === 'manual-fund')?.valuation.kind).toBe('manual');
  });
  it('does not infer price movement from a cost-only fallback without a quote anchor', () => {
    const s = snapshot('stock', true);
    const data = fromSnapshot(s, null, now);
    const summary = summarize(data.holdings, [], now);
    const pieces = pricedPiecesOf(itemsFrom(s, data, t));
    expect(pieces).toEqual([]);
    expect(denseSeries('1D', t, summary.netCents, pieces, { SYNTH: { t: [t - 86400000, t], p: [100, 200] } })).toBeNull();
    expect(summary.categories[0].marketCents).toBe(0);
    expect(summary.netCents).toBe(50_000);
  });
});
