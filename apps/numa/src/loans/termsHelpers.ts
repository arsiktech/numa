import { parseDate } from '@/ask/parse';
import type { CloudLiability } from '@/cloud/api';
import { parseBought } from '@/data/editPlan';
import type { DebtEvent } from '@/data/moneyMap';
import type { LoanTerms, TermEvent } from '@/domain/loanTerms';

export const termsOf = (l: CloudLiability): LoanTerms => ({
  unit: l.owedSymbol || l.currency,
  principal: l.principal ?? null, startedAt: l.startedAt ?? null, dueKind: l.dueKind ?? null,
  interestTerms: l.interestTerms ?? null, interestRate: l.interestRate ?? null, dueDate: l.dueDate ?? null, interestDueDay: l.interestDueDay ?? null,
});

export const termEventOf = (e: DebtEvent): TermEvent => ({
  kind: e.kind, amount: e.amount, principalPart: e.principalPart ?? null, interestPart: e.interestPart ?? null, feePart: e.feePart ?? null, unit: e.unit, occurredAt: e.occurredAt,
});

export const hasTerms = (l: CloudLiability) => !!(l.principal || l.startedAt || l.dueKind || l.interestTerms);

/** Whether a debt is a plain money debt Numa can work interest out for. */
export const inCurrency = (l: CloudLiability) => !l.owedSymbol;

/** The unit a debt is kept in: its coin, or its currency. */
export const unitOf = (l: CloudLiability) => l.owedSymbol || l.currency;

/**
 * A typed date as the calendar day it names, at noon UTC, so the same typed day is always the same
 * moment. "2026-07-01" and "Jul 2026" already are; "20 Sep" and "today" are read in the phone's own
 * time and then written as the same calendar day.
 */
function asCalendarDay(local: number): number {
  const d = new Date(local);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

/**
 * Today on the phone's calendar, as the moment a typed "today" is stored: noon UTC of the phone's own
 * date. Interest and overdue checks compare calendar days, so they take this and not the clock. With
 * the clock, a payment dated today lies after "now" for the hours when the phone's date is ahead of
 * UTC's, and the history seems to disagree with the balance.
 */
export const calendarToday = (now: number) => asCalendarDay(now);

/**
 * What removing a history entry did to the debt, as the server undoes it: only an entry that changed
 * the balance changes it back, and a split payment gives back its principal part only.
 */
export function removedText(e: Pick<DebtEvent, 'kind' | 'applied' | 'amount' | 'principalPart'>): string {
  const moved = e.applied ? (e.principalPart ?? e.amount ?? 0) : 0;
  if (!(moved > 0)) return e.applied && e.principalPart === 0 ? 'Removed. It paid no principal, so the debt is unchanged' : 'Removed';
  if (e.kind === 'repaid' || e.kind === 'received') return e.principalPart != null ? 'Removed, and its principal part is back on the debt' : 'Removed, and the amount is back on the debt';
  return 'Removed, and the amount is taken off the debt again';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A calendar day kept as noon UTC, shown as that day wherever the phone is: "20 Sep", with the year
 * when it is not this year. Read in the phone's own time, noon UTC is the next day east of UTC+12.
 */
export function dayText(at: number, now: number): string {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '—';
  const year = new Date(calendarToday(now)).getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() !== year ? ` ${d.getUTCFullYear()}` : ''}`;
}

/** A past date typed loosely: "2026-07-01", "Jul 2026", "today", "20 Sep". */
export function pastDate(text: string, now: number): number | null {
  const named = parseBought(text, now);
  if (named !== null) return named;
  const loose = parseDate(text, new Date(now), 'past')?.at;
  return loose === undefined ? null : asCalendarDay(loose);
}

/** A date that may be ahead: "2026-12-20" or "20 Dec". */
export function laterDate(text: string, now: number): number | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (iso) {
    const at = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    return new Date(at).getUTCMonth() === Number(iso[2]) - 1 ? at : null;
  }
  const loose = parseDate(text, new Date(now), 'future')?.at;
  return loose === undefined ? null : asCalendarDay(loose);
}
