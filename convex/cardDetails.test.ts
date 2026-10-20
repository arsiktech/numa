import { describe, expect, it } from "vitest";
import { cleanCardDetails } from "./lib/cardDetails";

describe("card purchase details", () => {
  it("keeps what the statement says, trimmed, with currency codes in capitals", () => {
    expect(cleanCardDetails({ issuer: " ether.fi ", last4: "9969", merchant: "  SHOP, LISBON ", billed: { amount: 11.3612345678, currency: "usd" }, cashback: { amount: 0.34, currency: "usd" }, mode: "", status: "CLEARED" }))
      .toEqual({ issuer: "ether.fi", last4: "9969", merchant: "SHOP, LISBON", billed: { amount: 11.361235, currency: "USD" }, cashback: { amount: 0.34, currency: "USD" }, status: "CLEARED" });
  });

  it("refuses a card number that isn't four digits, and amounts that aren't money", () => {
    expect(() => cleanCardDetails({ issuer: "ether.fi", last4: "4111111111111111" })).toThrow();
    expect(() => cleanCardDetails({ issuer: "ether.fi", last4: "12a4" })).toThrow();
    expect(() => cleanCardDetails({ issuer: "ether.fi", billed: { amount: -1, currency: "USD" } })).toThrow();
    expect(() => cleanCardDetails({ issuer: "ether.fi", cashback: { amount: 1, currency: "dollars" } })).toThrow();
  });
});
