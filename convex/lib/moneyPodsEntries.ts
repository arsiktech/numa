import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireUser } from "./access";
import { withMutationReceipt } from "./mutationReceipts";
import {
  currencyValidator,
  requirePodCurrency,
  requirePodEditor,
  splitModeValidator
} from "./podAccess";
import {
  requirePodMember as requireMemberInPod,
  validatePodExpenseInput as validatePodExpenseRefs
} from "./podValidation";
import {
  assertDistinctSettlementMembers,
  assertPositiveAmount,
  cleanRequired
} from "./inputGuards";

/**
 * Pod expense + settlement entry mutations, grouped as a plain object so the
 * public api.moneyPods.* paths stay in moneyPods.ts (see that file's header).
 */

const addExpense = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    podId: v.id("moneyPods"),
    paidByMemberId: v.id("podMembers"),
    /**
     * Free-text label of the payment method the payer used — must match one of
     * the strings on `podMembers.cards`. Server doesn't validate the match
     * because cards are user-defined free text and a payer may pay with cash
     * (omitted). Shared mode renders this as the "ZEN / Revolut / Cash" chip.
     */
    paidByCard: v.optional(v.string()),
    amount: v.number(),
    currency: currencyValidator,
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    occurredAt: v.number(),
    splitMode: splitModeValidator,
    participantMemberIds: v.array(v.id("podMembers")),
    customSplits: v.optional(v.array(v.object({ memberId: v.id("podMembers"), bps: v.number() }))),
    coveredGroupId: v.optional(v.id("podGroups")),
    sourcePortfolioId: v.optional(v.id("portfolios")),
    sourceAccountId: v.optional(v.id("assets")),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.addExpense",
      async () => {
        await requirePodEditor(ctx, args.podId);
        await requirePodCurrency(ctx, args.podId, args.currency);
        await validatePodExpenseRefs(ctx, args.podId, args);
        const { clientMutationId: _clientMutationId, paidByCard, ...rest } = args;
        void _clientMutationId;
        const trimmedCard = paidByCard?.trim();
        return await ctx.db.insert("podExpenses", {
          ...rest,
          description: cleanRequired(args.description, "Description"),
          paidByCard: trimmedCard && trimmedCard.length > 0 ? trimmedCard : undefined
        });
      }
    );
  }
});

const updateExpense = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    expenseId: v.id("podExpenses"),
    paidByMemberId: v.optional(v.id("podMembers")),
    paidByCard: v.optional(v.union(v.string(), v.null())),
    amount: v.optional(v.number()),
    currency: v.optional(currencyValidator),
    description: v.optional(v.string()),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    occurredAt: v.optional(v.number()),
    splitMode: v.optional(splitModeValidator),
    participantMemberIds: v.optional(v.array(v.id("podMembers"))),
    customSplits: v.optional(
      v.union(
        v.array(v.object({ memberId: v.id("podMembers"), bps: v.number() })),
        v.null()
      )
    ),
    coveredGroupId: v.optional(v.union(v.id("podGroups"), v.null())),
    sourcePortfolioId: v.optional(v.union(v.id("portfolios"), v.null())),
    sourceAccountId: v.optional(v.union(v.id("assets"), v.null())),
    notes: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.updateExpense",
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

        await validatePodExpenseRefs(ctx, expense.podId, {
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
          const trimmedCard = args.paidByCard?.trim();
          patch.paidByCard = trimmedCard && trimmedCard.length > 0 ? trimmedCard : undefined;
        }
        if (args.amount !== undefined) patch.amount = args.amount;
        if (args.currency !== undefined) patch.currency = args.currency;
        if (args.description !== undefined) {
          patch.description = cleanRequired(args.description, "Description");
        }
        if (args.categoryId !== undefined) patch.categoryId = args.categoryId ?? undefined;
        if (args.occurredAt !== undefined) patch.occurredAt = args.occurredAt;
        if (args.splitMode !== undefined) patch.splitMode = args.splitMode;
        if (args.participantMemberIds !== undefined) {
          patch.participantMemberIds = args.participantMemberIds;
        }
        if (args.customSplits !== undefined) patch.customSplits = args.customSplits ?? undefined;
        if (args.coveredGroupId !== undefined) patch.coveredGroupId = args.coveredGroupId ?? undefined;
        if (args.sourcePortfolioId !== undefined) {
          patch.sourcePortfolioId = args.sourcePortfolioId ?? undefined;
        }
        if (args.sourceAccountId !== undefined) patch.sourceAccountId = args.sourceAccountId ?? undefined;
        if (args.notes !== undefined) {
          const trimmedNotes = args.notes?.trim();
          patch.notes = trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes : undefined;
        }
        await ctx.db.patch(args.expenseId, patch);
        return args.expenseId;
      }
    );
  }
});

const removeExpense = mutation({
  args: { clientMutationId: v.optional(v.string()), expenseId: v.id("podExpenses") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.removeExpense",
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

const addSettlement = mutation({
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
      "moneyPods.addSettlement",
      async () => {
        await requirePodEditor(ctx, args.podId);
        await requirePodCurrency(ctx, args.podId, args.currency);
        await requireMemberInPod(ctx, args.podId, args.fromMemberId);
        await requireMemberInPod(ctx, args.podId, args.toMemberId);
        assertDistinctSettlementMembers(args.fromMemberId, args.toMemberId);
        assertPositiveAmount(args.amount);
        const { clientMutationId: _clientMutationId, note, ...rest } = args;
        void _clientMutationId;
        const trimmedNote = note?.trim();
        return await ctx.db.insert("podSettlements", {
          ...rest,
          note: trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined
        });
      }
    );
  }
});

const updateSettlement = mutation({
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
      "moneyPods.updateSettlement",
      async () => {
        const settlement = await ctx.db.get(args.settlementId);
        if (!settlement) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Settlement not found" });
        }
        await requirePodEditor(ctx, settlement.podId);
        await requirePodCurrency(ctx, settlement.podId, args.currency ?? settlement.currency);
        if (args.fromMemberId !== undefined) {
          await requireMemberInPod(ctx, settlement.podId, args.fromMemberId);
        }
        if (args.toMemberId !== undefined) {
          await requireMemberInPod(ctx, settlement.podId, args.toMemberId);
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
          patch.note = trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined;
        }
        await ctx.db.patch(args.settlementId, patch);
        return args.settlementId;
      }
    );
  }
});

const removeSettlement = mutation({
  args: { clientMutationId: v.optional(v.string()), settlementId: v.id("podSettlements") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.removeSettlement",
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

export const moneyPodsEntries = {
  addExpense,
  updateExpense,
  removeExpense,
  addSettlement,
  updateSettlement,
  removeSettlement
};
