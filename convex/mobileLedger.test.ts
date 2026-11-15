// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ledgerOutline, monthLedger, portfolioSnapshot, transaction } from "./mobile";
import { privacyFixture } from "../src/test/privacyFixture";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** A space with one transaction from this week and one from four months ago, and a second space the user cannot see. */
function ledger() {
  const f = privacyFixture();
  f.seed("portfolios", "pf", { name: "Home", defaultCurrency: "EUR", ownerId: "user", type: "personal", createdAt: 0 });
  f.seed("memberships", "member", { userId: "user", portfolioId: "pf", role: "owner" });
  f.seed("portfolios", "theirs", { name: "Theirs", defaultCurrency: "EUR", ownerId: "other", type: "personal", createdAt: 0 });
  const tx = (id: string, portfolioId: string, occurredAt: number, description: string, amount: number) =>
    f.seed("transactions", id, { portfolioId, occurredAt, description, amount, kind: "expense", currency: "EUR", createdByUserId: "user" });
  // Seeded oldest first: the synthetic adapter returns rows in insertion order, as the time index would.
  tx("old", "pf", now - 120 * DAY, "Rent", 1200);
  tx("recent", "pf", now - 2 * DAY, "Lunch", 12.5);
  tx("foreign", "theirs", now - 120 * DAY, "Not yours", 5);
  return f;
}

describe("the ledger outside the home subscription", () => {
  it("leaves older transactions out of a ranged snapshot but still names the oldest", async () => {
    const f = ledger();
    const snapshot = await f.call(portfolioSnapshot, { portfolioId: "pf", since: now - 45 * DAY });
    expect(snapshot.transactions.map((t: { id: string }) => t.id)).toEqual(["recent"]);
    expect(snapshot.oldestTransactionAt).toBe(now - 120 * DAY);
  });

  it("reads one month by its bounds", async () => {
    const f = ledger();
    const rows = await f.call(monthLedger, { portfolioId: "pf", start: now - 130 * DAY, end: now - 100 * DAY });
    expect(rows.map((t: { id: string }) => t.id)).toEqual(["old"]);
  });

  it("reads one old transaction by id, and nothing from another space", async () => {
    const f = ledger();
    expect(await f.call(transaction, { portfolioId: "pf", id: "old" })).toMatchObject({ id: "old", description: "Rent", amountMinor: 120000 });
    expect(await f.call(transaction, { portfolioId: "pf", id: "foreign" })).toBeNull();
    expect(await f.call(transaction, { portfolioId: "pf", id: "no-such-id" })).toBeNull();
    expect(await f.call(transaction, { portfolioId: "pf", id: "member" })).toBeNull();
    await expect(f.call(transaction, { portfolioId: "theirs", id: "foreign" })).rejects.toThrow();
    f.signIn(null);
    await expect(f.call(transaction, { portfolioId: "pf", id: "old" })).rejects.toThrow();
  });

  it("outlines every transaction between two times, start included and end excluded", async () => {
    const f = ledger();
    expect(await f.call(ledgerOutline, { portfolioId: "pf", start: now - 120 * DAY, end: now })).toEqual([
      { occurredAt: now - 120 * DAY, amountMinor: 120000, description: "Rent" },
      { occurredAt: now - 2 * DAY, amountMinor: 1250, description: "Lunch" },
    ]);
    expect(await f.call(ledgerOutline, { portfolioId: "pf", start: now - 200 * DAY, end: now - 120 * DAY })).toEqual([]);
    expect(await f.call(ledgerOutline, { portfolioId: "pf", start: now, end: now })).toEqual([]);
    await expect(f.call(ledgerOutline, { portfolioId: "theirs", start: 0, end: now })).rejects.toThrow();
  });
});
