import { v, ConvexError } from "convex/values";
import { removePortfolioDocument } from "./lib/removeDocument";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));

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
