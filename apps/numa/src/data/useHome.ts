import { useEffect, useMemo, useState } from 'react';

import type { CloudCurrency } from '@/cloud/api';
import { pickAttention } from '@/domain/attention';
import { summarizeFlow, type FlowSummary } from '@/domain/flow';
import { summarize, type Summary } from '@/domain/summary';
import type { Attention, Currency } from '@/domain/types';
import { demoAttention, demoDebts, demoHoldings, demoNow, demoOctober, demoPoints } from './demo';
import { useCloudData } from './cloud';
import { seriesFor, todayFromMarkets, type Point, type Range } from './series';

/** Everything Home draws, whichever source it came from. */
export type HomeModel =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'needsSpace'; create: (currency: CloudCurrency) => Promise<void> }
  | {
      status: 'ready';
      source: 'demo' | 'cloud';
      now: number;
      currency: Currency;
      summary: Summary;
      /** False while a record needs an exchange rate we do not have. */
      available: boolean;
      points: Point[];
      hasHistory: boolean;
      live: boolean;
      month: string;
      flow: FlowSummary;
      attention: Attention[];
      empty: boolean;
    };

/** The labelled demo portfolio with a gentle live tick. */
export function useDemoHome(range: Range): HomeModel {
  const summary = useMemo(() => summarize(demoHoldings, demoDebts, demoNow), []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + (Math.random() - 0.42) * 7000), 1700);
    return () => clearInterval(id);
  }, []);
  const netCents = summary.netCents + Math.round(tick);
  const points = useMemo(() => demoPoints(range, summary.netCents), [range, summary.netCents]);
  return {
    status: 'ready', source: 'demo', now: demoNow.getTime(), currency: 'EUR', summary, available: true,
    points: [...points.slice(0, -1), { t: demoNow.getTime(), cents: netCents }], hasHistory: true, live: true,
    month: 'October', flow: summarizeFlow(demoOctober), attention: pickAttention(demoAttention), empty: false,
  };
}

/** The signed-in person's first portfolio, live from Convex. */
export function useCloudHome(range: Range): HomeModel {
  const cloudData = useCloudData();
  if (cloudData.status !== 'ready') return cloudData;
  const { data, summary, now } = cloudData;
  const priced = data.holdings.filter((h) => h.valuation.kind === 'synced');
  const marketsToday = priced.length ? priced.reduce((sum, h) => sum + (h.changeTodayCents ?? 0), 0) : null;
  const today = range === '1D' ? todayFromMarkets(now, summary.netCents, marketsToday) : null;
  const { points, hasHistory } = today ?? seriesFor(data.history, now, summary.netCents, range);
  return {
    status: 'ready', source: 'cloud', now, currency: data.currency, summary, available: data.unconverted.length === 0,
    points, hasHistory, live: priced.length > 0,
    month: data.month.month, flow: summarizeFlow(data.month), attention: pickAttention(data.attention), empty: data.empty,
  };
}
