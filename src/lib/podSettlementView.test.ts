import { describe, expect, it } from "vitest";
import {
  buildMyPodSettlementView,
  buildPartySettlementTransfers,
  isActionablePodTransfer
} from "./podSettlementView";
import type { PodSettlementSummary } from "./podSettlement";

const summary: PodSettlementSummary = {
  totalExpenses: 100,
  rows: [
    {
      memberId: "m_me",
      displayName: "Me",
      partyId: "m_me",
      paid: 0,
      share: 0,
      settledOut: 0,
      settledIn: 0,
      net: 0
    }
  ],
  transfers: [
    {
      fromMemberId: "m_me",
      toMemberId: "m_alex",
      fromPartyId: "m_me",
      toPartyId: "m_alex",
      fromName: "Me",
      toName: "Alex",
      amount: 42
    },
    {
      fromMemberId: "m_maya2",
      toMemberId: "m_me",
      fromPartyId: "m_maya2",
      toPartyId: "m_me",
      fromName: "Maya",
      toName: "Me",
      amount: 18
    }
  ]
};

describe("buildMyPodSettlementView", () => {
  it("labels the largest transfer when the user owes someone", () => {
    const view = buildMyPodSettlementView(summary, "m_me", "EUR");
    expect(view.state).toBe("user_owes");
    expect(view.label).toBe("You owe Alex");
    expect(view.amount).toBe(42);
    expect(view.recommendedSettlementDraft?.toMemberId).toBe("m_alex");
  });

  it("labels money owed to the user", () => {
    const view = buildMyPodSettlementView(
      { ...summary, transfers: [summary.transfers[1]!] },
      "m_me",
      "EUR"
    );
    expect(view.state).toBe("owed_to_user");
    expect(view.label).toBe("Maya owes you");
  });

  it("returns a settled state when there is no user transfer", () => {
    const view = buildMyPodSettlementView(
      { rows: summary.rows, transfers: [], totalExpenses: 0 },
      "m_me",
      "EUR"
    );
    expect(view.state).toBe("settled");
    expect(view.label).toBe("All settled");
  });

  it("aggregates transfers by the user's family group", () => {
    const view = buildMyPodSettlementView(
      {
        totalExpenses: 100,
        rows: [
          {
            memberId: "m_arseny",
            displayName: "Arseny",
            groupName: "Arseny + Maya",
            partyId: "g_a",
            paid: 0,
            share: 0,
            settledOut: 0,
            settledIn: 0,
            net: 0
          },
          {
            memberId: "m_maya",
            displayName: "Maya",
            groupName: "Arseny + Maya",
            partyId: "g_a",
            paid: 0,
            share: 0,
            settledOut: 0,
            settledIn: 0,
            net: 0
          }
        ],
        transfers: [
          {
            fromMemberId: "m_sam",
            toMemberId: "m_arseny",
            fromPartyId: "g_b",
            toPartyId: "g_a",
            fromName: "Sam + Kim",
            toName: "Arseny + Maya",
            amount: 50
          },
          {
            fromMemberId: "m_kim",
            toMemberId: "m_maya",
            fromPartyId: "g_b",
            toPartyId: "g_a",
            fromName: "Sam + Kim",
            toName: "Arseny + Maya",
            amount: 50
          }
        ]
      },
      "m_arseny",
      "EUR"
    );

    expect(view.state).toBe("owed_to_user");
    expect(view.label).toBe("Sam + Kim owes you");
    expect(view.amount).toBe(100);
    expect(view.recommendedSettlementDraft).toBeUndefined();
  });

  it("does not show same-family transfers as money owed to yourself", () => {
    const view = buildMyPodSettlementView(
      {
        totalExpenses: 100,
        rows: [
          {
            memberId: "m_arseny",
            displayName: "Arseny",
            groupName: "Arseny + Maya",
            partyId: "g_a",
            paid: 0,
            share: 0,
            settledOut: 0,
            settledIn: 0,
            net: 0
          },
          {
            memberId: "m_maya",
            displayName: "Maya",
            groupName: "Arseny + Maya",
            partyId: "g_a",
            paid: 0,
            share: 0,
            settledOut: 0,
            settledIn: 0,
            net: 0
          }
        ],
        transfers: [
          {
            fromMemberId: "m_maya",
            toMemberId: "m_arseny",
            fromPartyId: "g_a",
            toPartyId: "g_a",
            fromName: "Arseny + Maya",
            toName: "Arseny + Maya",
            amount: 25
          }
        ]
      },
      "m_arseny",
      "EUR"
    );

    expect(view.state).toBe("settled");
    expect(view.label).toBe("All settled");
  });

  it("nets opposite member-level transfers between the same two family groups", () => {
    const view = buildMyPodSettlementView(
      {
        totalExpenses: 200,
        rows: [
          {
            memberId: "m_arseny",
            displayName: "Arseny",
            groupName: "Arseny + Maya",
            partyId: "g_a",
            paid: 0,
            share: 0,
            settledOut: 0,
            settledIn: 0,
            net: 0
          }
        ],
        transfers: [
          {
            fromMemberId: "m_sam",
            toMemberId: "m_arseny",
            fromPartyId: "g_b",
            toPartyId: "g_a",
            fromName: "Sam + Kim",
            toName: "Arseny + Maya",
            amount: 100
          },
          {
            fromMemberId: "m_maya",
            toMemberId: "m_kim",
            fromPartyId: "g_a",
            toPartyId: "g_b",
            fromName: "Arseny + Maya",
            toName: "Sam + Kim",
            amount: 80
          }
        ]
      },
      "m_arseny",
      "EUR"
    );

    expect(view.state).toBe("owed_to_user");
    expect(view.label).toBe("Sam + Kim owes you");
    expect(view.amount).toBe(20);
    expect(view.recommendedSettlementDraft).toBeUndefined();
  });

  it("marks same-party transfers as not actionable for settlement UI", () => {
    expect(
      isActionablePodTransfer({
        fromName: "Arseny + Maya",
        toName: "Arseny + Maya"
      })
    ).toBe(false);
    expect(
      isActionablePodTransfer({
        fromName: "Sam + Kim",
        toName: "Arseny + Maya"
      })
    ).toBe(true);
  });

  it("treats same-name transfers between distinct parties as actionable", () => {
    expect(
      isActionablePodTransfer({
        fromName: "Alex",
        toName: "Alex",
        fromPartyId: "m_alex_1",
        toPartyId: "m_alex_2"
      })
    ).toBe(true);
    expect(
      isActionablePodTransfer({
        fromName: "Arseny + Maya",
        toName: "Arseny + Maya",
        fromPartyId: "g_a",
        toPartyId: "g_a"
      })
    ).toBe(false);
  });

  it("nets party transfers before showing settle actions", () => {
    const transfers = buildPartySettlementTransfers({
      totalExpenses: 200,
      rows: [],
      transfers: [
        {
          fromMemberId: "m_sam",
          toMemberId: "m_arseny",
          fromPartyId: "g_b",
          toPartyId: "g_a",
          fromName: "Sam + Kim",
          toName: "Arseny + Maya",
          amount: 100
        },
        {
          fromMemberId: "m_maya",
          toMemberId: "m_kim",
          fromPartyId: "g_a",
          toPartyId: "g_b",
          fromName: "Arseny + Maya",
          toName: "Sam + Kim",
          amount: 80
        }
      ]
    });

    expect(transfers).toEqual([
      {
        fromMemberId: "m_sam",
        toMemberId: "m_arseny",
        fromPartyId: "g_b",
        toPartyId: "g_a",
        fromName: "Sam + Kim",
        toName: "Arseny + Maya",
        amount: 20
      }
    ]);
  });

  it("keeps two ungrouped members with the same display name as separate parties", () => {
    const collidingSummary: PodSettlementSummary = {
      totalExpenses: 100,
      rows: [
        {
          memberId: "m_me",
          displayName: "Me",
          partyId: "m_me",
          paid: 0,
          share: 0,
          settledOut: 0,
          settledIn: 0,
          net: 50
        }
      ],
      transfers: [
        {
          fromMemberId: "m_alex_1",
          toMemberId: "m_me",
          fromPartyId: "m_alex_1",
          toPartyId: "m_me",
          fromName: "Alex",
          toName: "Me",
          amount: 30
        },
        {
          fromMemberId: "m_alex_2",
          toMemberId: "m_me",
          fromPartyId: "m_alex_2",
          toPartyId: "m_me",
          fromName: "Alex",
          toName: "Me",
          amount: 20
        }
      ]
    };

    const transfers = buildPartySettlementTransfers(collidingSummary);
    expect(transfers).toEqual([
      {
        fromMemberId: "m_alex_1",
        toMemberId: "m_me",
        fromPartyId: "m_alex_1",
        toPartyId: "m_me",
        fromName: "Alex",
        toName: "Me",
        amount: 30
      },
      {
        fromMemberId: "m_alex_2",
        toMemberId: "m_me",
        fromPartyId: "m_alex_2",
        toPartyId: "m_me",
        fromName: "Alex",
        toName: "Me",
        amount: 20
      }
    ]);

    const view = buildMyPodSettlementView(collidingSummary, "m_me", "EUR");
    expect(view.state).toBe("owed_to_user");
    expect(view.amount).toBe(30);
    expect(view.recommendedSettlementDraft?.fromMemberId).toBe("m_alex_1");
    expect(view.recommendedSettlementDraft?.toMemberId).toBe("m_me");
  });

  it("does not misattribute a counterparty sharing the user's display name", () => {
    const view = buildMyPodSettlementView(
      {
        totalExpenses: 100,
        rows: [
          {
            memberId: "m_me",
            displayName: "Alex",
            partyId: "m_me",
            paid: 0,
            share: 0,
            settledOut: 0,
            settledIn: 0,
            net: 50
          }
        ],
        transfers: [
          {
            fromMemberId: "m_other_alex",
            toMemberId: "m_me",
            fromPartyId: "m_other_alex",
            toPartyId: "m_me",
            fromName: "Alex",
            toName: "Alex",
            amount: 50
          }
        ]
      },
      "m_me",
      "EUR"
    );

    expect(view.state).toBe("owed_to_user");
    expect(view.amount).toBe(50);
    expect(view.recommendedSettlementDraft?.fromMemberId).toBe("m_other_alex");
    expect(view.recommendedSettlementDraft?.toMemberId).toBe("m_me");
  });
});
