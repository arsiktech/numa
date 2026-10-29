import type { CloudLiability } from '@/cloud/api';
import { debtFields, deletePlan, editPlan } from './editPlan';

const loan = (over: Partial<CloudLiability> = {}): CloudLiability => ({
  id: 'loan', name: 'Synthetic loan', kind: 'loan', balance: 900, currency: 'EUR', updatedAt: 0,
  principal: 1_000, startedAt: Date.UTC(2026, 0, 1), dueKind: 'fixed', dueDate: Date.UTC(2026, 11, 1),
  interestTerms: 'simple', interestRate: 12, interestDueDay: 10, counterparty: 'Synthetic lender', ...over,
});

describe('loan edit and delete Undo', () => {
  it('restores the fixed repayment kind as well as its date after clearing the date', () => {
    const before = debtFields(loan());
    const plan = editPlan('liability', 'loan', before, { ...before, dueDate: null }, 'pf');
    expect(plan.apply.args).toMatchObject({ dueDate: null });
    expect(plan.undo.args).toMatchObject({ id: 'loan', dueKind: 'fixed', dueDate: loan().dueDate });
  });

  it('preserves every saved loan term on delete Undo without claiming the old record identity or history', () => {
    const plan = deletePlan('liability', 'loan', debtFields(loan()), 'pf');
    expect(plan.apply).toEqual({ fn: 'deleteLiability', args: { id: 'loan' } });
    expect(plan.undo.args).toMatchObject({
      portfolioId: 'pf', balance: 900, currency: 'EUR', principal: 1_000, startedAt: loan().startedAt,
      dueKind: 'fixed', dueDate: loan().dueDate, interestTerms: 'simple', interestRate: 12, interestDueDay: 10,
    });
    expect(plan.undo.args).not.toHaveProperty('id');
    expect(plan.undo.args).not.toHaveProperty('events');
  });

  it('preserves a coin obligation and manual terms rather than recreating its fiat valuation as a cash debt', () => {
    const coin = loan({ currency: 'USD', balance: 400, owedSymbol: 'ETH', owedQuantity: 0.125, principal: null, startedAt: null, interestTerms: 'manual', interestRate: 4, interestDueDay: null, dueKind: 'flexible', dueDate: null });
    expect(deletePlan('liability', coin.id, debtFields(coin), 'pf').undo.args).toMatchObject({
      currency: 'USD', owedSymbol: 'ETH', owedQuantity: 0.125, interestTerms: 'manual', interestRate: 4, dueKind: 'flexible',
    });
  });

  it('does not resend original amount or rate during an unrelated balance edit', () => {
    const before = debtFields(loan());
    const plan = editPlan('liability', 'loan', before, { ...before, balanceCents: 80_000 }, 'pf');
    expect(plan.apply.args).not.toHaveProperty('principal');
    expect(plan.apply.args).not.toHaveProperty('interestRate');
    expect(plan.undo.args).not.toHaveProperty('principal');
  });
});
