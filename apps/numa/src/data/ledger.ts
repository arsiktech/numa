import { useQuery } from 'convex/react';

import { cloud, type CloudSnapshot, type CloudTransaction, type LedgerMark } from '@/cloud/api';
import { monthRange, type MonthKey } from '@/flow/month';

/*
 * The ledger beyond the snapshot. The snapshot carries only the last weeks of transactions, which
 * keeps Home quick to load; a screen that needs an older record reads just that record here.
 * Signed-in screens only: the demo has no backend to ask, and these hooks throw without one.
 */

const NOTHING: LedgerMark[] = [];

/** One local calendar month of transactions; undefined while it loads. */
export const useMonthLedger = (portfolioId: string | null, k: MonthKey): CloudTransaction[] | undefined =>
  useQuery(cloud.monthLedger, portfolioId ? { portfolioId, ...monthRange(k) } : 'skip');

/** One transaction by id: from the snapshot when it is recent, read on its own when it is older. Undefined while it loads, null when it is gone. */
export function useTransaction(snapshot: CloudSnapshot | null, portfolioId: string | null, id: string): CloudTransaction | null | undefined {
  const recent = snapshot?.transactions.find((t) => t.id === id);
  const older = useQuery(cloud.transaction, portfolioId && !recent ? { portfolioId, id } : 'skip');
  return recent ?? older;
}

/** What is already saved between two times, for an import to check its rows against; undefined while it loads. No span means nothing to check. */
export function useLedgerOutline(portfolioId: string | null, span: { start: number; end: number } | null): LedgerMark[] | undefined {
  const marks = useQuery(cloud.ledgerOutline, portfolioId && span ? { portfolioId, ...span } : 'skip');
  return span ? marks : NOTHING;
}
