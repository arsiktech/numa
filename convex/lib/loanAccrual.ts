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

export type AccrualTerms = { principal: number; startedAt: number; interestRate: number; unit?: string | null };
export type AccrualEvent = {
  kind: "borrowed" | "repaid" | "lent" | "received" | "note" | "capitalized";
  amount?: number | null;
  principalPart?: number | null;
  interestPart?: number | null;
  feePart?: number | null;
  unit?: string | null;
  occurredAt: number;
};

/** Keep this admission rule aligned with the app. Never silently convert or relabel legacy history. */
function historyUnitProblem(terms: AccrualTerms, events: AccrualEvent[], at: number): string | null {
  const unsupported = events.some((e) =>
    (e.kind === "borrowed" || e.kind === "repaid" || e.kind === "capitalized") &&
    dayOf(e.occurredAt) >= dayOf(terms.startedAt) && dayOf(e.occurredAt) <= dayOf(at) &&
    (!terms.unit || !e.unit || e.unit.toUpperCase() !== terms.unit.toUpperCase()));
  return unsupported ? "The loan history contains amounts in another or unknown unit. Check the history units before calculating interest." : null;
}

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

/**
 * Principal outstanding at the end of a day. Events count in date order, and the principal never goes
 * below zero at any step: an overpayment brings it to zero, and money borrowed later starts from there.
 */
function principalAt(terms: AccrualTerms, events: AccrualEvent[], at: number): number {
  let p = terms.principal;
  const startDay = dayOf(terms.startedAt);
  const inOrder = events.filter((e) => dayOf(e.occurredAt) <= dayOf(at) && dayOf(e.occurredAt) >= startDay).sort((x, y) => x.occurredAt - y.occurredAt);
  for (const e of inOrder) {
    if (e.kind === "borrowed" || e.kind === "capitalized") p += e.amount ?? 0;
    else if (e.kind === "repaid") p = Math.max(0, p - principalPaid(e));
  }
  return Math.max(0, cents(p));
}

/**
 * One month's interest, rounded half up to cents. The product is first rounded to nine decimals, so
 * an exact half cent such as 178.185 is not read as 178.18499… by way of binary floating point.
 */
export const monthInterest = (principal: number, rate: number) => cents(roundDecimals((principal * rate) / 1200, 9));

/**
 * Interest accrued for the completed months and the part of it already settled. Null when the start
 * date is more than 50 years back, which is a typing mistake and not a loan.
 */
export function interestOwed(terms: AccrualTerms, events: AccrualEvent[], now: number): { accrued: number; settled: number; owed: number } | null {
  if (now - terms.startedAt > 50 * 365 * DAY || historyUnitProblem(terms, events, now)) return null;
  let accrued = 0;
  for (let months = 0; addMonths(terms.startedAt, months + 1) <= now; months += 1) {
    accrued += monthInterest(principalAt(terms, events, addMonths(terms.startedAt, months)), terms.interestRate);
  }
  const settled = events
    .filter((e) => dayOf(e.occurredAt) >= dayOf(terms.startedAt) && dayOf(e.occurredAt) <= dayOf(now))
    .reduce((t, e) => t + (e.kind === "repaid" ? (e.interestPart ?? 0) : e.kind === "capitalized" ? (e.amount ?? 0) : 0), 0);
  return { accrued: cents(accrued), settled: cents(settled), owed: cents(accrued - settled) };
}

/**
 * Why interest of `amount` cannot be added to the principal on the day `at`, or null when it can.
 * It can be no more than was owed on that day, from the history up to it. And once added, today's
 * total owed must not go below zero: interest paid after that day was already settled, so it is not
 * added again. Adding it back-dated raises the principal for the months after it, and the interest
 * those months accrue on it is counted in today's total.
 */
export function interestAddProblem(terms: AccrualTerms, events: AccrualEvent[], amount: number, at: number, now: number): string | null {
  const unitProblem = historyUnitProblem(terms, events, now);
  if (unitProblem) return unitProblem;
  const then = interestOwed(terms, events.filter((e) => dayOf(e.occurredAt) <= dayOf(at)), at);
  const after = interestOwed(terms, [...events, { kind: "capitalized", amount, unit: terms.unit, occurredAt: at }], now);
  if (!then || !after) return "There is no unpaid interest to add yet";
  const owedThen = Math.max(0, then.owed);
  if (!(owedThen > 0.005)) return "There was no unpaid interest to add on that date";
  if (amount > owedThen + 0.005) return `That is more than the interest owed on that date, ${owedThen.toFixed(2)}`;
  if (after.owed < -0.005) return "That interest has since been paid or added, so adding it again would count it twice";
  return null;
}
