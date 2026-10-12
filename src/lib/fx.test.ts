import { describe, expect, it } from "vitest";
import { convertCurrency, fxQuoteIsCurrent, parseFxQuote, UNKNOWN_FX_RATES } from "./fx";
import { formatMoney, formatMoneyCompact, formatMoneyDecimal, formatPercent } from "./money";

const now = Date.parse("2026-10-01T12:00:00Z");
const quote = { base: "EUR", date: "2026-09-30", rates: { USD: 1.12 }, provider: "frankfurter" };
describe("verified FX boundary", () => {
  it("preserves the provider date and rejects unproven or invalid rates", () => {
    expect(parseFxQuote(quote, now)).toEqual({ ...quote, rates: { EUR: 1, USD: 1.12 } });
    for (const patch of [{ provider: "fallback" }, { date: "2026-10-02" }, { date: "2026-02-30" }, { rates: { USD: 0 } }, { rates: { USD: -1 } }, { rates: { USD: Infinity } }, { rates: {} }]) {
      expect(() => parseFxQuote({ ...quote, ...patch }, now)).toThrow();
    }
    expect(fxQuoteIsCurrent(parseFxQuote(quote, now), now)).toBe(true);
    expect(fxQuoteIsCurrent(parseFxQuote({ ...quote, date: "2026-09-01" }, now), now)).toBe(false);
  });
  it("preserves same-currency and zero values without inventing cross-currency amounts", () => {
    expect(convertCurrency(100, "USD", "USD", UNKNOWN_FX_RATES)).toBe(100);
    expect(convertCurrency(0, "USD", "EUR", UNKNOWN_FX_RATES)).toBe(0);
    expect(convertCurrency(100, "USD", "EUR", UNKNOWN_FX_RATES)).toBeNaN();
    for (const rate of [0, -1, NaN, Infinity]) expect(convertCurrency(100, "USD", "EUR", { EUR: 1, USD: rate })).toBeNaN();
    expect(convertCurrency(112, "USD", "EUR", { EUR: 1, USD: 1.12 })).toBeCloseTo(100);
    expect(convertCurrency(Infinity, "EUR", "EUR", UNKNOWN_FX_RATES)).toBeNaN();
  });
  it("renders unavailable money explicitly", () => {
    for (const formatter of [formatMoney, formatMoneyCompact, formatMoneyDecimal]) expect(formatter(NaN, "EUR")).toBe("Unavailable");
    expect(formatPercent(NaN)).toBe("Unavailable");
  });
});
