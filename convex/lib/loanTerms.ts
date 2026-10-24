import { ConvexError } from "convex/values";

/**
 * Loan terms and payment splits. Pure checks that the mutations share, so the rules are tested
 * without a database. Accrued interest itself is worked out in the app from these terms; the
 * server only keeps the terms and the split of each payment honest.
 */

const DAY = 86_400_000;
const MAX = 1e12;
/** A repayment date further ahead than this is a typing mistake, and too far out for a calendar to show. */
const LATEST_DUE = 100 * 365 * DAY;
const bad = (message: string) => new ConvexError({ code: "INVALID_INPUT", message });

/** Money in a currency keeps cents; a debt owed in a coin keeps eight decimals. */
export const isCurrency = (unit: string) => unit === "EUR" || unit === "USD";
/**
 * Rounds half up on the decimal digits as written, so 12.345 is 12.35 and not 12.34 by way of
 * binary floating point. Very small or very large numbers, written with an exponent, round plainly.
 */
export function roundDecimals(n: number, places: number): number {
  if (!Number.isFinite(n)) return n;
  const text = String(n);
  if (text.includes("e")) {
    // A number this large has no decimals left to round.
    if (Math.abs(n) >= 1) return n;
    const factor = 10 ** places;
    return Math.round(n * factor) / factor;
  }
  return Number(`${Math.round(Number(`${text}e${places}`))}e-${places}`);
}
/** An amount in its unit: cents for a currency, eight decimals for a coin. */
export const roundAmount = (n: number, unit: string) => roundDecimals(n, isCurrency(unit) ? 2 : 8);
const roundTo = roundAmount;
/** Half of the smallest step of the unit: two amounts closer than this are the same amount. */
const halfStep = (unit: string) => (isCurrency(unit) ? 0.005 : 5e-9);

export type Split = { principalPart: number; interestPart: number; feePart: number };

/**
 * How a payment divides into principal, interest and fees. Returns null when no part was given,
 * which means the whole amount is principal, as before. Every part is at least zero and the three
 * add up to the amount, so a split can never create or lose money.
 */
export function cleanSplit(amount: number, unit: string, parts: { principalPart?: number; interestPart?: number; feePart?: number }): Split | null {
  const given = [parts.principalPart, parts.interestPart, parts.feePart];
  if (given.every((p) => p === undefined)) return null;
  const [principalPart, interestPart, feePart] = given.map((p) => {
    const value = p ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > MAX) throw bad("Each part of a payment must be zero or more");
    return roundTo(value, unit);
  });
  const total = roundTo(principalPart + interestPart + feePart, unit);
  // Both sides are already rounded to the unit, so one step apart (a cent, or 1e-8 of a coin) is a real difference.
  if (Math.abs(total - amount) > halfStep(unit)) throw bad("Principal, interest and fees must add up to the payment");
  return { principalPart, interestPart, feePart };
}

export type TermsInput = {
  principal?: number | null;
  startedAt?: number | null;
  dueKind?: "fixed" | "flexible" | null;
  interestTerms?: "none" | "simple" | "manual" | null;
  interestRate?: number | null;
  dueDate?: number | null;
  interestDueDay?: number | null;
};
export type TermsDoc = {
  principal?: number;
  startedAt?: number;
  dueKind?: "fixed" | "flexible";
  interestTerms?: "none" | "simple" | "manual";
  interestRate?: number;
  dueDate?: number;
  interestDueDay?: number;
  currency: string;
  owedSymbol?: string;
  kind?: string;
};

type Field = "principal" | "startedAt" | "dueKind" | "interestTerms" | "interestRate" | "dueDate" | "interestDueDay";
/** What to patch: a field set to undefined is removed from the document. */
export type TermsPatch = { principal?: number; startedAt?: number; dueKind?: "fixed" | "flexible"; interestTerms?: "none" | "simple" | "manual"; interestRate?: number; dueDate?: number; interestDueDay?: number };

/**
 * The patch that saves a debt's loan terms, or an error saying what is missing. A field left out
 * keeps what is saved; null clears it. Terms Numa cannot calculate are kept as "manual", never
 * guessed. Simple interest needs a rate, an original amount and a start date.
 */
export function termsPatch(input: TermsInput, existing: TermsDoc, now: number): TermsPatch {
  const out: Record<string, unknown> = {};
  const next: TermsDoc = { ...existing };
  const set = (key: Field, value: unknown) => {
    out[key] = value === null ? undefined : value;
    (next as Record<string, unknown>)[key] = value === null ? undefined : value;
  };

  if (input.principal !== undefined) {
    if (input.principal !== null && (!Number.isFinite(input.principal) || !(input.principal > 0) || input.principal > MAX)) throw bad("The original amount must be more than zero");
    set("principal", input.principal === null ? null : roundTo(input.principal, existing.currency));
  }
  if (input.startedAt !== undefined) {
    if (input.startedAt !== null && (!Number.isFinite(input.startedAt) || input.startedAt < 0 || input.startedAt > now + DAY)) throw bad("The start date can’t be in the future");
    set("startedAt", input.startedAt);
  }
  if (input.interestTerms !== undefined) set("interestTerms", input.interestTerms);
  if (input.interestRate !== undefined) {
    if (input.interestRate !== null && (!Number.isFinite(input.interestRate) || input.interestRate < 0 || input.interestRate > 100)) throw bad("The yearly rate must be between 0 and 100 percent");
    set("interestRate", input.interestRate);
  }
  if (input.interestDueDay !== undefined) {
    if (input.interestDueDay !== null && (!Number.isInteger(input.interestDueDay) || input.interestDueDay < 1 || input.interestDueDay > 28)) throw bad("The due day must be a whole number from 1 to 28");
    set("interestDueDay", input.interestDueDay);
  }
  if (input.dueKind !== undefined) set("dueKind", input.dueKind);
  if (input.dueDate !== undefined) {
    if (input.dueDate !== null && !validDueDate(input.dueDate, now)) throw bad("The repayment date isn’t a valid date");
    set("dueDate", input.dueDate);
  } else if (input.dueKind === null) {
    // "Not set" has no repayment date either, so it never leaves a date behind to show as due or raise an alert.
    set("dueDate", null);
  }

  // Interest-free has no rate; a flexible loan has no repayment date.
  if (next.interestTerms === "none" && next.interestRate !== undefined) set("interestRate", null);
  if (next.dueKind === "flexible" && next.dueDate !== undefined) set("dueDate", null);
  // A due day belongs to simple interest. Leaving simple interest takes it away; asking for one without it is refused.
  if (next.interestTerms !== "simple" && next.interestDueDay !== undefined) {
    if (input.interestDueDay !== undefined && input.interestDueDay !== null) throw bad("A due day needs simple interest");
    set("interestDueDay", null);
  }

  const problem = termsProblem(next);
  if (problem) throw bad(problem);
  return out as TermsPatch;
}

/** Whether a repayment date is a real date, not before 1970 and not more than 100 years ahead. */
export const validDueDate = (at: number, now: number) => Number.isFinite(at) && at >= 0 && at <= now + LATEST_DUE;

/**
 * What is wrong with a debt's terms as they would be saved, or null. Every write that can touch the
 * terms checks this, so no path (the terms form, the item editor, Ask, an agent or the web app)
 * leaves a loan whose interest or repayment date cannot be worked out.
 */
export function termsProblem(next: TermsDoc): string | null {
  if (next.dueKind === "fixed" && next.dueDate === undefined) return "A fixed loan needs its repayment date";
  if (next.dueKind === "fixed" && next.startedAt !== undefined && next.dueDate! < next.startedAt) return "The repayment date can’t be before the start date";
  if (next.interestTerms === "simple") {
    // Cards and mortgages usually charge compound or instalment interest, which Numa does not calculate.
    if (next.kind === "mortgage" || next.kind === "credit_card") return "Mortgages and cards usually charge compound or instalment interest. Mark its interest as manual";
    if (next.owedSymbol) return "Simple interest isn’t calculated for a debt owed in a coin yet. Mark its terms as manual";
    if (!(next.interestRate! > 0)) return "Simple interest needs a yearly rate above zero";
    if (next.principal === undefined || next.startedAt === undefined) return "Simple interest needs the original amount and the start date";
  }
  if (next.owedSymbol && next.principal !== undefined) return "The original amount isn’t kept for a debt owed in a coin yet";
  return null;
}

/**
 * Refuses a debt write that would break its loan terms: an update from the item editor, Ask, an agent
 * or the web app. An original amount is in the debt's currency, so the currency cannot change under it.
 */
export function assertTermsAfterPatch(existing: TermsDoc, patch: { [key: string]: unknown }) {
  const next: { [key: string]: unknown } = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  if (existing.principal !== undefined && next.currency !== existing.currency) throw bad("This debt has an original amount in its currency. Clear its loan terms before changing the currency");
  const problem = termsProblem(next as TermsDoc);
  if (problem) throw bad(problem);
}
