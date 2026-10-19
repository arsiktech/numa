import { ConvexError, v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { checkLoanLinks, parseKey, takenBy, type ParsedKey } from "./lib/loanLinks";
import { withMutationReceipt } from "./lib/mutationReceipts";

const targetValidator = v.object({
  key: v.string(),
  role: v.union(v.literal("deployed"), v.literal("collateral")),
  part: v.optional(v.object({ symbol: v.string(), quantity: v.number() }))
});

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db.query("loanLinks").withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId)).collect();
    return rows.map((r) => ({ loanKey: r.loanKey, targets: r.targets, updatedAt: r.updatedAt }));
  }
});

/** The record a key names must sit in this space. */
async function assertOwned(ctx: MutationCtx, portfolioId: Id<"portfolios">, key: ParsedKey) {
  const [table, raw]: [TableNames, string] = "walletId" in key ? ["cryptoWallets", key.walletId]
    : [key.kind === "holding" ? "holdings" : key.kind === "asset" ? "assets" : "liabilities", key.id];
  const id = ctx.db.normalizeId(table, raw);
  const doc = id ? await ctx.db.get(id) : null;
  if (!doc || !("portfolioId" in doc) || String(doc.portfolioId) !== String(portfolioId)) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That record isn't in this space" });
  }
}

/**
 * Says where one loan's money went (and, for a recorded debt, what backs it). Replaces the loan's
 * links; an empty list removes them. Sending the same links again changes nothing.
 */
export const set = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    loanKey: v.string(),
    targets: v.array(targetValidator),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const rows = await ctx.db.query("loanLinks").withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId)).collect();
    const parsed = checkLoanLinks(args.loanKey, args.targets, takenBy(rows));
    // Clearing needs no live loan: a repaid borrowing or a deleted debt can still let its places go.
    if (args.targets.length) await assertOwned(ctx, args.portfolioId, parseKey(args.loanKey)!);
    for (const p of parsed) await assertOwned(ctx, args.portfolioId, p);
    const existing = rows.find((r) => r.loanKey === args.loanKey) ?? null;
    if (!existing && !args.targets.length) return null;
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "loanLinks.set", async (): Promise<Id<"loanLinks">> => {
      if (existing && !args.targets.length) { await ctx.db.delete(existing._id); return existing._id; }
      if (existing) { await ctx.db.patch(existing._id, { targets: args.targets, updatedAt: Date.now() }); return existing._id; }
      return await ctx.db.insert("loanLinks", { portfolioId: args.portfolioId, loanKey: args.loanKey, targets: args.targets, updatedAt: Date.now() });
    }, args.portfolioId);
  }
});
