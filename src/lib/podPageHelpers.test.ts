import { describe, expect, it } from "vitest";
import {
  addCardTaskLabel,
  balanceStatusForRow,
  buildMemberLabelMap,
  buildSuggestedInvitePeople,
  displayNameFromEmail,
  formatCompactAmount,
  historyCountKey,
  inferSharedExpenseEmoji,
  initialsFor,
  isEmailLike,
  parseEmailList,
  parseQuickExpense,
  parseQuickExpenseList,
  settlementTransferKey,
  template
} from "./podPageHelpers";
import type { PodGroup, PodMember, User } from "./types";

function member(overrides: Partial<PodMember> & Pick<PodMember, "id" | "displayName">): PodMember {
  return {
    podId: "pod-1",
    role: "editor",
    createdAt: 0,
    ...overrides
  } as PodMember;
}

describe("parseQuickExpense", () => {
  it("splits a description and trailing amount", () => {
    expect(parseQuickExpense("coffee 5")).toEqual({ description: "coffee", amount: 5 });
  });

  it("accepts comma decimals", () => {
    expect(parseQuickExpense("taxi 18,50")).toEqual({ description: "taxi", amount: 18.5 });
  });

  it("strips trailing separators from the description", () => {
    expect(parseQuickExpense("groceries — 45")).toEqual({ description: "groceries", amount: 45 });
  });

  it("returns null amount for text without a number", () => {
    expect(parseQuickExpense("just words")).toEqual({ description: "just words", amount: null });
  });

  it("rejects non-positive amounts", () => {
    expect(parseQuickExpense("refund -10").amount).toBeNull();
  });

  it("handles empty input", () => {
    expect(parseQuickExpense("  ")).toEqual({ description: "", amount: null });
  });
});

describe("parseQuickExpenseList", () => {
  it("splits on newlines and semicolons", () => {
    expect(parseQuickExpenseList("coffee 5\ntaxi 18; dinner 80")).toEqual([
      { description: "coffee", amount: 5 },
      { description: "taxi", amount: 18 },
      { description: "dinner", amount: 80 }
    ]);
  });

  it("splits on commas only before non-numeric text", () => {
    expect(parseQuickExpenseList("coffee 5, taxi 18")).toEqual([
      { description: "coffee", amount: 5 },
      { description: "taxi", amount: 18 }
    ]);
    // The comma inside "18,50" is a decimal separator, not an item break.
    expect(parseQuickExpenseList("taxi 18,50")).toEqual([
      { description: "taxi", amount: 18.5 }
    ]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseQuickExpenseList("   ")).toEqual([]);
  });
});

describe("formatCompactAmount", () => {
  it("keeps integers compact and shows cents otherwise", () => {
    expect(formatCompactAmount(45)).toBe("45");
    expect(formatCompactAmount(18.5)).toBe("18.50");
  });
});

describe("template", () => {
  it("replaces every occurrence of each placeholder", () => {
    expect(template("{name} owes {name} nothing", { name: "Ari" })).toBe(
      "Ari owes Ari nothing"
    );
  });
});

describe("balanceStatusForRow", () => {
  it("treats tiny nets as square", () => {
    expect(balanceStatusForRow({ memberId: "m1", net: 0.004 } as never, "EUR")).toMatchObject({
      label: "square",
      tone: "positive",
      amount: 0
    });
    expect(balanceStatusForRow(undefined, "EUR").label).toBe("square");
  });

  it("labels positive nets as gets and negative as owes", () => {
    expect(balanceStatusForRow({ memberId: "m1", net: 25 } as never, "USD")).toMatchObject({
      tone: "brand",
      amount: 25
    });
    expect(balanceStatusForRow({ memberId: "m1", net: -25 } as never, "USD")).toMatchObject({
      tone: "info",
      amount: 25
    });
  });

  it("keeps cents in the gets/owes labels", () => {
    expect(balanceStatusForRow({ memberId: "m1", net: 21.25 } as never, "USD").label).toBe(
      "gets $21.25"
    );
    expect(balanceStatusForRow({ memberId: "m1", net: -42.5 } as never, "USD").label).toBe(
      "owes $42.50"
    );
  });
});

describe("addCardTaskLabel", () => {
  const me = { id: "u1", displayName: "Maks", email: "me@example.com" } as User;

  it("says 'Add your card' when the cardless member is me", () => {
    expect(addCardTaskLabel(member({ id: "m1", displayName: "Maks", linkedUserId: "u1" }), me)).toBe(
      "Add your card"
    );
  });

  it("uses the member's name otherwise", () => {
    expect(addCardTaskLabel(member({ id: "m2", displayName: "Lena" }), me)).toBe(
      "Add Lena's card"
    );
  });
});

describe("historyCountKey", () => {
  it("selects singular and plural variants in English", () => {
    expect(historyCountKey("expenses", 1, "en")).toBe("pod.historyExpensesOne");
    expect(historyCountKey("expenses", 2, "en")).toBe("pod.historyExpensesMany");
    expect(historyCountKey("settlements", 1, "en")).toBe("pod.historySettlementsOne");
    expect(historyCountKey("settlements", 5, "en")).toBe("pod.historySettlementsMany");
  });

  it("handles Russian one/few/many forms", () => {
    expect(historyCountKey("expenses", 1, "ru")).toBe("pod.historyExpensesOne");
    expect(historyCountKey("expenses", 2, "ru")).toBe("pod.historyExpensesFew");
    expect(historyCountKey("expenses", 5, "ru")).toBe("pod.historyExpensesMany");
    expect(historyCountKey("expenses", 21, "ru")).toBe("pod.historyExpensesOne");
  });

  it("falls back to one/many when the locale is invalid", () => {
    expect(historyCountKey("expenses", 1, "")).toBe("pod.historyExpensesOne");
    expect(historyCountKey("expenses", 3, "")).toBe("pod.historyExpensesMany");
  });
});

describe("initialsFor", () => {
  it("uses first letters of the first two words", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
  });

  it("uses two letters of a single word", () => {
    expect(initialsFor("ada")).toBe("AD");
  });

  it("falls back to ? for blank labels", () => {
    expect(initialsFor("   ")).toBe("?");
  });
});

describe("inferSharedExpenseEmoji", () => {
  it("maps common descriptions to emoji", () => {
    expect(inferSharedExpenseEmoji("Monthly rent")).toBe("🏠");
    expect(inferSharedExpenseEmoji("Grocery run")).toBe("🛒");
    expect(inferSharedExpenseEmoji("Coffee with Sam")).toBe("🍽️");
    expect(inferSharedExpenseEmoji("misc")).toBe("🧾");
  });
});

describe("buildMemberLabelMap", () => {
  it("labels grouped members with the group name", () => {
    const members = [
      member({ id: "m1", displayName: "Sam", groupId: "g1" }),
      member({ id: "m2", displayName: "Arseny" })
    ];
    const groups = [{ id: "g1", podId: "pod-1", name: "Family A", createdAt: 0 } as PodGroup];
    const labels = buildMemberLabelMap(members, groups);
    expect(labels.get("m1")).toBe("Family A");
    expect(labels.get("m2")).toBe("Arseny");
  });

  it("falls back to the display name when the group is missing", () => {
    const members = [member({ id: "m1", displayName: "Sam", groupId: "gone" })];
    expect(buildMemberLabelMap(members, []).get("m1")).toBe("Sam");
  });
});

describe("parseEmailList", () => {
  it("splits, trims, lowercases, and dedupes", () => {
    expect(parseEmailList("A@b.co, a@b.co\n c@d.io ; ")).toEqual(["a@b.co", "c@d.io"]);
  });
});

describe("isEmailLike / displayNameFromEmail", () => {
  it("validates plausible emails", () => {
    expect(isEmailLike("user@host.io")).toBe(true);
    expect(isEmailLike("not-an-email")).toBe(false);
    expect(isEmailLike(undefined)).toBe(false);
  });

  it("derives a readable name from the local part", () => {
    expect(displayNameFromEmail("ada.lovelace@math.org")).toBe("ada lovelace");
    expect(displayNameFromEmail("@host")).toBe("@host");
  });
});

describe("settlementTransferKey", () => {
  it("is stable for equal transfers", () => {
    const a = { fromMemberId: "m1", toMemberId: "m2", amount: 12.345 };
    const b = { fromMemberId: "m1", toMemberId: "m2", amount: 12.345 };
    expect(settlementTransferKey(a)).toBe(settlementTransferKey(b));
    expect(settlementTransferKey(a)).toBe("m1-m2-12.35");
  });
});

describe("buildSuggestedInvitePeople", () => {
  const me: User = {
    id: "u-me",
    displayName: "Me",
    email: "me@numa.app"
  } as User;

  it("excludes the current user and already-typed emails, prefers higher-score sources", () => {
    const suggestions = buildSuggestedInvitePeople({
      currentUserId: me.id,
      currentUserEmail: me.email,
      typedEmails: ["typed@x.io"],
      localUsers: [
        me,
        { id: "u2", displayName: "Local User", email: "shared@x.io" } as User
      ],
      localPodMembers: [member({ id: "m1", displayName: "Member Name", email: "shared@x.io" })],
      cloudPodData: [
        { members: [member({ id: "m2", displayName: "Cloud Name", email: "shared@x.io" })] }
      ]
    });
    expect(suggestions).toHaveLength(1);
    // Cloud pods score highest, so the cloud display name wins for the email.
    expect(suggestions[0]).toMatchObject({ email: "shared@x.io", displayName: "Cloud Name" });
  });

  it("derives a display name from the email when none is known", () => {
    const suggestions = buildSuggestedInvitePeople({
      currentUserId: me.id,
      currentUserEmail: me.email,
      typedEmails: [],
      localUsers: [],
      localPodMembers: [member({ id: "m1", displayName: "", email: "jo.doe@x.io" })],
      cloudPodData: []
    });
    expect(suggestions[0]?.displayName).toBe("jo doe");
  });
});
