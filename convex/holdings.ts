import { v, ConvexError } from "convex/values";
import { removePortfolioDocument } from "./lib/removeDocument";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { assertTimestamp, majorUnits, minorUnits } from "./lib/finance";

function assertHolding(input: { quantity: number; costBasis: number; acquiredAt: number }) {
  if (!Number.isFinite(input.quantity) || input.quantity < 0 || input.costBasis < 0 ||
      majorUnits(minorUnits(input.costBasis)) !== input.costBasis) {
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Holding quantity and cost basis must be finite and non-negative; cost basis must use whole cents." });
  }
  assertTimestamp(input.acquiredAt);
}

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const holdingKindValidator = v.union(
  v.literal("stock"),
  v.literal("etf"),
  v.literal("crypto"),
  v.literal("index")
);

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("holdings")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const listEventsForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("holdingEvents")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
    name: v.string(),
    kind: holdingKindValidator,
    quantity: v.number(),
    costBasis: v.number(),
    currency: currencyValidator,
    acquiredAt: v.number(),
    recordPurchase: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "holdings.add",
      async () => {
        assertHolding(args);
        if (args.recordPurchase && (!args.clientMutationId?.trim() || args.quantity <= 0 || !Number.isFinite(args.costBasis / args.quantity))) {
          throw new ConvexError({ code: "INVALID_ARGUMENT", message: "A purchase requires a positive quantity and a retry identity." });
        }
        const id = await ctx.db.insert("holdings", {
          portfolioId: args.portfolioId,
          symbol: args.symbol,
          name: args.name,
          kind: args.kind,
          quantity: args.quantity,
          costBasis: args.costBasis,
          currency: args.currency,
          acquiredAt: args.acquiredAt
        });
        if (args.recordPurchase) await ctx.db.insert("holdingEvents", {
          portfolioId: args.portfolioId, holdingId: id, symbol: args.symbol,
          kind: "buy", quantity: args.quantity, unitPrice: args.costBasis / args.quantity,
          total: args.costBasis, currency: args.currency, occurredAt: args.acquiredAt
        });
        return id;
      },
      String(args.portfolioId)
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("holdings"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      symbol: v.optional(v.string()),
      name: v.optional(v.string()),
      kind: v.optional(holdingKindValidator),
      quantity: v.optional(v.number()),
      costBasis: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      acquiredAt: v.optional(v.number())
    })
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Holding not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "holdings.update",
      async () => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args.patch)) {
          if (value !== undefined) patch[key] = value;
        }
        assertHolding({ ...existing, ...patch } as typeof existing);
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
    );
  }
});

export const remove = mutation({
  args: { id: v.id("holdings"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await removePortfolioDocument(ctx, args.id, args.clientMutationId, "holdings.remove")
});

export const addEvent = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    holdingId: v.id("holdings"),
    symbol: v.string(),
    kind: v.union(v.literal("buy"), v.literal("sell")),
    quantity: v.number(),
    unitPrice: v.number(),
    total: v.number(),
    currency: currencyValidator,
    occurredAt: v.number(),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const holding = await ctx.db.get(args.holdingId);
    if (!holding || String(holding.portfolioId) !== String(args.portfolioId)) {
      throw new ConvexError({
        code: "INVALID_REFERENCE",
        message: "Holding does not belong to this portfolio"
      });
    }
    if (args.quantity <= 0 || args.unitPrice < 0 || args.total < 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Holding event amounts must be positive"
      });
    }
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "holdingEvents.add",
      async () =>
        await ctx.db.insert("holdingEvents", {
          portfolioId: args.portfolioId,
          holdingId: args.holdingId,
          symbol: args.symbol,
          kind: args.kind,
          quantity: args.quantity,
          unitPrice: args.unitPrice,
          total: args.total,
          currency: args.currency,
          occurredAt: args.occurredAt,
          notes: args.notes
        })
    );
  }
});
