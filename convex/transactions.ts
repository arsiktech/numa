import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { withAiAuditConfirmation } from "./lib/aiAudit";
import { applyTransactionChange, assertTransactionMoney, replayDeletedTransaction } from "./lib/transactionFinance";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const txKindValidator = v.union(v.literal("income"), v.literal("expense"));
const splitsValidator = v.array(
  v.object({ userId: v.id("users"), bps: v.number() })
);
const locationValidator = v.object({
  lat: v.number(),
  lng: v.number(),
  label: v.optional(v.string())
});
const clearableCategoryIdValidator = v.union(v.id("categories"), v.null());
const clearableAccountIdValidator = v.union(v.id("assets"), v.null());
const clearableStringValidator = v.union(v.string(), v.null());
const clearableLocationValidator = v.union(locationValidator, v.null());

/**
 * List the portfolio's transactions newest-first. Members only.
 */
export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
    return rows.sort((a, b) => b.occurredAt - a.occurredAt);
  }
});

/**
 * Insert a new transaction. Editor+ only. createdByUserId is set from auth.
 */
export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    occurredAt: v.number(),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    accountId: v.optional(v.id("assets")),
    kind: txKindValidator,
    amount: v.number(),
    currency: currencyValidator,
    splits: v.optional(splitsValidator),
    notes: v.optional(v.string()),
    location: v.optional(locationValidator),
    clientMutationId: v.optional(v.string()),
    auditDraftId: v.optional(v.id("aiActionDrafts"))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    assertTransactionMoney(args);
    return await withAiAuditConfirmation(
      ctx,
      {
        userId,
        portfolioId: args.portfolioId,
        auditDraftId: args.auditDraftId,
        clientMutationId: args.clientMutationId,
        actionType: "transaction.create",
        actualPayload: {
          portfolioId: args.portfolioId,
          occurredAt: args.occurredAt,
          description: args.description,
          categoryId: args.categoryId,
          accountId: args.accountId,
          kind: args.kind,
          amount: args.amount,
          currency: args.currency,
          splits: args.splits,
          notes: args.notes,
          location: args.location,
          createdByUserId: userId
        },
        payloadKeys: [
          "portfolioId",
          "occurredAt",
          "description",
          "categoryId",
          "accountId",
          "kind",
          "amount",
          "currency",
          "splits",
          "notes",
          "location",
          "createdByUserId"
        ]
      },
      async () => await withMutationReceipt(
        ctx,
        userId,
        args.clientMutationId,
        "transactions.add",
        async () => {
          await applyTransactionChange(ctx, null, args);
          const txId = await ctx.db.insert("transactions", {
            portfolioId: args.portfolioId,
            occurredAt: args.occurredAt,
            description: args.description,
            categoryId: args.categoryId,
            accountId: args.accountId,
            kind: args.kind,
            amount: args.amount,
            currency: args.currency,
            createdByUserId: userId,
            splits: args.splits,
            notes: args.notes,
            location: args.location
          });
          return txId;
        },
        String(args.portfolioId)
      )
    );
  }
});

/**
 * Patch a transaction. Editor+ on the tx's portfolio.
 */
export const update = mutation({
  args: {
    id: v.id("transactions"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      occurredAt: v.optional(v.number()),
      description: v.optional(v.string()),
      categoryId: v.optional(clearableCategoryIdValidator),
      accountId: v.optional(clearableAccountIdValidator),
      kind: v.optional(txKindValidator),
      amount: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      splits: v.optional(splitsValidator),
      notes: v.optional(clearableStringValidator),
      location: v.optional(clearableLocationValidator)
    })
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.id);
    if (!before) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found" });
    }
    const { userId } = await requireEditor(ctx, before.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "transactions.update",
      async () => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args.patch)) {
          if (value !== undefined) patch[key] = value === null ? undefined : value;
        }
        const after = { ...before, ...patch } as typeof before;
        await applyTransactionChange(ctx, before, after);
        await ctx.db.patch(args.id, patch);
        return args.id;
      },
      String(before.portfolioId)
    );
  }
});

export const remove = mutation({
  args: { id: v.id("transactions"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return await replayDeletedTransaction(ctx, args.id, args.clientMutationId, "transactions.remove");
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "transactions.remove",
      async () => {
        await applyTransactionChange(ctx, existing, null);
        await ctx.db.delete(args.id);
        return args.id;
      },
      String(existing.portfolioId)
    );
  }
});
