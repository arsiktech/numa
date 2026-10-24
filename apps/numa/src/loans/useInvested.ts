import { useMemo } from 'react';

import { useCloudData } from '@/data/cloud';
import { illiquidPlaces, investedIlliquid } from '@/data/loans';
import { withInvested, type Summary } from '@/domain/summary';
import { useLoans } from './useLoans';

export type Invested = { cents: number; partial: boolean; linked: boolean };

/**
 * How much of what is owed went into things that can't be sold within a week, for Liquid after
 * debts. Null while loans are loading. `linked` is false when no loan says where its money went.
 */
export function useInvested(): Invested | null {
  const cloudData = useCloudData();
  const loans = useLoans();
  return useMemo(() => {
    if (cloudData.status !== 'ready' || loans.status !== 'ready') return null;
    const r = investedIlliquid(loans.loans, illiquidPlaces(cloudData.data.holdings));
    return { ...r, linked: loans.loans.some((l) => l.deployed.length > 0) };
  }, [cloudData, loans]);
}

/** The summary with that money left out of Liquid after debts. Unchanged while loans are loading. */
export const liquidSummary = (summary: Summary, invested: Invested | null) => (invested ? withInvested(summary, invested.cents) : summary);
