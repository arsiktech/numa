import type { CardDetails, CloudTransaction } from '@/cloud/api';
import { convertCents, type FxRate } from '@/data/fx';
import type { Currency } from '@/domain/types';

/**
 * A card purchase seen whole: when it happened, what the card charged and at what rate, and the
 * cashback it earned. Anything the statement didn't say stays out rather than showing as zero.
 */

/** Any currency, the way a person reads it: "$171.68", "₴1,420.00", "12.50 AED" when unknown. */
export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const whenOf = (ms: number) =>
  `${new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}, ${timeOf(ms)}`;

const amountOf = (t: CloudTransaction) => Math.abs(t.amountMinor) / 100;

/** "1 EUR = 1.1359 USD" when the card charged another currency than the amount is in. */
export function rateText(t: CloudTransaction): string | null {
  const b = t.card?.billed;
  if (!b || b.currency === t.currency || !(amountOf(t) > 0) || !(b.amount > 0)) return null;
  return `1 ${t.currency} = ${(b.amount / amountOf(t)).toFixed(4)} ${b.currency}`;
}

/** Cashback as a share of what was paid, when both are in the same currency. */
export function cashbackShare(t: CloudTransaction): number | null {
  const cb = t.card?.cashback;
  if (!cb) return null;
  const base = t.card?.billed && t.card.billed.currency === cb.currency ? t.card.billed.amount : t.currency === cb.currency ? amountOf(t) : null;
  return base && base > 0 ? cb.amount / base : null;
}

/** What a list row adds under the name and under the amount. */
export function rowDetails(t: CloudTransaction): { meta: string[]; extra: string | null } {
  const c = t.card;
  const meta = [timeOf(t.occurredAt)];
  if (c?.last4) meta.push(`••${c.last4}`);
  if (c?.original && c.original.currency !== t.currency) meta.push(formatAmount(c.original.amount, c.original.currency));
  const extra = c?.cashback && c.cashback.amount > 0 ? `+${formatAmount(c.cashback.amount, c.cashback.currency)} back` : null;
  return { meta, extra };
}

/** A note that only repeats the card details (as imported statements write them) adds nothing on screen. */
export const noteRepeatsCard = (t: CloudTransaction) =>
  !!t.card && !!t.notes && t.notes.toLowerCase().startsWith(`${t.card.issuer.toLowerCase()} card`);

export type MonthCashback = { cents: number; count: number; share: number | null; unknown: number };

/** Cashback earned on a month's purchases, in the space's currency; null when there was none. */
export function monthCashback(txs: CloudTransaction[], currency: Currency, fx: FxRate | null): MonthCashback | null {
  let cents = 0, count = 0, unknown = 0, back = 0, paid = 0;
  for (const t of txs) {
    const cb = t.card?.cashback;
    if (!cb || !(cb.amount > 0)) continue;
    count += 1;
    const c = cb.currency === 'USD' || cb.currency === 'EUR' ? convertCents(Math.round(cb.amount * 100), cb.currency, currency, fx) : null;
    if (c === null) unknown += 1; else cents += c;
    const share = cashbackShare(t);
    if (share !== null) { back += cb.amount; paid += cb.amount / share; }
  }
  if (!count) return null;
  return { cents, count, share: paid > 0 ? back / paid : null, unknown };
}

export type { CardDetails };
