import type { MonthFlow } from './types';

export type FlowSummary = { inCents: number; outCents: number; keptCents: number; keptShare: number };

export function summarizeFlow(m: MonthFlow): FlowSummary {
  const inCents = m.incoming.reduce((s, l) => s + l.cents, 0);
  const outCents = m.outgoing.reduce((s, l) => s + l.cents, 0);
  const keptCents = inCents - outCents;
  return { inCents, outCents, keptCents, keptShare: inCents > 0 ? keptCents / inCents : 0 };
}
