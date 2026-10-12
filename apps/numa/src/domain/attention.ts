import type { Attention, Urgency } from './types';

const rank: Record<Urgency, number> = { due: 0, watch: 1, housekeeping: 2 };

/** What the home shows under "Needs you": the most urgent first, at most `max` a day. */
export function pickAttention(items: Attention[], max = 3): Attention[] {
  return [...items]
    .sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.raisedAt.localeCompare(b.raisedAt))
    .slice(0, max);
}

/** Drops what the person dismissed, unless its title changed, and what is snoozed until later. */
export function visibleAttention(items: Attention[], dismissed: Record<string, { title: string; until: number | null }>, now: number): Attention[] {
  return items.filter((i) => {
    const d = dismissed[i.id];
    if (!d || d.title !== i.title) return true;
    return d.until !== null && d.until <= now;
  });
}

/** The start of tomorrow, local time: when a "Later" comes back. */
export function tomorrow(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}
