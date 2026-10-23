import { ConvexError, v } from "convex/values";
import { activePodMembership } from "./lib/invitationAuthority";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureUser, requireUser, type AnyCtx } from "./lib/access";
import { cleanRequired, friendlyDisplayName } from "./lib/inputGuards";
import { withMutationReceipt } from "./lib/mutationReceipts";
import {
  PodRole,
  appModeValidator,
  buildPodSnapshot,
  claimInvitedPodRows,
  currencyValidator,
  ensureProfile,
  localeValidator,
  mobilePod,
  podAccess,
  primaryJobValidator,
  requirePodCurrency,
  requirePodEditor,
  splitModeValidator,
  starterTemplateValidator,
  themeKeyValidator,
  themeValidator,
  userEmail
} from "./lib/mobileSupport";
import { requirePodMember as memberInPod, validatePodExpenseInput as validateExpenseInput } from "./lib/podValidation";
import { assertDistinctSettlementMembers, assertPositiveAmount } from "./lib/inputGuards";
import { buildPortfolioSnapshot, mobilePortfolio, mobileProfile, userPortfolios } from "./lib/mobilePortfolio";

export const me = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await ensureUser(ctx);
    await claimInvitedPodRows(ctx, userId);
    const profile = await ensureProfile(ctx, userId);
    const user = await ctx.db.get(userId);
    return {
      id: userId,
      email: (user as { email?: string } | null)?.email ?? null,
      displayName: profile.displayName,
      defaultCurrency: profile.defaultCurrency
    };
  }
});

async function listPodsForUser(ctx: AnyCtx, userId: Id<"users">) {
  const email = await userEmail(ctx, userId);
    const memberships = await ctx.db
      .query("podMembers")
      .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
      .collect();
    const invitedMemberships = email
      ? await ctx.db
          .query("podMembers")
          .withIndex("by_email", (q) => q.eq("invitedEmail", email))
          .collect()
      : [];
    const owned = await ctx.db
      .query("moneyPods")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();

    const roles = new Map<string, PodRole>();
    for (const membership of memberships.filter(activePodMembership)) roles.set(String(membership.podId), membership.role as PodRole);
    for (const membership of invitedMemberships.filter(m => !m.linkedUserId && activePodMembership(m))) {
      if (!roles.has(String(membership.podId))) {
        roles.set(String(membership.podId), membership.role as PodRole);
      }
    }
    for (const pod of owned) roles.set(String(pod._id), "owner");

    const pods = await Promise.all([...roles.keys()].map((id) => ctx.db.get(id as Id<"moneyPods">)));
    return pods
      .filter((pod): pod is Doc<"moneyPods"> => pod !== null)
      .map((pod) => mobilePod(pod, roles.get(String(pod._id)) ?? "viewer"));
}

export const listPods = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await listPodsForUser(ctx, userId);
  }
});

export const podSnapshot = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => await buildPodSnapshot(ctx, args.podId)
});

export const createPod = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    name: v.string(),
    currency: currencyValidator
  },
  handler: async (ctx, args) => {
    const userId = await ensureUser(ctx);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.createPod", async () => {
      const profile = await ensureProfile(ctx, userId);
      const now = Date.now();
      const podId = await ctx.db.insert("moneyPods", {
        name: cleanRequired(args.name, "Pod name"),
        currency: args.currency,
        ownerUserId: userId,
        createdAt: now
      });
      const householdGroupId = await ctx.db.insert("podGroups", {
        podId,
        name: "Household",
        color: "mint"
      });
      await ctx.db.insert("podGroups", {
        podId,
        name: "Guests",
        color: "coral"
      });
      await ctx.db.insert("podMembers", {
        podId,
        displayName: friendlyDisplayName((await userEmail(ctx, userId)) ?? "", profile.displayName),
        linkedUserId: userId,
        groupId: householdGroupId,
        role: "owner",
        joinedAt: now
      });
      return podId;
    });
  }
});

export const createExpense = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    podId: v.id("moneyPods"),
    paidByMemberId: v.id("podMembers"),
    paidByCard: v.optional(v.string()),
    amount: v.number(),
    currency: currencyValidator,
    description: v.string(),
    occurredAt: v.number(),
    splitMode: splitModeValidator,
    participantMemberIds: v.array(v.id("podMembers")),
    customSplits: v.optional(v.array(v.object({ memberId: v.id("podMembers"), bps: v.number() }))),
    coveredGroupId: v.optional(v.id("podGroups")),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.createExpense",
      async () => {
        await requirePodEditor(ctx, args.podId);
        await requirePodCurrency(ctx, args.podId, args.currency);
        await validateExpenseInput(ctx, args.podId, args);
        const { clientMutationId: _clientMutationId, paidByCard, notes, ...rest } = args;
        void _clientMutationId;
        const trimmedCard = paidByCard?.trim();
        const trimmedNotes = notes?.trim();
        return await ctx.db.insert("podExpenses", {
          ...rest,
          description: cleanRequired(args.description, "Description"),
          paidByCard: trimmedCard ? trimmedCard : undefined,
          notes: trimmedNotes ? trimmedNotes : undefined
        });
      }
    );
  }
});

export const updateExpense = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    expenseId: v.id("podExpenses"),
    paidByMemberId: v.optional(v.id("podMembers")),
    paidByCard: v.optional(v.union(v.string(), v.null())),
    amount: v.optional(v.number()),
    currency: v.optional(currencyValidator),
    description: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    splitMode: v.optional(splitModeValidator),
    participantMemberIds: v.optional(v.array(v.id("podMembers"))),
    customSplits: v.optional(
      v.union(v.array(v.object({ memberId: v.id("podMembers"), bps: v.number() })), v.null())
    ),
    coveredGroupId: v.optional(v.union(v.id("podGroups"), v.null())),
    notes: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.updateExpense",
      async () => {
        const expense = await ctx.db.get(args.expenseId);
        if (!expense) throw new ConvexError({ code: "NOT_FOUND", message: "Expense not found" });
        await requirePodEditor(ctx, expense.podId);
        await requirePodCurrency(ctx, expense.podId, args.currency ?? expense.currency);

        const nextPaidByMemberId = args.paidByMemberId ?? expense.paidByMemberId;
        const nextAmount = args.amount ?? expense.amount;
        const nextDescription = args.description ?? expense.description;
        const nextSplitMode = args.splitMode ?? expense.splitMode;
        const nextParticipantMemberIds =
          args.participantMemberIds ?? expense.participantMemberIds;
        const nextCustomSplits =
          args.customSplits === undefined ? expense.customSplits : args.customSplits ?? undefined;
        const nextCoveredGroupId =
          args.coveredGroupId === undefined ? expense.coveredGroupId : args.coveredGroupId ?? undefined;

        await validateExpenseInput(ctx, expense.podId, {
          paidByMemberId: nextPaidByMemberId,
          amount: nextAmount,
          description: nextDescription,
          participantMemberIds: nextParticipantMemberIds,
          customSplits: nextCustomSplits,
          coveredGroupId: nextCoveredGroupId,
          splitMode: nextSplitMode
        });

        const patch: Record<string, unknown> = {};
        if (args.paidByMemberId !== undefined) patch.paidByMemberId = args.paidByMemberId;
        if (args.paidByCard !== undefined) {
          const trimmed = args.paidByCard?.trim();
          patch.paidByCard = trimmed ? trimmed : undefined;
        }
        if (args.amount !== undefined) patch.amount = args.amount;
        if (args.currency !== undefined) patch.currency = args.currency;
        if (args.description !== undefined) patch.description = cleanRequired(args.description, "Description");
        if (args.occurredAt !== undefined) patch.occurredAt = args.occurredAt;
        if (args.splitMode !== undefined) patch.splitMode = args.splitMode;
        if (args.participantMemberIds !== undefined) patch.participantMemberIds = args.participantMemberIds;
        if (args.customSplits !== undefined) patch.customSplits = args.customSplits ?? undefined;
        if (args.coveredGroupId !== undefined) patch.coveredGroupId = args.coveredGroupId ?? undefined;
        if (args.notes !== undefined) {
          const trimmed = args.notes?.trim();
          patch.notes = trimmed ? trimmed : undefined;
        }
        await ctx.db.patch(args.expenseId, patch);
        return args.expenseId;
      }
    );
  }
});

export const deleteExpense = mutation({
  args: { clientMutationId: v.optional(v.string()), expenseId: v.id("podExpenses") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.deleteExpense",
      async () => {
        const expense = await ctx.db.get(args.expenseId);
        if (!expense) throw new ConvexError({ code: "NOT_FOUND", message: "Expense not found" });
        await requirePodEditor(ctx, expense.podId);
        await ctx.db.delete(args.expenseId);
        return args.expenseId;
      }
    );
  }
});

export const createSettlement = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    podId: v.id("moneyPods"),
    fromMemberId: v.id("podMembers"),
    toMemberId: v.id("podMembers"),
    amount: v.number(),
    currency: currencyValidator,
    occurredAt: v.number(),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.createSettlement",
      async () => {
        await requirePodEditor(ctx, args.podId);
        await requirePodCurrency(ctx, args.podId, args.currency);
        await memberInPod(ctx, args.podId, args.fromMemberId);
        await memberInPod(ctx, args.podId, args.toMemberId);
        assertDistinctSettlementMembers(args.fromMemberId, args.toMemberId);
        assertPositiveAmount(args.amount);
        const { clientMutationId: _clientMutationId, note, ...rest } = args;
        void _clientMutationId;
        const trimmedNote = note?.trim();
        return await ctx.db.insert("podSettlements", {
          ...rest,
          note: trimmedNote ? trimmedNote : undefined
        });
      }
    );
  }
});

export const updateSettlement = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    settlementId: v.id("podSettlements"),
    fromMemberId: v.optional(v.id("podMembers")),
    toMemberId: v.optional(v.id("podMembers")),
    amount: v.optional(v.number()),
    currency: v.optional(currencyValidator),
    occurredAt: v.optional(v.number()),
    note: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.updateSettlement",
      async () => {
        const settlement = await ctx.db.get(args.settlementId);
        if (!settlement) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Settlement not found" });
        }
        await requirePodEditor(ctx, settlement.podId);
        await requirePodCurrency(ctx, settlement.podId, args.currency ?? settlement.currency);
        if (args.fromMemberId !== undefined) {
          await memberInPod(ctx, settlement.podId, args.fromMemberId);
        }
        if (args.toMemberId !== undefined) {
          await memberInPod(ctx, settlement.podId, args.toMemberId);
        }
        assertDistinctSettlementMembers(
          args.fromMemberId ?? settlement.fromMemberId,
          args.toMemberId ?? settlement.toMemberId
        );
        if (args.amount !== undefined) assertPositiveAmount(args.amount);

        const patch: Record<string, unknown> = {};
        if (args.fromMemberId !== undefined) patch.fromMemberId = args.fromMemberId;
        if (args.toMemberId !== undefined) patch.toMemberId = args.toMemberId;
        if (args.amount !== undefined) patch.amount = args.amount;
        if (args.currency !== undefined) patch.currency = args.currency;
        if (args.occurredAt !== undefined) patch.occurredAt = args.occurredAt;
        if (args.note !== undefined) {
          const trimmedNote = args.note?.trim();
          patch.note = trimmedNote ? trimmedNote : undefined;
        }
        await ctx.db.patch(args.settlementId, patch);
        return args.settlementId;
      }
    );
  }
});

export const deleteSettlement = mutation({
  args: { clientMutationId: v.optional(v.string()), settlementId: v.id("podSettlements") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.deleteSettlement",
      async () => {
        const settlement = await ctx.db.get(args.settlementId);
        if (!settlement) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Settlement not found" });
        }
        await requirePodEditor(ctx, settlement.podId);
        await ctx.db.delete(args.settlementId);
        return args.settlementId;
      }
    );
  }
});

export const updateMemberCards = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    memberId: v.id("podMembers"),
    cards: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.updateMemberCards",
      async () => {
        const member = await ctx.db.get(args.memberId);
        if (!member) throw new ConvexError({ code: "NOT_FOUND", message: "Member not found" });
        const access = await podAccess(ctx, member.podId);
        const canEdit = access.role === "owner" || String(access.member._id) === String(member._id);
        if (!canEdit) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Only owners or the member can edit card labels"
          });
        }
        const cards = args.cards.map((card) => card.trim()).filter(Boolean);
        await ctx.db.patch(args.memberId, {
          cards: cards.length > 0 ? cards : undefined
        });
        return args.memberId;
      }
    );
  }
});

export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await ensureUser(ctx);
    await claimInvitedPodRows(ctx, userId);
    const profile = await ensureProfile(ctx, userId);
    const user = await ctx.db.get(userId);
    const portfolios = await userPortfolios(ctx, userId);
    const pods = await listPodsForUser(ctx, userId);
    const selected = portfolios[0];
    const snapshot = selected ? await buildPortfolioSnapshot(ctx, selected.portfolio._id) : null;
    const hasRealData = Boolean(
      snapshot &&
        (snapshot.transactions.length > 0 ||
          snapshot.assets.some((asset) => Math.abs(asset.balance) > 0.001) ||
          snapshot.holdings.length > 0 ||
          pods.length > 0)
    );
    return {
      profile: mobileProfile(userId, user, profile),
      portfolios: portfolios.map((entry) => mobilePortfolio(entry.portfolio, entry.membership)),
      selectedPortfolioId: selected?.portfolio._id ?? null,
      portfolioSnapshot: snapshot,
      pods,
      hasRealData
    };
  }
});

export const portfolioSnapshot = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => await buildPortfolioSnapshot(ctx, args.portfolioId)
});

export const updateProfilePrefs = mutation({
  args: {
    displayName: v.optional(v.string()),
    defaultCurrency: v.optional(currencyValidator),
    theme: v.optional(themeValidator),
    appMode: v.optional(appModeValidator),
    themeKey: v.optional(themeKeyValidator),
    primaryJob: v.optional(primaryJobValidator),
    starterTemplate: v.optional(starterTemplateValidator),
    locale: v.optional(localeValidator),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "mobile.updateProfilePrefs",
      async () => {
        const profile = await ensureProfile(ctx, userId);
        const patch: Record<string, unknown> = {};
        if (args.displayName !== undefined) patch.displayName = cleanRequired(args.displayName, "Display name");
        if (args.defaultCurrency !== undefined) patch.defaultCurrency = args.defaultCurrency;
        if (args.theme !== undefined) patch.theme = args.theme;
        if (args.appMode !== undefined) patch.appMode = args.appMode;
        if (args.themeKey !== undefined) patch.themeKey = args.themeKey;
        if (args.primaryJob !== undefined) patch.primaryJob = args.primaryJob;
        if (args.starterTemplate !== undefined) patch.starterTemplate = args.starterTemplate;
        if (args.locale !== undefined) patch.locale = args.locale;
        await ctx.db.patch(profile._id, patch);
        return profile._id;
      }
    );
  }
});

import { mobileRecords } from "./lib/mobileRecords";

export const {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createCategory,
  upsertAsset,
  deleteAsset,
  upsertLiability,
  deleteLiability,
  upsertHolding,
  deleteHolding,
  upsertGoal
} = mobileRecords;

export { assertMobileTransactionRefs, mobileTransactionAuditPayload } from "./lib/mobileSupport";
export { mobileProfile } from "./lib/mobilePortfolio";
