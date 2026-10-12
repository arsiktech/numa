import type { CloudRecurring, CloudSnapshot, CloudTransaction } from '@/cloud/api';
import { availableMonths, monthFlow, shiftMonth } from './month';
import { mrr, recurringRows } from './recurring';
import { layoutSankey } from './sankey';
import { txDeletePlan, txEditPlan, txFields } from './txPlan';

const now = new Date(2026, 9, 12, 10);
const t = now.getTime();
const DAY = 86_400_000;
const tx = (id: string, kind: 'income' | 'expense', cents: number, at: number, extra: Partial<CloudTransaction> = {}): CloudTransaction =>
  ({ id, kind, amountMinor: cents, occurredAt: at, description: id, categoryId: null, currency: 'EUR', accountId: null, notes: null, ...extra });
const snap = (transactions: CloudTransaction[]): CloudSnapshot => ({
  portfolio: { id: 'p', name: 'P', defaultCurrency: 'EUR' }, categories: [{ id: 'c-rent', name: 'Rent', kind: 'expense' }],
  transactions, assets: [], liabilities: [], holdings: [], wealthSnapshots: [],
});

describe('months', () => {
  it('lists months from the first transaction to now', () => {
    expect(availableMonths([tx('a', 'expense', 1, new Date(2026, 7, 3).getTime())], now)).toEqual([{ year: 2026, month: 7 }, { year: 2026, month: 8 }, { year: 2026, month: 9 }]);
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
  it('groups a month by category and keeps the transactions behind each stream', () => {
    const f = monthFlow(snap([tx('rent1', 'expense', 120_000, t - DAY, { categoryId: 'c-rent' }), tx('rent2', 'expense', 5_000, t - 2 * DAY, { categoryId: 'c-rent' }), tx('inv', 'income', 500_000, t - DAY), tx('old', 'expense', 9, t - 60 * DAY)]), { year: 2026, month: 9 }, 'EUR', null, now);
    expect(f.outgoing).toEqual([{ id: 'expense:Rent', label: 'Rent', cents: 125_000, txIds: ['rent1', 'rent2'] }]);
    expect(f.incoming.map((l) => l.cents)).toEqual([500_000]);
  });
});

describe('layoutSankey', () => {
  const lines = (xs: number[], p: string) => xs.map((cents, i) => ({ id: `${p}${i}`, label: `${p}${i}`, cents }));
  it('adds a Kept node so both sides sum to what came in', () => {
    const l = layoutSankey(lines([600, 400], 'in'), lines([300, 200], 'out'), 300, 200);
    expect(l.right.map((n) => n.kind)).toEqual(['out', 'out', 'kept']);
    expect(l.right.at(-1)!.cents).toBe(500);
    expect(l.total).toBe(1000);
    expect(l.ribbons).toHaveLength(5);
    const sum = (ns: { h: number }[]) => ns.reduce((s, n) => s + n.h, 0);
    expect(Math.abs(sum(l.left) - sum(l.right))).toBeLessThan(0.001);
  });
  it('shows overspending as money from savings, never a negative kept', () => {
    const l = layoutSankey(lines([100], 'in'), lines([150], 'out'), 300, 200);
    expect(l.left.map((n) => [n.kind, n.cents])).toEqual([['in', 100], ['savings', 50]]);
    expect(l.right.some((n) => n.kind === 'kept')).toBe(false);
  });
  it('draws nothing for an empty month', () => {
    expect(layoutSankey([], [], 300, 200).ribbons).toEqual([]);
  });
});

describe('recurring and MRR', () => {
  const rule = (over: Partial<CloudRecurring>): CloudRecurring => ({ id: 'r', description: 'x', kind: 'income', amount: 100, currency: 'EUR', cadence: 'monthly', startAt: t - DAY, nextRunAt: t + DAY, endAt: null, active: true, revenueType: null, incomeSource: null, ...over });
  it('counts only marked subscriptions and retainers as MRR', () => {
    const rows = recurringRows([
      rule({ id: 'a', revenueType: 'subscription', amount: 1200, cadence: 'yearly', incomeSource: 'App' }),
      rule({ id: 'b', revenueType: 'retainer', amount: 2000 }),
      rule({ id: 'c', amount: 4000, description: 'Salary' }),
      rule({ id: 'd', revenueType: 'subscription', active: false }),
      rule({ id: 'e', kind: 'expense', amount: 15 }),
    ], 'EUR', null, t);
    expect(rows.map((r) => r.id)).toEqual(['c', 'b', 'a', 'e']);
    expect(mrr(rows)).toMatchObject({ mrrCents: 210_000, arrCents: 2_520_000, unknown: 0 });
  });
  it('has no MRR without marked revenue, rather than a misleading zero', () => {
    expect(mrr(recurringRows([rule({})], 'EUR', null, t))).toBeNull();
  });
});

describe('transaction plans', () => {
  const base = tx('t1', 'expense', 450, t, { categoryId: 'c1', accountId: 'acc', notes: 'n' });
  it('edits in place and undoes to the old fields', () => {
    const p = txEditPlan(base, { ...txFields(base), amountCents: 500, description: ' Coffee ' });
    expect(p.apply).toEqual({ fn: 'updateTransaction', args: { id: 't1', description: 'Coffee', kind: 'expense', amount: 5, currency: 'EUR', occurredAt: t, categoryId: 'c1' } });
    expect(p.undo.args).toMatchObject({ id: 't1', amount: 4.5 });
  });
  it('undoes a delete with the same account, so balances come back', () => {
    expect(txDeletePlan(base, 'p').undo).toEqual({ fn: 'createTransaction', args: { portfolioId: 'p', occurredAt: t, description: 't1', kind: 'expense', amount: 4.5, currency: 'EUR', categoryId: 'c1', accountId: 'acc', notes: 'n' } });
  });
});
