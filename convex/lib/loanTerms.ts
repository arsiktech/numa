import { ConvexError } from "convex/values";

/**
 * Loan terms and payment splits. Pure checks that the mutations share, so the rules are tested
 * without a database. Accrued interest itself is worked out in the app from these terms; the
 * server only keeps the terms and the split of each payment honest.
 */

const DAY = 86_400_000;
const MAX = 1e12;
const bad = (message: string) => new ConvexError({ code: "INVALID_INPUT", message });

/** Money in a currency keeps cents; a debt owed in a coin keeps eight decimals. */
export const isCurrency = (unit: string) => unit === "EUR" || unit === "USD";
const roundTo = (n: number, unit: string) => {
  const f = isCurrency(unit) ? 100 : 1e8;
  return Math.round(n * f) / f;
};
const tolerance = (unit: string) => (isCurrency(unit) ? 0.005 : 1e-8);

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
  if (Math.abs(total - amount) > tolerance(unit)) throw bad("Principal, interest and fees must add up to the payment");
  return { principalPart, interestPart, feePart };
}

export type TermsInput = {
  principal?: number | null;
  startedAt?: number | null;
  dueKind?: "fixed" | "flexible" | null;
  interestTerms?: "none" | "simple" | "manual" | null;
  interestRate?: number | null;
  dueDate?: number | null;
};
export type TermsDoc = {
  principal?: number;
  startedAt?: number;
  dueKind?: "fixed" | "flexible";
  interestTerms?: "none" | "simple" | "manual";
  interestRate?: number;
  dueDate?: number;
  currency: string;
  owedSymbol?: string;
};

type Field = "principal" | "startedAt" | "dueKind" | "interestTerms" | "interestRate" | "dueDate";
/** What to patch: a field set to undefined is removed from the document. */
export type TermsPatch = { principal?: number; startedAt?: number; dueKind?: "fixed" | "flexible"; interestTerms?: "none" | "simple" | "manual"; interestRate?: number; dueDate?: number };

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
  if (input.dueKind !== undefined) set("dueKind", input.dueKind);
  if (input.dueDate !== undefined) set("dueDate", input.dueDate);

  // Interest-free has no rate; a flexible loan has no repayment date.
  if (next.interestTerms === "none" && next.interestRate !== undefined) set("interestRate", null);
  if (next.dueKind === "flexible" && next.dueDate !== undefined) set("dueDate", null);

  if (next.dueKind === "fixed" && next.dueDate === undefined) throw bad("A fixed loan needs its repayment date");
  if (next.dueKind === "fixed" && next.startedAt !== undefined && next.dueDate! < next.startedAt) throw bad("The repayment date can’t be before the start date");
  if (next.interestTerms === "simple") {
    if (next.owedSymbol) throw bad("Simple interest isn’t calculated for a debt owed in a coin yet. Mark its terms as manual");
    if (!(next.interestRate! > 0)) throw bad("Simple interest needs a yearly rate above zero");
    if (next.principal === undefined || next.startedAt === undefined) throw bad("Simple interest needs the original amount and the start date");
  }
  if (next.owedSymbol && next.principal !== undefined) throw bad("The original amount isn’t kept for a debt owed in a coin yet");
  return out as TermsPatch;
}
