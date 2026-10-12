import { describe, expect, it } from "vitest";
import { computePodSettlement } from "./podSettlement";
import type { PodExpense, PodGroup, PodMember, PodSettlement } from "./types";

const NOW = new Date("2026-05-15T12:00:00Z").getTime();
const podId = "pod_home";

const groups: PodGroup[] = [
  { id: "g_a", podId, name: "Arseny + Maya", color: "mint" },
  { id: "g_b", podId, name: "Sam + Kim", color: "lavender" }
];

const members: PodMember[] = [
  { id: "m_arseny", podId, displayName: "Arseny", groupId: "g_a", role: "owner", joinedAt: NOW },
  { id: "m_maya", podId, displayName: "Maya", groupId: "g_a", role: "editor", joinedAt: NOW },
  { id: "m_sam", podId, displayName: "Sam", groupId: "g_b", role: "editor", joinedAt: NOW },
  { id: "m_kim", podId, displayName: "Kim", groupId: "g_b", role: "editor", joinedAt: NOW }
];

function expense(partial: Partial<PodExpense>): PodExpense {
  return {
    id: partial.id ?? "pe_1",
    podId,
    paidByMemberId: partial.paidByMemberId ?? "m_arseny",
    amount: partial.amount ?? 0,
    currency: partial.currency ?? "EUR",
    description: partial.description ?? "Groceries",
    occurredAt: partial.occurredAt ?? NOW,
    splitMode: partial.splitMode ?? "equal_people",
    participantMemberIds: partial.participantMemberIds ?? members.map((m) => m.id),
    customSplits: partial.customSplits,
    coveredGroupId: partial.coveredGroupId
  };
}

describe("computePodSettlement", () => {
  it("splits a shared expense equally between people", () => {
    const result = computePodSettlement(
      members,
      groups,
      [expense({ amount: 120, paidByMemberId: "m_arseny" })],
      [],
      { rates: null, currency: "EUR" }
    );
    const arseny = result.rows.find((r) => r.memberId === "m_arseny")!;
    expect(arseny.paid).toBe(120);
    expect(arseny.share).toBe(30);
    expect(arseny.net).toBe(90);
    expect(result.transfers).toHaveLength(3);
  });

  it("splits equally between families/groups", () => {
    const result = computePodSettlement(
      members,
      groups,
      [expense({ amount: 100, splitMode: "equal_groups" })],
      [],
      { rates: null, currency: "EUR" }
    );
    expect(result.rows.find((r) => r.memberId === "m_arseny")!.share).toBe(25);
    expect(result.rows.find((r) => r.memberId === "m_sam")!.share).toBe(25);
  });

  it("labels transfers by family group when members belong to groups", () => {
    const result = computePodSettlement(
      members,
      groups,
      [
        expense({
          amount: 100,
          paidByMemberId: "m_arseny",
          splitMode: "custom",
          participantMemberIds: ["m_arseny", "m_sam"],
          customSplits: [
            { memberId: "m_arseny", bps: 5000 },
            { memberId: "m_sam", bps: 5000 }
          ]
        })
      ],
      [],
      { rates: null, currency: "EUR" }
    );
    expect(result.transfers[0]).toMatchObject({
      fromName: "Sam + Kim",
      toName: "Arseny + Maya",
      amount: 50
    });
  });

  it("treats custom split bps as literal basis points, not normalized weights", () => {
    const result = computePodSettlement(
      members,
      groups,
      [
        expense({
          amount: 100,
          paidByMemberId: "m_arseny",
          splitMode: "custom",
          participantMemberIds: ["m_arseny", "m_sam"],
          customSplits: [
            { memberId: "m_arseny", bps: 3000 },
            { memberId: "m_sam", bps: 5000 }
          ]
        })
      ],
      [],
      { rates: null, currency: "EUR" }
    );

    expect(result.rows.find((r) => r.memberId === "m_arseny")!.share).toBe(30);
    expect(result.rows.find((r) => r.memberId === "m_sam")!.share).toBe(50);
  });

  it("applies settlements against the final balance", () => {
    const settlements: PodSettlement[] = [
      {
        id: "ps_1",
        podId,
        fromMemberId: "m_sam",
        toMemberId: "m_arseny",
        amount: 30,
        currency: "EUR",
        occurredAt: NOW
      }
    ];
    const result = computePodSettlement(
      members,
      groups,
      [expense({ amount: 120, paidByMemberId: "m_arseny" })],
      settlements,
      { rates: null, currency: "EUR" }
    );
    expect(result.rows.find((r) => r.memberId === "m_arseny")!.net).toBe(60);
    expect(result.rows.find((r) => r.memberId === "m_sam")!.net).toBe(0);
  });

  it("recomputes balances after an expense edit or delete", () => {
    const edited = computePodSettlement(
      members,
      groups,
      [expense({ amount: 80, paidByMemberId: "m_arseny" })],
      [],
      { rates: null, currency: "EUR" }
    );
    expect(edited.totalExpenses).toBe(80);
    expect(edited.rows.find((r) => r.memberId === "m_arseny")!.net).toBe(60);

    const deleted = computePodSettlement(members, groups, [], [], {
      rates: null,
      currency: "EUR"
    });
    expect(deleted.totalExpenses).toBe(0);
    expect(deleted.rows.every((row) => row.net === 0)).toBe(true);
  });

  it("falls back to people split when a covered group is unlinked", () => {
    const result = computePodSettlement(
      members.map((member) =>
        member.groupId === "g_b" ? { ...member, groupId: undefined } : member
      ),
      groups.filter((group) => group.id !== "g_b"),
      [
        expense({
          amount: 100,
          splitMode: "covered_group",
          coveredGroupId: undefined
        })
      ],
      [],
      { rates: null, currency: "EUR" }
    );
    expect(result.rows.find((r) => r.memberId === "m_arseny")!.share).toBe(25);
    expect(result.rows.find((r) => r.memberId === "m_kim")!.share).toBe(25);
  });

  it("keeps separate balances and party ids for ungrouped members sharing a display name", () => {
    const alexes: PodMember[] = [
      { id: "m_alex_1", podId, displayName: "Alex", role: "owner", joinedAt: NOW },
      { id: "m_alex_2", podId, displayName: "Alex", role: "editor", joinedAt: NOW }
    ];
    const result = computePodSettlement(
      alexes,
      [],
      [
        expense({
          amount: 100,
          paidByMemberId: "m_alex_1",
          participantMemberIds: ["m_alex_1", "m_alex_2"]
        })
      ],
      [],
      { rates: null, currency: "EUR" }
    );

    const payer = result.rows.find((r) => r.memberId === "m_alex_1")!;
    const ower = result.rows.find((r) => r.memberId === "m_alex_2")!;
    expect(payer.net).toBe(50);
    expect(ower.net).toBe(-50);
    expect(payer.partyId).toBe("m_alex_1");
    expect(ower.partyId).toBe("m_alex_2");

    expect(result.transfers).toEqual([
      {
        fromMemberId: "m_alex_2",
        toMemberId: "m_alex_1",
        fromPartyId: "m_alex_2",
        toPartyId: "m_alex_1",
        fromName: "Alex",
        toName: "Alex",
        amount: 50
      }
    ]);
  });

  it("uses the group id as the party id for grouped members", () => {
    const result = computePodSettlement(
      members,
      groups,
      [
        expense({
          amount: 100,
          paidByMemberId: "m_arseny",
          splitMode: "custom",
          participantMemberIds: ["m_arseny", "m_sam"],
          customSplits: [
            { memberId: "m_arseny", bps: 5000 },
            { memberId: "m_sam", bps: 5000 }
          ]
        })
      ],
      [],
      { rates: null, currency: "EUR" }
    );

    expect(result.rows.find((r) => r.memberId === "m_arseny")!.partyId).toBe("g_a");
    expect(result.rows.find((r) => r.memberId === "m_sam")!.partyId).toBe("g_b");
    expect(result.transfers[0]).toMatchObject({
      fromPartyId: "g_b",
      toPartyId: "g_a"
    });
  });

  it("honors the covered group when participant ids drift out of sync", () => {
    const result = computePodSettlement(
      members,
      groups,
      [
        expense({
          amount: 100,
          paidByMemberId: "m_arseny",
          splitMode: "covered_group",
          coveredGroupId: "g_b",
          participantMemberIds: ["m_arseny"]
        })
      ],
      [],
      { rates: null, currency: "EUR" }
    );

    expect(result.rows.find((r) => r.memberId === "m_arseny")!.share).toBe(0);
    expect(result.rows.find((r) => r.memberId === "m_sam")!.share).toBe(50);
    expect(result.rows.find((r) => r.memberId === "m_kim")!.share).toBe(50);
    const familyTransfers = result.transfers.filter(
      (transfer) =>
        transfer.fromName === "Sam + Kim" && transfer.toName === "Arseny + Maya"
    );
    expect(familyTransfers.reduce((sum, transfer) => sum + transfer.amount, 0)).toBe(100);
  });
});
