import { useMemo } from 'react';

import type { CloudTransaction } from '@/cloud/api';
import { useMonthLedger } from '@/data/ledger';
import { runwayMonths } from './plan';

/**
 * The transactions of the months runway is averaged over. The snapshot does not reach that far
 * back, so each month is read on its own. Undefined until all of them have loaded, so runway is
 * never worked out from part of the months.
 */
export function useRunwayLedger(portfolioId: string | null, now: number): CloudTransaction[] | undefined {
  const [m1, m2, m3] = runwayMonths(new Date(now));
  const a = useMonthLedger(portfolioId, m1);
  const b = useMonthLedger(portfolioId, m2);
  const c = useMonthLedger(portfolioId, m3);
  return useMemo(() => (a && b && c ? [...a, ...b, ...c] : undefined), [a, b, c]);
}
