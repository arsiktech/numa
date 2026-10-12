import { v, ConvexError } from "convex/values";
import { removePortfolioDocument } from "./lib/removeDocument";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const liabilityKindValidator = v.union(
  v.literal("credit_card"),
  v.literal("loan"),
  v.literal("mortgage"),
  v.literal("other")
);
const clearableNumberValidator = v.union(v.number(), v.null());
const clearableStringValidator = v.union(v.string(), v.null());

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("liabilities")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: liabilityKindValidator,
    balance: v.number(),
    currency: currencyValidator,
    interestRate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "liabilities.add",
      async () =>
        await ctx.db.insert("liabilities", {
          portfolioId: args.portfolioId,
          name: args.name,
          kind: args.kind,
          balance: args.balance,
          currency: args.currency,
          interestRate: args.interestRate,
          dueDate: args.dueDate,
          notes: args.notes,
          updatedAt: Date.now()
        })
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("liabilities"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      name: v.optional(v.string()),
      kind: v.optional(liabilityKindValidator),
      balance: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      interestRate: v.optional(clearableNumberValidator),
      dueDate: v.optional(clearableNumberValidator),
      notes: v.optional(clearableStringValidator)
    })
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Liability not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "liabilities.update",
      async () => {
        const patch: Record<string, unknown> = { updatedAt: Date.now() };
        for (const [key, value] of Object.entries(args.patch)) {
          if (value !== undefined) patch[key] = value === null ? undefined : value;
        }
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
    );
  }
});

export const remove = mutation({
  args: { id: v.id("liabilities"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await removePortfolioDocument(ctx, args.id, args.clientMutationId, "liabilities.remove")
});
