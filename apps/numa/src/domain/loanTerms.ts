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
  /** Currency or coin the original principal and history must be in. */
  unit?: string | null;
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
  | { status: 'unsupported-history'; reason: string; reconciles: false }
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
 * "5,000", "1,234,567.89" and "5 000" are thousands; "0,5", "0,125" and "1234,50" use a decimal comma.
 * A comma is a thousands separator only between groups of three digits after a first group of one to
 * three that does not start with 0. Returns NaN when the text is not a plain amount.
 */
export function parseAmount(text: string): number {
  const compact = text.trim().replace(/\s/g, '');
  const thousands = /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(compact);
  const clean = thousands ? compact.replace(/,/g, '') : compact.replace(',', '.');
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
 * day. Events count in date order, and the principal never goes below zero at any step: an
 * overpayment brings it to zero, and money borrowed later starts from there.
 */
export function principalAt(terms: LoanTerms, events: TermEvent[], at: number): number | null {
  if (historyUnitProblem(terms, events, at)) return null;
  return principalFromHistory(terms, events, at);
}

/** Units are evidence, not a conversion rule. An old unlabelled payment cannot be assumed to be this currency. */
function historyUnitProblem(terms: LoanTerms, events: TermEvent[], at: number): string | null {
  const startDay = dayOf(terms.startedAt ?? 0);
  const unsupported = events.some((e) =>
    (e.kind === 'borrowed' || e.kind === 'repaid' || e.kind === 'capitalized') &&
    dayOf(e.occurredAt) >= startDay && dayOf(e.occurredAt) <= dayOf(at) &&
    (!terms.unit || !e.unit || e.unit.toUpperCase() !== terms.unit.toUpperCase()));
  return unsupported ? 'The loan history contains amounts in another or unknown unit. Check the history units before calculating interest.' : null;
}

/** Called only after the relevant history units have been checked. */
function principalFromHistory(terms: LoanTerms, events: TermEvent[], at: number): number {
  let p = terms.principal ?? 0;
  const startDay = dayOf(terms.startedAt ?? 0);
  const inOrder = events.filter((e) => dayOf(e.occurredAt) <= dayOf(at) && dayOf(e.occurredAt) >= startDay).sort((x, y) => x.occurredAt - y.occurredAt);
  for (const e of inOrder) {
    if (e.kind === 'borrowed' || e.kind === 'capitalized') p += e.amount ?? 0;
    else if (e.kind === 'repaid') p = Math.max(0, p - principalPaid(e));
  }
  return Math.max(0, cents(p));
}

/**
 * One month's interest before rounding to cents. The product is rounded to nine decimals first, so an
 * exact half cent such as 178.185 is not read as 178.18499… by way of binary floating point.
 */
const monthRaw = (principal: number, rate: number) => roundDecimals((principal * rate) / 1200, 9);
/** One month's interest, rounded half up to cents. */
export const monthInterest = (principal: number, rate: number) => cents(monthRaw(principal, rate));

export function accrual(terms: LoanTerms, events: TermEvent[], balance: number, now: number): Accrual {
  if (terms.interestTerms === 'manual') return { status: 'manual' };
  if (terms.interestTerms !== 'simple') return { status: 'none' };
  if (!(terms.interestRate && terms.interestRate > 0)) return { status: 'incomplete', missing: 'a yearly rate' };
  if (terms.principal === null || terms.startedAt === null) return { status: 'incomplete', missing: 'the original amount and the start date' };
  const unitProblem = historyUnitProblem(terms, events, now);
  if (unitProblem) return { status: 'unsupported-history', reason: unitProblem, reconciles: false };
  const start = terms.startedAt;
  // A start date that far back is a typing mistake, and would loop for centuries of months.
  if (now - start > 50 * 365 * 86_400_000) return { status: 'incomplete', missing: 'a start date within the last 50 years' };
  let months = 0;
  const periods: { endAt: number; amount: number }[] = [];
  while (addMonths(start, months + 1) <= now) {
    periods.push({ endAt: addMonths(start, months + 1), amount: monthInterest(principalFromHistory(terms, events, addMonths(start, months)), terms.interestRate) });
    months += 1;
  }
  const accrued = periods.reduce((t, p) => t + p.amount, 0);
  const settled = events
    .filter((e) => dayOf(e.occurredAt) >= dayOf(start) && dayOf(e.occurredAt) <= dayOf(now))
    .reduce((t, e) => t + (e.kind === 'repaid' ? (e.interestPart ?? 0) : e.kind === 'capitalized' ? (e.amount ?? 0) : 0), 0);
  const historyPrincipal = principalFromHistory(terms, events, now);
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
  const running = span > 0 ? cents(monthRaw(principalFromHistory(terms, events, runningStart), terms.interestRate) * (gone / span)) : 0;

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

/** Interest owed on a day from the history up to it, or null when it cannot be worked out. */
function owedOn(terms: LoanTerms, events: TermEvent[], at: number): number | null {
  const a = accrual(terms, events.filter((e) => dayOf(e.occurredAt) <= dayOf(at)), 0, at);
  return a.status === 'ok' ? Math.max(0, a.owed) : null;
}

/**
 * Why interest of `amount` cannot be added to the principal on the day `at`, or null when it can.
 * The server applies the same rule (convex/lib/loanAccrual.ts). It can be no more than was owed on
 * that day, from the history up to it. Once added, today's total owed must not go below zero:
 * interest paid after that day was already settled, so it is not added again. A back-dated add raises
 * the principal for the months after it, and the interest they accrue on it counts today.
 */
export function interestAddProblem(terms: LoanTerms, events: TermEvent[], amount: number, at: number, today: number): string | null {
  const unitProblem = historyUnitProblem(terms, events, today);
  if (unitProblem) return unitProblem;
  const then = owedOn(terms, events, at);
  const after = accrual(terms, [...events, { kind: 'capitalized', amount, principalPart: null, interestPart: null, feePart: null, unit: terms.unit, occurredAt: at }], 0, today);
  if (then === null || after.status !== 'ok') return 'There is no unpaid interest to add yet.';
  if (!(then > 0.005)) return 'There was no unpaid interest to add on that date.';
  if (amount > then + 0.005) return `That is more than the interest owed on that date, ${then.toFixed(2)}.`;
  if (after.owed < -0.005) return 'That interest has since been paid or added, so adding it again would count it twice.';
  return null;
}

/** The most interest that can be added on the day `at`. Null is unknown, zero is a known absence. */
export function interestAddable(terms: LoanTerms, events: TermEvent[], at: number, today: number): number | null {
  if (accrual(terms, events, 0, today).status !== 'ok') return null;
  const then = owedOn(terms, events, at);
  if (then === null) return null;
  if (!(then > 0.005)) return 0;
  if (interestAddProblem(terms, events, then, at, today) === null) return then;
  // Interest settled since that day is not added again: today's total owed is the most that is left.
  const now = owedOn(terms, events, today);
  if (now === null) return null;
  return Math.max(0, Math.min(then, now));
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
export const isOverdue = (terms: LoanTerms, balance: number, now: number) => terms.dueKind === 'fixed' && terms.dueDate !== null && dayOf(terms.dueDate) < dayOf(now) && balance > 0;

/** A split typed in as text, checked to add up to the payment: in cents for money, in eight decimals for a coin. */
export function splitProblem(total: number, parts: { principal: number; interest: number; fees: number }, decimals = 2): string | null {
  const values = [parts.principal, parts.interest, parts.fees];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return 'Each part must be zero or more.';
  const scale = 10 ** decimals;
  // Rounded half up as written, the way the server rounds, so 1.005 is 1.01 here too.
  const units = (n: number) => Math.round(roundDecimals(n, decimals) * scale);
  const sum = units(parts.principal) + units(parts.interest) + units(parts.fees);
  const want = units(total);
  if (sum === want) return null;
  const gap = (Math.abs(sum - want) / scale).toFixed(Math.min(decimals, 8));
  return sum < want ? `${gap} of the payment is not placed yet.` : `The parts are ${gap} more than the payment.`;
}
