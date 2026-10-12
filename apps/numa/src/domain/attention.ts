import type { Attention, Urgency } from './types';

const rank: Record<Urgency, number> = { due: 0, watch: 1, housekeeping: 2 };

/** What the home shows under "Needs you": the most urgent first, at most `max` a day. */
export function pickAttention(items: Attention[], max = 3): Attention[] {
  return [...items]
    .sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.raisedAt.localeCompare(b.raisedAt))
    .slice(0, max);
}
