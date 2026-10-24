import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useCallback, useMemo } from 'react';

import { cloud } from '@/cloud/api';
import { newMutationId, useCloudData } from '@/data/cloud';
import { moneyMap, type DebtEvent, type MoneyMap } from '@/data/moneyMap';
import { useCloudItems } from '@/data/useItems';
import type { Currency } from '@/domain/types';

export type MoneyMapState =
  | { status: 'loading' }
  | { status: 'ready'; map: MoneyMap; events: DebtEvent[]; portfolioId: string; currency: Currency; now: number };

/** The signed-in space's money map and the history of its debts. */
export function useMoneyMap(): MoneyMapState {
  const cloud_ = useCloudData();
  const source = useCloudItems();
  const portfolioId = cloud_.status === 'ready' ? cloud_.portfolioId : null;
  const events = useQuery(cloud.debtEvents, portfolioId ? { portfolioId } : 'skip');
  return useMemo<MoneyMapState>(() => {
    if (cloud_.status !== 'ready' || source.status !== 'ready' || !events) return { status: 'loading' };
    return { status: 'ready', map: moneyMap(cloud_.snapshot, source.items, cloud_.data.currency, cloud_.fx), events, portfolioId: cloud_.portfolioId, currency: cloud_.data.currency, now: cloud_.now };
  }, [cloud_, source, events]);
}

export function eventErrorText(e: unknown): string {
  const data = e instanceof ConvexError && e.data && typeof e.data === 'object' ? (e.data as { code?: string; message?: string }) : null;
  if (data?.message && (data.code === 'INVALID_DEBT_EVENT' || data.code === 'INVALID_INPUT')) return `${data.message}.`;
  if (data?.code === 'NOT_FOUND') return 'That debt isn’t here anymore.';
  return 'Couldn’t save that. Check your connection and try again.';
}

/** Record or remove history; a payment also changes the debt, and removing it gives it back. */
export function useDebtWrites(portfolioId: string | null) {
  const add = useMutation(cloud.addDebtEvent);
  const remove = useMutation(cloud.removeDebtEvent);
  return {
    add: useCallback(async (e: { subject: string; kind: DebtEvent['kind']; amount?: number; unit?: string; principalPart?: number; interestPart?: number; feePart?: number; occurredAt: number; note?: string; apply: boolean; clientMutationId?: string }) => {
      if (!portfolioId) throw new Error('No space');
      const r = await add({ portfolioId, ...e, clientMutationId: e.clientMutationId ?? newMutationId('numa.debtEvent') });
      return r.id;
    }, [add, portfolioId]),
    remove: useCallback(async (id: string) => { await remove({ id, clientMutationId: newMutationId('numa.removeDebtEvent') }); }, [remove]),
  };
}

/**
 * Save a debt's loan terms. A field left out keeps what is saved; null clears it. A note about the
 * change is saved in the same write, and the same request id counts once.
 */
export function useTermsWrite() {
  const set = useMutation(cloud.setLoanTerms);
  return useCallback(async (
    id: string,
    terms: { principal?: number | null; startedAt?: number | null; dueKind?: 'fixed' | 'flexible' | null; interestTerms?: 'none' | 'simple' | 'manual' | null; interestRate?: number | null; interestDueDay?: number | null; dueDate?: number | null },
    options: { clientMutationId?: string; note?: { text: string; occurredAt: number } } = {},
  ) => {
    await set({ id, ...terms, ...(options.note ? { note: options.note } : {}), clientMutationId: options.clientMutationId ?? newMutationId('numa.loanTerms') });
  }, [set]);
}
