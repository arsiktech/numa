import { useQuery } from 'convex/react';
import { useMemo } from 'react';

import { cloud } from '@/cloud/api';
import { useCloudData } from '@/data/cloud';
import { summarize, type Earnings, type Range } from '@/data/earnings';
import type { Currency } from '@/domain/types';

export type EarningsState =
  | { status: 'loading' }
  /** `earnings` is null when the space's currency can't be shown without an exchange rate. */
  | { status: 'ready'; earnings: Earnings | null; tracked: boolean; currency: Currency; now: number };

/** What the space's DeFi strategies earned over a range. Signed-in only. */
export function useEarnings(range: Range): EarningsState {
  const cloudData = useCloudData();
  const portfolioId = cloudData.status === 'ready' ? cloudData.portfolioId : null;
  const rows = useQuery(cloud.defiEarnings, portfolioId ? { portfolioId } : 'skip');
  return useMemo<EarningsState>(() => {
    if (cloudData.status !== 'ready' || !rows) return { status: 'loading' };
    const { data, fx, now } = cloudData;
    return { status: 'ready', earnings: summarize(rows, range, now, data.currency, fx), tracked: rows.length > 0, currency: data.currency, now };
  }, [cloudData, rows, range]);
}
