import { expect, it } from "vitest";
import { validateHoldingDraft, type HoldingDraft } from "./holdingDraft";

const draft: HoldingDraft = { symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: "0.00000001", costBasis: "0,01", currency: "EUR" };
it("accepts fractional units and comma decimals without rounding", () => {
  expect(validateHoldingDraft(draft)).toMatchObject({ valid: true, quantity: 0.00000001, costBasis: 0.01 });
  expect(validateHoldingDraft({ ...draft, costBasis: "0" }).valid).toBe(true);
  expect(validateHoldingDraft({ ...draft, quantity: "1e-8" }).quantity).toBe(0.00000001);
});
it.each(["", "-1", "Infinity", "1e9", "1,234.56", "0.001", "0.0000001", "1.0000001", "90000000000.01"])("rejects invalid or ambiguous cost %s", costBasis => {
  expect(validateHoldingDraft({ ...draft, costBasis }).errors.costBasis).toBeDefined();
});
it.each(["", "0", "-1", "Infinity", "1,000.2"])("rejects invalid quantity %s", quantity => {
  expect(validateHoldingDraft({ ...draft, quantity }).errors.quantity).toBeDefined();
});
it("identifies missing symbols and unsupported currencies", () => {
  expect(validateHoldingDraft({ ...draft, symbol: " ", currency: "GBP" }).errors).toMatchObject({ symbol: expect.any(String), currency: expect.any(String) });
});
