import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { internalMutationWithoutHistory } from "./lib/functions";
import { requireMember } from "./lib/access";
import { recordTypeValidator } from "./lib/recordHistory";

const MAX = 500;

/**
 * A space's change history, newest first. Narrow it to one record (its id, even after it was
 * deleted), to one type of record, and to a time window. `cursor` continues an earlier page.
 */
export const list = query({
  args: {
    portfolioId: v.id("portfolios"),
    recordId: v.optional(v.string()),
    recordType: v.optional(recordTypeValidator),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const limit = Math.max(1, Math.min(MAX, Math.floor(args.limit ?? 100)));
    const upper = args.to ?? Infinity;
    const lower = args.from ?? -Infinity;
    const range = <Q extends { gte: (f: "at", n: number) => Q; lte: (f: "at", n: number) => Q }>(q: Q) => {
      let out = q;
      if (Number.isFinite(lower)) out = out.gte("at", lower);
      if (Number.isFinite(upper)) out = out.lte("at", upper);
      return out;
    };
    const rows = args.recordId !== undefined
      ? ctx.db.query("recordChanges").withIndex("by_record", q => range(q.eq("portfolioId", args.portfolioId).eq("recordId", args.recordId!) as any))
      : args.recordType !== undefined
        ? ctx.db.query("recordChanges").withIndex("by_type", q => range(q.eq("portfolioId", args.portfolioId).eq("recordType", args.recordType!) as any))
        : ctx.db.query("recordChanges").withIndex("by_portfolio_at", q => range(q.eq("portfolioId", args.portfolioId) as any));
    const page = await rows.order("desc").paginate({ cursor: args.cursor ?? null, numItems: limit });
    const entries = page.page.filter(e => args.recordType === undefined || e.recordType === args.recordType);
    return { entries, cursor: page.isDone ? null : page.continueCursor };
  },
});

const PURGE_BATCH = 1000;

/**
 * Deletes a removed space's history a batch at a time, so a long history can't push the space delete
 * past Convex's per-transaction limits. Schedules the next batch while rows remain.
 */
export async function purgeSpaceHistory(ctx: MutationCtx, portfolioId: Id<"portfolios">): Promise<void> {
  const rows = await ctx.db
    .query("recordChanges")
    .withIndex("by_portfolio_at", (q) => q.eq("portfolioId", portfolioId))
    .take(PURGE_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.recordHistory.purgeSpace, { portfolioId });
}

export const purgeSpace = internalMutationWithoutHistory({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, { portfolioId }) => {
    const portfolio = await ctx.db.get(portfolioId);
    if (portfolio) return; // the space came back or was never deleted: keep its history
    await purgeSpaceHistory(ctx, portfolioId);
  },
});
