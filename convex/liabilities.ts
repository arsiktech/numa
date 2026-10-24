import { v, ConvexError } from "convex/values";
import { removePortfolioDocument } from "./lib/removeDocument";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { assertTermsAfterPatch, termsPatch, validDueDate } from "./lib/loanTerms";
import { withMutationReceipt } from "./lib/mutationReceipts";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const liabilityKindValidator = v.union(
  v.literal("credit_card"),
  v.literal("loan"),
  v.literal("mortgage"),
  v.literal("other")
);
const clearableNumberValidator = v.union(v.number(), v.null());
const DAY = 86_400_000;
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
        if (typeof args.patch.dueDate === "number" && !validDueDate(args.patch.dueDate, Date.now())) {
          throw new ConvexError({ code: "INVALID_INPUT", message: "The due date isn’t a valid date" });
        }
        // Clearing the date of a fixed loan makes it no longer fixed, as the app's item editor does.
        if (args.patch.dueDate === null && existing.dueKind === "fixed") patch.dueKind = undefined;
        // An edit here must still fit the loan terms, as the terms form would require.
        assertTermsAfterPatch(existing, patch);
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

const dueKindValidator = v.union(v.literal("fixed"), v.literal("flexible"));
const interestTermsValidator = v.union(v.literal("none"), v.literal("simple"), v.literal("manual"));

/**
 * Saves a debt's loan terms: the original amount, start date, whether it has a repayment date, and
 * its interest. A field left out keeps what is saved; null clears it. The balance never changes
 * here. Terms Numa cannot calculate are kept as manual rather than calculated wrongly.
 */
export const setTerms = mutation({
  args: {
    id: v.id("liabilities"),
    principal: v.optional(clearableNumberValidator),
    startedAt: v.optional(clearableNumberValidator),
    dueKind: v.optional(v.union(dueKindValidator, v.null())),
    interestTerms: v.optional(v.union(interestTermsValidator, v.null())),
    interestRate: v.optional(clearableNumberValidator),
    interestDueDay: v.optional(clearableNumberValidator),
    dueDate: v.optional(clearableNumberValidator),
    /** A line for the debt's history about what changed, saved in the same write as the terms. */
    note: v.optional(v.object({ text: v.string(), occurredAt: v.number() })),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Liability not found" });
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    const { id, clientMutationId, note, ...input } = args;
    void id; void clientMutationId;
    const patch = termsPatch(input, existing, Date.now());
    const text = note?.text.trim().replace(/\s+/g, " ");
    if (note && (!text || text.length > 140)) throw new ConvexError({ code: "INVALID_INPUT", message: "Keep the note to 140 characters" });
    if (note && (!Number.isFinite(note.occurredAt) || note.occurredAt > Date.now() + DAY)) throw new ConvexError({ code: "INVALID_INPUT", message: "The note’s date can’t be in the future" });
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "liabilities.setTerms", async () => {
      await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });
      if (note && text) {
        await ctx.db.insert("debtEvents", { portfolioId: existing.portfolioId, subject: `liability:${args.id}`, kind: "note", applied: false, occurredAt: note.occurredAt, createdAt: Date.now(), note: text });
      }
      return args.id;
    }, existing.portfolioId);
  }
});
