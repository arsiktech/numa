import type { CloudGoal, CloudSnapshot, CloudTransaction } from '@/cloud/api';
import { summarize } from '@/domain/summary';
import { goalCreatePlan, goalDeletePlan, goalRows, limitPlan, limits, runway, runwayWords } from './plan';

const now = new Date(2026, 9, 12, 10);
const t = now.getTime();
const at = (monthsAgo: number) => new Date(2026, 9 - monthsAgo, 10, 12).getTime();
const tx = (id: string, kind: 'income' | 'expense', cents: number, occurredAt: number, categoryId: string | null = null): CloudTransaction =>
  ({ id, kind, amountMinor: cents, occurredAt, description: id, categoryId, currency: 'EUR', accountId: null, notes: null });
const cash = summarize([{ id: 'a', name: 'Bank', category: 'cash', liquidity: { kind: 'cash' }, valuation: { kind: 'manual', valueCents: 1_200_000, asOf: now.toISOString(), remindAfterDays: 30 } }], [], now);
const snap = (over: Partial<CloudSnapshot>): CloudSnapshot => ({
  portfolio: { id: 'p', name: 'P', defaultCurrency: 'EUR' },
  categories: [{ id: 'c-din', name: 'Dining', kind: 'expense', monthlyLimit: 200, budgetCurrency: 'EUR' }, { id: 'c-rent', name: 'Rent', kind: 'expense', monthlyLimit: null }, { id: 'c-free', name: 'Freelance', kind: 'income' }],
  transactions: [], assets: [], liabilities: [], holdings: [], wealthSnapshots: [], ...over,
});

describe('runway', () => {
  it('divides cash by the average of the last three full months', () => {
    const s = snap({ transactions: [tx('a', 'expense', 100_000, at(1)), tx('b', 'expense', 200_000, at(2)), tx('c', 'expense', 300_000, at(3)), tx('now', 'expense', 999_999, t)] });
    const r = runway(s, cash, 'EUR', null, now);
    expect(r).toMatchObject({ cashCents: 1_200_000, monthlyOutCents: 200_000, months: 6, basisMonths: 3 });
    expect(runwayWords(r.months)).toBe('About 6 months on cash');
  });
  it('says when there is no recent spending instead of guessing', () => {
    expect(runway(snap({ transactions: [tx('now', 'expense', 1, t)] }), cash, 'EUR', null, now).months).toBeNull();
    expect(runwayWords(40)).toBe('More than 3 years on cash');
    expect(runwayWords(18)).toBe('About 1.5 years on cash');
  });
});

describe('limits', () => {
  it('compares this month’s spending with each limit, most used first', () => {
    const rows = limits(snap({ transactions: [tx('d1', 'expense', 15_000, t, 'c-din'), tx('d2', 'expense', 9_000, t, 'c-din'), tx('r', 'expense', 120_000, t, 'c-rent')] }), 'EUR', null, now);
    expect(rows[0]).toMatchObject({ limitCents: 20_000, spentCents: 24_000, share: 1.2 });
    expect(rows[1]).toMatchObject({ limitCents: null, spentCents: 120_000, share: null });
  });
  it('sets and clears a limit with undo to the old one', () => {
    const din = snap({}).categories[0];
    expect(limitPlan(din, 25_000)).toEqual({ apply: { fn: 'updateCategory', args: { id: 'c-din', patch: { monthlyLimit: 250 } } }, undo: { fn: 'updateCategory', args: { id: 'c-din', patch: { monthlyLimit: 200 } } } });
    expect(limitPlan(din, null).apply.args).toEqual({ id: 'c-din', patch: { monthlyLimit: null } });
  });
});

describe('goals', () => {
  const goal = (over: Partial<CloudGoal>): CloudGoal => ({ id: 'g', scope: 'net_worth', target: 24_000, currency: 'EUR', startAt: 0, deadline: null, label: null, categoryId: null, assetId: null, holdingId: null, createdAt: 0, ...over });
  it('measures progress from the person’s own numbers', () => {
    const s = snap({ goals: [goal({}), goal({ id: 'g2', scope: 'income_category', categoryId: 'c-free', target: 5_000 }), goal({ id: 'g3', scope: 'asset_value', assetId: 'gone' })], transactions: [tx('i', 'income', 250_000, t, 'c-free')] });
    const rows = goalRows(s, cash, 'EUR', null, now, () => null);
    expect(rows[0]).toMatchObject({ title: 'Net worth', currentCents: 1_200_000, targetCents: 2_400_000, share: 0.5 });
    expect(rows[1]).toMatchObject({ title: 'Freelance this month', currentCents: 250_000, share: 0.5 });
    expect(rows[2]).toMatchObject({ currentCents: null, share: null });
  });
  it('creates with undo by removing, and deletes with undo by re-creating', () => {
    expect(goalCreatePlan('p', { scope: 'net_worth', targetCents: 10_000_000, currency: 'EUR', deadline: null, label: ' ' }, 5).apply.args).toEqual({ portfolioId: 'p', scope: 'net_worth', target: 100_000, currency: 'EUR', startAt: 5, createdAt: 5 });
    expect(goalDeletePlan('p', goal({ deadline: 9, label: 'Freedom' })).undo.args).toEqual({ portfolioId: 'p', scope: 'net_worth', target: 24_000, currency: 'EUR', startAt: 0, createdAt: 0, deadline: 9, label: 'Freedom' });
  });
});
