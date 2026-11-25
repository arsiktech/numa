import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { internalMutationBy, mutation } from "./lib/functions";
import { type Post } from "./lib/portalSource";
import { fetchShared, planRecords, sharedBalancesUrl, type HeldRecord, type SharedReading } from "./lib/sharedBalances";

/**
 * Copies one Numa Shared household into this space: one record per counterparty, read on a schedule.
 * Numa Pro never writes to Numa Shared. A failed read keeps the last amounts and marks them stale.
 */

const TIMEOUT_MS = 15_000;
const SCHEDULED_AGE_MS = 25 * 60_000;
const SCHEDULED_BATCH = 25;
const HOUSEHOLD = /^[A-Za-z0-9_-]{8,80}$/;
const TOKEN = /^nspro_[A-Za-z0-9_-]{40,80}$/;
const bad = (message: string) => { throw new ConvexError({ code: "INVALID_SHARED_LINK", message }); };

const post: Post = async (url, headers, body) => {
  const response = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { ok: response.ok, status: response.status, text: (await response.text()).slice(0, 200_000) };
};

type SyncMark = NonNullable<Doc<"liabilities">["sharedSync"]>;

function mark(row: { sharedSync?: SyncMark }, householdId: string): string | undefined {
  return row.sharedSync?.householdId === householdId ? row.sharedSync.unitId : undefined;
}

/** The space's Numa Shared links, without the key. */
export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, { portfolioId }) => {
    await requireMember(ctx, portfolioId);
    const rows = await ctx.db.query("sharedLinks").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect();
    return rows.map((row) => ({
      id: row._id, householdId: row.householdId, status: row.status ?? null, message: row.message ?? null,
      checkedAt: row.checkedAt ?? null, readingAt: row.readingAt ?? null,
    }));
  },
});

/** Starts copying one household. A link that is already there keeps its records and reads again. */
export const connect = mutation({
  args: { portfolioId: v.id("portfolios"), householdId: v.string(), token: v.string() },
  handler: async (ctx, { portfolioId, householdId, token }) => {
    const { userId } = await requireEditor(ctx, portfolioId);
    const household = householdId.trim();
    const key = token.trim();
    if (!HOUSEHOLD.test(household)) bad("Paste the household id from Numa Shared");
    if (!TOKEN.test(key)) bad("Paste the Numa Pro key from Numa Shared");
    if (!sharedBalancesUrl()) bad("Numa Shared isn't configured");
    const existing = await ctx.db.query("sharedLinks").withIndex("by_household", (q) => q.eq("portfolioId", portfolioId).eq("householdId", household)).unique();
    const id = existing?._id ?? await ctx.db.insert("sharedLinks", { portfolioId, householdId: household, token: key, createdBy: userId, createdAt: Date.now() });
    if (existing) await ctx.db.patch(id, { token: key });
    await ctx.scheduler.runAfter(0, internal.sharedLinks.syncOne, { linkId: id });
    return { id };
  },
});

/** Stops copying. The records stay, still marked as synced, until they are deleted. */
export const disconnect = mutation({
  args: { id: v.id("sharedLinks") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await requireEditor(ctx, row.portfolioId);
    await ctx.db.delete(id);
    return null;
  },
});

/** Reads one household now. */
export const syncNow = mutation({
  args: { id: v.id("sharedLinks") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new ConvexError({ code: "NOT_FOUND", message: "Link not found" });
    await requireEditor(ctx, row.portfolioId);
    await ctx.scheduler.runAfter(0, internal.sharedLinks.syncOne, { linkId: id });
    return null;
  },
});

type Target = { id: Id<"sharedLinks">; householdId: string; token: string };

export const target = internalQuery({
  args: { linkId: v.id("sharedLinks") },
  handler: async (ctx, { linkId }): Promise<Target | null> => {
    const row = await ctx.db.get(linkId);
    return row ? { id: row._id, householdId: row.householdId, token: row.token } : null;
  },
});

export const due = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Target[]> => {
    const due: Array<Target & { checkedAt: number }> = [];
    for await (const row of ctx.db.query("sharedLinks")) {
      if (row.checkedAt !== undefined && now - row.checkedAt < SCHEDULED_AGE_MS) continue;
      due.push({ id: row._id, householdId: row.householdId, token: row.token, checkedAt: row.checkedAt ?? 0 });
    }
    due.sort((a, b) => a.checkedAt - b.checkedAt);
    return due.slice(0, SCHEDULED_BATCH).map(({ id, householdId, token }) => ({ id, householdId, token }));
  },
});

const lineValidator = v.object({ unitId: v.string(), label: v.string(), minorUnits: v.string() });
const readingValidator = v.union(
  v.object({ status: v.literal("ok"), currency: v.union(v.literal("EUR"), v.literal("USD")), lines: v.array(lineValidator) }),
  v.object({ status: v.literal("stale"), message: v.string() }),
);

/** Writes a reading. A stale one keeps every amount and flags the records. */
export const save = internalMutationBy("Numa Shared")({
  args: { linkId: v.id("sharedLinks"), reading: readingValidator, checkedAt: v.number() },
  handler: async (ctx, { linkId, reading, checkedAt }) => {
    const link = await ctx.db.get(linkId);
    if (!link) return false;
    const assets = await ctx.db.query("assets").withIndex("by_portfolio", (q) => q.eq("portfolioId", link.portfolioId)).collect();
    const liabilities = await ctx.db.query("liabilities").withIndex("by_portfolio", (q) => q.eq("portfolioId", link.portfolioId)).collect();
    const held: Array<{ id: Id<"assets" | "liabilities">; table: "assets" | "liabilities"; doc: Doc<"assets"> | Doc<"liabilities"> }> = [
      ...assets.map((doc) => ({ id: doc._id, table: "assets" as const, doc })),
      ...liabilities.map((doc) => ({ id: doc._id, table: "liabilities" as const, doc })),
    ];
    const synced = held.filter((row) => mark(row.doc, link.householdId));
    if (reading.status !== "ok") {
      await ctx.db.patch(link._id, { status: "stale", message: reading.message, checkedAt });
      for (const row of synced) {
        const current = row.doc.sharedSync!;
        await ctx.db.patch(row.id, { sharedSync: { ...current, stale: true, checkedAt } });
      }
      return false;
    }
    const records: HeldRecord[] = synced.map((row) => ({
      id: row.id, table: row.table, balance: row.doc.balance, currency: row.doc.currency, unitId: row.doc.sharedSync!.unitId,
    }));
    const plan = planRecords(records, reading.lines, reading.currency);
    const nameFor = (label: string) => (label ? `Numa Shared · ${label}`.slice(0, 80) : undefined);
    const stamp = (unitId: string): SyncMark => ({ householdId: link.householdId, unitId, checkedAt, readingAt: checkedAt, stale: false });
    for (const id of plan.deletes) await ctx.db.delete(id as Id<"assets">);
    for (const write of plan.writes) {
      const name = nameFor(write.label);
      const sync = stamp(write.unitId);
      if (write.id) {
        const patch: Record<string, unknown> = { balance: write.balance, currency: write.currency, sharedSync: sync, updatedAt: checkedAt };
        if (name) patch.name = name;
        if (write.table === "liabilities" && name) patch.counterparty = write.label.slice(0, 80);
        if (write.table === "assets" && name) patch.owedBy = write.label.slice(0, 80);
        await ctx.db.patch(write.id as Id<"assets">, patch);
      } else if (write.balance > 0 && name) {
        const common = {
          portfolioId: link.portfolioId, name, kind: "other" as const, balance: write.balance, currency: write.currency,
          notes: "Synced from Numa Shared. This amount updates on its own.", sharedSync: sync, updatedAt: checkedAt,
        };
        if (write.table === "liabilities") await ctx.db.insert("liabilities", { ...common, counterparty: write.label.slice(0, 80) });
        else await ctx.db.insert("assets", { ...common, owedBy: write.label.slice(0, 80) });
      }
    }
    await ctx.db.patch(link._id, { status: "ok", message: undefined, checkedAt, readingAt: checkedAt });
    return true;
  },
});

async function readOne(target: Target): Promise<SharedReading> {
  const url = sharedBalancesUrl();
  if (!url) return { status: "stale", message: "Numa Shared isn't configured" };
  return await fetchShared(url, target.token, target.householdId, post);
}

export const syncOne = internalAction({
  args: { linkId: v.id("sharedLinks") },
  handler: async (ctx, { linkId }): Promise<boolean> => {
    const row: Target | null = await ctx.runQuery(internal.sharedLinks.target, { linkId });
    if (!row) return false;
    const reading = await readOne(row);
    return await ctx.runMutation(internal.sharedLinks.save, { linkId, reading, checkedAt: Date.now() });
  },
});

/** Every 30 minutes: households not read recently, a bounded batch at a time. */
export const refreshDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const targets: Target[] = await ctx.runQuery(internal.sharedLinks.due, { now: Date.now() });
    let saved = 0;
    for (const target of targets) {
      const reading = await readOne(target);
      if (await ctx.runMutation(internal.sharedLinks.save, { linkId: target.id, reading, checkedAt: Date.now() })) saved += 1;
    }
    return saved;
  },
});
