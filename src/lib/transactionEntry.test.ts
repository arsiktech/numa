import { expect, it } from "vitest";
import { localEntryDate, parseEntryAmount, parseEntryBatch, validEntryDate } from "./transactionEntry";

it("accepts positive decimal money without silently changing precision or signs", () => {
  expect(["12.50", "12,50", ".50", ",50", " 1234 "].map(parseEntryAmount)).toEqual([12.5, 12.5, .5, .5, 1234]);
  for (const value of ["", "0", "-5", "+5", "1e3", "Infinity", "0.001", "1,000", "1.234,56", "90000000001"]) expect(parseEntryAmount(value)).toBeNull();
});
it("keeps every batch item reviewable and flags malformed items instead of dropping them", () => {
  const batch = parseEntryBatch("Coffee 5,50\nMissing amount\nRefund -12\nGroceries 80");
  expect(batch.entries).toEqual([{ description: "Coffee", amount: 5.5 }, { description: "Groceries", amount: 80 }]);
  expect(batch.errors).toHaveLength(2);
  expect(batch.valid).toBe(false);
  expect(parseEntryBatch("coffee 5.50, groceries 80").valid).toBe(true);
  expect(parseEntryBatch("Coffee 5.50, 7-Eleven 8").entries).toEqual([{ description: "Coffee", amount: 5.5 }, { description: "7-Eleven", amount: 8 }]);
  expect(parseEntryBatch("Coffee 5.50,7-Eleven 8").valid).toBe(false);
  expect(parseEntryBatch("\n ").valid).toBe(false);
});
it("keeps a local calendar date and rejects impossible days", () => {
  expect(localEntryDate(new Date(2026, 0, 2, 23, 30))).toBe("2026-01-02");
  expect(validEntryDate("2024-02-29")).toBe(true);
  for (const date of ["2026-02-29", "2026-13-01", "2026-04-31", "", "bad"]) expect(validEntryDate(date)).toBe(false);
});
