import { describe, expect, it } from "vitest";
import { podBalances, podSettlementSummary } from "./mobileSupport";

const member = (id: string, displayName: string, groupId?: string) =>
  ({ _id: id, podId: "pod", displayName, groupId, role: "editor", joinedAt: 0 }) as any;
const group = (id: string, name: string) => ({ _id: id, podId: "pod", name }) as any;
const expense = (paidByMemberId: string, amount: number, participantMemberIds: string[]) =>
  ({ _id: `e-${paidByMemberId}`, podId: "pod", paidByMemberId, amount, currency: "USD", description: "Dinner", occurredAt: 1, splitMode: "equal_people", participantMemberIds }) as any;

describe("pod settlement parties", () => {
  it("keeps two members with the same name apart", () => {
    const members = [member("me", "Alex"), member("other", "Alex")];
    const balances = podBalances(members, [expense("other", 40, ["me", "other"])], [], [], "USD");
    const summary = podSettlementSummary("me" as any, members, [], balances, "USD");
    expect(summary).toMatchObject({
      state: "user_owes",
      counterpartyName: "Alex",
      amount: 20,
      label: "You owe Alex",
      recommendedSettlementDraft: { fromMemberId: "me", toMemberId: "other", amount: 20, currency: "USD" }
    });
    expect(summary.transfers).toEqual([{ fromMemberId: "me", toMemberId: "other", fromName: "Alex", toName: "Alex", amount: 20 }]);
  });

  it("keeps a group apart from a member who shares its name", () => {
    const groups = [group("g", "Kim")];
    const members = [member("me", "Robin", "g"), member("partner", "Lee", "g"), member("kim", "Kim")];
    const balances = podBalances(members, [expense("kim", 30, ["me", "partner", "kim"])], [], groups, "USD");
    const summary = podSettlementSummary("me" as any, members, groups, balances, "USD");
    expect(summary).toMatchObject({ state: "user_owes", counterpartyName: "Kim", amount: 20 });
  });
});

describe("pod balances currency", () => {
  it("labels balances with the pod's currency before any expense exists", () => {
    const balances = podBalances([member("me", "Alex")], [], [], [], "USD");
    expect(balances).toEqual([{ memberId: "me", amount: 0, currency: "USD" }]);
  });
});
