import { categoryBudgetCurrency } from "./money";
import { removePortfolioDocument } from "./lib/removeDocument";
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { withAiAuditConfirmation } from "./lib/aiAudit";

const categoryKindValidator = v.union(v.literal("income"), v.literal("expense"));
const clearableStringValidator = v.union(v.string(), v.null());
const clearableNumberValidator = v.union(v.number(), v.null());

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("categories")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: categoryKindValidator,
    icon: v.string(),
    color: v.string(),
    sortOrder: v.number(),
    emoji: v.optional(v.string()),
    monthlyLimit: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
    auditDraftId: v.optional(v.id("aiActionDrafts"))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    return await withAiAuditConfirmation(
      ctx,
      {
        userId,
        portfolioId: args.portfolioId,
        auditDraftId: args.auditDraftId,
        clientMutationId: args.clientMutationId,
        actionType: "category.create",
        actualPayload: {
          portfolioId: args.portfolioId,
          name: args.name,
          kind: args.kind,
          icon: args.icon,
          color: args.color,
          sortOrder: args.sortOrder,
          emoji: args.emoji,
          monthlyLimit: args.monthlyLimit
        },
        payloadKeys: [
          "portfolioId",
          "name",
          "kind",
          "icon",
          "color",
          "sortOrder",
          "emoji",
          "monthlyLimit"
        ]
      },
      async () => await withMutationReceipt(
        ctx,
        userId,
        args.clientMutationId,
        "categories.add",
        async () => {
          if (args.monthlyLimit !== undefined && args.kind !== "expense") throw new Error("Monthly spending budgets require an expense category");
          const monthlyLimitCurrency = await categoryBudgetCurrency(ctx, args.portfolioId, args.monthlyLimit);
          return await ctx.db.insert("categories", {
            portfolioId: args.portfolioId,
            name: args.name,
            kind: args.kind,
            icon: args.icon,
            color: args.color,
            sortOrder: args.sortOrder,
            emoji: args.emoji,
            monthlyLimit: args.monthlyLimit,
            monthlyLimitCurrency
          });
        },
        String(args.portfolioId)
      )
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("categories"),
    clientMutationId: v.optional(v.string()),
    auditDraftId: v.optional(v.id("aiActionDrafts")),
    patch: v.object({
      name: v.optional(v.string()),
      kind: v.optional(categoryKindValidator),
      icon: v.optional(v.string()),
      color: v.optional(v.string()),
      sortOrder: v.optional(v.number()),
      emoji: v.optional(clearableStringValidator),
      monthlyLimit: v.optional(clearableNumberValidator)
    })
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    if (args.auditDraftId) {
      const auditedKeys = Object.entries(args.patch)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      if (auditedKeys.length !== 1 || auditedKeys[0] !== "monthlyLimit") {
        throw new ConvexError({
          code: "AUDIT_PAYLOAD_MISMATCH",
          message: "A budget draft can only update the monthly limit"
        });
      }
    }
    return await withAiAuditConfirmation(
      ctx,
      {
        userId,
        portfolioId: existing.portfolioId,
        auditDraftId: args.auditDraftId,
        clientMutationId: args.clientMutationId,
        actionType: "budget.update",
        actualPayload: {
          portfolioId: existing.portfolioId,
          categoryId: args.id,
          monthlyLimit: args.patch.monthlyLimit
        },
        payloadKeys: ["portfolioId", "categoryId", "monthlyLimit"]
      },
      async () => await withMutationReceipt(
        ctx,
        userId,
        args.clientMutationId,
        "categories.update",
        async () => {
          const patch: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(args.patch)) {
            if (value !== undefined) patch[key] = value === null ? undefined : value;
          }
          if (args.patch.monthlyLimit !== undefined) {
            if (args.patch.monthlyLimit !== null && (args.patch.kind ?? existing.kind) !== "expense") {
              throw new Error("Monthly spending budgets require an expense category");
            }
            patch.monthlyLimitCurrency = await categoryBudgetCurrency(ctx, existing.portfolioId, args.patch.monthlyLimit, existing);
          }
          if (args.patch.kind === "income" && existing.monthlyLimit !== undefined && args.patch.monthlyLimit !== null) {
            throw new Error("Remove the spending budget before changing its category to income");
          }
          await ctx.db.patch(args.id, patch);
          return args.id;
        },
        String(existing.portfolioId)
      )
    );
  }
});

export const remove = mutation({
  args: { id: v.id("categories"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await removePortfolioDocument(ctx, args.id, args.clientMutationId, "categories.remove")
});
