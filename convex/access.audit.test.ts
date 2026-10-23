import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
import { privacyFixture } from "../src/test/privacyFixture";
import { inviteByEmail, redeemInvitesForMe, listPendingInvitesFor } from "./memberships";
import { create, getBundle, removeMember, leaveMoneyPod, removeExpense, addExpense, listMine, joinPodByCode } from "./moneyPods";
import { podSnapshot, deleteExpense, listPods, me } from "./mobile";
import { sha256Hex } from "./lib/appleIdentity";

function portfolioFixture(verified = false) {
  const f = privacyFixture();
  f.seed("users", "owner", { email: "owner@example.com", emailVerificationTime: 1 });
  f.seed("users", "user", { email: "recipient@example.com", ...(verified ? { emailVerificationTime: 1 } : {}) });
  f.seed("portfolios", "portfolio", { ownerId: "owner", name: "Private synthetic portfolio" });
  f.seed("memberships", "owner-membership", { portfolioId: "portfolio", userId: "owner", role: "owner" });
  return f;
}
const invitation = { portfolioId: "portfolio", email: "recipient@example.com", role: "viewer", ownershipBps: 0, displayName: "Recipient" };

describe("verified email invitation authority", () => {
  it("keeps an unverified recipient pending and hides the inviting portfolio until verification", async () => {
    const f = portfolioFixture(); f.signIn("owner");
    expect(await f.call(inviteByEmail, invitation)).toMatchObject({ kind: "invite" });
    f.signIn("user");
    expect(await f.call(listPendingInvitesFor)).toEqual([]);
    expect(await f.call(redeemInvitesForMe)).toBe(0);
    expect(f.all("memberships")).toHaveLength(1);
    f.rows.get("user").emailVerificationTime = 1;
    expect(await f.call(listPendingInvitesFor)).toHaveLength(1);
    expect(await f.call(redeemInvitesForMe)).toBe(1);
    expect(f.all("memberships")).toHaveLength(2);
  });
  it("still grants an unambiguous verified recipient immediately", async () => {
    const f = portfolioFixture(true); f.signIn("owner");
    expect(await f.call(inviteByEmail, invitation)).toMatchObject({ kind: "member" });
  });
  it("does not redeem revoked or different-email invitations", async () => {
    const f = portfolioFixture(true);
    f.seed("invites", "revoked", { ...invitation, invitedEmail: invitation.email, status: "revoked" });
    f.seed("invites", "unrelated", { ...invitation, invitedEmail: "other@example.com", status: "pending" });
    expect(await f.call(redeemInvitesForMe)).toBe(0);
  });
  it("neither links nor exposes email-only pods to unverified users", async () => {
    const f = portfolioFixture(); f.signIn("owner");
    const { id: podId } = await f.call(create, { name: "Private pod", currency: "EUR", members: [{ displayName: "Recipient", email: invitation.email, role: "editor" }] });
    const member = f.all("podMembers").find(m => m.invitedEmail === invitation.email)!;
    expect(member.linkedUserId).toBeUndefined();
    f.signIn("user");
    await f.call(me);
    expect(f.rows.get(member._id).linkedUserId).toBeUndefined();
    expect(await f.call(listMine)).toEqual([]);
    expect(await f.call(listPods)).toEqual([]);
    for (const read of [getBundle, podSnapshot]) await expect(f.call(read, { podId })).rejects.toThrow(/member/i);
    f.rows.get("user").emailVerificationTime = 1;
    await f.call(me);
    expect(f.rows.get(member._id).linkedUserId).toBe("user");
    for (const read of [getBundle, podSnapshot]) await expect(f.call(read, { podId })).resolves.toBeDefined();
  });
});

async function podFixture() {
  const f = portfolioFixture(true); f.signIn("owner");
  const { id: podId } = await f.call(create, { name: "Private pod", currency: "EUR", members: [{ displayName: "Recipient", email: invitation.email, role: "editor" }] });
  const members = f.all("podMembers");
  return { f, podId, owner: members.find(m => m.role === "owner")!, member: members.find(m => m.role === "editor")! };
}

describe("pod withdrawal revokes caller authority, not history", () => {
  for (const exit of ["owner removal", "self leave"]) {
    it(`${exit} denies both registered read and delete paths for new records`, async () => {
      const { f, podId, owner, member } = await podFixture();
      if (exit === "owner removal") await f.call(removeMember, { memberId: member._id });
      else { f.signIn("user"); await f.call(leaveMoneyPod, { podId }); }
      expect(f.rows.get(member._id)).toMatchObject({ active: false, linkedUserId: "user", role: "editor" });
      f.signIn("owner");
      const { id: expenseId } = await f.call(addExpense, { podId, paidByMemberId: owner._id, participantMemberIds: [owner._id], amount: 9, currency: "EUR", description: "Post-exit sentinel", occurredAt: Date.now(), splitMode: "equal_people" });
      await expect(f.call(getBundle, { podId })).resolves.toMatchObject({ expenses: [expect.objectContaining({ _id: expenseId })] });
      f.signIn("user");
      for (const read of [getBundle, podSnapshot]) await expect(f.call(read, { podId })).rejects.toThrow(/member/i);
      for (const remove of [removeExpense, deleteExpense]) await expect(f.call(remove, { expenseId })).rejects.toThrow(/member/i);
      expect(f.rows.has(expenseId)).toBe(true);
      expect(await f.call(listMine)).toEqual([]);
      expect(await f.call(listPods)).toEqual([]);
      expect(f.rows.has(member._id)).toBe(true);
    });
  }
  it("a valid code can explicitly reactivate a tombstone without changing the historical member id", async () => {
    const { f, podId, member } = await podFixture();
    await f.call(removeMember, { memberId: member._id });
    f.seed("podInvites", "code", { podId, codeHash: await sha256Hex("synthetic-code"), expiresAt: Date.now() + 60_000, revoked: false });
    f.signIn("user");
    expect(await f.call(joinPodByCode, { code: "synthetic-code" })).toMatchObject({ memberId: member._id });
    await expect(f.call(getBundle, { podId })).resolves.toBeDefined();
  });
  it("never uses a verified email fallback to claim another linked identity", async () => {
    const { f, podId, member } = await podFixture();
    f.seed("users", "other", { email: invitation.email, emailVerificationTime: 1 }); f.signIn("other");
    for (const read of [getBundle, podSnapshot]) await expect(f.call(read, { podId })).rejects.toThrow(/member/i);
    expect(f.rows.get(member._id).linkedUserId).toBe("user");
  });
});
