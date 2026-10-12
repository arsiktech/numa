import { useEffect, useMemo, useState } from 'react';

import { pickAttention } from '@/domain/attention';
import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { demoAttention, demoDebts, demoHoldings, demoNow, demoOctober, demoSeries, type Range } from './demo';

/** Home data. Today this is the labelled demo portfolio with a gentle live tick; the Convex source replaces it next. */
export function useHome(range: Range) {
  const summary = useMemo(() => summarize(demoHoldings, demoDebts, demoNow), []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + (Math.random() - 0.42) * 7000), 1700);
    return () => clearInterval(id);
  }, []);
  const netCents = summary.netCents + Math.round(tick);
  const series = useMemo(() => demoSeries(range, summary.netCents), [range, summary.netCents]);
  const live = [...series.slice(0, -1), netCents];
  return {
    demo: true as const,
    summary,
    netCents,
    series: live,
    month: 'October',
    flow: summarizeFlow(demoOctober),
    attention: pickAttention(demoAttention),
  };
}
