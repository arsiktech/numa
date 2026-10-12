import type { I18nKey } from "@/lib/i18n";
import { formatMoneyDecimal } from "@/lib/money";
import type { PodBalanceRow } from "@/lib/podSettlement";
import type { buildMyPodSettlementView } from "@/lib/podSettlementView";
import type {
  CurrencyCode,
  PodGroup,
  PodMember,
  PodSplitMode,
  User
} from "@/lib/types";

/**
 * Pure helpers for the shared-pot surface. Extracted from
 * `src/routes/pod/page.tsx` so the page file stays focused on components and
 * the parsing/formatting logic is unit-testable in isolation.
 */

export type Translate = (key: I18nKey) => string;

export function podTemplateOptions(t: Translate) {
  return [
    {
      label: t("pod.templateCouple"),
      name: t("pod.templateCoupleName"),
      groups: t("pod.templateCoupleGroups")
    },
    {
      label: t("pod.templateFamily"),
      name: t("pod.templateFamilyName"),
      groups: t("pod.templateFamilyGroups")
    },
    {
      label: t("pod.templateTrip"),
      name: t("pod.templateTripName"),
      groups: t("pod.templateTripGroups")
    },
    {
      label: t("pod.templateFlat"),
      name: t("pod.templateFlatName"),
      groups: t("pod.templateFlatGroups")
    }
  ];
}

export function template(value: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (result, [key, replacement]) => result.split(`{${key}}`).join(replacement),
    value
  );
}

export function localizedSettlementDetail(
  view: ReturnType<typeof buildMyPodSettlementView>,
  t: Translate
) {
  if (view.state === "settled") return t("pod.noPaymentNeeded");
  return t(
    view.state === "user_owes"
      ? "pod.recordSettlementWhenPay"
      : "pod.draftSettlementWhenPaid"
  );
}

export function balanceStatusForRow(row: PodBalanceRow | undefined, currency: CurrencyCode) {
  if (!row || Math.abs(row.net) <= 0.005) {
    return {
      label: "square",
      tone: "positive" as const,
      amount: 0
    };
  }
  if (row.net > 0) {
    return {
      label: `gets ${formatMoneyDecimal(row.net, currency)}`,
      tone: "brand" as const,
      amount: row.net
    };
  }
  return {
    label: `owes ${formatMoneyDecimal(Math.abs(row.net), currency)}`,
    tone: "info" as const,
    amount: Math.abs(row.net)
  };
}

export function statusToneClass(tone: "positive" | "brand" | "info" | "warning" | "negative") {
  if (tone === "positive") return "text-[color:var(--color-positive)]";
  if (tone === "brand") return "text-[color:var(--color-brand)]";
  if (tone === "info") return "text-[color:var(--color-info)]";
  if (tone === "warning") return "text-[color:var(--color-warning)]";
  return "text-[color:var(--color-negative)]";
}

export function memberDisplayName(member: PodMember, me: User) {
  const emailMatches =
    me.email && member.email?.trim().toLowerCase() === me.email.trim().toLowerCase();
  if (member.linkedUserId === me.id || emailMatches) return "You";
  return member.displayName;
}

/**
 * Setup-task label for the "add a card" nudge. Avoids the ungrammatical
 * "Add You's card" when the cardless member is the current user.
 */
export function addCardTaskLabel(member: PodMember, me: User) {
  const name = memberDisplayName(member, me);
  return name === "You" ? "Add your card" : `Add ${name}'s card`;
}

const HISTORY_COUNT_KEYS = {
  expenses: {
    one: "pod.historyExpensesOne",
    few: "pod.historyExpensesFew",
    many: "pod.historyExpensesMany"
  },
  settlements: {
    one: "pod.historySettlementsOne",
    few: "pod.historySettlementsFew",
    many: "pod.historySettlementsMany"
  }
} as const;

/**
 * Picks the locale key for a pluralized "{count} expenses" / "{count}
 * settlements" fragment of the history summary line. Uses Intl.PluralRules so
 * Russian's one/few/many forms come out right; "other" (en/es plural, and any
 * unexpected category) falls back to the "many" variant.
 */
export function historyCountKey(
  noun: keyof typeof HISTORY_COUNT_KEYS,
  count: number,
  locale: string
): I18nKey {
  const category = (() => {
    try {
      return new Intl.PluralRules(locale).select(count);
    } catch {
      return count === 1 ? "one" : "other";
    }
  })();
  const variant = category === "one" ? "one" : category === "few" ? "few" : "many";
  return HISTORY_COUNT_KEYS[noun][variant] as I18nKey;
}

export function initialsFor(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function inferSharedExpenseEmoji(description: string) {
  const value = description.toLowerCase();
  if (/rent|home|house|loft/.test(value)) return "🏠";
  if (/grocery|market|food|shop/.test(value)) return "🛒";
  if (/utility|electric|water|gas/.test(value)) return "⚡";
  if (/internet|wifi|phone/.test(value)) return "📶";
  if (/dinner|restaurant|cafe|coffee/.test(value)) return "🍽️";
  return "🧾";
}

export function parseQuickExpense(text: string): { description: string; amount: number | null } {
  const trimmed = text.trim();
  if (!trimmed) return { description: "", amount: null };
  const match = /^(.*?)([-+]?\d+(?:[.,]\d{1,2})?)\s*$/.exec(trimmed);
  if (!match) return { description: trimmed, amount: null };
  const description = (match[1] ?? "").trim().replace(/[-–—:]+$/, "").trim();
  const amount = Number((match[2] ?? "").replace(",", "."));
  return {
    description: description || trimmed,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null
  };
}

export function parseQuickExpenseList(
  text: string
): Array<{ description: string; amount: number | null }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\n|;|,(?=\s*[^\d\s])/)
    .map((part) => parseQuickExpense(part))
    .filter((part) => part.description || part.amount !== null);
}

export function formatCompactAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function splitLabel(mode: PodSplitMode, t: Translate) {
  switch (mode) {
    case "equal_groups":
      return t("pod.split.groups");
    case "covered_group":
      return t("pod.split.oneGroup");
    case "custom":
      return t("pod.split.custom");
    case "equal_people":
      return t("pod.split.people");
  }
}

export function buildMemberLabelMap(members: PodMember[], groups: PodGroup[]) {
  const groupsById = new Map(groups.map((group) => [group.id, group.name]));
  return new Map(
    members.map((member) => [
      member.id,
      member.groupId ? groupsById.get(member.groupId) ?? member.displayName : member.displayName
    ])
  );
}

export function parseEmailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n;]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function buildSuggestedInvitePeople({
  currentUserId,
  currentUserEmail,
  typedEmails,
  localUsers,
  localPodMembers,
  cloudPodData
}: {
  currentUserId: string;
  currentUserEmail?: string;
  typedEmails: string[];
  localUsers: User[];
  localPodMembers: PodMember[];
  cloudPodData: Array<{ members: PodMember[] }>;
}) {
  const excludedEmails = new Set(typedEmails.map((email) => email.toLowerCase()));
  if (currentUserEmail) excludedEmails.add(currentUserEmail.trim().toLowerCase());
  const usersById = new Map(localUsers.map((user) => [user.id, user]));
  const people = new Map<
    string,
    { displayName: string; email: string; avatarUrl?: string; score: number }
  >();

  function addPerson(input: {
    displayName?: string;
    email?: string;
    avatarUrl?: string;
    linkedUserId?: string;
    score?: number;
  }) {
    const email = input.email?.trim().toLowerCase();
    if (!email || excludedEmails.has(email)) return;
    if (input.linkedUserId === currentUserId) return;
    const linkedUser = input.linkedUserId ? usersById.get(input.linkedUserId) : undefined;
    const displayName =
      input.displayName?.trim() ||
      linkedUser?.displayName ||
      displayNameFromEmail(email);
    const avatarUrl = input.avatarUrl ?? linkedUser?.avatarUrl;
    const existing = people.get(email);
    const score = input.score ?? 0;
    if (existing && existing.score > score) return;
    people.set(email, { displayName, email, avatarUrl, score });
  }

  for (const user of localUsers) {
    addPerson({
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      linkedUserId: user.id,
      score: 1
    });
  }
  for (const member of localPodMembers) {
    addPerson({
      displayName: member.displayName,
      email: member.email,
      linkedUserId: member.linkedUserId,
      score: 2
    });
  }
  for (const pod of cloudPodData) {
    for (const member of pod.members) {
      addPerson({
        displayName: member.displayName,
        email: member.email,
        linkedUserId: member.linkedUserId,
        score: 3
      });
    }
  }

  return [...people.values()]
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
    .slice(0, 8);
}

export function settlementTransferKey(transfer: {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}) {
  return `${transfer.fromMemberId}-${transfer.toMemberId}-${transfer.amount.toFixed(2)}`;
}

export function isEmailLike(email: string | undefined | null): boolean {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function displayNameFromEmail(email: string): string {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || email;
}
