import type { Op } from '@/ask/plan';
import type { Party } from '@/data/moneyMap';

/** Another debt owed to this party, or more money lent to them, as one write for useWriter. */
export function newDebtOp(party: Pick<Party, 'name' | 'owed'>, portfolioId: string, cents: number, currency: 'EUR' | 'USD'): Op {
  const balance = cents / 100;
  return party.owed === 'byYou'
    ? { fn: 'upsertLiability', args: { portfolioId, name: party.name, kind: 'loan', balance, currency, counterparty: party.name } }
    : { fn: 'upsertAsset', args: { portfolioId, name: `Loan to ${party.name}`, kind: 'other', balance, currency, owedBy: party.name } };
}
