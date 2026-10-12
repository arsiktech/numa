import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireEditor, requireMember, type AnyCtx } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { withAiAuditConfirmation } from "./lib/aiAudit";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const scopeValidator = v.union(
  v.literal("net_worth"),
  v.literal("monthly_income"),
  v.literal("income_category"),
  v.literal("asset_value"),
  v.literal("holding_value")
);

async function assertGoalRefs(
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
    if (!category || category.portfolioId !== args.portfolioId || category.kind !== "income") {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Income goal category must belong to this portfolio" });
    }
  }
  if (args.scope === "asset_value") {
    if (!args.assetId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Asset goal requires an asset" });
    }
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.portfolioId !== args.portfolioId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Asset goal target must belong to this portfolio" });
    }
  }
  if (args.scope === "holding_value") {
    if (!args.holdingId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Holding goal requires a holding" });
    }
    const holding = await ctx.db.get(args.holdingId);
    if (!holding || holding.portfolioId !== args.portfolioId) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Holding goal target must belong to this portfolio" });
    }
  }
}

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("goals")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("goals")),
    portfolioId: v.id("portfolios"),
    scope: scopeValidator,
    target: v.number(),
    currency: currencyValidator,
    startAt: v.number(),
    deadline: v.optional(v.number()),
    label: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    assetId: v.optional(v.id("assets")),
    holdingId: v.optional(v.id("holdings")),
    createdAt: v.number(),
    clientMutationId: v.optional(v.string()),
    auditDraftId: v.optional(v.id("aiActionDrafts"))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    if (args.auditDraftId && args.id) {
      throw new ConvexError({
        code: "AUDIT_PAYLOAD_MISMATCH",
        message: "AI goal drafts can only create a reviewed goal"
      });
    }
    if (args.target <= 0) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Target must be positive" });
    }
    await assertGoalRefs(ctx, args);

    const patch = {
      portfolioId: args.portfolioId,
      scope: args.scope,
      target: args.target,
      currency: args.currency,
      startAt: args.startAt,
      deadline: args.deadline,
      label: args.label,
      categoryId: args.scope === "income_category" ? args.categoryId : undefined,
      assetId: args.scope === "asset_value" ? args.assetId : undefined,
      holdingId: args.scope === "holding_value" ? args.holdingId : undefined,
      createdAt: args.createdAt
    };

    return await withAiAuditConfirmation(
      ctx,
      {
        userId,
        portfolioId: args.portfolioId,
        auditDraftId: args.auditDraftId,
        clientMutationId: args.clientMutationId,
        actionType: "goal.upsert",
        actualPayload: {
          portfolioId: args.portfolioId,
          scope: args.scope,
          target: args.target,
          currency: args.currency,
          startAt: args.startAt,
          deadline: args.deadline,
          label: args.label,
          categoryId: args.categoryId,
          assetId: args.assetId,
          holdingId: args.holdingId,
          createdAt: args.createdAt
        },
        payloadKeys: [
          "portfolioId",
          "scope",
          "target",
          "currency",
          "startAt",
          "deadline",
          "label",
          "categoryId",
          "assetId",
          "holdingId",
          "createdAt"
        ]
      },
      async () => await withMutationReceipt(
        ctx,
        userId,
        args.clientMutationId,
        "goals.upsert",
        async () => {
        if (args.id) {
          const existing = await ctx.db.get(args.id);
          if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Goal not found" });
          await requireEditor(ctx, existing.portfolioId);
          if (existing.portfolioId !== args.portfolioId) {
            throw new ConvexError({ code: "INVALID_GOAL", message: "Goal portfolio cannot change" });
          }
          await ctx.db.patch(args.id, patch);
          return args.id;
        }

        // No id means "create": always insert a new row. (Previously net_worth
        // goals were deduped per portfolio here, which silently overwrote the
        // first goal when a second one was created. Retry idempotency is
        // handled by withMutationReceipt, so no dedupe is needed.)
          return await ctx.db.insert("goals", patch);
        }
      )
    );
  }
});

export const remove = mutation({
  args: { id: v.id("goals"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "goals.remove", async () => {
      await ctx.db.delete(args.id);
      return args.id;
    });
  }
});
