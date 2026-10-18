export type Range = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const ranges: Range[] = ['1D', '1W', '1M', '1Y', 'ALL'];
/** What a saved snapshot recorded beside its net worth, in the portfolio's currency. */
export type PointParts = { liquidCents: number; investedCents: number; hardCents: number; oweCents: number };
export type Point = { t: number; cents: number; parts?: PointParts };

const DAY = 86_400_000;
export const spanMs: Record<Range, number> = { '1D': DAY, '1W': 7 * DAY, '1M': 30 * DAY, '1Y': 365 * DAY, ALL: Infinity };
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The chart line for a range: saved points inside it, the last point before it as the
 * starting value, and today's live value at the end. Fewer than two real points means
 * there is no history to draw yet.
 */
export function seriesFor(history: Point[], now: number, liveCents: number, range: Range): { points: Point[]; hasHistory: boolean } {
  const start = now - spanMs[range];
  const inside = history.filter((p) => p.t >= start && p.t < now);
  // A saved value carries to the start of the range only if it is no older than the range
  // itself; otherwise a week-old value would pass for this morning's.
  const before = history.filter((p) => p.t < start && start - p.t <= spanMs[range]).at(-1);
  const points: Point[] = [...(before ? [{ ...before, t: Math.max(start, before.t) }] : []), ...inside, { t: now, cents: liveCents }];
  if (points.length >= 2) return { points, hasHistory: true };
  return { points: [{ t: range === 'ALL' ? now - DAY : start, cents: liveCents }, { t: now, cents: liveCents }], hasHistory: false };
}

/** "Today 14:05", "Tue 7 Oct" or "7 Oct 2026" for the point under the finger. */
export function pointLabel(t: number, range: Range, now: number): string {
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (range === '1D' || (sameDay && range === '1W')) return (sameDay ? 'Today ' : `${d.getDate()} ${months[d.getMonth()]} `) + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (range === '1W') return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function rangeWords(range: Range, firstT: number): string {
  if (range === 'ALL') return `since ${months[new Date(firstT).getMonth()]} ${new Date(firstT).getFullYear()}`;
  return { '1D': 'today', '1W': 'this week', '1M': 'this month', '1Y': 'this year' }[range];
}

/**
 * Today's line from market moves: value before today's price changes, then now.
 * Returns null when nothing has a current price, so the screen says so instead.
 */
export function todayFromMarkets(now: number, liveCents: number, marketsTodayCents: number | null): { points: Point[]; hasHistory: boolean } | null {
  if (marketsTodayCents === null) return null;
  return { points: [{ t: now - DAY, cents: liveCents - marketsTodayCents }, { t: now, cents: liveCents }], hasHistory: true };
}

/** Short time-axis labels shown while scrubbing: "14:00", "Tue", "12 Oct", "Feb", "Mar 25". */
export function tickLabel(t: number, range: Range): string {
  const d = new Date(t);
  if (range === '1D') return String(d.getHours()).padStart(2, '0') + ':00';
  if (range === '1W') return days[d.getDay()];
  if (range === '1M') return `${d.getDate()} ${months[d.getMonth()]}`;
  if (range === '1Y') return d.getMonth() === 0 ? String(d.getFullYear()) : months[d.getMonth()];
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** "+34%", "−16%", "0%": change from the start of the line, for the value axis. */
export function changeLabel(value: number, start: number): string | null {
  if (start === 0) return null;
  const pct = ((value - start) / Math.abs(start)) * 100;
  const r = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return r === 0 ? '0%' : `${r > 0 ? '+' : '−'}${Math.abs(r)}%`;
}

/** A market price: "$67,123.45", or more digits for coins worth less than a dollar. */
export function priceText(usd: number): string {
  const opts: Intl.NumberFormatOptions = usd >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 };
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...opts }).format(usd);
}
