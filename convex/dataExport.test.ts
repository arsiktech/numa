// @vitest-environment node
import { describe, expect, it } from "vitest";
import { manifest, page, SPACE_EXPORT_SECTIONS } from "./dataExport";
import { convexToJson } from "convex/values";
import { privacyFixture } from "../src/test/privacyFixture";

const scope = { expectedUserId: "user", portfolioId: "space", requestId: "synthetic-export-1" };
function fixture() {
  const f = privacyFixture();
  f.seed("portfolios", "space", { name: "Synthetic Studio", ownerId: "user", defaultCurrency: "EUR", type: "personal" });
  f.seed("memberships", "mine", { portfolioId: "space", userId: "user", role: "owner", avatarUrl: "private-photo-url" });
  f.seed("users", "other", { email: "other@example.com" });
  f.seed("portfolios", "foreign", { ownerId: "other", name: "Private", defaultCurrency: "USD" });
  f.seed("memberships", "foreign-member", { portfolioId: "foreign", userId: "other", role: "owner" });
  f.seed("memberships", "shared-member", { portfolioId: "space", userId: "other", role: "editor", avatarUrl: "other-private-photo" });
  return f;
}
async function exportSection(f: ReturnType<typeof fixture>, section: string, limit = 32) {
  let cursor: string | null = null;
  const rows: unknown[] = [];
  for (let i = 0; i < 200; i++) {
    const result = await f.call(page, { ...scope, section, cursor, limit });
    expect(result.retryLimit).toBeNull();
    expect(result.rowCount).toBe(JSON.parse(result.rowsJSON).length);
    rows.push(...JSON.parse(result.rowsJSON));
    if (result.isDone) { expect(result.continueCursor).toBeNull(); return rows; }
    expect(result.continueCursor).not.toBe(cursor); cursor = result.continueCursor;
  }
  throw new Error("Did not reach export end");
}

describe("registered financial export", () => {
  it("exports complete paginated source records including debt, currencies, dates and review/ledger provenance", async () => {
    const f = fixture();
    for (let i = 0; i < 70; i++) f.seed("transactions", `tx-${i}`, { portfolioId: "space", amount: i + .01,
      currency: i % 2 ? "EUR" : "USD", occurredAt: 1800000000000 - i * 1000, description: `Synthetic ${i}`, createdByUserId: "user" });
    f.seed("liabilities", "loan", { portfolioId: "space", name: "Synthetic family loan", balance: 1234.56, currency: "EUR",
      dueDate: 1800000000000, notes: "Principal owed; not income", wealthObservation: { amount: null, observedAt: 1800000000000 } });
    f.seed("ledgerTransactions", "journal", { portfolioId: "space", sourceType: "liability", sourceId: "loan", classification: "financing_inflow",
      occurredAt: 1800000000000, currency: "EUR", createdByUserId: "user", clientMutationId: "loan-create", reversesId: "old-journal" });
    f.seed("aiActionDrafts", "my-review", { userId: "user", portfolioId: "space", prompt: "Synthetic transcript", resultId: "tx-1", confirmedMutationId: "review-create" });
    f.seed("aiActionDrafts", "their-review", { userId: "other", portfolioId: "space", prompt: "OTHER PRIVATE PROMPT" });
    f.seed("liabilities", "their-loan", { portfolioId: "foreign", balance: 888, currency: "USD" });
    const m = await f.call(manifest, scope);
    expect(m.sections).toEqual(SPACE_EXPORT_SECTIONS); expect(m.consistency).toContain("not a point-in-time");
    const tx = await exportSection(f, "transactions"); expect(tx).toEqual(f.all("transactions"));
    expect(await exportSection(f, "liabilities")).toEqual([f.rows.get("loan")]);
    expect(await exportSection(f, "ledgerTransactions")).toEqual([f.rows.get("journal")]);
    expect(await exportSection(f, "aiActionDrafts")).toEqual([f.rows.get("my-review")]);
    expect(await exportSection(f, "membership")).toEqual([{ ...f.rows.get("mine"), avatarUrl: undefined }]);
    for (const section of SPACE_EXPORT_SECTIONS.filter(s => !["portfolio", "membership", "transactions", "liabilities", "ledgerTransactions", "aiActionDrafts"].includes(s))) {
      expect(await exportSection(f, section)).toEqual([]);
    }
  });
  it("preserves paginated transfer provenance and tombstones without leaking a foreign space", async () => {
    const f = fixture();
    for (let i = 0; i < 35; i++) f.seed("cashTransfers", `transfer-${i}`, {
      portfolioId: "space", fromAccountId: "cash-a", toAccountId: "cash-b", amount: i + .25,
      currency: i % 2 ? "EUR" : "USD", occurredAt: 1800000000000 - i * 1000,
      sourceEventId: `event-${i}`, sourceFingerprint: `original-${i}`,
      ...(i === 7 ? { deletedAt: 1800000000123 } : {}),
    });
    f.seed("cashTransfers", "foreign-transfer", { portfolioId: "foreign", amount: 999, currency: "EUR" });
    expect((await f.call(manifest, scope)).sections).toContain("cashTransfers");
    expect(await exportSection(f, "cashTransfers")).toEqual(f.all("cashTransfers").filter(row => row.portfolioId === "space"));
  });
  it("preserves supported non-JSON values in recorded AI provenance without coercion", async () => {
    const f = fixture();
    f.seed("aiActionDrafts", "encoded-review", { userId: "user", portfolioId: "space", proposedPayload: {
      bytes: new Uint8Array([1, 2, 3]).buffer, integer: 9007199254740993n, missing: NaN, infinity: Infinity,
    } });
    expect(await exportSection(f, "aiActionDrafts")).toEqual(convexToJson([f.rows.get("encoded-review")]));
    const encoded = JSON.stringify(await exportSection(f, "aiActionDrafts"));
    expect(encoded).toContain("$bytes"); expect(encoded).toContain("$integer"); expect(encoded).toContain("$float");
  });
  it("rechecks actor, membership, account existence and deletion between pages", async () => {
    const f = fixture(); const args = { ...scope, section: "liabilities", cursor: null, limit: 32 };
    await f.call(page, args);
    f.signIn("other"); await expect(f.call(page, args)).rejects.toThrow(/account changed/);
    f.signIn("user"); await expect(f.call(page, { ...args, portfolioId: "foreign" })).rejects.toThrow(/Not a member/);
    f.rows.delete("mine"); await expect(f.call(page, args)).rejects.toThrow(/Not a member/);
    f.seed("memberships", "mine", { portfolioId: "space", userId: "user", role: "viewer" });
    f.seed("profiles", "profile", { userId: "user", deletionStartedAt: Date.now() });
    await expect(f.call(manifest, scope)).rejects.toThrow(/deletion has started/);
    f.rows.delete("user"); await expect(f.call(page, args)).rejects.toThrow(/Account no longer exists/);
    f.signIn(null); await expect(f.call(manifest, scope)).rejects.toThrow(/Not signed in/);
  });
  it("does not accept an incomplete split page; retries the same cursor at smaller sizes", async () => {
    const f = fixture(); f.seed("liabilities", "loan", { portfolioId: "space", balance: 5, currency: "EUR" });
    f.splitExportTables.add("liabilities");
    for (const [limit, next] of [[32, 8], [8, 1]]) {
      expect(await f.call(page, { ...scope, section: "liabilities", cursor: null, limit })).toMatchObject({
        rowsJSON: "[]", rowCount: 0, isDone: false, continueCursor: null, retryLimit: next,
      });
    }
    expect(await exportSection(f, "liabilities", 1)).toEqual([f.rows.get("loan")]);
  });
  it("strips temporary wallet leases without stripping valuation evidence or unknown fields", async () => {
    const f = fixture(); f.seed("cryptoWallets", "wallet", { portfolioId: "space", address: "public-synthetic-address", syncLeaseId: "internal-lease",
      syncLeaseUntil: 123, snapshot: { stale: true, provider: "synthetic", tokens: [] } });
    expect(await exportSection(f, "cryptoWallets")).toEqual([{ ...f.rows.get("wallet"), syncLeaseId: undefined, syncLeaseUntil: undefined }]);
    await expect(f.call(manifest, { ...scope, requestId: "" })).rejects.toThrow(/request identifier/);
    await expect(f.call(page, { ...scope, section: "portfolio", cursor: "unexpected", limit: 32 })).rejects.toThrow(/single-record/);
  });
});
