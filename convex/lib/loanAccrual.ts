import { roundDecimals } from "./loanTerms";

/**
 * Interest owed on a simple-interest loan, worked out the way the app works it out
 * (apps/numa/src/domain/loanTerms.ts), so the server can refuse to add more interest than is owed.
 * The two copies must agree: convex/lib/loanAccrual.test.ts runs both over the same histories.
 *
 * Convention: the yearly rate divided by 12 for each completed month since the start date, on the
 * principal outstanding at the start of that month, rounded half up to cents. Dates are compared by
 * calendar day (UTC). Interest paid in cash or added to the principal settles the oldest months.
 */

const DAY = 86_400_000;
const cents = (n: number) => roundDecimals(n, 2);
const dayOf = (t: number) => Math.floor(t / DAY);

export type AccrualTerms = { principal: number; startedAt: number; interestRate: number };
export type AccrualEvent = {
  kind: "borrowed" | "repaid" | "lent" | "received" | "note" | "capitalized";
  amount?: number | null;
  principalPart?: number | null;
  interestPart?: number | null;
  feePart?: number | null;
  occurredAt: number;
};

/** The date `k` whole months after `t`, keeping the day of the month or the last day of a shorter month. */
function addMonths(t: number, k: number): number {
  const d = new Date(t);
  const month = d.getUTCMonth() + k;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/** How much of a payment lowered the principal: its principal part, or all of it when it was not split. */
function principalPaid(e: AccrualEvent): number {
  if (e.kind !== "repaid") return 0;
  const split = (e.principalPart ?? null) !== null || (e.interestPart ?? null) !== null || (e.feePart ?? null) !== null;
  return split ? (e.principalPart ?? 0) : (e.amount ?? 0);
}

/** Principal outstanding at the end of a day. It never goes below zero. */
function principalAt(terms: AccrualTerms, events: AccrualEvent[], at: number): number {
  let p = terms.principal;
  const startDay = dayOf(terms.startedAt);
  for (const e of events) {
    if (dayOf(e.occurredAt) > dayOf(at) || dayOf(e.occurredAt) < startDay) continue;
    if (e.kind === "borrowed" || e.kind === "capitalized") p += e.amount ?? 0;
    else if (e.kind === "repaid") p -= principalPaid(e);
  }
  return Math.max(0, cents(p));
}

/**
 * Interest accrued for the completed months and the part of it already settled. Null when the start
 * date is more than 50 years back, which is a typing mistake and not a loan.
 */
export function interestOwed(terms: AccrualTerms, events: AccrualEvent[], now: number): { accrued: number; settled: number; owed: number } | null {
  if (now - terms.startedAt > 50 * 365 * DAY) return null;
  let accrued = 0;
  for (let months = 0; addMonths(terms.startedAt, months + 1) <= now; months += 1) {
    accrued += cents((principalAt(terms, events, addMonths(terms.startedAt, months)) * terms.interestRate) / 100 / 12);
  }
  const settled = events
    .filter((e) => dayOf(e.occurredAt) >= dayOf(terms.startedAt))
    .reduce((t, e) => t + (e.kind === "repaid" ? (e.interestPart ?? 0) : e.kind === "capitalized" ? (e.amount ?? 0) : 0), 0);
  return { accrued: cents(accrued), settled: cents(settled), owed: cents(accrued - settled) };
}
