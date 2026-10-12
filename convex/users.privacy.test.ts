import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteMyAccount, cancelMyDeletion, executeScheduledDeletion } from "./users";
import { create as createSpace } from "./spaces";
import { ensureProfile } from "./profiles";
import { validateAndConsume, ingestTransaction } from "./webhookTokens";
import { ensureUser } from "./lib/access";
import { privacyFixture } from "../src/test/privacyFixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("registered account-deletion lifecycle", () => {
  it("creates a grace marker for a profileless real account, schedules once and makes canceled jobs harmless", async () => {
    const f = privacyFixture(); f.rows.get("user").email = "owner@numa.invalid";
    const now = 1_800_000_000_000; vi.spyOn(Date, "now").mockReturnValue(now);
    await f.call(deleteMyAccount); await f.call(deleteMyAccount);
    expect(f.jobs).toHaveLength(1);
    expect(f.all("profiles")[0]).toMatchObject({ deletionScheduledAt: now + 7 * 86400000 });
    expect(f.rows.has("user")).toBe(true);
    expect(await f.call(cancelMyDeletion)).toEqual({ ok: true });
    expect(f.jobs[0].canceled).toBe(true);
    f.signIn(null); vi.spyOn(Date, "now").mockReturnValue(now + 8 * 86400000);
    await f.call(executeScheduledDeletion, { userId: "user" });
    expect(f.rows.has("user")).toBe(true);
    expect(f.all("profiles")[0].deletionScheduledAt).toBeUndefined();
  });
  it("never shortens the grace period, including an old runner after cancel and reschedule", async () => {
    const f = privacyFixture(); f.rows.get("user").email = "owner@numa.invalid";
    let now = 1_800_000_000_000; vi.spyOn(Date, "now").mockImplementation(() => now);
    await f.call(deleteMyAccount); const oldDue = f.jobs[0].at;
    now += 86400000; await f.call(cancelMyDeletion); await f.call(deleteMyAccount);
    const due = f.jobs[1].at; expect(due).toBe(oldDue + 86400000);
    f.signIn(null); now = oldDue;
    await f.call(executeScheduledDeletion, f.jobs[0].args);
    expect(f.rows.has("user")).toBe(true); expect(f.deletes).toBe(0);
    now = due - 1; await f.call(executeScheduledDeletion, f.jobs[0].args);
    expect(f.rows.has("user")).toBe(true); expect(f.deletes).toBe(0);
    now = due; await f.call(executeScheduledDeletion, f.jobs[1].args);
    expect(f.rows.has("user")).toBe(false);
  });
  it("drains a profileless 1700-row account after sign-out, preserves foreign records and removes privacy/auth/pod data", async () => {
    const f = privacyFixture();
    f.seed("portfolios", "owned", { ownerId: "user" });
    f.seed("portfolios", "foreign", { ownerId: "someone-else" });
    for (let i = 0; i < 1700; i++) f.seed("assets", `asset-${i}`, { portfolioId: "owned", balance: i });
    f.seed("assets", "foreign-asset", { portfolioId: "foreign", balance: 91 });
    f.seed("cashTransfers", "owned-transfer", { portfolioId: "owned", amount: 3 });
    f.seed("cashTransfers", "deleted-transfer", { portfolioId: "owned", amount: 4, deletedAt: 1 });
    f.seed("cashTransfers", "foreign-transfer", { portfolioId: "foreign", amount: 5 });
    f.seed("memberships", "shared-membership", { userId: "user", portfolioId: "foreign" });
    f.seed("privacyChoices", "choice", { userId: "user" });
    f.seed("clientErrors", "old-error", { userId: "user" });
    f.seed("clientErrors", "foreign-error", { userId: "someone-else" });
    f.seed("moneyPods", "pod", { ownerUserId: "user" });
    f.seed("podInvites", "pod-invite", { podId: "pod" });
    f.seed("authSessions", "session", { userId: "user" });
    f.seed("authVerifiers", "owned-verifier", { sessionId: "session", signature: "owned-synthetic" });
    f.seed("authVerifiers", "foreign-verifier", { sessionId: "foreign-session", signature: "foreign-synthetic" });
    f.seed("authVerifiers", "anonymous-verifier", { signature: "anonymous-synthetic" });
    f.seed("authRefreshTokens", "refresh", { sessionId: "session" });
    f.seed("authAccounts", "auth", { userId: "user" });
    f.seed("authVerificationCodes", "code", { accountId: "auth" });
    await f.call(deleteMyAccount);
    expect(f.deletes).toBeLessThanOrEqual(800);
    expect(f.all("profiles")[0].deletionStartedAt).toBeTypeOf("number");
    expect(await f.call(cancelMyDeletion)).toMatchObject({ ok: false, reason: "already-started" });
    f.signIn(null);
    for (let index = 0; index < f.jobs.length && index < 8; index++) {
      await f.call(executeScheduledDeletion, f.jobs[index].args);
      expect(f.deletes).toBeLessThanOrEqual(800);
    }
    expect(f.rows.has("user")).toBe(false);
    expect(f.all("assets")).toMatchObject([{ _id: "foreign-asset", balance: 91 }]);
    expect(f.all("profiles")).toHaveLength(0);
    expect(f.all("cashTransfers")).toMatchObject([{ _id: "foreign-transfer", amount: 5 }]);
    for (const table of ["memberships", "privacyChoices", "moneyPods", "podInvites", "authSessions", "authRefreshTokens", "authAccounts", "authVerificationCodes"]) expect(f.all(table)).toHaveLength(0);
    expect(f.all("clientErrors")).toMatchObject([{ _id: "foreign-error" }]);
    expect(f.all("authVerifiers").map(row => row._id)).toEqual(["foreign-verifier", "anonymous-verifier"]);
    await f.call(executeScheduledDeletion, { userId: "user" }); expect(f.deletes).toBe(0);
  });
  it("rejects new records during deletion and from a stale authenticated token after completion", async () => {
    const f = privacyFixture();
    const args = { name: "Should not be recreated", spaceKind: "business", currency: "EUR", clientMutationId: "late-space" };
    for (let i = 0; i < 810; i++) f.seed("privacyChoices", `choice-${i}`, { userId: "user" });
    await f.call(deleteMyAccount);
    await expect(f.call(createSpace, args)).rejects.toThrow(/deletion has started/);
    await expect(f.call(ensureProfile)).rejects.toThrow(/deletion has started/);
    await expect(f.call({ _handler: ensureUser })).rejects.toThrow(/deletion has started/);
    await f.call(executeScheduledDeletion, { userId: "user" });
    // Keep presenting the exact old authenticated subject, like an unexpired JWT.
    await expect(f.call(createSpace, args)).rejects.toThrow(/Account no longer exists/);
    await expect(f.call(ensureProfile)).rejects.toThrow(/Account no longer exists/);
    await expect(f.call({ _handler: ensureUser })).rejects.toThrow(/Account no longer exists/);
    expect(f.all("portfolios")).toHaveLength(0); expect(f.all("assets")).toHaveLength(0);
    expect(f.all("profiles")).toHaveLength(0); expect(f.all("users")).toHaveLength(0);
  });
  it("blocks server-secret webhook writes from a draining or deleted token owner", async () => {
    const f = privacyFixture(); f.signIn(null); vi.stubEnv("NUMA_PUSH_INTERNAL_SECRET", "synthetic-internal-secret");
    f.seed("profiles", "profile", { userId: "user", deletionStartedAt: Date.now() });
    f.seed("webhookTokens", "token", { userId: "user", portfolioId: "pf", tokenHash: "synthetic-hash", uses: 0, scope: "add-transaction" });
    const token = { tokenHash: "synthetic-hash", serverSecret: "synthetic-internal-secret" };
    for (const method of [validateAndConsume, ingestTransaction]) {
      await expect(f.call(method, { ...token, occurredAt: Date.now(), description: "Synthetic", kind: "expense", amount: 1, currency: "EUR" })).rejects.toThrow(/deletion has started/);
    }
    expect(f.rows.get("token").uses).toBe(0); expect(f.all("transactions")).toHaveLength(0);
    f.rows.delete("user");
    await expect(f.call(validateAndConsume, token)).rejects.toThrow(/Account no longer exists/);
  });
  it("preserves the marker when the last budget slot cannot fit profile and user together", async () => {
    const f = privacyFixture();
    for (let i = 0; i < 799; i++) f.seed("privacyChoices", `choice-${i}`, { userId: "user" });
    await f.call(deleteMyAccount);
    expect(f.deletes).toBeLessThanOrEqual(800);
    expect(f.all("profiles")).toHaveLength(1);
    expect(f.rows.has("user")).toBe(true);
    f.signIn(null); await f.call(executeScheduledDeletion, { userId: "user" });
    expect(f.rows.has("user")).toBe(false); expect(f.all("profiles")).toHaveLength(0);
  });
});

describe("account deletion preserves shared financial history without login links", () => {
  it("anonymizes non-owned pod members and preserves the actual settlement balances", async () => {
    const { computeSettlementBalances } = await import("./lib/settlementMath");
    const f = privacyFixture(); f.rows.get("user").emailVerificationTime = 1;
    f.seed("moneyPods", "shared-pod", { ownerUserId: "other", name: "Synthetic shared pot", currency: "EUR" });
    f.seed("podMembers", "payer", { podId: "shared-pod", linkedUserId: "user", invitedEmail: "qa@example.com", displayName: "Private name", cards: ["Private card"], linkedPortfolioId: "private-portfolio", role: "editor", groupId: "group" });
    f.seed("podMembers", "peer", { podId: "shared-pod", linkedUserId: "other", role: "owner" });
    f.seed("podExpenses", "expense", { podId: "shared-pod", paidByMemberId: "payer", amount: 100, splitMode: "equal_people", participantMemberIds: ["payer", "peer"] });
    f.seed("podSettlements", "payment", { podId: "shared-pod", fromMemberId: "peer", toMemberId: "payer", amount: 10 });
    const balances = () => computeSettlementBalances(f.all("podMembers").map(m => ({ id: m._id, groupId: m.groupId })), f.all("podExpenses"), f.all("podSettlements"), [{ id: "group" }]);
    const before = balances(); await f.call(deleteMyAccount);
    expect(balances()).toEqual(before); expect(before.reduce((n, row) => n + row.net, 0)).toBe(0);
    const payer = f.rows.get("payer"); expect(payer).toMatchObject({ active: false, displayName: "Former member", role: "viewer", groupId: "group" });
    for (const key of ["linkedUserId", "invitedEmail", "linkedPortfolioId", "cards"]) expect(payer[key]).toBeUndefined();
    expect(f.rows.has("expense")).toBe(true); expect(f.rows.has("payment")).toBe(true); expect(f.rows.has("user")).toBe(false);
  });
  it("only detaches unlinked invitations for a verified email and deletes password counters owned by authAccount ID", async () => {
    for (const verified of [false, true]) {
      const f = privacyFixture(); if (verified) f.rows.get("user").emailVerificationTime = 1;
      f.seed("podMembers", "invite", { podId: "shared", invitedEmail: "qa@example.com", displayName: "Invite" });
      f.seed("podMembers", "other-linked", { podId: "shared", invitedEmail: "qa@example.com", linkedUserId: "other", displayName: "Other" });
      f.seed("authAccounts", "owned-auth", { userId: "user", provider: "password" });
      f.seed("authRateLimits", "password-limit", { identifier: "owned-auth", lastAttemptTime: 10 });
      f.seed("authRateLimits", "otp-limit", { identifier: "qa@example.com", lastAttemptTime: 10 });
      await f.call(deleteMyAccount);
      expect(f.rows.get("invite").invitedEmail).toBe(verified ? undefined : "qa@example.com");
      expect(f.rows.get("other-linked").linkedUserId).toBe("other");
      expect(f.rows.has("password-limit")).toBe(false); expect(f.rows.has("otp-limit")).toBe(true);
    }
  });
});

describe("transaction-wide deletion byte budget", () => {
  it("continues through large valid AI documents without exceeding read/write limits or losing the marker", async () => {
    const f = privacyFixture();
    for (let i = 0; i < 22; i++) f.seed("aiActionDrafts", `large-${i}`, { userId: "user", proposedPayload: { text: "x".repeat(900000) } });
    await f.call(deleteMyAccount);
    expect(f.rows.has("user")).toBe(true); expect(f.all("profiles")[0].deletionStartedAt).toBeTypeOf("number");
    expect(f.bytesRead).toBeLessThan(16 * 1024 * 1024); expect(f.bytesWritten).toBeLessThan(16 * 1024 * 1024);
    f.signIn(null);
    for (let i = 0; i < f.jobs.length && i < 12; i++) {
      await f.call(executeScheduledDeletion, f.jobs[i].args);
      expect(f.bytesRead).toBeLessThan(16 * 1024 * 1024); expect(f.bytesWritten).toBeLessThan(16 * 1024 * 1024);
    }
    expect(f.rows.has("user")).toBe(false); expect(f.all("aiActionDrafts")).toEqual([]);
  });
});
