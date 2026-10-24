import { pickAttention } from './attention';
import { summarizeFlow } from './flow';
import { formatMoney, formatPercent, formatShort } from './money';
import { countedValue, summarize } from './summary';
import type { Attention, Holding } from './types';

const now = new Date('2026-10-11T20:40:00Z');
const h = (p: Partial<Holding> & Pick<Holding, 'id' | 'category' | 'valuation' | 'liquidity'>): Holding => ({ name: p.id, ...p });

describe('formatMoney', () => {
  it('groups thousands and keeps cents exact', () => {
    expect(formatMoney(89953842)).toBe('€899,538');
    expect(formatMoney(89953842, 'EUR', { cents: true })).toBe('€899,538.42');
    expect(formatMoney(-8544000)).toBe('−€85,440');
    expect(formatMoney(232894, 'EUR', { cents: true, sign: true })).toBe('+€2,328.94');
  });
  it('shortens for block labels and signs percentages', () => {
    expect(formatShort(25603800)).toBe('€256k');
    expect(formatShort(120000000)).toBe('€1.2M');
    expect(formatPercent(0.0026)).toBe('+0.26%');
    expect(formatPercent(-0.018, 1)).toBe('−1.8%');
  });
});

describe('summarize', () => {
  const holdings: Holding[] = [
    h({ id: 'btc-ledger', category: 'crypto', valuation: { kind: 'live', valueCents: 9_640_000, asOf: now.toISOString() }, liquidity: { kind: 'liquid' } }),
    h({ id: 'btc-pledged', category: 'crypto', valuation: { kind: 'live', valueCents: 4_048_800, asOf: now.toISOString() }, liquidity: { kind: 'pledged', against: 'usdc-loan' } }),
    h({ id: 'spcx', category: 'stocks', valuation: { kind: 'delayed', valueCents: 7_600_000, asOf: now.toISOString(), delayMinutes: 15 }, liquidity: { kind: 'locked', until: '2026-12-09' } }),
    h({ id: 'eur', category: 'cash', valuation: { kind: 'synced', valueCents: 3_000_000, asOf: '2026-10-09T10:00:00Z', source: 'Revolut CSV' }, liquidity: { kind: 'cash' } }),
    h({ id: 'flat', category: 'property', valuation: { kind: 'manual', valueCents: 14_500_000, asOf: '2026-06-01T00:00:00Z', remindAfterDays: 90 }, liquidity: { kind: 'illiquid' } }),
    h({ id: 'gold', category: 'things', valuation: { kind: 'missing', lastKnownCents: 1_675_000, lastKnownAt: '2026-10-09T00:00:00Z' }, liquidity: { kind: 'liquid' } }),
    h({ id: 'art', category: 'things', valuation: { kind: 'missing', lastKnownCents: null, lastKnownAt: null }, liquidity: { kind: 'illiquid' } }),
  ];
  const s = summarize(holdings, [{ id: 'usdc-loan', name: 'USDC loan', balanceCents: 2_000_000 }], now);

  it('never turns an unknown value into zero', () => {
    expect(countedValue({ kind: 'missing', lastKnownCents: null, lastKnownAt: null })).toBeNull();
    expect(s.unknown.map((x) => x.id)).toEqual(['art']);
  });
  it('adds known and last-known values, and subtracts debts', () => {
    expect(s.ownCents).toBe(9_640_000 + 4_048_800 + 7_600_000 + 3_000_000 + 14_500_000 + 1_675_000);
    expect(s.oweCents).toBe(2_000_000);
    expect(s.netCents).toBe(s.ownCents - 2_000_000);
  });
  it('keeps locked, pledged and illiquid holdings out of liquid, and only cash in cash', () => {
    expect(s.liquidCents).toBe(9_640_000 + 3_000_000 + 1_675_000);
    expect(s.cashCents).toBe(3_000_000);
  });
  it('subtracts everything owed from liquid assets, and leaves gross liquid unchanged', () => {
    expect(s.liquidAfterDebtsCents).toBe(9_640_000 + 3_000_000 + 1_675_000 - 2_000_000);
    expect(s.liquidAfterDebtsCents).toBe(s.liquidCents - s.oweCents);
    expect(s.liquidCents).toBe(9_640_000 + 3_000_000 + 1_675_000);
  });
  it('equals gross liquid when nothing is owed', () => {
    const none = summarize(holdings, [], now);
    expect(none.liquidAfterDebtsCents).toBe(none.liquidCents);
  });
  it('counts several debts once each', () => {
    const many = summarize(holdings, [
      { id: 'a', name: 'Card', balanceCents: 40_000 },
      { id: 'b', name: 'Loan', balanceCents: 1_500_000 },
      { id: 'c', name: 'Friend', balanceCents: 60_000 },
    ], now);
    expect(many.oweCents).toBe(1_600_000);
    expect(many.liquidAfterDebtsCents).toBe(many.liquidCents - 1_600_000);
  });
  it('shows a negative result when debts are bigger than liquid assets, never zero', () => {
    const cash = [h({ id: 'eur', category: 'cash', valuation: { kind: 'synced', valueCents: 100_000, asOf: now.toISOString(), source: 'Bank' }, liquidity: { kind: 'cash' } })];
    const deep = summarize(cash, [{ id: 'loan', name: 'Loan', balanceCents: 450_000 }], now);
    expect(deep.liquidCents).toBe(100_000);
    expect(deep.liquidAfterDebtsCents).toBe(-350_000);
  });
  it('does not deduct a debt twice when a wallet already counts its borrowed coins as owned', () => {
    // A wallet is valued with its borrowed coins added back, and the loan is listed once as a debt.
    const wallet = [h({ id: 'wallet', category: 'crypto', valuation: { kind: 'synced', valueCents: 1_000_000, asOf: now.toISOString(), source: 'Wallet' }, liquidity: { kind: 'liquid' } })];
    const one = summarize(wallet, [{ id: 'wallet-loan', name: 'Wallet loan', balanceCents: 400_000 }], now);
    expect(one.liquidAfterDebtsCents).toBe(600_000);
    expect(one.netCents).toBe(600_000);
  });
  it('still subtracts debts when a holding has no known value, and lists it as unknown', () => {
    const unknown = [
      h({ id: 'eur', category: 'cash', valuation: { kind: 'synced', valueCents: 200_000, asOf: now.toISOString(), source: 'Bank' }, liquidity: { kind: 'cash' } }),
      h({ id: 'art', category: 'things', valuation: { kind: 'missing', lastKnownCents: null, lastKnownAt: null }, liquidity: { kind: 'liquid' } }),
    ];
    const r = summarize(unknown, [{ id: 'd', name: 'Card', balanceCents: 50_000 }], now);
    expect(r.unknown.map((x) => x.id)).toEqual(['art']);
    expect(r.liquidAfterDebtsCents).toBe(150_000);
  });
  it('flags last-known prices and overdue manual values as stale', () => {
    expect(s.stale.map((x) => x.id).sort()).toEqual(['flat', 'gold']);
  });
  it('orders categories and their shares add up to one', () => {
    expect(s.categories.map((c) => c.category)).toEqual(['crypto', 'stocks', 'property', 'cash', 'things']);
    expect(s.categories.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('summarizeFlow', () => {
  it('reports what was kept and its share', () => {
    const f = summarizeFlow({ month: '2026-10', incoming: [{ id: 'a', label: 'Consulting', cents: 1_385_500 }], outgoing: [{ id: 'b', label: 'Living', cents: 946_000 }] });
    expect(f).toEqual({ inCents: 1_385_500, outCents: 946_000, keptCents: 439_500, keptShare: 439_500 / 1_385_500 });
  });
  it('does not divide by zero in a month without income', () => {
    expect(summarizeFlow({ month: '2026-10', incoming: [], outgoing: [] }).keptShare).toBe(0);
  });
});

describe('pickAttention', () => {
  const base = { body: '', primary: '', secondary: '', doneText: '', raisedAt: '2026-10-10T00:00:00Z' };
  const items: Attention[] = [
    { ...base, id: 'stale', urgency: 'housekeeping', title: 'stale' },
    { ...base, id: 'peg', urgency: 'watch', title: 'peg' },
    { ...base, id: 'tax', urgency: 'due', title: 'tax', dueAt: '2026-10-20' },
    { ...base, id: 'key', urgency: 'due', title: 'key', dueAt: '2026-11-03' },
  ];
  it('puts due items first by date and caps the list at three', () => {
    expect(pickAttention(items).map((a) => a.id)).toEqual(['tax', 'key', 'peg']);
  });
});

describe('visibleAttention', () => {
  const { visibleAttention, tomorrow } = jest.requireActual('./attention') as typeof import('./attention');
  const item = (id: string, title: string) => ({ id, title, urgency: 'watch' as const, body: '', primary: '', secondary: '', doneText: '', raisedAt: '' });
  const now = new Date(2026, 9, 12, 15).getTime();
  it('hides dismissed items until their title changes', () => {
    const items = [item('a', 'Dining is at 85% of its limit'), item('b', 'No price for ACME')];
    expect(visibleAttention(items, { a: { title: 'Dining is at 85% of its limit', until: null } }, now).map((i) => i.id)).toEqual(['b']);
    expect(visibleAttention([item('a', 'Dining is over its limit')], { a: { title: 'Dining is at 85% of its limit', until: null } }, now)).toHaveLength(1);
  });
  it('brings snoozed items back the next day', () => {
    const until = tomorrow(now);
    expect(new Date(until).getDate()).toBe(13);
    expect(visibleAttention([item('a', 'x')], { a: { title: 'x', until } }, now)).toHaveLength(0);
    expect(visibleAttention([item('a', 'x')], { a: { title: 'x', until } }, until + 1)).toHaveLength(1);
  });
});
