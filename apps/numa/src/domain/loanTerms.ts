/**
 * What a loan with terms owes beyond its principal. Pure, so every figure is tested without a
 * backend. `balance` on the debt stays the principal still owed; interest accrued is worked out
 * here from the terms and the history, and is shown beside it, not added to it.
 *
 * Convention (not confirmed against any signed agreement, so the app shows it): simple interest
 * accrues the yearly rate divided by 12 for each completed month since the start date, on the
 * principal outstanding at the start of that month. Each month is rounded half up to cents. A part
 * of a month is not accrued until it completes. Month-end dates are kept: 31 Jan plus a month is
 * 28 Feb.
 *
 * Dates are compared by calendar day (UTC), never by the minute. A payment on the day a month
 * starts counts as paid before that month, however its time of day was typed. Anything dated before
 * the start day is left out.
 */

export type LoanTerms = {
  principal: number | null;
  startedAt: number | null;
  dueKind: 'fixed' | 'flexible' | null;
  interestTerms: 'none' | 'simple' | 'manual' | null;
  /** Percent a year. */
  interestRate: number | null;
  dueDate: number | null;
  /** The day of the month (1 to 28) the interest is due by. It says when to pay, and changes no figure. */
  interestDueDay?: number | null;
};

export type TermEvent = {
  kind: 'borrowed' | 'repaid' | 'lent' | 'received' | 'note' | 'capitalized';
  amount: number | null;
  principalPart: number | null;
  interestPart: number | null;
  feePart: number | null;
  /** The currency or coin the event is in. Null when it is not known. */
  unit?: string | null;
  occurredAt: number;
};

export type Accrual =
  | { status: 'none' }
  | { status: 'manual' }
  | { status: 'incomplete'; missing: string }
  | {
      status: 'ok';
      /** Interest worked out for the completed months. */
      accrued: number;
      /** Interest paid in cash, plus interest added to the principal. */
      settled: number;
      /** Accrued minus settled. Negative means interest was paid ahead. */
      owed: number;
      months: number;
      /** When the next month completes and more interest accrues. */
      nextAccrualAt: number;
      /**
       * With a due day: when the oldest interest still owed was due, or when the next is due if none is
       * owed. Null without a due day.
       */
      dueAt: number | null;
      /** True when interest is owed and its due day has passed. */
      overdue: boolean;
      /** An estimate of the interest running up this month. It is not owed until the month completes. */
      running: number;
      /** Principal the history says is outstanding now. */
      historyPrincipal: number;
      /** False when the history and the saved balance disagree, so the figure may be wrong. */
      reconciles: boolean;
    };

/** Rounds half up on the digits as written, so 12.345 is 12.35 and not 12.34 by way of binary floating point. */
export function roundDecimals(n: number, places: number): number {
  if (!Number.isFinite(n)) return n;
  const text = String(n);
  if (text.includes('e')) {
    if (Math.abs(n) >= 1) return n;
    const factor = 10 ** places;
    return Math.round(n * factor) / factor;
  }
  return Number(`${Math.round(Number(`${text}e${places}`))}e-${places}`);
}
const cents = (n: number) => roundDecimals(n, 2);

const DAY = 86_400_000;
/** The calendar day (UTC) of a moment, as a whole number. */
export const dayOf = (t: number) => Math.floor(t / DAY);

/**
 * "5,000" and "5 000" are thousands; "0,5" and "1234,50" use a decimal comma. Returns NaN when
 * the text is not a plain amount.
 */
export function parseAmount(text: string): number {
  const clean = text.trim().replace(/\s/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return /^\d*\.?\d+$|^\d+\.$/.test(clean) ? Number(clean) : NaN;
}

/** The date `k` whole months after `t`, keeping the day of the month or the last day of a shorter month. */
export function addMonths(t: number, k: number): number {
  const d = new Date(t);
  const month = d.getUTCMonth() + k;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/**
 * The due date for interest that completed on `endAt`: the next time the due day comes round, on or
 * after that day, at noon UTC. A due day of 10 and a month completing on 16 Sep is due 10 Oct.
 */
export function dueDateFor(endAt: number, day: number): number {
  const d = new Date(endAt);
  const month = d.getUTCDate() > day ? d.getUTCMonth() + 1 : d.getUTCMonth();
  return Date.UTC(d.getUTCFullYear(), month, day, 12);
}

/** How much of a payment lowered the principal: its principal part, or all of it when it was not split. */
export function principalPaid(e: TermEvent): number {
  if (e.kind !== 'repaid') return 0;
  const split = e.principalPart !== null || e.interestPart !== null || e.feePart !== null;
  return split ? (e.principalPart ?? 0) : (e.amount ?? 0);
}

/**
 * Principal outstanding on a day, from the original amount and the events up to the end of that
 * day. It never goes below zero: an overpayment in the history does not make interest negative.
 */
export function principalAt(terms: LoanTerms, events: TermEvent[], at: number): number {
  let p = terms.principal ?? 0;
  const startDay = dayOf(terms.startedAt ?? 0);
  for (const e of events) {
    if (dayOf(e.occurredAt) > dayOf(at) || dayOf(e.occurredAt) < startDay) continue;
    if (e.kind === 'borrowed' || e.kind === 'capitalized') p += e.amount ?? 0;
    else if (e.kind === 'repaid') p -= principalPaid(e);
  }
  return Math.max(0, cents(p));
}

export function accrual(terms: LoanTerms, events: TermEvent[], balance: number, now: number): Accrual {
  if (terms.interestTerms === 'manual') return { status: 'manual' };
  if (terms.interestTerms !== 'simple') return { status: 'none' };
  if (!(terms.interestRate && terms.interestRate > 0)) return { status: 'incomplete', missing: 'a yearly rate' };
  if (terms.principal === null || terms.startedAt === null) return { status: 'incomplete', missing: 'the original amount and the start date' };
  const start = terms.startedAt;
  // A start date that far back is a typing mistake, and would loop for centuries of months.
  if (now - start > 50 * 365 * 86_400_000) return { status: 'incomplete', missing: 'a start date within the last 50 years' };
  let months = 0;
  const periods: { endAt: number; amount: number }[] = [];
  while (addMonths(start, months + 1) <= now) {
    periods.push({ endAt: addMonths(start, months + 1), amount: cents((principalAt(terms, events, addMonths(start, months)) * terms.interestRate) / 100 / 12) });
    months += 1;
  }
  const accrued = periods.reduce((t, p) => t + p.amount, 0);
  const settled = events
    .filter((e) => dayOf(e.occurredAt) >= dayOf(start))
    .reduce((t, e) => t + (e.kind === 'repaid' ? (e.interestPart ?? 0) : e.kind === 'capitalized' ? (e.amount ?? 0) : 0), 0);
  const historyPrincipal = principalAt(terms, events, now);
  const nextAccrualAt = addMonths(start, months + 1);

  // What was settled covers the oldest months first. The first month left short is the one now due.
  let left = settled;
  let oldestUnpaidEnd: number | null = null;
  for (const period of periods) {
    const covered = Math.min(left, period.amount);
    left = cents(left - covered);
    if (cents(period.amount - covered) > 0.005) { oldestUnpaidEnd = period.endAt; break; }
  }
  const day = terms.interestDueDay ?? null;
  const dueAt = day === null ? null : dueDateFor(oldestUnpaidEnd ?? nextAccrualAt, day);
  const overdue = day !== null && oldestUnpaidEnd !== null && dayOf(dueDateFor(oldestUnpaidEnd, day)) < dayOf(now);

  // The running month, from the principal at its start, by the days gone: an estimate, never owed yet.
  const runningStart = addMonths(start, months);
  const span = dayOf(nextAccrualAt) - dayOf(runningStart);
  const gone = Math.max(0, dayOf(now) - dayOf(runningStart));
  const running = span > 0 ? cents(((principalAt(terms, events, runningStart) * terms.interestRate) / 100 / 12) * (gone / span)) : 0;

  return {
    status: 'ok',
    accrued: cents(accrued),
    settled: cents(settled),
    owed: cents(accrued - settled),
    months,
    nextAccrualAt,
    dueAt,
    overdue,
    running,
    historyPrincipal,
    // Half a cent: a whole cent apart is a real difference, not rounding.
    reconciles: Math.abs(historyPrincipal - balance) < 0.005,
  };
}

/** What has been paid back, by kind. Payments that were not split count wholly as principal. */
export function paidTotals(events: TermEvent[], unit?: string): { total: number; principal: number; interest: number; fees: number } {
  const out = { total: 0, principal: 0, interest: 0, fees: 0 };
  for (const e of events) {
    if (e.kind !== 'repaid' || e.amount === null) continue;
    // Amounts in another currency or coin are not added to this debt's totals.
    if (unit !== undefined && e.unit !== undefined && e.unit !== null && e.unit.toUpperCase() !== unit.toUpperCase()) continue;
    out.total += e.amount;
    out.principal += principalPaid(e);
    out.interest += e.interestPart ?? 0;
    out.fees += e.feePart ?? 0;
  }
  return { total: cents(out.total), principal: cents(out.principal), interest: cents(out.interest), fees: cents(out.fees) };
}

/** Whether a loan with a fixed repayment date is past it with something still owed. */
export const isOverdue = (terms: LoanTerms, balance: number, now: number) => terms.dueKind === 'fixed' && terms.dueDate !== null && terms.dueDate < now && balance > 0;

/** A split typed in as text, checked to add up to the payment: in cents for money, in eight decimals for a coin. */
export function splitProblem(total: number, parts: { principal: number; interest: number; fees: number }, decimals = 2): string | null {
  const values = [parts.principal, parts.interest, parts.fees];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return 'Each part must be zero or more.';
  const scale = 10 ** decimals;
  const sum = Math.round(parts.principal * scale) + Math.round(parts.interest * scale) + Math.round(parts.fees * scale);
  const want = Math.round(total * scale);
  if (sum === want) return null;
  const gap = (Math.abs(sum - want) / scale).toFixed(Math.min(decimals, 8));
  return sum < want ? `${gap} of the payment is not placed yet.` : `The parts are ${gap} more than the payment.`;
}
