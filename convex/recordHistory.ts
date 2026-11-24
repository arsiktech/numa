import { v } from "convex/values";
import { query } from "./_generated/server";
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
