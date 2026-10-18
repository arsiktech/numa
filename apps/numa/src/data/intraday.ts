import type { Point, Range } from './series';

/**
 * Dense chart lines from market price history, the way a broker draws them: every 10 minutes for
 * a day, every hour for a week, every 4 hours for a month, every day for a year. Each priced
 * position moves with its own price; everything without one (cash, property, stablecoins, lending,
 * debts) stays at today's value. The line ends exactly at today's net worth.
 */

export type HistoryRange = Exclude<Range, 'ALL'>;
export type PriceSeries = { t: number[]; p: number[] };
/** A position that moves with a market price: its symbol and today's value in the portfolio currency. */
export type PricedPiece = { symbol: string; kind: 'crypto' | 'stock'; valueCents: number };

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const GRID: Record<HistoryRange, { step: number; span: number }> = {
  '1D': { step: 10 * MIN, span: DAY },
  '1W': { step: HOUR, span: 7 * DAY },
  '1M': { step: 4 * HOUR, span: 30 * DAY },
  '1Y': { step: DAY, span: 365 * DAY },
};

export function gridFor(range: HistoryRange, now: number): number[] {
  const { step, span } = GRID[range];
  const end = Math.floor(now / step) * step;
  const out: number[] = [];
  for (let t = end - span; t <= end; t += step) out.push(t);
  return out;
}

/** The last price at or before `t` (or the first one), from a series sorted by time. */
function priceAt(s: PriceSeries, t: number): number {
  let lo = 0, hi = s.t.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return s.p[best];
}

/**
 * The net worth line for a range, or null when no position has a price history (then the
 * chart falls back to saved points). Amounts are integer cents.
 */
export function denseSeries(range: HistoryRange, now: number, netCents: number, pieces: PricedPiece[], history: Record<string, PriceSeries>): Point[] | null {
  const moving = pieces
    .map((piece) => ({ piece, s: history[piece.symbol.toUpperCase()] }))
    .filter((x): x is { piece: PricedPiece; s: PriceSeries } => !!x.s && x.s.t.length > 0 && x.s.p.at(-1)! > 0 && x.piece.valueCents !== 0);
  if (!moving.length) return null;
  const fixed = netCents - moving.reduce((sum, x) => sum + x.piece.valueCents, 0);
  const points: Point[] = gridFor(range, now).filter((t) => t < now).map((t) => ({
    t,
    cents: Math.round(fixed + moving.reduce((sum, { piece, s }) => sum + piece.valueCents * (priceAt(s, t) / s.p.at(-1)!), 0)),
  }));
  return [...points, { t: now, cents: netCents }];
}
