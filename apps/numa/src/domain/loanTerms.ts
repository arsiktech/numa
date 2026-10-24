/**
 * What a loan with terms owes beyond its principal. Pure, so every figure is tested without a
 * backend. `balance` on the debt stays the principal still owed; interest accrued is worked out
 * here from the terms and the history, and is shown beside it, not added to it.
 *
 * Convention (not confirmed against any signed agreement, so the app shows it): simple interest
 * accrues the yearly rate divided by 12 for each completed month since the start date, on the
 * principal outstanding at the start of that month. Each month is rounded to cents. A part of a
 * month is not accrued until it completes. Month-end dates are kept: 31 Jan plus a month is 28 Feb.
 */

export type LoanTerms = {
  principal: number | null;
  startedAt: number | null;
  dueKind: 'fixed' | 'flexible' | null;
  interestTerms: 'none' | 'simple' | 'manual' | null;
  /** Percent a year. */
  interestRate: number | null;
  dueDate: number | null;
};

export type TermEvent = {
  kind: 'borrowed' | 'repaid' | 'lent' | 'received' | 'note' | 'capitalized';
  amount: number | null;
  principalPart: number | null;
  interestPart: number | null;
  feePart: number | null;
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
      /** Principal the history says is outstanding now. */
      historyPrincipal: number;
      /** False when the history and the saved balance disagree, so the figure may be wrong. */
      reconciles: boolean;
    };

const cents = (n: number) => Math.round(n * 100) / 100;

/** The date `k` whole months after `t`, keeping the day of the month or the last day of a shorter month. */
export function addMonths(t: number, k: number): number {
  const d = new Date(t);
  const month = d.getUTCMonth() + k;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/** How much of a payment lowered the principal: its principal part, or all of it when it was not split. */
export function principalPaid(e: TermEvent): number {
  if (e.kind !== 'repaid') return 0;
  const split = e.principalPart !== null || e.interestPart !== null || e.feePart !== null;
  return split ? (e.principalPart ?? 0) : (e.amount ?? 0);
}

/** Principal outstanding at a moment, from the original amount and the events up to then. */
export function principalAt(terms: LoanTerms, events: TermEvent[], at: number): number {
  let p = terms.principal ?? 0;
  for (const e of events) {
    if (e.occurredAt > at || e.occurredAt < (terms.startedAt ?? 0)) continue;
    if (e.kind === 'borrowed' || e.kind === 'capitalized') p += e.amount ?? 0;
    else if (e.kind === 'repaid') p -= principalPaid(e);
  }
  return cents(p);
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
  let accrued = 0;
  while (addMonths(start, months + 1) <= now) {
    accrued += cents((principalAt(terms, events, addMonths(start, months)) * terms.interestRate) / 100 / 12);
    months += 1;
  }
  const settled = events
    .filter((e) => e.occurredAt >= start)
    .reduce((t, e) => t + (e.kind === 'repaid' ? (e.interestPart ?? 0) : e.kind === 'capitalized' ? (e.amount ?? 0) : 0), 0);
  const historyPrincipal = principalAt(terms, events, now);
  return {
    status: 'ok',
    accrued: cents(accrued),
    settled: cents(settled),
    owed: cents(accrued - settled),
    months,
    nextAccrualAt: addMonths(start, months + 1),
    historyPrincipal,
    reconciles: Math.abs(historyPrincipal - balance) < 0.01,
  };
}

/** What has been paid back, by kind. Payments that were not split count wholly as principal. */
export function paidTotals(events: TermEvent[]): { total: number; principal: number; interest: number; fees: number } {
  const out = { total: 0, principal: 0, interest: 0, fees: 0 };
  for (const e of events) {
    if (e.kind !== 'repaid' || e.amount === null) continue;
    out.total += e.amount;
    out.principal += principalPaid(e);
    out.interest += e.interestPart ?? 0;
    out.fees += e.feePart ?? 0;
  }
  return { total: cents(out.total), principal: cents(out.principal), interest: cents(out.interest), fees: cents(out.fees) };
}

/** Whether a loan with a fixed repayment date is past it with something still owed. */
export const isOverdue = (terms: LoanTerms, balance: number, now: number) => terms.dueKind === 'fixed' && terms.dueDate !== null && terms.dueDate < now && balance > 0;

/** A split typed in as text, checked to add up to the payment in cents. */
export function splitProblem(total: number, parts: { principal: number; interest: number; fees: number }): string | null {
  const values = [parts.principal, parts.interest, parts.fees];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return 'Each part must be zero or more.';
  const sum = Math.round((parts.principal + parts.interest + parts.fees) * 100);
  const want = Math.round(total * 100);
  if (sum === want) return null;
  const gap = Math.abs(sum - want) / 100;
  return sum < want ? `${gap.toFixed(2)} of the payment is not placed yet.` : `The parts are ${gap.toFixed(2)} more than the payment.`;
}
