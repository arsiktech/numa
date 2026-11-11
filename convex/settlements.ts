import { v, ConvexError } from "convex/values";
import { removePortfolioDocument } from "./lib/removeDocument";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { exactPositiveMoney } from "./lib/finance";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));

function assertDistinctUsers(fromUserId: Id<"users">, toUserId: Id<"users">) {
  if (fromUserId === toUserId) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Settlement payer and recipient must be different" });
  }
}

async function assertPortfolioMember(ctx: MutationCtx, portfolioId: Id<"portfolios">, userId: Id<"users">) {
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("portfolioId"), portfolioId))
    .first();
  if (!membership) {
    throw new ConvexError({ code: "INVALID_REFERENCE", message: "Settlement users must be members of this portfolio" });
  }
}

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db
      .query("settlements")
      .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
    return rows.sort((a, b) => b.occurredAt - a.occurredAt);
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    amount: v.number(),
    currency: currencyValidator,
    occurredAt: v.number(),
    note: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    exactPositiveMoney(args.amount);
    assertDistinctUsers(args.fromUserId, args.toUserId);
    await assertPortfolioMember(ctx, args.portfolioId, args.fromUserId);
    await assertPortfolioMember(ctx, args.portfolioId, args.toUserId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "settlements.add",
      async () =>
        await ctx.db.insert("settlements", {
          portfolioId: args.portfolioId,
          fromUserId: args.fromUserId,
          toUserId: args.toUserId,
          amount: args.amount,
          currency: args.currency,
          occurredAt: args.occurredAt,
          note: args.note
        })
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("settlements"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      fromUserId: v.optional(v.id("users")),
      toUserId: v.optional(v.id("users")),
      amount: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      occurredAt: v.optional(v.number()),
      note: v.optional(v.string())
    })
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Settlement not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "settlements.update",
      async () => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args.patch)) {
          if (value !== undefined) patch[key] = value;
        }
        // Only changed fields are checked, so a historical row stays editable after a member leaves.
        const { amount, fromUserId, toUserId } = args.patch;
        if (amount !== undefined && !Object.is(amount, existing.amount)) exactPositiveMoney(amount);
        const fromChanged = fromUserId !== undefined && fromUserId !== existing.fromUserId;
        const toChanged = toUserId !== undefined && toUserId !== existing.toUserId;
        if (fromChanged || toChanged) {
          assertDistinctUsers(fromUserId ?? existing.fromUserId, toUserId ?? existing.toUserId);
          if (fromChanged) await assertPortfolioMember(ctx, existing.portfolioId, fromUserId);
          if (toChanged) await assertPortfolioMember(ctx, existing.portfolioId, toUserId);
        }
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
    );
  }
});

export const remove = mutation({
  args: { id: v.id("settlements"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await removePortfolioDocument(ctx, args.id, args.clientMutationId, "settlements.remove")
});
