import { newDebtOp } from './newDebtOp';

describe('newDebtOp', () => {
  it('adds a debt owed to the party as a loan', () => {
    expect(newDebtOp({ name: 'Sam', owed: 'byYou' }, 'pf', 123_456, 'EUR')).toEqual({ fn: 'upsertLiability', args: { portfolioId: 'pf', name: 'Sam', kind: 'loan', balance: 1234.56, currency: 'EUR', counterparty: 'Sam' } });
  });
  it('adds money lent to the party as an asset they owe', () => {
    expect(newDebtOp({ name: 'Company', owed: 'toYou' }, 'pf', 50_000, 'USD')).toEqual({ fn: 'upsertAsset', args: { portfolioId: 'pf', name: 'Loan to Company', kind: 'other', balance: 500, currency: 'USD', owedBy: 'Company' } });
  });
  it('leaves the receipt to useWriter, so a retry of the same intent reuses one', () => {
    expect(newDebtOp({ name: 'Sam', owed: 'byYou' }, 'pf', 100, 'EUR').args).not.toHaveProperty('clientMutationId');
  });
});
