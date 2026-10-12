import type { AskProposal } from '@/cloud/api';
import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { aiContext } from './aiContext';
import { draftProblems, type AskContext } from './parse';
import { proposalToDraft } from './proposal';

const now = new Date(2026, 9, 12, 10);
const ctx: AskContext = {
  currency: 'EUR', now,
  categories: [{ id: 'c1', name: 'Dining', kind: 'expense' }, { id: 'c2', name: 'Salary', kind: 'income' }],
  assets: [{ id: 'a1', name: 'Main account', kind: 'cash', balance: 4321, currency: 'EUR' }],
  liabilities: [{ id: 'l1', name: 'Visa card', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: null }],
  holdings: [{ id: 'h1', symbol: 'VOO', name: 'Vanguard S&P 500', kind: 'etf', quantity: 4, costBasis: 1800, currency: 'USD', acquiredAt: 1 }],
};
const p = (over: Partial<AskProposal>): AskProposal => ({
  kind: 'expense', name: 'Coffee', amount: 4.5, currency: null, date: null, category: null,
  assetKind: null, debtKind: null, holdingKind: null, symbol: null, quantity: null, holdingMode: null, ...over,
});

describe('proposalToDraft', () => {
  it('makes a spend in the home currency, matched to an existing category', () => {
    expect(proposalToDraft(p({ category: 'dining', date: '2026-10-03' }), ctx)).toEqual({
      type: 'transaction', kind: 'expense', description: 'Coffee', amountCents: 450, currency: 'EUR',
      occurredAt: new Date(2026, 9, 3, 12).getTime(), categoryId: 'c1', categoryName: 'Dining',
    });
  });

  it('never dates a spend in the future', () => {
    const d = proposalToDraft(p({ date: '2026-12-01' }), ctx);
    expect(d?.type === 'transaction' && d.occurredAt).toBe(now.getTime());
  });

  it('updates an account or debt the person already has', () => {
    const a = proposalToDraft(p({ kind: 'account', name: 'main account', amount: 5000 }), ctx);
    expect(a).toMatchObject({ type: 'asset', name: 'Main account', amountCents: 500_000, existing: { id: 'a1', balanceCents: 432_100 } });
    const d = proposalToDraft(p({ kind: 'debt', name: 'Visa', amount: 600, date: '2026-10-20' }), ctx);
    expect(d).toMatchObject({ type: 'debt', name: 'Visa card', debtKind: 'credit_card', amountCents: 60_000, dueDate: new Date(2026, 9, 20, 12).getTime(), existing: { id: 'l1' } });
  });

  it('adds to a holding and keeps an unknown price unknown', () => {
    const h = proposalToDraft(p({ kind: 'holding', name: 'VOO', symbol: 'voo', quantity: 2, amount: null, holdingMode: 'add' }), ctx);
    expect(h).toMatchObject({ type: 'holding', symbol: 'VOO', name: 'Vanguard S&P 500', holdingKind: 'etf', quantity: 2, priceCents: null, currency: 'USD', existing: { id: 'h1' } });
    expect(draftProblems(h!)).toEqual(['Add the price you paid per VOO.']);
    expect(proposalToDraft(p({ kind: 'holding', symbol: 'BTC', quantity: null }), ctx)).toBeNull();
  });

  it('asks for a missing amount instead of saving zero', () => {
    expect(draftProblems(proposalToDraft(p({ amount: null }), ctx)!)).toEqual(['Add an amount.']);
  });
});

describe('aiContext', () => {
  const summary = summarize(
    [{ id: 'a', name: 'Bank', category: 'cash', liquidity: { kind: 'cash' }, valuation: { kind: 'manual', valueCents: 432_100, asOf: now.toISOString(), remindAfterDays: 30 } }],
    [{ id: 'd', name: 'Visa card', balanceCents: 42_000 }],
    now,
  );
  const month = { month: 'October', incoming: [{ id: 'x', label: 'Client A', cents: 500_000 }], outgoing: [{ id: 'r', label: 'Rent', cents: 120_000 }] };

  it('summarizes names and amounts, with no ids', () => {
    const text = aiContext(ctx, { summary, available: true, currency: 'EUR', month, flow: summarizeFlow(month), debts: [] });
    expect(text).toContain('Today: 2026-10-12. Home currency: EUR.');
    expect(text).toContain('Net worth €3,901: owns €4,321, owes €420.');
    expect(text).toContain('- Main account (cash): €4,321');
    expect(text).toContain('- VOO Vanguard S&P 500 (etf): 4 units, paid $1,800 in total');
    expect(text).toContain('This month (October): in €5,000, out €1,200, kept €3,800.');
    expect(text).toContain('Spending categories: Dining. Income categories: Salary.');
    expect(text).not.toMatch(/\b(a1|l1|h1|c1)\b/);
  });

  it('says when totals are unavailable instead of sending zeros', () => {
    const text = aiContext(ctx, { summary, available: false, currency: 'EUR', month, flow: summarizeFlow(month), debts: [] });
    expect(text).toContain('Totals are unavailable');
    expect(text).not.toContain('Net worth');
  });
});
