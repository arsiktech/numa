import { describe, expect, it } from "vitest";
import { cleanSplit, roundAmount, roundDecimals, termsPatch, type TermsDoc } from "./loanTerms";

const NOW = Date.UTC(2026, 9, 24);
const DAY = 86_400_000;
const loan: TermsDoc = { currency: "EUR" };

describe("cleanSplit", () => {
  it("returns nothing when no part is given, so the whole amount stays principal", () => {
    expect(cleanSplit(1000, "EUR", {})).toBeNull();
  });
  it("fills the parts left out with zero", () => {
    expect(cleanSplit(1000, "EUR", { principalPart: 900, interestPart: 100 })).toEqual({ principalPart: 900, interestPart: 100, feePart: 0 });
    expect(cleanSplit(10, "EUR", { principalPart: 3.33, interestPart: 3.33, feePart: 3.34 })).toEqual({ principalPart: 3.33, interestPart: 3.33, feePart: 3.34 });
  });
  it("refuses parts that do not add up to the payment, including a cent lost to rounding", () => {
    expect(() => cleanSplit(1000, "EUR", { principalPart: 900, interestPart: 99 })).toThrow(/add up/);
    expect(() => cleanSplit(1000, "EUR", { principalPart: 900, interestPart: 101 })).toThrow(/add up/);
    expect(() => cleanSplit(10, "EUR", { principalPart: 3.333, interestPart: 3.333, feePart: 3.334 })).toThrow(/add up/);
  });
  it("refuses negative, infinite and huge parts", () => {
    expect(() => cleanSplit(1000, "EUR", { principalPart: 1100, interestPart: -100 })).toThrow(/zero or more/);
    expect(() => cleanSplit(1000, "EUR", { principalPart: Infinity })).toThrow(/zero or more/);
    expect(() => cleanSplit(1000, "EUR", { principalPart: NaN })).toThrow(/zero or more/);
    expect(() => cleanSplit(1, "EUR", { principalPart: 1e13 })).toThrow(/zero or more/);
  });
  it("keeps a coin to eight decimals, and money to cents", () => {
    expect(cleanSplit(0.12345678, "BTC", { principalPart: 0.1, interestPart: 0.02345678 })).toEqual({ principalPart: 0.1, interestPart: 0.02345678, feePart: 0 });
    expect(() => cleanSplit(0.12345678, "BTC", { principalPart: 0.1, interestPart: 0.0234 })).toThrow(/add up/);
  });
});

describe("termsPatch", () => {
  it("saves the original amount, start date and a simple yearly rate together", () => {
    const patch = termsPatch({ principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8, dueKind: "flexible" }, loan, NOW);
    expect(patch).toMatchObject({ principal: 20000, interestTerms: "simple", interestRate: 8, dueKind: "flexible" });
  });
  it("needs a rate, an original amount and a start date for simple interest", () => {
    expect(() => termsPatch({ interestTerms: "simple" }, loan, NOW)).toThrow(/yearly rate/);
    expect(() => termsPatch({ interestTerms: "simple", interestRate: 8 }, loan, NOW)).toThrow(/original amount and the start date/);
    expect(() => termsPatch({ interestTerms: "simple", interestRate: 0, principal: 1, startedAt: NOW }, loan, NOW)).toThrow(/yearly rate/);
  });
  it("keeps what is saved when a field is left out, and clears it with null", () => {
    const saved: TermsDoc = { ...loan, principal: 5000, startedAt: NOW - 30 * DAY, interestTerms: "simple", interestRate: 10 };
    expect(termsPatch({ interestRate: 12 }, saved, NOW)).toEqual({ interestRate: 12 });
    expect(termsPatch({ principal: null, interestTerms: "none" }, saved, NOW)).toMatchObject({ principal: undefined, interestTerms: "none", interestRate: undefined });
  });
  it("bounds the yearly rate between 0 and 100 percent", () => {
    const ok = { principal: 1000, startedAt: NOW - DAY, interestTerms: "simple" as const };
    expect(() => termsPatch({ ...ok, interestRate: 100.5 }, loan, NOW)).toThrow(/between 0 and 100/);
    expect(() => termsPatch({ ...ok, interestRate: -1 }, loan, NOW)).toThrow(/between 0 and 100/);
    expect(termsPatch({ ...ok, interestRate: 100 }, loan, NOW)).toMatchObject({ interestRate: 100 });
  });
  it("makes interest-free carry no rate, and a flexible loan carry no repayment date", () => {
    const saved: TermsDoc = { ...loan, interestTerms: "simple", interestRate: 9, principal: 100, startedAt: NOW - DAY, dueKind: "fixed", dueDate: NOW + 30 * DAY };
    expect(termsPatch({ interestTerms: "none", dueKind: "flexible" }, saved, NOW)).toMatchObject({ interestTerms: "none", interestRate: undefined, dueKind: "flexible", dueDate: undefined });
  });
  it("needs a repayment date for a fixed loan, not before its start", () => {
    expect(() => termsPatch({ dueKind: "fixed" }, loan, NOW)).toThrow(/repayment date/);
    expect(() => termsPatch({ dueKind: "fixed", startedAt: NOW - DAY, dueDate: NOW - 2 * DAY }, loan, NOW)).toThrow(/before the start/);
    expect(termsPatch({ dueKind: "fixed", dueDate: NOW + 60 * DAY }, loan, NOW)).toMatchObject({ dueKind: "fixed" });
  });
  it("refuses a start date in the future and an original amount of zero", () => {
    expect(() => termsPatch({ startedAt: NOW + 5 * DAY }, loan, NOW)).toThrow(/future/);
    expect(() => termsPatch({ principal: 0 }, loan, NOW)).toThrow(/more than zero/);
    expect(() => termsPatch({ principal: -5 }, loan, NOW)).toThrow(/more than zero/);
  });
  it("keeps compounding and amortized terms as manual, and calculates nothing for a debt owed in a coin", () => {
    expect(termsPatch({ interestTerms: "manual" }, loan, NOW)).toEqual({ interestTerms: "manual" });
    const coin: TermsDoc = { currency: "USD", owedSymbol: "BTC" };
    expect(() => termsPatch({ interestTerms: "simple", interestRate: 5, principal: 1, startedAt: NOW }, coin, NOW)).toThrow(/coin/);
    expect(() => termsPatch({ principal: 1 }, coin, NOW)).toThrow(/coin/);
    expect(termsPatch({ interestTerms: "manual", dueKind: "flexible" }, coin, NOW)).toMatchObject({ interestTerms: "manual" });
  });
});

describe("rounding", () => {
  it("rounds half up on the digits as written, not by way of binary floating point", () => {
    expect(roundDecimals(12.345, 2)).toBe(12.35);
    expect(roundDecimals(1.005, 2)).toBe(1.01);
    expect(roundDecimals(2.675, 2)).toBe(2.68);
    expect(roundDecimals(0.005, 2)).toBe(0.01);
    expect(roundDecimals(0.004, 2)).toBe(0);
    expect(roundDecimals(100.004, 2)).toBe(100);
  });
  it("copes with numbers written with an exponent and with values that are not numbers", () => {
    expect(roundDecimals(1e-7, 2)).toBe(0);
    expect(roundDecimals(1.6e-8, 8)).toBe(2e-8);
    expect(roundDecimals(1e21, 2)).toBe(1e21);
    expect(Number.isNaN(roundDecimals(NaN, 2))).toBe(true);
    expect(roundDecimals(Infinity, 2)).toBe(Infinity);
  });
  it("keeps cents for a currency and eight decimals for a coin", () => {
    expect(roundAmount(1.005, "EUR")).toBe(1.01);
    expect(roundAmount(0.123456785, "BTC")).toBe(0.12345679);
  });
});

describe("termsPatch limits", () => {
  it("refuses a repayment date that is not a real date", () => {
    for (const bad of [NaN, Infinity, -1]) expect(() => termsPatch({ dueKind: "fixed", dueDate: bad }, loan, NOW)).toThrow(/valid date/);
  });
  it("keeps simple interest off mortgages and cards, and allows manual there", () => {
    const ok = { principal: 1000, startedAt: NOW - DAY, interestTerms: "simple" as const, interestRate: 5 };
    expect(() => termsPatch(ok, { ...loan, kind: "mortgage" }, NOW)).toThrow(/compound or instalment/);
    expect(() => termsPatch(ok, { ...loan, kind: "credit_card" }, NOW)).toThrow(/compound or instalment/);
    expect(termsPatch({ interestTerms: "manual" }, { ...loan, kind: "mortgage" }, NOW)).toEqual({ interestTerms: "manual" });
    expect(termsPatch(ok, { ...loan, kind: "loan" }, NOW)).toMatchObject({ interestTerms: "simple" });
    expect(termsPatch(ok, { ...loan, kind: "other" }, NOW)).toMatchObject({ interestTerms: "simple" });
  });
});

describe("interest due day", () => {
  const simple: TermsDoc = { ...loan, principal: 5000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 10 };
  it("saves a due day from 1 to 28 with simple interest", () => {
    expect(termsPatch({ interestDueDay: 10 }, simple, NOW)).toEqual({ interestDueDay: 10 });
    expect(termsPatch({ interestDueDay: 1 }, simple, NOW)).toEqual({ interestDueDay: 1 });
    expect(termsPatch({ interestDueDay: 28 }, simple, NOW)).toEqual({ interestDueDay: 28 });
  });
  it("refuses a day that is not a whole number from 1 to 28", () => {
    for (const bad of [0, 29, 31, -1, 10.5, NaN, Infinity]) expect(() => termsPatch({ interestDueDay: bad }, simple, NOW)).toThrow(/whole number from 1 to 28/);
  });
  it("clears it with null, and takes it away when interest stops being simple", () => {
    const withDay: TermsDoc = { ...simple, interestDueDay: 10 };
    expect(termsPatch({ interestDueDay: null }, withDay, NOW)).toEqual({ interestDueDay: undefined });
    expect(termsPatch({ interestTerms: "none" }, withDay, NOW)).toMatchObject({ interestTerms: "none", interestDueDay: undefined, interestRate: undefined });
    expect(termsPatch({ interestTerms: "manual" }, withDay, NOW)).toMatchObject({ interestTerms: "manual", interestDueDay: undefined });
  });
  it("refuses to set a due day on interest that is not simple", () => {
    expect(() => termsPatch({ interestTerms: "manual", interestDueDay: 10 }, loan, NOW)).toThrow(/needs simple interest/);
    expect(() => termsPatch({ interestDueDay: 10 }, loan, NOW)).toThrow(/needs simple interest/);
  });
});
