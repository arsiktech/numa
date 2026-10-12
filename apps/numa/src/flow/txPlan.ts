import type { Op } from '@/ask/plan';
import type { CloudCurrency, CloudTransaction } from '@/cloud/api';

export type TxFields = { description: string; kind: 'income' | 'expense'; amountCents: number; currency: CloudCurrency; occurredAt: number; categoryId: string | null };
export const txFields = (t: CloudTransaction): TxFields => ({ description: t.description, kind: t.kind, amountCents: Math.abs(t.amountMinor), currency: t.currency, occurredAt: t.occurredAt, categoryId: t.categoryId });

const update = (id: string, f: TxFields): Op => ({ fn: 'updateTransaction', args: { id, description: f.description.trim(), kind: f.kind, amount: f.amountCents / 100, currency: f.currency, occurredAt: f.occurredAt, categoryId: f.categoryId } });

/** Save writes the new fields; Undo writes the old ones back to the same transaction. */
export function txEditPlan(t: CloudTransaction, after: TxFields): { apply: Op; undo: Op } {
  return { apply: update(t.id, after), undo: update(t.id, txFields(t)) };
}

/** Delete removes it; Undo re-creates it with the same fields and account, so account balances come back too. */
export function txDeletePlan(t: CloudTransaction, portfolioId: string): { apply: Op; undo: Op } {
  return {
    apply: { fn: 'deleteTransaction', args: { id: t.id } },
    undo: {
      fn: 'createTransaction',
      args: {
        portfolioId, occurredAt: t.occurredAt, description: t.description, kind: t.kind, amount: Math.abs(t.amountMinor) / 100, currency: t.currency,
        ...(t.categoryId ? { categoryId: t.categoryId } : {}), ...(t.accountId ? { accountId: t.accountId } : {}), ...(t.notes ? { notes: t.notes } : {}),
      },
    },
  };
}

export function txProblems(f: TxFields): string[] {
  const out: string[] = [];
  if (!f.description.trim()) out.push('Add what it was for.');
  if (!(f.amountCents > 0)) out.push('Add an amount.');
  return out;
}
