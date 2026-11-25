import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, query, type MutationCtx } from "./_generated/server";
import { internalMutationWithoutHistory } from "./lib/functions";
import { requireMember } from "./lib/access";
import { recordNameOf, recordTypeOf, recordTypeValidator, recordValues, TRACKED_TABLES, type Tracked } from "./lib/recordHistory";

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

/**
 * Records deleted from a space, newest first, one row each: the entry that deleted it, with the
 * record's fields at that moment. Read its whole history with `list` and its id.
 */
export const deleted = query({
  args: { portfolioId: v.id("portfolios"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const limit = Math.max(1, Math.min(MAX, Math.floor(args.limit ?? 100)));
    const rows = await ctx.db
      .query("recordChanges")
      .withIndex("by_action", (q) => q.eq("portfolioId", args.portfolioId).eq("action", "deleted"))
      .order("desc")
      .take(limit);
    const seen = new Set<string>();
    return rows.filter((row) => (seen.has(row.recordId) ? false : (seen.add(row.recordId), true)));
  },
});

const BACKFILL_PAGE = 200;
export const BACKFILL_ACTOR = { kind: "system" as const, name: "Backfill" };

/**
 * One page of the backfill: an "Added" entry for each record in `table` that has none, dated when
 * the record was created. Records that already have one are left alone, so running it again adds nothing.
 */
export const backfillPage = internalMutationWithoutHistory({
  args: { table: v.union(...TRACKED_TABLES.map((t) => v.literal(t))), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { table, cursor }) => {
    const page = await ctx.db.query(table as Tracked).paginate({ cursor, numItems: BACKFILL_PAGE });
    let added = 0;
    for (const doc of page.page) {
      const row = doc as unknown as Record<string, unknown> & { _id: string; _creationTime: number; portfolioId: Id<"portfolios"> };
      const has = await ctx.db
        .query("recordChanges")
        .withIndex("by_record", (q) => q.eq("portfolioId", row.portfolioId).eq("recordId", row._id))
        .filter((q) => q.eq(q.field("action"), "created"))
        .first();
      if (has) continue;
      const createdAt = typeof row.createdAt === "number" && Number.isFinite(row.createdAt) ? row.createdAt : row._creationTime;
      await ctx.db.insert("recordChanges", {
        portfolioId: row.portfolioId, at: createdAt, recordType: recordTypeOf(table as Tracked), recordId: row._id,
        recordName: recordNameOf(table as Tracked, row), action: "created", values: recordValues(table as Tracked, row), actor: BACKFILL_ACTOR,
      });
      added++;
    }
    return { scanned: page.page.length, added, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** Runs the backfill over every kept record. Safe to run more than once. `npx convex run recordHistory:backfill` */
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scanned: number; added: number; byTable: Record<string, { scanned: number; added: number }> }> => {
    const byTable: Record<string, { scanned: number; added: number }> = {};
    let scanned = 0, added = 0;
    for (const table of TRACKED_TABLES) {
      const tally = { scanned: 0, added: 0 };
      let cursor: string | null = null;
      do {
        const page: { scanned: number; added: number; cursor: string | null } = await ctx.runMutation(internal.recordHistory.backfillPage, { table, cursor });
        tally.scanned += page.scanned; tally.added += page.added; cursor = page.cursor;
      } while (cursor !== null);
      byTable[table] = tally; scanned += tally.scanned; added += tally.added;
    }
    return { scanned, added, byTable };
  },
});
