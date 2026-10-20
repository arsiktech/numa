import type { CloudTransaction } from '@/cloud/api';
import { convertCents, type FxRate } from '@/data/fx';
import type { Currency } from '@/domain/types';
import type { MonthKey } from './month';

/**
 * A month as a calendar of spending: each day's spend in the space currency and a shade from 0 (none)
 * to 4 (the month's biggest days). Shades follow the square root of the spend, so one big day doesn't
 * flatten every other day to the same grey. Spend that can't be converted is counted as unknown.
 */
export type CalendarDay = { day: number; at: number; spentCents: number; count: number; unknown: number; income: boolean; level: 0 | 1 | 2 | 3 | 4; txIds: string[] };
export type MonthCalendar = { lead: number; days: CalendarDay[]; averageCents: number; maxCents: number };

export function monthCalendar(txs: CloudTransaction[], k: MonthKey, currency: Currency, fx: FxRate | null, now: number): MonthCalendar {
  const count = new Date(k.year, k.month + 1, 0).getDate();
  const days: CalendarDay[] = Array.from({ length: count }, (_, i) => ({ day: i + 1, at: new Date(k.year, k.month, i + 1).getTime(), spentCents: 0, count: 0, unknown: 0, income: false, level: 0, txIds: [] }));
  for (const t of txs) {
    const d = new Date(t.occurredAt);
    if (d.getFullYear() !== k.year || d.getMonth() !== k.month) continue;
    const day = days[d.getDate() - 1];
    day.txIds.push(t.id);
    if (t.kind === 'income') { day.income = true; continue; }
    const cents = convertCents(Math.abs(t.amountMinor), t.currency, currency, fx);
    day.count += 1;
    if (cents === null) day.unknown += 1; else day.spentCents += cents;
  }
  const maxCents = Math.max(0, ...days.map((d) => d.spentCents));
  for (const d of days) {
    d.level = d.spentCents <= 0 || maxCents <= 0 ? 0 : (Math.min(4, 1 + Math.floor(Math.sqrt(d.spentCents / maxCents) * 3.999)) as CalendarDay['level']);
  }
  // The average is over days that have happened, so a month in progress isn't diluted by the future.
  const elapsed = days.filter((d) => d.at <= now).length || count;
  const spent = days.reduce((t, d) => t + d.spentCents, 0);
  return { lead: (new Date(k.year, k.month, 1).getDay() + 6) % 7, days, averageCents: Math.round(spent / elapsed), maxCents };
}

/** "2.6× your daily average", or how far below it. Null on a day with no spending. */
export function versusAverage(day: CalendarDay, averageCents: number): string | null {
  if (day.spentCents <= 0 || averageCents <= 0) return null;
  const x = day.spentCents / averageCents;
  return x >= 1.05 ? `${x.toFixed(1)}× your daily average` : x <= 0.95 ? `${Math.round((1 - x) * 100)}% under your daily average` : 'About your daily average';
}
