import type { CloudWealthSnapshot, SnapshotLine } from '@/cloud/api';
import type { CategoryId, Currency } from '@/domain/types';
import { convertCents, type FxRate } from './fx';

/** The four parts a saved date splits into, matching the blocks Home shows for a past date. */
export type DayGroup = 'liquid' | 'invested' | 'hard' | 'owe';
export const dayGroups: DayGroup[] = ['liquid', 'invested', 'hard', 'owe'];
export const dayGroupNames: Record<DayGroup, string> = { liquid: 'Liquid', invested: 'Invested', hard: 'Property & things', owe: 'Owed' };

/** Which part a tapped block belongs to on a past date; `all` opens the whole date. */
export function dayGroupOf(to: CategoryId | 'debts' | 'all'): DayGroup | undefined {
  if (to === 'all') return undefined;
  if (to === 'debts') return 'owe';
  if (to === 'cash') return 'liquid';
  if (to === 'property' || to === 'things') return 'hard';
  return 'invested';
}

const kindNames: Record<SnapshotLine['group'], string> = { liquid: 'Cash', crypto: 'Crypto', stocks: 'Stocks', hard: 'Property & things', debt: 'Debt' };
const partOf = (l: SnapshotLine): DayGroup =>
  l.group === 'debt' || l.amount < 0 ? 'owe' : l.group === 'liquid' ? 'liquid' : l.group === 'hard' ? 'hard' : 'invested';

export type DayLine = { name: string; kind: string; cents: number };
export type DaySection = { group: DayGroup; cents: number; lines: DayLine[] };
export type Day = {
  takenAt: number;
  currency: Currency;
  netCents: number;
  sections: DaySection[];
  /** True when the date kept each position, not only the four totals. */
  detailed: boolean;
};

/**
 * One saved date, in the space's currency when today's rate allows, else in the currency it was saved
 * in. Owed amounts are positive. Null when no date was saved at `takenAt`.
 */
export function dayDetails(snapshots: CloudWealthSnapshot[], takenAt: number, currency: Currency, fx: FxRate | null): Day | null {
  const w = snapshots.find((s) => s.takenAt === takenAt);
  if (!w) return null;
  const raw = (major: number) => Math.round(major * 100);
  const lines = w.lines ?? [];
  const sameAsSaved = currency === w.currency;
  const canConvert = sameAsSaved || convertCents(100, w.currency, currency, fx) !== null;
  const shown: Currency = canConvert ? currency : w.currency;
  const conv = (cents: number) => (shown === w.currency ? cents : convertCents(cents, w.currency, shown, fx)!);

  const totals: Record<DayGroup, number> = {
    liquid: conv(raw(w.liquid ?? 0)),
    invested: conv(raw(w.invested ?? 0)),
    hard: conv(raw(w.hardAssets ?? 0)),
    owe: conv(Math.abs(raw(w.liabilities ?? 0))),
  };
  const sections = dayGroups.map((group): DaySection => ({
    group,
    cents: totals[group],
    lines: lines
      .filter((l) => partOf(l) === group)
      .map((l) => ({ name: l.name, kind: kindNames[l.group], cents: conv(Math.abs(raw(l.amount))) }))
      .sort((a, b) => b.cents - a.cents),
  })).filter((s) => s.cents !== 0 || s.lines.length);
  return { takenAt, currency: shown, netCents: conv(raw(w.netWorth)), sections, detailed: lines.length > 0 };
}
