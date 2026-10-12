import { assertCashAccountDefinitionChange } from "./money";
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { addMoney } from "./lib/finance";
import { assertAssetBalance } from "./lib/inputGuards";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const assetKindValidator = v.union(
  v.literal("cash"),
  v.literal("real_estate"),
  v.literal("vehicle"),
  v.literal("collectible"),
  v.literal("other")
);
const clearableStringValidator = v.union(v.string(), v.null());

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("assets")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: assetKindValidator,
    balance: v.number(),
    currency: currencyValidator,
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "assets.add",
      async () => {
        assertAssetBalance(args.balance);
        return await ctx.db.insert("assets", {
          portfolioId: args.portfolioId,
          name: args.name,
          kind: args.kind,
          balance: args.balance,
          currency: args.currency,
          notes: args.notes,
          updatedAt: Date.now()
        });
      }
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("assets"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      name: v.optional(v.string()),
      kind: v.optional(assetKindValidator),
      balance: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      notes: v.optional(clearableStringValidator)
    })
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Asset not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "assets.update", async () => {
      // Metadata edits must not rewrite or reject historical sub-cent balances.
      if (args.patch.balance !== undefined && !Object.is(args.patch.balance, existing.balance)) {
        assertAssetBalance(args.patch.balance);
      }
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      for (const [key, value] of Object.entries(args.patch)) {
        if (value !== undefined) patch[key] = value === null ? undefined : value;
      }
      await assertCashAccountDefinitionChange(ctx, existing, {
        kind: args.patch.kind ?? existing.kind, currency: args.patch.currency ?? existing.currency
      });
      await ctx.db.patch(args.id, patch);
      return args.id;
    });
  }
});

/**
 * Atomic balance increment for goal contributions ("Add money"). Unlike
 * `update` (absolute last-write-wins patch), this reads the current balance
 * inside the Convex transaction and applies `existing.balance + delta`, so
 * concurrent contributions from multiple devices/surfaces converge instead of
 * silently overwriting each other. `delta` must already be in the asset's own
 * currency — callers convert client-side before invoking.
 */
export const adjustBalance = mutation({
  args: {
    id: v.id("assets"),
    delta: v.number(),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.delta)) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "delta must be a finite number" });
    }
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Asset not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "assets.adjustBalance", async () => {
      await ctx.db.patch(args.id, {
        // FX-converted contributions may contain sub-cents; round each amount
        // with the shared money policy and reject unavailable/overflow totals.
        balance: addMoney(existing.balance, args.delta),
        updatedAt: Date.now()
      });
      return args.id;
    });
  }
});

export const remove = mutation({
  args: { id: v.id("assets"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "assets.remove", async () => {
      await assertCashAccountDefinitionChange(ctx, existing, null);
      await ctx.db.delete(args.id);
      return args.id;
    });
  }
});
