import { applyTransactionChange, assertTransactionMoney } from "./lib/transactionFinance";
import { nextRunAfter } from "./lib/recurringSchedule";
import { removePortfolioDocument } from "./lib/removeDocument";
import { assertTimestamp } from "./lib/finance";
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const kindValidator = v.union(v.literal("income"), v.literal("expense"));
const cadenceValidator = v.union(
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly")
);
const clearableCategoryIdValidator = v.union(v.id("categories"), v.null());
const clearableAccountIdValidator = v.union(v.id("assets"), v.null());
const clearableNumberValidator = v.union(v.number(), v.null());
const clearableStringValidator = v.union(v.string(), v.null());
const revenueTypeValidator = v.union(v.literal("subscription"), v.literal("retainer"));

const MAX_INCOME_SOURCE_LENGTH = 80;

/** Only income can be recurring revenue; sources are short trimmed labels. */
function assertRevenueFields(kind: "income" | "expense", revenueType: unknown, incomeSource: string | undefined) {
  if (revenueType !== undefined && kind !== "income") {
    throw new ConvexError({ code: "INVALID_REVENUE", message: "Only income can count as recurring revenue." });
  }
  if (incomeSource !== undefined && (incomeSource.trim() !== incomeSource || incomeSource.length === 0 || incomeSource.length > MAX_INCOME_SOURCE_LENGTH)) {
    throw new ConvexError({ code: "INVALID_INCOME_SOURCE", message: `Income source must be 1 to ${MAX_INCOME_SOURCE_LENGTH} characters.` });
  }
}

/**
 * Materialization posts each run through `applyTransactionChange`, so a rule
 * must pass the same money check at write time; one bad rule would otherwise
 * stop every rule in the space from posting.
 */
function assertRuleMoney(rule: { portfolioId: Id<"portfolios">; kind: "income" | "expense"; amount: number; currency: "USD" | "EUR"; nextRunAt: number; accountId?: Id<"assets">; categoryId?: Id<"categories"> }) {
  assertTransactionMoney({ ...rule, occurredAt: rule.nextRunAt });
}

/**
 * List a portfolio's recurring transactions, sorted by `nextRunAt` ascending.
 * Members only.
 */
export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db
      .query("recurring")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
    return rows.sort((a, b) => a.nextRunAt - b.nextRunAt);
  }
});

/**
 * Insert a new recurring rule. Editor+ only. `createdByUserId` is set from auth.
 * Caller is responsible for computing `nextRunAt` (matches the local UI pattern).
 */
export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    accountId: v.optional(v.id("assets")),
    kind: kindValidator,
    amount: v.number(),
    currency: currencyValidator,
    cadence: cadenceValidator,
    startAt: v.number(),
    nextRunAt: v.number(),
    endAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    revenueType: v.optional(revenueTypeValidator),
    incomeSource: v.optional(v.string()),
    createdAt: v.number(),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    assertRevenueFields(args.kind, args.revenueType, args.incomeSource);
    assertRuleMoney(args);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "recurring.add",
      async () =>
        await ctx.db.insert("recurring", {
          portfolioId: args.portfolioId,
          description: args.description,
          categoryId: args.categoryId,
          accountId: args.accountId,
          kind: args.kind,
          amount: args.amount,
          currency: args.currency,
          cadence: args.cadence,
          startAt: args.startAt,
          nextRunAt: args.nextRunAt,
          endAt: args.endAt,
          notes: args.notes,
          active: args.active,
          revenueType: args.revenueType,
          incomeSource: args.incomeSource,
          createdByUserId: userId,
          createdAt: args.createdAt
        })
    );
  }
});

/**
 * Patch a recurring rule. Editor+ on its portfolio.
 */
export const update = mutation({
  args: {
    id: v.id("recurring"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      description: v.optional(v.string()),
      categoryId: v.optional(clearableCategoryIdValidator),
      accountId: v.optional(clearableAccountIdValidator),
      kind: v.optional(kindValidator),
      amount: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      cadence: v.optional(cadenceValidator),
      startAt: v.optional(v.number()),
      nextRunAt: v.optional(v.number()),
      endAt: v.optional(clearableNumberValidator),
      notes: v.optional(clearableStringValidator),
      active: v.optional(v.boolean()),
      revenueType: v.optional(v.union(revenueTypeValidator, v.null())),
      incomeSource: v.optional(clearableStringValidator)
    })
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.id);
    if (!before) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Recurring not found" });
    }
    const { userId } = await requireEditor(ctx, before.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "recurring.update",
      async () => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args.patch)) {
          if (value !== undefined) patch[key] = value === null ? undefined : value;
        }
        const next = { ...before, ...patch } as typeof before;
        assertRevenueFields(next.kind, next.revenueType, next.incomeSource);
        // Only a changed amount or currency is checked, so an untouched legacy row stays editable.
        if (
          (args.patch.amount !== undefined && !Object.is(args.patch.amount, before.amount)) ||
          (args.patch.currency !== undefined && args.patch.currency !== before.currency)
        ) {
          assertRuleMoney(next);
        }
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
    );
  }
});

/**
 * Remove a recurring rule. Editor+ on its portfolio.
 */
export const remove = mutation({
  args: { id: v.id("recurring"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await removePortfolioDocument(ctx, args.id, args.clientMutationId, "recurring.remove")
});

/**
 * Walk every active recurring whose `nextRunAt <= now`, emitting transactions
 * for each missed occurrence (cap 60 per rule per call) and patching
 * `nextRunAt`. Also applies the cash-account delta on linked assets just like
 * `transactions.add` does. Editor+ only.
 *
 * Mirrors the local `materializeRecurring` reducer in src/services/storeReducer.ts;
 * both step with `nextRunAfter` from convex/lib/recurringSchedule.ts.
 */
export const materializeForPortfolio = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    now: v.number()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);

    const rows = await ctx.db
      .query("recurring")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();

    assertTimestamp(args.now);
    // A device clock ahead of the server must not post future runs.
    const cutoff = Math.min(args.now, Date.now());
    let emitted = 0;

    for (const r of rows) {
      if (!r.active) continue;
      if (r.endAt && r.endAt < r.nextRunAt) continue;
      let nextRunAt = r.nextRunAt;
      for (let i = 0; i < 60 && nextRunAt <= cutoff; i++) {
        if (r.endAt && nextRunAt > r.endAt) break;
        const category = r.categoryId ? await ctx.db.get(r.categoryId) : null;
        // Category deletion/retyping must not prevent materializing a valid
        // historical rule. Categories carry no money; cash refs remain strict.
        const categoryId = category?.portfolioId === r.portfolioId && category.kind === r.kind ? r.categoryId : undefined;
        await applyTransactionChange(ctx, null, { ...r, categoryId, occurredAt: nextRunAt });
        await ctx.db.insert("transactions", {
          portfolioId: r.portfolioId,
          occurredAt: nextRunAt,
          description: r.description,
          categoryId,
          accountId: r.accountId,
          kind: r.kind,
          amount: r.amount,
          currency: r.currency,
          createdByUserId: userId,
          notes: r.notes
        });
        emitted += 1;
        nextRunAt = nextRunAfter(nextRunAt, r.cadence, r.startAt);
      }
      if (nextRunAt !== r.nextRunAt) {
        await ctx.db.patch(r._id, { nextRunAt });
      }
    }

    return { emitted };
  }
});
