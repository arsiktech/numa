import { isStale } from './summary';
import type { Valuation } from './types';

export type Tone = 'live' | 'ok' | 'stale' | 'missing' | 'due';
export type Freshness = { text: string; tone: Tone };

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDay = (ms: number, now: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${months[d.getMonth()]}${d.getFullYear() !== new Date(now).getFullYear() ? ' ' + d.getFullYear() : ''}`;
};

/** "20 Feb 2026", always with the year. */
export const longDay = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; };

/** "4 min ago", "3 h ago", "2 days ago", "5 months ago". */
export function ago(ms: number, now: number): string {
  const s = Math.max(0, now - ms) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86_400);
  if (days < 60) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** Where a value came from and how fresh it is, in words. Every value on Holdings carries one. */
export function freshness(v: Valuation, now: number): Freshness {
  switch (v.kind) {
    case 'live':
      return { text: 'Live', tone: 'live' };
    case 'delayed':
      return { text: `Delayed ${v.delayMinutes} min`, tone: 'live' };
    case 'synced': {
      const t = new Date(v.asOf).getTime();
      return { text: `${v.source} · ${ago(t, now)}`, tone: now - t < 3_600_000 ? 'live' : 'ok' };
    }
    case 'manual': {
      const t = new Date(v.asOf).getTime();
      return isStale(v, new Date(now))
        ? { text: `Your value · ${ago(t, now).replace(' ago', '')} old`, tone: 'stale' }
        : { text: `Your value · ${shortDay(t, now)}`, tone: 'ok' };
    }
    case 'missing':
      return v.lastKnownAt
        ? { text: `Last price · ${ago(new Date(v.lastKnownAt).getTime(), now)}`, tone: 'stale' }
        : { text: 'No price yet · counted at cost', tone: 'missing' };
  }
}
