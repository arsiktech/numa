import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useCallback, useMemo } from 'react';

import { cloud } from '@/cloud/api';
import { newMutationId, useCloudData } from '@/data/cloud';
import { loanPlaces, loansOf, takenBy, type CloudLoanLink, type Loan, type LoanPart, type LoanPlace, type LoanRole, type Taken } from '@/data/loans';
import { useCloudItems } from '@/data/useItems';

export type LoansState =
  | { status: 'loading' }
  | { status: 'ready'; loans: Loan[]; places: Map<string, LoanPlace>; links: CloudLoanLink[]; taken: Taken; portfolioId: string; now: number };

/** The signed-in space's loans, with where their money went. */
export function useLoans(): LoansState {
  const cloudData = useCloudData();
  const source = useCloudItems();
  const portfolioId = cloudData.status === 'ready' ? cloudData.portfolioId : null;
  const links = useQuery(cloud.loanLinks, portfolioId ? { portfolioId } : 'skip');
  return useMemo<LoansState>(() => {
    if (cloudData.status !== 'ready' || source.status !== 'ready' || !links) return { status: 'loading' };
    const { snapshot, fx, data } = cloudData;
    return {
      status: 'ready', links, taken: takenBy(links), portfolioId: cloudData.portfolioId, now: cloudData.now,
      loans: loansOf(snapshot, source.items, links, data.currency, fx, cloudData.now),
      places: loanPlaces(snapshot, source.items, data.currency, fx),
    };
  }, [cloudData, source, links]);
}

const ERRORS: Record<string, string> = {
  INVALID_LOAN_LINK: 'That link isn’t possible. Pick another place.',
  NOT_FOUND: 'That place isn’t in this space anymore.',
};
export function linkErrorText(e: unknown): string {
  const data = e instanceof ConvexError && e.data && typeof e.data === 'object' ? (e.data as { code?: string; message?: string }) : null;
  if (data?.code === 'INVALID_LOAN_LINK' && data.message) return `${data.message}.`;
  return (data?.code && ERRORS[data.code]) || 'Couldn’t save that. Check your connection and try again.';
}

/** Save one loan's links. Moving a place linked whole from another loan clears it there first. */
export function useLinkWrites(state: LoansState) {
  const set = useMutation(cloud.setLoanLinks);
  const save = useCallback(async (loanKey: string, targets: CloudLoanLink['targets']) => {
    if (state.status !== 'ready') return;
    await set({ portfolioId: state.portfolioId, loanKey, targets, clientMutationId: newMutationId('numa.linkLoan') });
  }, [set, state]);
  const current = useCallback((loanKey: string) => (state.status === 'ready' ? state.links.find((l) => l.loanKey === loanKey)?.targets ?? [] : []), [state]);
  return {
    add: useCallback(async (loanKey: string, key: string, role: LoanRole, part?: LoanPart) => {
      if (state.status !== 'ready') return;
      for (const other of state.taken.get(key) ?? []) {
        if (other.loanKey !== loanKey && other.whole) await save(other.loanKey, current(other.loanKey).filter((t) => t.key !== key));
      }
      await save(loanKey, [...current(loanKey).filter((t) => t.key !== key), { key, role, ...(part ? { part } : {}) }]);
    }, [state, save, current]),
    /** Only part of a place, or the whole of it again when `part` is left out. */
    setPart: useCallback(async (loanKey: string, key: string, part?: LoanPart) => {
      await save(loanKey, current(loanKey).map((t) => (t.key !== key ? t : { key: t.key, role: t.role, ...(part ? { part } : {}) })));
    }, [save, current]),
    remove: useCallback(async (loanKey: string, key: string) => {
      await save(loanKey, current(loanKey).filter((t) => t.key !== key));
    }, [save, current]),
  };
}
