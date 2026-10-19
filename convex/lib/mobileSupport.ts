import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser, type AnyCtx } from "./access";
import { cleanRequired, friendlyDisplayName, normalizeEmail } from "./inputGuards";
import { computeSettlementBalances, minimizeTransfers, type SettlementExpense, type SettlementPayment } from "./settlementMath";
import { seedStarterCategories } from "./starterCategories";

export const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
export const appModeValidator = v.union(v.literal("light"), v.literal("advanced"), v.literal("shared"));
export const themeValidator = v.union(v.literal("light"), v.literal("dark"), v.literal("auto"));
export const themeKeyValidator = v.union(
  v.literal("numa"),
  v.literal("citrus"),
  v.literal("pebble"),
  v.literal("coral"),
  v.literal("carbon")
);
export const localeValidator = v.union(v.literal("en"), v.literal("ru"), v.literal("es"));
export const primaryJobValidator = v.union(
  v.literal("net_worth"),
  v.literal("daily_spending"),
  v.literal("shared_money")
);
export const starterTemplateValidator = v.union(
  v.literal("personal_capital"),
  v.literal("couple_family"),
  v.literal("trip_shared_flat")
);
export const txKindValidator = v.union(v.literal("income"), v.literal("expense"));
export const categoryKindValidator = v.union(v.literal("income"), v.literal("expense"));
export const goalScopeValidator = v.union(
  v.literal("net_worth"),
  v.literal("monthly_income"),
  v.literal("income_category"),
  v.literal("asset_value"),
  v.literal("holding_value")
);
export const assetKindValidator = v.union(
  v.literal("cash"),
  v.literal("real_estate"),
  v.literal("vehicle"),
  v.literal("collectible"),
  v.literal("business"),
  v.literal("other")
);
export const liabilityKindValidator = v.union(
  v.literal("credit_card"),
  v.literal("loan"),
  v.literal("mortgage"),
  v.literal("other")
);
export const holdingKindValidator = v.union(
  v.literal("stock"),
  v.literal("etf"),
  v.literal("crypto"),
  v.literal("index")
);
export const splitModeValidator = v.union(
  v.literal("equal_people"),
  v.literal("equal_groups"),
  v.literal("custom"),
  v.literal("covered_group")
);

export type PodRole = "owner" | "editor" | "viewer";

export type MobileTransactionAuditArgs = {
  portfolioId: Id<"portfolios">;
  occurredAt: number;
  description: string;
  categoryId?: Id<"categories">;
  accountId?: Id<"assets">;
  kind: "income" | "expense";
  amount: number;
  currency: "USD" | "EUR";
  notes?: string;
};

export function mobileTransactionAuditPayload(
  args: MobileTransactionAuditArgs,
  userId: Id<"users">
) {
  return {
    portfolioId: args.portfolioId,
    occurredAt: args.occurredAt,
    description: cleanRequired(args.description, "Description"),
    categoryId: args.categoryId,
    accountId: args.accountId,
    kind: args.kind,
    amount: args.amount,
    currency: args.currency,
    notes: args.notes?.trim() || undefined,
    createdByUserId: userId
  };
}

export async function assertMobileTransactionRefs(
  ctx: AnyCtx,
  portfolioId: Id<"portfolios">,
  categoryId?: Id<"categories">,
  accountId?: Id<"assets">
) {
  if (categoryId) {
    const category = await ctx.db.get(categoryId);
    if (!category || String(category.portfolioId) !== String(portfolioId)) {
      throw new ConvexError({
        code: "INVALID_REFERENCE",
        message: "Category does not belong to this portfolio"
      });
    }
  }
  if (!accountId) return { account: null };
  const account = await ctx.db.get(accountId);
  if (
    !account ||
    account.kind !== "cash" ||
    String(account.portfolioId) !== String(portfolioId)
  ) {
    throw new ConvexError({
      code: "INVALID_REFERENCE",
      message: "Cash account does not belong to this portfolio"
    });
  }
  return { account };
}

export async function assertGoalRefs(
  ctx: AnyCtx,
  args: {
    portfolioId: Id<"portfolios">;
    scope: "net_worth" | "monthly_income" | "income_category" | "asset_value" | "holding_value";
    categoryId?: Id<"categories">;
    assetId?: Id<"assets">;
    holdingId?: Id<"holdings">;
  }
) {
  if (args.scope === "income_category") {
    if (!args.categoryId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Income category goal requires a category" });
    }
    const category = await ctx.db.get(args.categoryId);
    if (!category || String(category.portfolioId) !== String(args.portfolioId) || category.kind !== "income") {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Income goal category must belong to this portfolio" });
    }
  }
  if (args.scope === "asset_value") {
    if (!args.assetId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Asset goal requires an asset" });
    }
    const asset = await ctx.db.get(args.assetId);
    if (!asset || String(asset.portfolioId) !== String(args.portfolioId)) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Asset goal target must belong to this portfolio" });
    }
  }
  if (args.scope === "holding_value") {
    if (!args.holdingId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Holding goal requires a holding" });
    }
    const holding = await ctx.db.get(args.holdingId);
    if (!holding || String(holding.portfolioId) !== String(args.portfolioId)) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Holding goal target must belong to this portfolio" });
    }
  }
}

export async function userEmail(ctx: AnyCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  return normalizeEmail((user as { email?: string } | null)?.email);
}

export async function profileFor(ctx: AnyCtx, userId: Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function ensureProfile(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await profileFor(ctx, userId);
  const user = await ctx.db.get(userId);
  const email = (user as { email?: string } | null)?.email ?? "";
  if (existing) {
    const displayName = friendlyDisplayName(email, existing.displayName);
    if (displayName !== existing.displayName) {
      await ctx.db.patch(existing._id, { displayName });
      const linkedMembers = await ctx.db
        .query("podMembers")
        .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
        .collect();
      await Promise.all(
        linkedMembers
          .filter((member) => member.displayName.includes("@"))
          .map((member) => ctx.db.patch(member._id, { displayName }))
      );
      await ensureStarterPortfolio(ctx, userId, displayName, existing.defaultCurrency);
      return (await ctx.db.get(existing._id))!;
    }
    await ensureStarterPortfolio(ctx, userId, displayName, existing.defaultCurrency);
    return existing;
  }
  const name = friendlyDisplayName(email, (user as { name?: string } | null)?.name);
  const profileId = await ctx.db.insert("profiles", {
    userId,
    displayName: name,
    defaultCurrency: "EUR",
    theme: "auto",
    appMode: "advanced",
    primaryJob: "net_worth",
    starterTemplate: "personal_capital",
    themeKey: "citrus",
    createdAt: Date.now()
  });
  await ensureStarterPortfolio(ctx, userId, name, "EUR");
  return (await ctx.db.get(profileId))!;
}

export async function ensureStarterPortfolio(
  ctx: MutationCtx,
  userId: Id<"users">,
  displayName: string,
  defaultCurrency: "USD" | "EUR"
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if ((await Promise.all(memberships.map(membership => ctx.db.get(membership.portfolioId)))).some(Boolean)) return;

  const now = Date.now();
  const portfolioId = await ctx.db.insert("portfolios", {
    name: "Personal",
    type: "personal",
    spaceKind: "personal",
    tagline: "Just you",
    ownerId: userId,
    defaultCurrency,
    createdAt: now
  });
  await ctx.db.insert("memberships", {
    portfolioId,
    userId,
    ownershipBps: 10000,
    role: "owner",
    displayName,
    joinedAt: now
  });
  await seedStarterCategories(ctx, portfolioId);
  await ctx.db.insert("assets", {
    portfolioId,
    name: "Cash",
    kind: "cash",
    balance: 0,
    currency: defaultCurrency,
    notes: "Starter account - every transaction debits or credits its balance",
    updatedAt: now
  });
}

export async function claimInvitedPodRows(ctx: MutationCtx, userId: Id<"users">) {
  const email = await userEmail(ctx, userId);
  if (!email) return;
  const invited = await ctx.db
    .query("podMembers")
    .withIndex("by_email", (q) => q.eq("invitedEmail", email))
    .collect();
  for (const member of invited) {
    if (!member.linkedUserId) {
      await ctx.db.patch(member._id, { linkedUserId: userId });
    }
  }
}

export async function podAccess(ctx: AnyCtx, podId: Id<"moneyPods">) {
  const userId = await requireUser(ctx);
  const email = await userEmail(ctx, userId);
  const direct = await ctx.db
    .query("podMembers")
    .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
    .filter((q) => q.eq(q.field("podId"), podId))
    .unique();
  if (direct) return { userId, member: direct, role: direct.role as PodRole };
  if (email) {
    const invited = await ctx.db
      .query("podMembers")
      .withIndex("by_email", (q) => q.eq("invitedEmail", email))
      .filter((q) => q.eq(q.field("podId"), podId))
      .unique();
    if (invited) return { userId, member: invited, role: invited.role as PodRole };
  }
  const pod = await ctx.db.get(podId);
  if (pod?.ownerUserId === userId) {
    const ownerMember = await ctx.db
      .query("podMembers")
      .withIndex("by_pod", (q) => q.eq("podId", podId))
      .filter((q) => q.eq(q.field("linkedUserId"), userId))
      .unique();
    if (ownerMember) return { userId, member: ownerMember, role: ownerMember.role as PodRole };
  }
  throw new ConvexError({ code: "FORBIDDEN", message: "Not a member of this money pod" });
}

export async function requirePodEditor(ctx: AnyCtx, podId: Id<"moneyPods">) {
  const access = await podAccess(ctx, podId);
  if (access.role !== "owner" && access.role !== "editor") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Editor role required" });
  }
  return access;
}

export async function requirePodCurrency(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  currency: "USD" | "EUR"
) {
  const pod = await ctx.db.get(podId);
  if (!pod) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Money pod not found" });
  }
  if (pod.currency !== currency) {
    throw new ConvexError({
      code: "INVALID_CURRENCY",
      message: "Shared pod entries must use the pod currency"
    });
  }
  return pod;
}

export function mobilePod(pod: Doc<"moneyPods">, role: PodRole) {
  return {
    id: pod._id,
    name: pod.name,
    currency: pod.currency,
    myRole: role
  };
}

export function mobileMember(member: Doc<"podMembers">) {
  return {
    id: member._id,
    podId: member.podId,
    displayName: member.displayName,
    invitedEmail: member.invitedEmail ?? null,
    linkedUserId: member.linkedUserId ?? null,
    groupId: member.groupId ?? null,
    role: member.role,
    joinedAt: member.joinedAt,
    cards: member.cards ?? []
  };
}

export function mobileExpense(expense: Doc<"podExpenses">) {
  return {
    id: expense._id,
    podId: expense.podId,
    paidByMemberId: expense.paidByMemberId,
    paidByCard: expense.paidByCard ?? null,
    amount: expense.amount,
    currency: expense.currency,
    description: expense.description,
    occurredAt: expense.occurredAt,
    splitMode: expense.splitMode,
    participantMemberIds: expense.participantMemberIds,
    customSplits: expense.customSplits ?? [],
    coveredGroupId: expense.coveredGroupId ?? null,
    notes: expense.notes ?? null
  };
}

export function mobileSettlement(settlement: Doc<"podSettlements">) {
  return {
    id: settlement._id,
    podId: settlement.podId,
    fromMemberId: settlement.fromMemberId,
    toMemberId: settlement.toMemberId,
    amount: settlement.amount,
    currency: settlement.currency,
    occurredAt: settlement.occurredAt,
    note: settlement.note ?? null
  };
}

export function toSettlementExpense(expense: Doc<"podExpenses">): SettlementExpense {
  return {
    paidByMemberId: String(expense.paidByMemberId),
    amount: expense.amount,
    splitMode: expense.splitMode,
    participantMemberIds: expense.participantMemberIds.map(String),
    customSplits: expense.customSplits?.map((split) => ({
      memberId: String(split.memberId),
      bps: split.bps
    })),
    coveredGroupId: expense.coveredGroupId ? String(expense.coveredGroupId) : null
  };
}

/**
 * Per-member net balances for a pod, rounded to 2 decimals. Pods are
 * single-currency (see requirePodCurrency), so amounts pass straight into the
 * shared settlement core — the same code the client preview uses.
 */
export function podBalances(
  members: Doc<"podMembers">[],
  expenses: Doc<"podExpenses">[],
  settlements: Doc<"podSettlements">[],
  groups: Doc<"podGroups">[]
) {
  const settlementPayments: SettlementPayment[] = settlements.map((settlement) => ({
    fromMemberId: String(settlement.fromMemberId),
    toMemberId: String(settlement.toMemberId),
    amount: settlement.amount
  }));
  const coreRows = computeSettlementBalances(
    members.map((member) => ({
      id: String(member._id),
      groupId: member.groupId ? String(member.groupId) : null
    })),
    expenses.map(toSettlementExpense),
    settlementPayments,
    groups.map((group) => ({ id: String(group._id) }))
  );
  const netById = new Map(coreRows.map((row) => [row.memberId, row.net]));
  return members.map((member) => ({
    memberId: member._id,
    amount: Math.round((netById.get(String(member._id)) ?? 0) * 100) / 100,
    currency: expenses[0]?.currency ?? settlements[0]?.currency ?? "EUR"
  }));
}

export function podSettlementSummary(
  meMemberId: Id<"podMembers">,
  members: Doc<"podMembers">[],
  groups: Doc<"podGroups">[],
  balances: ReturnType<typeof podBalances>,
  currency: "USD" | "EUR"
) {
  const memberById = new Map(members.map((member) => [String(member._id), member]));
  const groupById = new Map(groups.map((group) => [String(group._id), group]));
  const me = memberById.get(String(meMemberId));
  const myPartyName = me ? podPartyName(me, groupById) : null;
  const partyKeyOf = (memberId: string) => {
    const member = memberById.get(memberId);
    return member ? podPartyName(member, groupById) : memberId;
  };
  // Shared minimizer with the server's policy: round to 2dp and never emit a
  // transfer between two members of the same party (they're consumed but not
  // shown). Names are attached afterward for the party-netting pass.
  const transfers = minimizeTransfers(
    balances.map((row) => ({ memberId: String(row.memberId), net: row.amount })),
    { round: true, partyKeyOf }
  ).map((transfer) => {
    const from = memberById.get(transfer.fromMemberId);
    const to = memberById.get(transfer.toMemberId);
    return {
      fromMemberId: transfer.fromMemberId,
      toMemberId: transfer.toMemberId,
      fromName: from ? podPartyName(from, groupById) : "Someone",
      toName: to ? podPartyName(to, groupById) : "Someone",
      amount: transfer.amount
    };
  });
  const netTransfers = netPartyTransfers(transfers);
  const partyTransfers = new Map<
    string,
    {
      counterpartyName: string;
      netAmount: number;
      transferCount: number;
      draft?: {
        fromMemberId: string;
        toMemberId: string;
        amount: number;
        currency: "USD" | "EUR";
      };
    }
  >();
  if (myPartyName) {
    for (const transfer of netTransfers) {
      const direction =
        transfer.fromMemberId === String(meMemberId) || transfer.fromName === myPartyName
          ? "out"
          : transfer.toMemberId === String(meMemberId) || transfer.toName === myPartyName
            ? "in"
            : null;
      if (!direction) continue;
      const counterpartyName = direction === "out" ? transfer.toName : transfer.fromName;
      const current = partyTransfers.get(counterpartyName);
      const signedAmount = direction === "in" ? transfer.amount : -transfer.amount;
      if (current) {
        current.netAmount += signedAmount;
        current.transferCount += 1;
        current.draft = undefined;
      } else {
        partyTransfers.set(counterpartyName, {
          counterpartyName,
          netAmount: signedAmount,
          transferCount: 1,
          draft: {
            fromMemberId: transfer.fromMemberId,
            toMemberId: transfer.toMemberId,
            amount: transfer.amount,
            currency
          }
        });
      }
    }
  }
  const mine = [...partyTransfers.values()]
    .map((transfer) => ({
      ...transfer,
      direction: transfer.netAmount < 0 ? ("out" as const) : ("in" as const),
      amount: Math.round(Math.abs(transfer.netAmount) * 100) / 100
    }))
    .filter((transfer) => transfer.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)[0];
  if (!mine) {
    return {
      state: "settled" as const,
      counterpartyName: null,
      amount: 0,
      currency,
      label: "All settled",
      recommendedSettlementDraft: null,
      transfers: netTransfers
    };
  }
  if (mine.direction === "out") {
    return {
      state: "user_owes" as const,
      counterpartyName: mine.counterpartyName,
      amount: mine.amount,
      currency,
      label: `You owe ${mine.counterpartyName}`,
      recommendedSettlementDraft: mine.transferCount === 1 ? mine.draft : null,
      transfers: netTransfers
    };
  }
  return {
    state: "owed_to_user" as const,
    counterpartyName: mine.counterpartyName,
    amount: mine.amount,
    currency,
    label: `${mine.counterpartyName} owes you`,
    recommendedSettlementDraft: mine.transferCount === 1 ? mine.draft : null,
    transfers: netTransfers
  };
}

export function netPartyTransfers(
  transfers: Array<{
    fromMemberId: string;
    toMemberId: string;
    fromName: string;
    toName: string;
    amount: number;
  }>
) {
  const netByPair = new Map<
    string,
    {
      aName: string;
      bName: string;
      netFromAToB: number;
      aToBDraft?: { fromMemberId: string; toMemberId: string };
      bToADraft?: { fromMemberId: string; toMemberId: string };
    }
  >();
  for (const transfer of transfers) {
    const [aName, bName] =
      transfer.fromName <= transfer.toName
        ? [transfer.fromName, transfer.toName]
        : [transfer.toName, transfer.fromName];
    const key = `${aName}\u0000${bName}`;
    const current = netByPair.get(key) ?? { aName, bName, netFromAToB: 0 };
    const fromAToB = transfer.fromName === aName && transfer.toName === bName;
    current.netFromAToB += fromAToB ? transfer.amount : -transfer.amount;
    if (fromAToB && !current.aToBDraft) {
      current.aToBDraft = {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId
      };
    }
    if (!fromAToB && !current.bToADraft) {
      current.bToADraft = {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId
      };
    }
    netByPair.set(key, current);
  }

  return [...netByPair.values()]
    .map((pair) => {
      const amount = Math.abs(pair.netFromAToB);
      if (amount <= 0.005) return null;
      const fromAToB = pair.netFromAToB > 0;
      const draft = fromAToB ? pair.aToBDraft : pair.bToADraft;
      if (!draft) return null;
      return {
        fromMemberId: draft.fromMemberId,
        toMemberId: draft.toMemberId,
        fromName: fromAToB ? pair.aName : pair.bName,
        toName: fromAToB ? pair.bName : pair.aName,
        amount: Math.round(amount * 100) / 100
      };
    })
    .filter(
      (
        transfer
      ): transfer is {
        fromMemberId: string;
        toMemberId: string;
        fromName: string;
        toName: string;
        amount: number;
      } => Boolean(transfer)
    )
    .sort((a, b) => b.amount - a.amount);
}

export function podPartyName(member: Doc<"podMembers">, groupById: Map<string, Doc<"podGroups">>) {
  return member.groupId ? groupById.get(String(member.groupId))?.name ?? member.displayName : member.displayName;
}

export async function buildPodSnapshot(ctx: QueryCtx, podId: Id<"moneyPods">) {
  const access = await podAccess(ctx, podId);
  const pod = await ctx.db.get(podId);
  if (!pod) throw new ConvexError({ code: "NOT_FOUND", message: "Money pod not found" });
  const [members, groups, expenses, settlements] = await Promise.all([
    ctx.db
      .query("podMembers")
      .withIndex("by_pod", (q) => q.eq("podId", podId))
      .collect(),
    ctx.db
      .query("podGroups")
      .withIndex("by_pod", (q) => q.eq("podId", podId))
      .collect(),
    ctx.db
      .query("podExpenses")
      .withIndex("by_pod_time", (q) => q.eq("podId", podId))
      .collect(),
    ctx.db
      .query("podSettlements")
      .withIndex("by_pod_time", (q) => q.eq("podId", podId))
      .collect()
  ]);
  const balances = podBalances(members, expenses, settlements, groups);
  return {
    pod: mobilePod(pod, access.role),
    members: members.map(mobileMember),
    groups: groups.map((group) => ({
      id: group._id,
      podId: group.podId,
      name: group.name,
      color: group.color
    })),
    expenses: expenses
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map(mobileExpense),
    settlements: settlements
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map(mobileSettlement),
    balances,
    settlementSummary: podSettlementSummary(access.member._id, members, groups, balances, pod.currency)
  };
}

