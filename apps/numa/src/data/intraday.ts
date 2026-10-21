import type { Item } from './items';
import { positionsOf } from './positions';
import type { Point, Range } from './series';

/**
 * Dense chart lines from market price history, the way a broker draws them: every 10 minutes for
 * a day, every hour for a week, every 4 hours for a month, every day for a year. Each priced
 * position moves with its own price; everything without one (cash, property, stablecoins, lending,
 * debts) stays at today's value. The line ends exactly at today's net worth.
 */

export type HistoryRange = Exclude<Range, 'ALL'>;
/** Raw candle START timestamps and close prices, retained separately from the drawing grid.
 * The close is only available at t + granularityMs; fetchedAt is never reset on cache fallback.
 */
export type PriceObservations = {
  t: number[]; p: number[]; source: 'coinbase' | 'yahoo'; granularityMs: number; fetchedAt: number;
};
export type PriceSeries = { t: number[]; p: number[]; observations?: PriceObservations };
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
  return s.p[Math.max(0, indexAt(s.t, t))];
}

function indexAt(times: number[], t: number): number {
  let lo = 0, hi = times.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

/** Invalid or mismatched price arrays cannot produce a money value or a chart ratio. */
export function validPriceSeries(s: PriceSeries): boolean {
  return Array.isArray(s?.t) && Array.isArray(s?.p) && s.t.length > 0 && s.t.length === s.p.length &&
    s.t.every((t, i) => Number.isFinite(t) && (i === 0 || t >= s.t[i - 1])) &&
    s.p.every((p) => Number.isFinite(p) && p > 0);
}

/** Evidence for attribution only. Drawing grids, previous-close padding and old cache rows
 * cannot establish coverage. Allow at most three grid/candle intervals of age or missing
 * observations, including at pinned endpoints. Also verify the current normalization price.
 */
export function hasObservedCoverage(s: PriceSeries, range: HistoryRange, from: number, to: number, now: number): boolean {
  if (!validPriceSeries(s) || ![from, to, now].every(Number.isFinite) || from > to || to > now || s.t.some((t) => t > now)) return false;
  const o = s.observations;
  const granularityMs = range === '1D' ? 300_000 : range === '1Y' ? 86_400_000 : 3_600_000;
  if (!o || !['coinbase', 'yahoo'].includes(o.source) || o.granularityMs !== granularityMs ||
    !Number.isFinite(o.fetchedAt) || o.fetchedAt > now || !Array.isArray(o.t) || !Array.isArray(o.p) || !o.t.length || o.t.length !== o.p.length ||
    !o.t.every((t, i) => Number.isSafeInteger(t) && t >= 0 && t + o.granularityMs <= o.fetchedAt && (i === 0 || t > o.t[i - 1])) ||
    !o.p.every((p) => Number.isFinite(p) && p > 0)) return false;
  const closes = o.t.map((t) => t + o.granularityMs);
  const maxAge = 3 * Math.max(GRID[range].step, o.granularityMs);
  const supportedDrawingAt = (t: number) => {
    const drawn = indexAt(s.t, t);
    if (drawn < 0) return false;
    const observed = indexAt(closes, s.t[drawn]);
    // A Yahoo candle close drawn at its start, or a synthetic previous close, must
    // not be treated as a price actually available at that selected timestamp.
    return observed >= 0 && t - closes[observed] <= maxAge && s.p[drawn] === o.p[observed];
  };
  if (!supportedDrawingAt(from) || !supportedDrawingAt(to) || !supportedDrawingAt(s.t[s.t.length - 1]) || !supportedDrawingAt(now)) return false;
  const first = indexAt(closes, from), last = indexAt(closes, to);
  for (let i = first + 1; i <= last; i++) if (closes[i] - closes[i - 1] > maxAge) return false;
  return true;
}

/** Unrounded cents, shared by the chart and its explanation, on today's quantities and FX. */
export function pricedValueAt(piece: PricedPiece, s: PriceSeries, t: number): number | null {
  if (!Number.isFinite(t) || !Number.isFinite(piece.valueCents) || !validPriceSeries(s)) return null;
  return valueAtValidSeries(piece, s, t);
}

function valueAtValidSeries(piece: PricedPiece, s: PriceSeries, t: number): number | null {
  const cents = piece.valueCents * (priceAt(s, t) / s.p[s.p.length - 1]);
  return Number.isFinite(cents) ? cents : null;
}

/**
 * The net worth line for a range, or null when no position has a price history (then the
 * chart falls back to saved points). Amounts are integer cents.
 */
export function denseSeries(range: HistoryRange, now: number, netCents: number, pieces: PricedPiece[], history: Record<string, PriceSeries>): Point[] | null {
  if (!Number.isSafeInteger(netCents) || !Number.isFinite(now)) return null;
  const moving = pieces
    .map((piece) => ({ piece, s: history[piece.symbol.toUpperCase()] }))
    .filter((x): x is { piece: PricedPiece; s: PriceSeries } => !!x.s && validPriceSeries(x.s) && Number.isFinite(x.piece.valueCents) && x.piece.valueCents > 0);
  if (!moving.length) return null;
  const fixed = netCents - moving.reduce((sum, x) => sum + x.piece.valueCents, 0);
  const points: Point[] = gridFor(range, now).filter((t) => t < now).map((t) => ({
    t,
    cents: Math.round(fixed + moving.reduce((sum, { piece, s }) => sum + (valueAtValidSeries(piece, s, t) ?? NaN), 0)),
  }));
  if (points.some((p) => !Number.isSafeInteger(p.cents))) return null;
  return [...points, { t: now, cents: netCents }];
}

/** The positions Home can ask a price-history provider to move. */
export function pricedPiecesOf(items: Item[]): PricedPiece[] {
  const anchored = items.filter((item) => item.freshness.tone !== 'missing');
  return (['crypto', 'stocks'] as const).flatMap((g) => positionsOf(anchored, g)
    .filter((p) => p.valueCents !== null && p.valueCents > 0 && !/^(item|cur|lent|pool):/.test(p.key))
    .map((p) => ({ symbol: p.key, kind: g === 'crypto' ? 'crypto' as const : 'stock' as const, valueCents: p.valueCents! })));
}
