import type { Currency } from '@/domain/types';
import { convertCents, type FxRate } from './fx';

/**
 * What DeFi strategies earned, as `defiEarnings:forPortfolio` reports it (dollars, per position, per
 * day read), turned into one view for a range: earned on what is held, interest paid on what is owed,
 * the net, and roughly what that is a year on what is held now.
 */
export type CloudEarning = {
  position: string; protocol: string; chainName: string; label: string;
  earnedUsd: number; paidUsd: number; heldUsd: number; owedUsd: number;
  daily: Record<string, [number, number]>; unknown: number; since: number;
  walletId: string; wallet: string;
};

export type Range = '7d' | '30d' | 'all';
export type Strategy = { key: string; name: string; where: string; earnedCents: number; paidCents: number; netCents: number; heldCents: number; rate: number | null; unknown: number };
export type EarningsDay = { day: string; netCents: number; totalCents: number };
export type Earnings = {
  /** When Numa first read any of them. */
  since: number | null;
  days: number;
  earnedCents: number; paidCents: number; netCents: number;
  /** Net over the range as a yearly share of what is held now; null until there is a day to go on. */
  rate: number | null;
  strategies: Strategy[];
  series: EarningsDay[];
  unknown: number;
};

const DAY = 86_400_000;
const RANGE_DAYS: Record<Range, number | null> = { '7d': 7, '30d': 30, all: null };
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Null when dollars can't be shown in the space's currency (no exchange rate): unknown, not zero. */
export function summarize(rows: CloudEarning[], range: Range, now: number, currency: Currency, fx: FxRate | null): Earnings | null {
  const cents = (usd: number) => convertCents(Math.round(usd * 100), 'USD', currency, fx);
  if (cents(1) === null) return null;
  const c = (usd: number) => cents(usd)!;
  const span = RANGE_DAYS[range];
  const from = span === null ? '' : dayOf(now - span * DAY);
  const since = rows.length ? Math.min(...rows.map((r) => r.since)) : null;
  const days = since === null ? 0 : Math.min(span ?? Infinity, Math.max(0, (now - since) / DAY));
  const byDay = new Map<string, number>();
  let earned = 0, paid = 0, held = 0, unknown = 0;
  const strategies: Strategy[] = [];
  for (const r of rows) {
    let e = 0, p = 0;
    for (const [d, [x, y]] of Object.entries(r.daily)) {
      if (d <= from) continue;
      e += x; p += y;
      byDay.set(d, (byDay.get(d) ?? 0) + x - y);
    }
    earned += e; paid += p; held += r.heldUsd; unknown += r.unknown;
    // A strategy closed before the range, with nothing in it, isn't shown.
    if (!e && !p && !r.heldUsd && !r.owedUsd) continue;
    const ownDays = Math.min(span ?? Infinity, Math.max(0, (now - r.since) / DAY));
    strategies.push({
      key: `${r.walletId}:${r.position}`, name: r.label, where: r.protocol === 'Wallet' || r.label.startsWith(r.protocol) ? `${r.wallet} · ${r.chainName}` : `${r.wallet} · ${r.protocol} · ${r.chainName}`,
      earnedCents: c(e), paidCents: c(p), netCents: c(e - p), heldCents: c(r.heldUsd),
      rate: ownDays >= 1 && r.heldUsd > 0 && Object.keys(r.daily).length ? ((e - p) / r.heldUsd) * (365 / ownDays) : null, unknown: r.unknown,
    });
  }
  let total = 0;
  const series = [...byDay.keys()].sort().map((d) => { total += byDay.get(d)!; return { day: d, netCents: c(byDay.get(d)!), totalCents: c(total) }; });
  strategies.sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents) || b.heldCents - a.heldCents);
  return {
    since, days, earnedCents: c(earned), paidCents: c(paid), netCents: c(earned - paid),
    rate: days >= 1 && held > 0 && series.length ? ((earned - paid) / held) * (365 / days) : null,
    strategies, series, unknown,
  };
}
