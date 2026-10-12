import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import type { Point } from '@/data/series';

/** What the home-screen widget shows. Strings are formatted here so they match the app exactly. */
export type WidgetPayload = {
  /** "€42,035", "••••" when amounts are hidden, or "—" when totals can't be worked out. */
  net: string;
  /** "+€120 today", "−€80 today", or an explanation. Empty when hidden. */
  today: string;
  up: boolean;
  /** The last 30 days of net worth, scaled 0 to 1. Empty when hidden or too short to draw. */
  line: number[];
  updatedAt: number;
};

const DAY = 86_400_000;

export function widgetPayload(p: { netCents: number; todayCents: number | null; points: Point[]; currency: Currency; hidden: boolean; available: boolean; now: number }): WidgetPayload {
  if (p.hidden) return { net: '••••', today: '', up: true, line: [], updatedAt: p.now };
  if (!p.available) return { net: '—', today: 'Needs today’s exchange rate', up: true, line: [], updatedAt: p.now };
  const today = p.todayCents === null ? 'No market prices today' : `${p.todayCents >= 0 ? '+' : '−'}${formatMoney(Math.abs(p.todayCents), p.currency)} today`;
  const recent = [...p.points.filter((x) => x.t >= p.now - 30 * DAY && x.t < p.now), { t: p.now, cents: p.netCents }].slice(-30);
  const values = recent.map((x) => x.cents);
  const lo = Math.min(...values), hi = Math.max(...values);
  const line = values.length < 2 ? [] : values.map((v) => (hi === lo ? 0.5 : Math.round(((v - lo) / (hi - lo)) * 1000) / 1000));
  return { net: formatMoney(p.netCents, p.currency), today, up: (p.todayCents ?? 0) >= 0, line, updatedAt: p.now };
}
