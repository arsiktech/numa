import type { CloudSnapshot } from '@/cloud/api';
import { ago, freshness } from '@/domain/freshness';
import { deletePlan, editPlan, fieldProblems, holdingFields, monthYear, parseBought } from './editPlan';
import { fromSnapshot } from './fromSnapshot';
import { gainOf, groupTotal, itemsFrom } from './items';

const now = new Date('2026-10-12T09:00:00Z');
const t = now.getTime();
const DAY = 86_400_000;
const fx = { usdPerEur: 1.25, asOf: '2026-10-11' };
const snap: CloudSnapshot = {
  portfolio: { id: 'p1', name: 'Personal', defaultCurrency: 'EUR' },
  categories: [], transactions: [], wealthSnapshots: [],
  assets: [
    { id: 'a1', name: 'Bank', kind: 'cash', balance: 1200, currency: 'EUR', updatedAt: t - DAY },
    { id: 'a2', name: 'Watch', kind: 'collectible', balance: 8000, currency: 'EUR', updatedAt: t - 210 * DAY },
    { id: 'a3', name: 'Card account', kind: 'cash', balance: -50, currency: 'EUR', updatedAt: t - DAY },
  ],
  holdings: [
    { id: 'h1', acquiredAt: 5, symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasis: 15000, currency: 'USD', marketPrice: 60000, changePercent: 2, quoteProvider: 'coingecko', quoteUpdatedAt: t - 4 * 60_000, quoteStale: false },
    { id: 'h2', acquiredAt: 5, symbol: 'ACME', name: 'Acme', kind: 'stock', quantity: 10, costBasis: 1000, currency: 'EUR', marketPrice: 0, changePercent: 0, quoteProvider: null, quoteUpdatedAt: null, quoteStale: false },
  ],
  liabilities: [{ id: 'l1', name: 'Card', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: t + 3 * DAY, updatedAt: t }],
};

describe('freshness', () => {
  it('says where each value came from and how old it is', () => {
    expect(ago(t - 4 * 60_000, t)).toBe('4 min ago');
    expect(freshness({ kind: 'synced', valueCents: 1, asOf: new Date(t - 4 * 60_000).toISOString(), source: 'CoinGecko' }, t)).toEqual({ text: 'CoinGecko · 4 min ago', tone: 'live' });
    expect(freshness({ kind: 'manual', valueCents: 1, asOf: new Date(t - 210 * DAY).toISOString(), remindAfterDays: 180 }, t)).toEqual({ text: 'Your value · 7 months old', tone: 'stale' });
    expect(freshness({ kind: 'missing', lastKnownCents: 5, lastKnownAt: null }, t).tone).toBe('missing');
  });
});

describe('itemsFrom', () => {
  const items = itemsFrom(snap, fromSnapshot(snap, fx, now), t);
  const byId = (id: string) => items.find((i) => i.id === id)!;

  it('puts every record in the group its block shows', () => {
    expect(byId('h1')).toMatchObject({ group: 'crypto', detail: '0.5 BTC', valueCents: 2_400_000, freshness: { text: 'CoinGecko · 4 min ago' } });
    expect(byId('h2')).toMatchObject({ group: 'stocks', valueCents: 100_000, freshness: { tone: 'missing' } });
    expect(byId('a2')).toMatchObject({ group: 'things', freshness: { tone: 'stale' } });
    expect(byId('a3')).toMatchObject({ group: 'debts', valueCents: 5_000, detail: 'Overdrawn account' });
    expect(byId('l1')).toMatchObject({ group: 'debts', valueCents: 42_000, freshness: { tone: 'due' } });
  });

  it('adds group totals and counts what has no value', () => {
    const noRate = itemsFrom(snap, fromSnapshot(snap, null, now), t);
    expect(noRate.find((i) => i.id === 'h1')).toMatchObject({ valueCents: null, freshness: { text: 'Needs today’s exchange rate' } });
    expect(groupTotal(noRate.filter((i) => i.group === 'crypto'))).toEqual({ cents: 0, unknown: 1 });
    expect(groupTotal(items.filter((i) => i.group === 'debts'))).toEqual({ cents: 47_000, unknown: 0 });
  });
});

describe('edit and delete plans', () => {
  const before = holdingFields(snap.holdings[0]);
  it('writes new fields and undoes to the old ones on the same record', () => {
    const p = editPlan('holding', 'h1', before, { ...before, quantity: 0.6, costBasisCents: 2_100_000 }, 'p1', 5);
    expect(p.apply).toEqual({ fn: 'upsertHolding', args: { portfolioId: 'p1', symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.6, costBasis: 21_000, currency: 'USD', location: '', id: 'h1', acquiredAt: 5 } });
    expect(p.undo.args).toMatchObject({ id: 'h1', quantity: 0.5, costBasis: 15_000 });
  });
  it('saves where a holding is kept, and clears it with an empty field', () => {
    const p = editPlan('holding', 'h1', before, { ...before, location: '  Trade Republic ' }, 'p1', 5);
    expect(p.apply.args).toMatchObject({ location: 'Trade Republic' });
    expect(p.undo.args).toMatchObject({ location: '' });
    expect(fieldProblems('holding', { ...before, location: 'x'.repeat(61) })).toEqual(['Keep where it is to 60 characters.']);
  });
  it('deletes and undoes by re-creating the same fields', () => {
    const p = deletePlan('liability', 'l1', { name: 'Card', kind: 'credit_card', balanceCents: 42_000, currency: 'EUR', dueDate: 99 }, 'p1');
    expect(p.apply).toEqual({ fn: 'deleteLiability', args: { id: 'l1' } });
    expect(p.undo).toEqual({ fn: 'upsertLiability', args: { portfolioId: 'p1', name: 'Card', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: 99 } });
  });
  it('clears a due date by leaving it out', () => {
    const p = editPlan('liability', 'l1', { name: 'Card', kind: 'credit_card', balanceCents: 1, currency: 'EUR', dueDate: 99 }, { name: 'Card', kind: 'credit_card', balanceCents: 1, currency: 'EUR', dueDate: null }, 'p1');
    expect('dueDate' in p.apply.args).toBe(false);
  });
  it('refuses a holding without a ticker, units or cost', () => {
    expect(fieldProblems('holding', { ...before, symbol: '', quantity: 0, costBasisCents: 0 })).toHaveLength(3);
    expect(fieldProblems('asset', { name: ' ', kind: 'cash', balanceCents: 0, currency: 'EUR', location: '', costCents: null, acquiredAt: null })).toEqual(['Add a name.']);
  });
  it('saves what an asset cost and when it was bought, and clears them with null', () => {
    const watch = { name: 'Watch', kind: 'collectible' as const, balanceCents: 1_200_000, currency: 'EUR' as const, location: '', costCents: 1_100_000, acquiredAt: Date.UTC(2025, 1, 1, 12) };
    const p = editPlan('asset', 'a1', watch, { ...watch, costCents: null, acquiredAt: null }, 'p1');
    expect(p.apply.args).toMatchObject({ id: 'a1', costBasis: null, acquiredAt: null });
    expect(p.undo.args).toMatchObject({ id: 'a1', costBasis: 11000, acquiredAt: Date.UTC(2025, 1, 1, 12) });
  });
});

describe('since bought', () => {
  const now = Date.UTC(2026, 9, 19);
  it('reads the usual ways of writing when something was bought', () => {
    expect(parseBought('Feb 2025', now)).toBe(Date.UTC(2025, 1, 1, 12));
    expect(parseBought('february 2025', now)).toBe(Date.UTC(2025, 1, 1, 12));
    expect(parseBought('14 Feb 2025', now)).toBe(Date.UTC(2025, 1, 14, 12));
    expect(parseBought('2024-07-18', now)).toBe(Date.UTC(2024, 6, 18, 12));
    expect(parseBought('2024-07', now)).toBe(Date.UTC(2024, 6, 1, 12));
    expect(parseBought('next year', now)).toBeNull();
    expect(parseBought('2027-01-01', now)).toBeNull();
    expect(parseBought('2025-02-30', now)).toBeNull();
    expect(monthYear(Date.UTC(2025, 1, 1, 12))).toBe('Feb 2025');
  });
  it('shows a gain against what was paid, in the portfolio currency, and nothing when cost or price is unknown', () => {
    expect(gainOf(1_200_000, 11000, 'EUR', 'EUR', null, 5, true)).toEqual({ cents: 100_000, pct: 100_000 / 1_100_000, since: 5 });
    expect(gainOf(1_000_000, 11000, 'EUR', 'EUR', null, null, true)?.cents).toBe(-100_000);
    expect(gainOf(1_000_000, 11000, 'USD', 'EUR', null, null, true)).toBeNull();
    expect(gainOf(1_000_000, 11000, 'USD', 'EUR', { usdPerEur: 1.1 } as never, null, true)?.cents).toBe(0);
    expect(gainOf(null, 11000, 'EUR', 'EUR', null, null, true)).toBeNull();
    expect(gainOf(1_000_000, null, 'EUR', 'EUR', null, null, true)).toBeNull();
    expect(gainOf(1_000_000, 11000, 'EUR', 'EUR', null, null, false)).toBeNull();
  });
});
