import type { CloudAsset, CloudHolding, CloudSnapshot } from '@/cloud/api';
import type { Attention, CategoryId, Currency, Debt, Holding, Liquidity, MonthFlow } from '@/domain/types';
import { monthFlow, monthOf as monthOfMs } from '@/flow/month';
import { convertCents, type FxRate } from './fx';

/** Home's view of one portfolio, in the portfolio's currency. */
export type HomeData = {
  currency: Currency;
  holdings: Holding[];
  debts: Debt[];
  /** Records that need an exchange rate we do not have. While any exist, totals are unavailable. */
  unconverted: string[];
  /** Saved net-worth points, oldest first. */
  history: { t: number; cents: number }[];
  month: MonthFlow;
  attention: Attention[];
  empty: boolean;
};

const DAY = 86_400_000;
/** Records stamped slightly after the screen's clock (it refreshes each minute; devices drift) still count as now. */
const CLOCK_SLACK = 3_600_000;
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortMonths = months.map((m) => m.slice(0, 3));
const iso = (ms: number) => new Date(ms).toISOString();
const shortDate = (ms: number) => `${new Date(ms).getDate()} ${shortMonths[new Date(ms).getMonth()]}`;
const providerNames: Record<string, string> = { coingecko: 'CoinGecko', 'alpha-vantage': 'Alpha Vantage', stooq: 'Stooq', finnhub: 'Finnhub' };

const assetPlace: Record<CloudAsset['kind'], { category: CategoryId; liquidity: Liquidity; remindAfterDays: number }> = {
  cash: { category: 'cash', liquidity: { kind: 'cash' }, remindAfterDays: 30 },
  real_estate: { category: 'property', liquidity: { kind: 'illiquid' }, remindAfterDays: 180 },
  vehicle: { category: 'things', liquidity: { kind: 'illiquid' }, remindAfterDays: 180 },
  collectible: { category: 'things', liquidity: { kind: 'illiquid' }, remindAfterDays: 180 },
  other: { category: 'things', liquidity: { kind: 'illiquid' }, remindAfterDays: 180 },
};

function ageWords(ms: number): string {
  const days = Math.floor(ms / DAY);
  if (days < 2) return 'a day';
  if (days < 60) return `${days} days`;
  return `${Math.round(days / 30)} months`;
}

function holdingOf(h: CloudHolding, currency: Currency, fx: FxRate | null, now: number, attention: Attention[]): Holding | null {
  const base = { id: h.id, name: h.name || h.symbol, category: (h.kind === 'crypto' ? 'crypto' : 'stocks') as CategoryId, quantity: { amount: h.quantity, unit: h.symbol }, liquidity: { kind: 'liquid' } as Liquidity };
  const hasQuote = h.quoteProvider !== null && h.quoteProvider !== 'mock' && h.quoteUpdatedAt !== null;
  if (!hasQuote) {
    // No price: count what was paid, flagged, so the total is honest about it.
    const cost = convertCents(Math.round(h.costBasis * 100), h.currency, currency, fx);
    if (cost === null) return null;
    attention.push({ id: `quote-${h.id}`, urgency: 'watch', title: `No price for ${h.symbol}`, body: 'Counted at what you paid until a price arrives.', primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt: iso(now) });
    return { ...base, valuation: { kind: 'missing', lastKnownCents: cost, lastKnownAt: null } };
  }
  // Quotes are stored in US dollars.
  const valueCents = convertCents(Math.round(h.marketPrice * h.quantity * 100), 'USD', currency, fx);
  if (valueCents === null) return null;
  const asOf = iso(h.quoteUpdatedAt!);
  if (h.quoteStale) {
    attention.push({ id: `stale-${h.id}`, urgency: 'watch', title: `${h.symbol} price is ${ageWords(now - h.quoteUpdatedAt!)} old`, body: 'Counted at the last price until a fresh one arrives.', primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt: iso(now) });
    return { ...base, valuation: { kind: 'missing', lastKnownCents: valueCents, lastKnownAt: asOf } };
  }
  const pct = Number.isFinite(h.changePercent) ? h.changePercent : 0;
  const changeTodayCents = pct > -100 ? Math.round(valueCents - valueCents / (1 + pct / 100)) : undefined;
  return { ...base, valuation: { kind: 'synced', valueCents, asOf, source: providerNames[h.quoteProvider!] ?? h.quoteProvider! }, changeTodayCents };
}

/** Maps the server's portfolio snapshot to Home. Pure, so it is tested without a backend. */
export function fromSnapshot(s: CloudSnapshot, fx: FxRate | null, now: Date): HomeData {
  const currency = s.portfolio.defaultCurrency;
  const nowMs = now.getTime();
  const holdings: Holding[] = [];
  const debts: Debt[] = [];
  const unconverted: string[] = [];
  const attention: Attention[] = [];

  for (const h of s.holdings) {
    const mapped = holdingOf(h, currency, fx, nowMs, attention);
    if (mapped) holdings.push(mapped); else unconverted.push(h.name || h.symbol);
  }

  for (const a of s.assets) {
    const cents = convertCents(Math.round(a.balance * 100), a.currency, currency, fx);
    if (cents === null) { unconverted.push(a.name); continue; }
    // An overdrawn account is money owed, not a negative block.
    if (cents < 0) { debts.push({ id: a.id, name: a.name, balanceCents: -cents }); continue; }
    const place = assetPlace[a.kind];
    holdings.push({ id: a.id, name: a.name, category: place.category, liquidity: place.liquidity, valuation: { kind: 'manual', valueCents: cents, asOf: iso(a.updatedAt), remindAfterDays: place.remindAfterDays } });
    const age = nowMs - a.updatedAt;
    if (cents > 0 && age > place.remindAfterDays * DAY) {
      attention.push({ id: `value-${a.id}`, urgency: 'housekeeping', title: `${a.name} value is ${ageWords(age)} old`, body: `Last updated ${shortDate(a.updatedAt)}. Update it so net worth stays right.`, primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt: iso(a.updatedAt + place.remindAfterDays * DAY) });
    }
  }

  for (const l of s.liabilities) {
    const cents = convertCents(Math.round(Math.abs(l.balance) * 100), l.currency, currency, fx);
    if (cents === null) { unconverted.push(l.name); continue; }
    debts.push({ id: l.id, name: l.name, balanceCents: cents });
    if (l.dueDate !== null && cents > 0 && l.dueDate >= nowMs - DAY && l.dueDate - nowMs <= 14 * DAY) {
      attention.push({ id: `due-${l.id}`, urgency: 'due', title: `${l.name} is due ${shortDate(l.dueDate)}`, body: 'Pay it on time to avoid fees.', primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', dueAt: iso(l.dueDate), raisedAt: iso(nowMs) });
    }
  }

  const history = s.wealthSnapshots
    .map((w) => ({ t: w.takenAt, cents: convertCents(Math.round(w.netWorth * 100), w.currency, currency, fx) }))
    .filter((p): p is { t: number; cents: number } => p.cents !== null && p.t <= nowMs + CLOCK_SLACK)
    .sort((a, b) => a.t - b.t);

  const { unconverted: monthUnconverted, ...month } = monthFlow(s, monthOfMs(now.getTime()), currency, fx, now);
  unconverted.push(...monthUnconverted);
  if (unconverted.length > 0) {
    attention.push({ id: 'fx', urgency: 'watch', title: 'Exchange rate unavailable', body: `${unconverted.length} ${unconverted.length === 1 ? 'record is' : 'records are'} in another currency. Totals come back when the rate loads.`, primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt: iso(nowMs) });
  }

  return {
    currency,
    holdings,
    debts,
    unconverted,
    history,
    month,
    attention,
    empty: s.holdings.length === 0 && s.liabilities.length === 0 && s.assets.every((a) => a.balance === 0) && s.transactions.length === 0,
  };
}
