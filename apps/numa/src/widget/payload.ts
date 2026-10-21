import type { CloudSnapshot } from '@/cloud/api';
import type { HomeData } from '@/data/fromSnapshot';
import { isFxCurrent, type FxRate } from '@/data/fx';
import { groupNames, itemsFrom } from '@/data/items';
import { moneyMap } from '@/data/moneyMap';
import type { Point } from '@/data/series';
import { formatMoney, formatShort } from '@/domain/money';
import type { Summary } from '@/domain/summary';
import type { CategoryId, Currency } from '@/domain/types';
import { monthCalendar } from '@/flow/calendar';
import { monthName, monthOf, transactionsIn } from '@/flow/month';

export type WidgetState = 'ready' | 'hidden' | 'empty' | 'unavailable' | 'partial';
export type Amount = { text: string; compact: string; exact: string };
type Section = { state: WidgetState; message?: string };
export type WidgetTrend = {
  points: { t: number; y: number }[];
  range: string; from: string; to: string; low: string; high: string;
};
export type WidgetNetWorth = Section & {
  value?: Amount;
  daily?: {
    text: string; direction: 'up' | 'down' | 'unknown'; asOf: number | null;
    // Optional for cached v2 data. Native code never parses an amount out of legacy text.
    amount?: string; period?: 'quoteChange'; currency?: Currency; fxAsOf?: string;
  };
  historyMessage?: string;
  trend?: WidgetTrend;
};
export type WidgetMoneyMap = Section & {
  toYou?: Amount; youOwe?: Amount;
  toFraction?: number; oweFraction?: number;
};
export type WidgetCalendarDay = {
  key: string; day: number; level: number; future: boolean; unknown: boolean; description: string;
};
export type WidgetSpending = Section & {
  month?: string; monthKey?: string; validUntil?: number; total?: Amount;
  lead?: number; days?: WidgetCalendarDay[];
};
export type WidgetCategory = { key: CategoryId; name: string; value: Amount; fraction: number; percent: string };
export type WidgetBlocks = Section & {
  own?: Amount; owe?: Amount; net?: Amount;
  ownFraction?: number; oweFraction?: number; categories?: WidgetCategory[];
};
export type WidgetPayload = {
  // v1 fields remain present for the already installed binary. Its untimed line is deliberately empty.
  net: string; today: string; up: boolean; line: number[]; updatedAt: number;
  version: 2; privacy: 'visible' | 'hidden'; syncedAt: number;
  freshness?: {
    sourceAsOf: number | null; quotesAsOf: number | null;
    quotes: 'none' | 'current' | 'stale' | 'partial'; stale: boolean; fxAsOf: string | null;
    fxRequired?: boolean;
  };
  netWorth: WidgetNetWorth; moneyMap: WidgetMoneyMap; spending: WidgetSpending; blocks: WidgetBlocks;
};

export type WidgetInput = {
  snapshot: CloudSnapshot; data: HomeData; summary: Summary; fx: FxRate | null;
  hidden: boolean; now: number;
  /** When the app actually observed this snapshot/FX pair, NOT the minute freshness clock. */
  syncedAt: number;
};

const DAY = 86_400_000;
const MAX_DATE = 253_402_300_799_000;
export const validTime = (n: number): boolean => Number.isFinite(n) && n > 0 && n <= MAX_DATE;
export const validCents = (n: number): boolean => Number.isSafeInteger(n);
const amount = (cents: number, currency: Currency): Amount => {
  const magnitude = Math.abs(cents);
  const unit = magnitude >= 100_000_000_000_000 ? { divisor: 100_000_000_000_000, suffix: 'T' }
    : magnitude >= 100_000_000_000 ? { divisor: 100_000_000_000, suffix: 'B' } : null;
  const compact = unit ? `${cents < 0 ? '−' : ''}${currency === 'EUR' ? '€' : '$'}${(magnitude / unit.divisor).toFixed(1).replace(/\.0$/, '')}${unit.suffix}` : formatShort(cents, currency);
  return { text: formatMoney(cents, currency), compact, exact: formatMoney(cents, currency, { cents: true }) };
};
const leastTime = (xs: (number | null | undefined)[]): number | null => {
  const known = xs.filter((t): t is number => typeof t === 'number' && validTime(t));
  return known.length ? Math.min(...known) : null;
};
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const currentQuoteTime = (at: number | null, now: number): boolean => at !== null && validTime(at)
  && validTime(now) && at <= now && now - at < DAY;

/** Only conversions used by the recorded portfolio total, including last-known valuations. */
function totalNeedsFx(p: Pick<WidgetInput, 'snapshot' | 'data'>): boolean {
  const currency = p.data.currency;
  return p.snapshot.assets.some((a) => a.currency !== currency)
    || p.snapshot.liabilities.some((l) => l.currency !== currency)
    || p.snapshot.holdings.some((h) => (h.quoteProvider && h.quoteProvider !== 'mock' && h.quoteUpdatedAt !== null ? 'USD' : h.currency) !== currency)
    || (currency === 'EUR' && (p.snapshot.wallets ?? []).some((w) => w.includeInNetWorth));
}

/** Only real saved observations. Duplicate timestamps keep the last usable input; never append a tick. */
export function datedHistory(points: Point[], now: number): Point[] {
  if (!validTime(now)) return [];
  const byTime = new Map<number, Point>();
  for (const p of points) {
    if (validTime(p.t) && validCents(p.cents) && p.t >= now - 30 * DAY && p.t <= now) {
      byTime.set(p.t, { t: p.t, cents: p.cents });
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t).slice(-90);
}

export function widgetTrend(points: Point[], now: number, currency: Currency): WidgetTrend | undefined {
  const saved = datedHistory(points, now);
  if (saved.length < 3) return undefined;
  const values = saved.map((p) => p.cents);
  const lo = Math.min(...values), hi = Math.max(...values);
  // hi-lo can exceed safe integer precision even when both inputs are safe. The ratio is still finite.
  const pointsOut = saved.map((p) => ({ t: p.t, y: hi === lo ? 0.5 : (p.cents - lo) / (hi - lo) }));
  if (pointsOut.some((p) => !Number.isFinite(p.y) || p.y < 0 || p.y > 1)) return undefined;
  return {
    points: pointsOut, range: 'Saved observations · 30 days',
    from: shortDate(saved[0].t), to: shortDate(saved[saved.length - 1].t),
    low: formatMoney(lo, currency), high: formatMoney(hi, currency),
  };
}

/** Coverage guard around the EXISTING holding change, not a second return/attribution estimator. */
export function widgetDailyChange(p: Pick<WidgetInput, 'snapshot' | 'data' | 'fx' | 'now'>): NonNullable<WidgetNetWorth['daily']> {
  const raw = p.snapshot.holdings;
  const countedWallets = (p.snapshot.wallets ?? []).some((w) => w.includeInNetWorth);
  const unknown = { text: 'Quote change unavailable', direction: 'unknown' as const, asOf: null };
  if (!validTime(p.now)) return unknown;
  if (!raw.length && !countedWallets) return { ...unknown, text: 'No market prices today' };
  // Wallet valuations have no daily quote-change contract. Do not silently add them as zero.
  if (countedWallets) return unknown;
  // Security quotes are USD. A USD portfolio needs no conversion for this estimate.
  if (p.data.currency === 'EUR' && !isFxCurrent(p.fx, p.now)) return unknown;
  const byId = new Map(p.data.holdings.map((h) => [h.id, h]));
  const changes: number[] = [];
  const times: number[] = [];
  for (const h of raw) {
    const mapped = byId.get(h.id);
    const at = h.quoteUpdatedAt;
    if (!mapped || mapped.valuation.kind !== 'synced' || !h.quoteProvider || h.quoteProvider === 'mock'
      || h.quoteStale || !Number.isFinite(h.changePercent) || h.changePercent <= -100 || h.changePercent === 0
      || !currentQuoteTime(at, p.now)
      || !validCents(mapped.changeTodayCents ?? NaN)) return unknown;
    // Existing providers use zero for both unknown and true-zero change. Until coverage is
    // explicit, those ambiguous zeros stay unavailable rather than implying a flat market.
    changes.push(mapped.changeTodayCents!);
    times.push(at!);
  }
  const cents = changes.reduce((sum, n) => sum + n, 0);
  if (!validCents(cents)) return unknown;
  const asOf = Math.min(...times);
  const changeAmount = `${cents >= 0 ? '+' : '−'}${formatMoney(Math.abs(cents), p.data.currency, { cents: true })}`;
  const day = new Date(asOf).toDateString() === new Date(p.now).toDateString() ? 'today'
    : `as of ${new Date(asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return {
    text: `${changeAmount} quote change ${day}`, amount: changeAmount, period: 'quoteChange', currency: p.data.currency,
    direction: cents >= 0 ? 'up' : 'down', asOf,
    ...(p.data.currency === 'EUR' ? { fxAsOf: p.fx!.asOf } : {}),
  };
}

function sourceFreshness(p: WidgetInput): NonNullable<WidgetPayload['freshness']> {
  const times = p.data.holdings.map((h) => h.valuation.kind === 'missing'
    ? (h.valuation.lastKnownAt ? Date.parse(h.valuation.lastKnownAt) : null) : Date.parse(h.valuation.asOf));
  times.push(...p.snapshot.liabilities.map((l) => l.owedSymbol ? l.owedPriceAt ?? null : l.updatedAt));
  const quotes = p.snapshot.holdings;
  const quoteTimes = quotes.map((h) => h.quoteUpdatedAt);
  const missing = quotes.some((h) => h.quoteUpdatedAt === null || !validTime(h.quoteUpdatedAt)
    || !h.quoteProvider || h.quoteProvider === 'mock' || !Number.isFinite(h.changePercent));
  const staleQuotes = quotes.some((h) => h.quoteStale || !currentQuoteTime(h.quoteUpdatedAt, p.now));
  const fxRequired = totalNeedsFx(p);
  const staleConversion = fxRequired && !isFxCurrent(p.fx, p.now);
  const walletsPartial = (p.snapshot.wallets ?? []).some((w) => w.includeInNetWorth && (!w.snapshot || w.snapshot.partial));
  const debtPricesOld = p.snapshot.liabilities.some((l) => l.owedSymbol && (l.owedPriceAt == null
    || !validTime(l.owedPriceAt) || l.owedPriceAt > p.now || p.now - l.owedPriceAt > DAY));
  return {
    sourceAsOf: leastTime(times), quotesAsOf: leastTime(quoteTimes),
    quotes: !quotes.length ? 'none' : missing ? 'partial' : staleQuotes ? 'stale' : 'current',
    stale: p.summary.stale.length > 0 || p.summary.unknown.length > 0 || staleQuotes || missing || walletsPartial || debtPricesOld || staleConversion,
    fxAsOf: p.fx?.asOf ?? null, fxRequired,
  };
}

function netWorth(p: WidgetInput): WidgetNetWorth {
  if (p.data.unconverted.length || !validCents(p.summary.netCents) || p.summary.unknown.length) {
    return { state: 'unavailable', message: 'Some values or exchange rates are unavailable' };
  }
  const hasRecords = p.snapshot.assets.length || p.snapshot.holdings.length || p.snapshot.liabilities.length
    || (p.snapshot.wallets ?? []).some((w) => w.includeInNetWorth);
  const historyNeedsFx = p.snapshot.wealthSnapshots.some((w) => w.takenAt >= p.now - 30 * DAY
    && w.takenAt <= p.now && w.currency !== p.data.currency && !p.fx);
  const trend = historyNeedsFx ? undefined : widgetTrend(p.data.history, p.now, p.data.currency);
  return {
    state: hasRecords ? 'ready' : 'empty', value: amount(p.summary.netCents, p.data.currency),
    daily: widgetDailyChange(p), trend,
    historyMessage: historyNeedsFx ? 'History needs exchange rates' : trend ? undefined
      : 'Not enough saved history. A trend needs 3 dated observations in 30 days.',
    message: hasRecords ? undefined : 'No assets or debts recorded',
  };
}

function mapSection(p: WidgetInput): WidgetMoneyMap {
  const map = moneyMap(p.snapshot, itemsFrom(p.snapshot, p.data, p.now, p.fx), p.data.currency, p.fx);
  const values = [map.owedToYouCents, map.youOweCents];
  if (values.some((n) => !validCents(n) || n < 0)) return { state: 'unavailable', message: 'Money map values unavailable' };
  const scale = Math.max(...values);
  // The existing map's unknown count includes records excluded from these two totals too.
  const partial = map.unknown > 0;
  return {
    state: partial ? 'partial' : map.owedToYou.length || map.people.length || map.protocols.length ? 'ready' : 'empty',
    message: partial ? 'Partial · unvalued records left out' : scale === 0 ? 'No lending or borrowing recorded' : undefined,
    toYou: amount(map.owedToYouCents, p.data.currency), youOwe: amount(map.youOweCents, p.data.currency),
    toFraction: scale ? map.owedToYouCents / scale : 0, oweFraction: scale ? map.youOweCents / scale : 0,
  };
}

function spendingSection(p: WidgetInput): WidgetSpending {
  const date = new Date(p.now), month = monthOf(p.now);
  const validUntil = new Date(month.year, month.month, date.getDate() + 1).getTime();
  // Keep the shared clock allowance within today, but never let a future local day
  // change this month's total, FX coverage, or the shade scale for elapsed days.
  const txs = transactionsIn(p.snapshot.transactions, month, date).filter((t) => t.occurredAt < validUntil);
  if (txs.some((t) => !validTime(t.occurredAt) || !validCents(t.amountMinor))) {
    return { state: 'unavailable', message: 'Spending values unavailable' };
  }
  const cal = monthCalendar(txs, month, p.data.currency, p.fx, p.now);
  const total = cal.days.reduce((sum, d) => sum + d.spentCents, 0);
  if (!validCents(total) || cal.days.some((d) => !validCents(d.spentCents))) {
    return { state: 'unavailable', message: 'Spending values unavailable' };
  }
  const partial = cal.days.some((d) => d.unknown > 0);
  const anySpend = cal.days.some((d) => d.count > 0);
  const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
  return {
    state: partial ? 'partial' : anySpend ? 'ready' : 'empty',
    message: partial ? 'Partial total · ? needs exchange rates' : !anySpend ? 'No spending logged this month' : undefined,
    month: monthName(month, date), monthKey, validUntil,
    total: amount(total, p.data.currency), lead: cal.lead,
    days: cal.days.map((d) => ({
      key: `${monthKey}-${String(d.day).padStart(2, '0')}`, day: d.day, level: d.level,
      future: d.at > p.now, unknown: d.unknown > 0,
      description: `${d.day} ${monthName(month, date)}: ${d.at > p.now ? 'future date'
        : d.unknown > 0 ? `${formatMoney(d.spentCents, p.data.currency, { cents: true })} known spending, unconverted spending also present`
          : d.count > 0 ? `${formatMoney(d.spentCents, p.data.currency, { cents: true })} spent` : 'no spending'}`,
    })),
  };
}

function blocksSection(p: WidgetInput): WidgetBlocks {
  const s = p.summary;
  if (p.data.unconverted.length || s.unknown.length || [s.ownCents, s.oweCents, s.netCents].some((n) => !validCents(n))
    || s.ownCents < 0 || s.oweCents < 0 || s.categories.some((c) => !validCents(c.cents) || c.cents < 0)) {
    return { state: 'unavailable', message: 'Composition needs all values and exchange rates' };
  }
  const scale = Math.max(s.ownCents, s.oweCents);
  return {
    state: scale === 0 ? 'empty' : 'ready', message: scale === 0 ? 'No assets or debts recorded' : undefined,
    own: amount(s.ownCents, p.data.currency), owe: amount(s.oweCents, p.data.currency), net: amount(s.netCents, p.data.currency),
    ownFraction: scale ? s.ownCents / scale : 0, oweFraction: scale ? s.oweCents / scale : 0,
    categories: s.categories.map((c) => {
      const fraction = s.ownCents ? c.cents / s.ownCents : 0;
      return {
        key: c.category, name: c.category === 'stocks' ? 'Stocks' : groupNames[c.category], value: amount(c.cents, p.data.currency), fraction,
        percent: fraction > 0 && fraction < 0.01 ? '<1%' : `${Math.round(fraction * 100)}%`,
      };
    }),
  };
}

/** No personal fields are even constructed when Hide amounts is on. */
export function widgetPayload(p: WidgetInput): WidgetPayload {
  const syncedAt = validTime(p.syncedAt) ? p.syncedAt : 0;
  const base = { version: 2 as const, syncedAt, updatedAt: syncedAt, line: [] as number[] };
  if (p.hidden) return {
    ...base, privacy: 'hidden', net: '••••', today: '', up: true,
    netWorth: { state: 'hidden' }, moneyMap: { state: 'hidden' }, spending: { state: 'hidden' }, blocks: { state: 'hidden' },
  };
  if (!validTime(p.now)) return {
    ...base, privacy: 'visible', net: '—', today: 'Data unavailable', up: true,
    netWorth: { state: 'unavailable' }, moneyMap: { state: 'unavailable' }, spending: { state: 'unavailable' }, blocks: { state: 'unavailable' },
  };
  // Upstream mapping may already have used this FX. Do not publish its derived values if corrupt.
  const usesFx = totalNeedsFx(p) || p.snapshot.wealthSnapshots.some((w) => w.currency !== p.data.currency)
    || p.snapshot.transactions.some((t) => t.currency !== p.data.currency);
  if (usesFx && p.fx && (!Number.isFinite(p.fx.usdPerEur) || p.fx.usdPerEur <= 0)) return {
    ...base, privacy: 'visible', net: '—', today: 'Exchange rate unavailable', up: true,
    netWorth: { state: 'unavailable', message: 'Exchange rate unavailable' },
    moneyMap: { state: 'unavailable', message: 'Exchange rate unavailable' },
    spending: { state: 'unavailable', message: 'Exchange rate unavailable' },
    blocks: { state: 'unavailable', message: 'Exchange rate unavailable' },
  };
  const input = p;
  const net = netWorth(input);
  return {
    ...base, privacy: 'visible', net: net.value?.text ?? '—', today: net.daily?.text ?? net.message ?? '',
    up: net.daily?.direction !== 'down', freshness: sourceFreshness(input),
    netWorth: net, moneyMap: mapSection(input), spending: spendingSection(input), blocks: blocksSection(input),
  };
}
