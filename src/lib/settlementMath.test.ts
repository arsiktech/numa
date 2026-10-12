import { describe, expect, it } from "vitest";
import {
  computeSettlementBalances,
  expenseShareRatios,
  minimizeTransfers,
  type SettlementExpense,
  type SettlementGroup,
  type SettlementMember
} from "../../convex/lib/settlementMath";

/**
 * Pins the canonical settlement math shared by the client preview
 * (src/lib/podSettlement.ts) and the server record (convex/mobile.ts). If
 * either consumer's behavior would drift, these expectations break first.
 */

const groups: SettlementGroup[] = [{ id: "g_a" }, { id: "g_b" }];
const members: SettlementMember[] = [
  { id: "m_arseny", groupId: "g_a" },
  { id: "m_maya", groupId: "g_a" },
  { id: "m_sam", groupId: "g_b" },
  { id: "m_kim", groupId: "g_b" }
];
const allIds = members.map((m) => m.id);

function expense(partial: Partial<SettlementExpense>): SettlementExpense {
  return {
    paidByMemberId: partial.paidByMemberId ?? "m_arseny",
    amount: partial.amount ?? 0,
    splitMode: partial.splitMode ?? "equal_people",
    participantMemberIds: partial.participantMemberIds ?? allIds,
    customSplits: partial.customSplits,
    coveredGroupId: partial.coveredGroupId
  };
}

function ratioMap(expenseInput: SettlementExpense) {
  return new Map(
    expenseShareRatios(expenseInput, members, groups).map((s) => [s.memberId, s.ratio])
  );
}

describe("expenseShareRatios", () => {
  it("splits equally across participants", () => {
    const r = ratioMap(expense({ amount: 120 }));
    expect(r.get("m_arseny")).toBeCloseTo(0.25);
    expect([...r.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("splits equally across groups, with ungrouped members as singleton buckets", () => {
    const r = ratioMap(expense({ amount: 100, splitMode: "equal_groups" }));
    // Two groups → 0.5 per group → 0.25 per member.
    expect(r.get("m_arseny")).toBeCloseTo(0.25);
    expect(r.get("m_sam")).toBeCloseTo(0.25);

    const withSolo = expenseShareRatios(
      // Empty participants means "everyone", so the solo member is included.
      expense({ splitMode: "equal_groups", participantMemberIds: [] }),
      [...members, { id: "m_solo", groupId: null }],
      groups
    );
    const solo = new Map(withSolo.map((s) => [s.memberId, s.ratio]));
    // Three buckets (g_a, g_b, solo) → solo gets a full 1/3.
    expect(solo.get("m_solo")).toBeCloseTo(1 / 3);
    expect(solo.get("m_arseny")).toBeCloseTo(1 / 6);
  });

  it("charges only the covered group", () => {
    const r = ratioMap(expense({ splitMode: "covered_group", coveredGroupId: "g_b" }));
    expect(r.get("m_sam")).toBeCloseTo(0.5);
    expect(r.get("m_kim")).toBeCloseTo(0.5);
    expect(r.get("m_arseny")).toBeUndefined();
  });

  it("falls back to the full covered group when participants drift out of sync", () => {
    const r = ratioMap(
      expense({ splitMode: "covered_group", coveredGroupId: "g_b", participantMemberIds: ["m_arseny"] })
    );
    expect(r.get("m_sam")).toBeCloseTo(0.5);
    expect(r.get("m_kim")).toBeCloseTo(0.5);
  });

  it("treats custom bps as literal basis points and clamps negatives", () => {
    const r = ratioMap(
      expense({
        splitMode: "custom",
        participantMemberIds: ["m_arseny", "m_sam"],
        customSplits: [
          { memberId: "m_arseny", bps: 3000 },
          { memberId: "m_sam", bps: 5000 },
          { memberId: "m_kim", bps: -100 }
        ]
      })
    );
    expect(r.get("m_arseny")).toBeCloseTo(0.3);
    expect(r.get("m_sam")).toBeCloseTo(0.5);
    expect(r.get("m_kim")).toBe(0);
  });

  it("returns nothing when there are no participants", () => {
    expect(expenseShareRatios(expense({ participantMemberIds: ["ghost"] }), members, groups)).toEqual(
      []
    );
  });
});

describe("computeSettlementBalances", () => {
  it("nets paid minus share, then applies settlements", () => {
    const rows = computeSettlementBalances(
      members,
      [expense({ amount: 120, paidByMemberId: "m_arseny" })],
      [{ fromMemberId: "m_sam", toMemberId: "m_arseny", amount: 30 }],
      groups
    );
    const byId = new Map(rows.map((r) => [r.memberId, r]));
    expect(byId.get("m_arseny")!.paid).toBe(120);
    expect(byId.get("m_arseny")!.share).toBe(30);
    // 120 paid − 30 share − 30 settledIn = 60.
    expect(byId.get("m_arseny")!.net).toBe(60);
    expect(byId.get("m_sam")!.net).toBe(0);
  });

  it("sums to zero across all members", () => {
    const rows = computeSettlementBalances(
      members,
      [
        expense({ amount: 90, paidByMemberId: "m_arseny" }),
        expense({ amount: 40, paidByMemberId: "m_sam", participantMemberIds: ["m_sam", "m_kim"] })
      ],
      [],
      groups
    );
    expect(rows.reduce((sum, r) => sum + r.net, 0)).toBeCloseTo(0);
  });
});

describe("minimizeTransfers", () => {
  const rows = [
    { memberId: "m_arseny", net: 90 },
    { memberId: "m_maya", net: -30 },
    { memberId: "m_sam", net: -30 },
    { memberId: "m_kim", net: -30 }
  ];

  it("settles everyone with the fewest transfers, largest first", () => {
    const transfers = minimizeTransfers(rows);
    expect(transfers).toHaveLength(3);
    expect(transfers.every((t) => t.toMemberId === "m_arseny")).toBe(true);
    expect(transfers.reduce((sum, t) => sum + t.amount, 0)).toBeCloseTo(90);
  });

  it("ignores dust below the epsilon", () => {
    expect(
      minimizeTransfers([
        { memberId: "a", net: 0.004 },
        { memberId: "b", net: -0.004 }
      ])
    ).toEqual([]);
  });

  it("rounds emitted amounts when asked", () => {
    const [transfer] = minimizeTransfers(
      [
        { memberId: "a", net: 33.335 },
        { memberId: "b", net: -33.335 }
      ],
      { round: true }
    );
    expect(transfer!.amount).toBe(33.34);
  });

  it("consumes but never emits transfers within the same party", () => {
    // A couple: arseny is owed, maya owes — they must not pay each other,
    // and the rest should still settle to the couple as a whole.
    const transfers = minimizeTransfers(
      [
        { memberId: "m_arseny", net: 60 },
        { memberId: "m_maya", net: -20 },
        { memberId: "m_sam", net: -40 }
      ],
      { partyKeyOf: (id) => (id === "m_arseny" || id === "m_maya" ? "couple_a" : id) }
    );
    expect(transfers.some((t) => t.fromMemberId === "m_maya" && t.toMemberId === "m_arseny")).toBe(
      false
    );
    expect(transfers.some((t) => t.fromMemberId === "m_sam")).toBe(true);
  });
});

/**
 * Member-exit (tombstone model) regression tests. When a member leaves a pot or
 * the owner removes them (convex/moneyPods.ts `leaveMoneyPod` / `removeMember`)
 * the row is kept as a tombstone and still fed to this math, instead of being
 * hard-deleted. These pin the three QA findings (2026-06-24): a removed payer's
 * outlay must not vanish, a custom split must stay fully allocated, and a
 * recorded settlement must survive so the counterparty's net is untouched. Each
 * test also reproduces the OLD broken behavior to show what tombstoning fixes.
 */
describe("member exit preserves settlement correctness", () => {
  it("keeps balances net to zero when the payer is a removed member", () => {
    // m_sam paid €120, split equally across all four, then leaves.
    const expenses = [expense({ amount: 120, paidByMemberId: "m_sam" })];

    // Tombstone: m_sam's row stays in the inputs, so their €120 credit
    // survives — the pod still nets to zero and they're owed their €90.
    const tombstoned = computeSettlementBalances(members, expenses, [], groups);
    expect(tombstoned.reduce((sum, r) => sum + r.net, 0)).toBeCloseTo(0);
    expect(tombstoned.find((r) => r.memberId === "m_sam")!.net).toBeCloseTo(90);

    // Old bug: hard-deleting the payer row drops the €120 paid credit while the
    // survivors still accrue their share, so the ledger no longer sums to zero —
    // money owed to the departed payer simply disappears.
    const hardDeleted = computeSettlementBalances(
      members.filter((m) => m.id !== "m_sam"),
      expenses,
      [],
      groups
    );
    expect(hardDeleted.reduce((sum, r) => sum + r.net, 0)).not.toBeCloseTo(0);
  });

  it("keeps a custom-split expense fully allocated after a participant is removed", () => {
    // €100 split 50/30/20 across three members; the 20% member then leaves.
    const fullSplit = expense({
      amount: 100,
      paidByMemberId: "m_arseny",
      splitMode: "custom",
      participantMemberIds: ["m_arseny", "m_maya", "m_kim"],
      customSplits: [
        { memberId: "m_arseny", bps: 5000 },
        { memberId: "m_maya", bps: 3000 },
        { memberId: "m_kim", bps: 2000 }
      ]
    });

    // Tombstone: m_kim's row and the untouched customSplits (sum 10000) remain,
    // so the full €100 is allocated and the pod nets to zero — m_kim still owes
    // their €20 even after leaving.
    const tombstoned = computeSettlementBalances(members, [fullSplit], [], groups);
    expect(tombstoned.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(100);
    expect(tombstoned.reduce((sum, r) => sum + r.net, 0)).toBeCloseTo(0);
    expect(tombstoned.find((r) => r.memberId === "m_kim")!.share).toBeCloseTo(20);

    // Old bug: filtering m_kim out of customSplits without renormalizing leaves
    // bps summing to 8000, so only €80 is charged — €20 vanishes from the ledger.
    const underAllocated = expense({
      amount: 100,
      paidByMemberId: "m_arseny",
      splitMode: "custom",
      participantMemberIds: ["m_arseny", "m_maya"],
      customSplits: [
        { memberId: "m_arseny", bps: 5000 },
        { memberId: "m_maya", bps: 3000 }
      ]
    });
    const broken = computeSettlementBalances(members, [underAllocated], [], groups);
    expect(broken.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(80);
    expect(broken.reduce((sum, r) => sum + r.net, 0)).not.toBeCloseTo(0);
  });

  it("preserves a counterparty's net when a member they settled with leaves", () => {
    // m_arseny paid a €120 group dinner (net +90); m_maya paid them €30 back.
    const expenses = [expense({ amount: 120, paidByMemberId: "m_arseny" })];
    const settlement = { fromMemberId: "m_maya", toMemberId: "m_arseny", amount: 30 };

    // Tombstone: the settlement row survives m_maya's exit, so m_arseny keeps
    // the €30 they were paid — their net stays at €60.
    const preserved = computeSettlementBalances(members, expenses, [settlement], groups);
    expect(preserved.find((r) => r.memberId === "m_arseny")!.net).toBeCloseTo(60);

    // Old bug: deleting every settlement touching the leaver erases the recorded
    // payment, swinging m_arseny's net back to €90 — a real-world payment is lost
    // and an already-settled debt reappears.
    const deleted = computeSettlementBalances(members, expenses, [], groups);
    expect(deleted.find((r) => r.memberId === "m_arseny")!.net).toBeCloseTo(90);
  });
});
