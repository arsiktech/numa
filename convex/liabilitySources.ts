import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { checkPortalUrl, fetchPortal, type Metric, type Post } from "./lib/portalSource";

/**
 * Records that follow a company portal: a debt as the company's shortfall, or a debt or money owed
 * to the person as what the company owes some investors. Read every 30 minutes; the link is read-only.
 */

const TIMEOUT_MS = 15_000;
const SCHEDULED_AGE_MS = 25 * 60_000;
const SCHEDULED_BATCH = 25;
const bad = (message: string) => new ConvexError({ code: "INVALID_PORTAL_LINK", message });

const post: Post = async (url, headers, body) => {
  // Redirects are not followed, so the key only ever goes to the link given. "manual" is the mode the
  // hosted runtime supports (as in sheetsImport); "error" made every call fail before it left.
  const response = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { ok: response.ok, status: response.status, text: (await response.text()).slice(0, 200_000) };
};

/** What the space's debts follow, without the secret. */
export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, { portfolioId }) => {
    await requireMember(ctx, portfolioId);
    const rows = await ctx.db.query("liabilitySources").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect();
    return rows.map((r) => ({
      liabilityId: r.liabilityId ?? null, assetId: r.assetId ?? null, label: r.label ?? null, host: new URL(r.url).hostname,
      status: r.status ?? null, message: r.message ?? null, checkedAt: r.checkedAt ?? null, readingAt: r.readingAt ?? null,
    }));
  },
});

/** Makes a debt follow a portal, replacing any portal it followed, and reads it right away. */
export const connect = mutation({
  args: { liabilityId: v.id("liabilities"), url: v.string(), key: v.optional(v.string()) },
  handler: async (ctx, { liabilityId, url, key }) => {
    const debt = await ctx.db.get(liabilityId);
    if (!debt) throw new ConvexError({ code: "NOT_FOUND", message: "Debt not found" });
    const { userId } = await requireEditor(ctx, debt.portfolioId);
    if (debt.owedSymbol) throw bad("A debt owed in a coin follows that coin’s price");
    const clean = checkPortalUrl(url);
    if (!clean) throw bad("Paste the portal’s https agent link");
    const secret = key?.trim().replace(/^bearer\s+/i, "") || undefined;
    if (secret && secret.length > 500) throw bad("That key is too long");
    const existing = await ctx.db.query("liabilitySources").withIndex("by_liability", (q) => q.eq("liabilityId", liabilityId)).first();
    if (existing) await ctx.db.delete(existing._id);
    const id = await ctx.db.insert("liabilitySources", { portfolioId: debt.portfolioId, liabilityId, url: clean, key: secret, createdBy: userId, createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.liabilitySources.syncOne, { sourceId: id });
    return { id };
  },
});

/**
 * Makes a debt, or money owed to the person, follow what the company owes some investors, through
 * the portal this space already follows. The link and key are copied on the server, never sent again.
 */
export const followInvestors = mutation({
  args: {
    record: v.string(), investorIds: v.array(v.string()), label: v.string(), clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, { record, investorIds, label }) => {
    const [kind, raw] = record.split(":");
    const liabilityId = kind === "liability" ? ctx.db.normalizeId("liabilities", raw ?? "") : null;
    const assetId = kind === "asset" ? ctx.db.normalizeId("assets", raw ?? "") : null;
    const doc = liabilityId ? await ctx.db.get(liabilityId) : assetId ? await ctx.db.get(assetId) : null;
    if (!doc) throw new ConvexError({ code: "NOT_FOUND", message: "Record not found" });
    const { userId } = await requireEditor(ctx, doc.portfolioId);
    if ("owedSymbol" in doc && doc.owedSymbol) throw bad("A debt owed in a coin follows that coin’s price");
    const ids = [...new Set(investorIds.map((i) => i.trim()).filter(Boolean))];
    if (!ids.length || ids.length > 20 || ids.some((i) => i.length > 100)) throw bad("Name between 1 and 20 investors");
    const name = label.trim().slice(0, 80);
    if (!name) throw bad("Say who the investors are");
    const portal = await ctx.db.query("liabilitySources").withIndex("by_portfolio", (q) => q.eq("portfolioId", doc.portfolioId)).first();
    if (!portal) throw bad("Connect the company portal on a debt first");
    const existing = liabilityId
      ? await ctx.db.query("liabilitySources").withIndex("by_liability", (q) => q.eq("liabilityId", liabilityId)).first()
      : await ctx.db.query("liabilitySources").withIndex("by_asset", (q) => q.eq("assetId", assetId!)).first();
    if (existing) await ctx.db.delete(existing._id);
    const id = await ctx.db.insert("liabilitySources", {
      portfolioId: doc.portfolioId, ...(liabilityId ? { liabilityId } : { assetId: assetId! }), metric: "investors", investorIds: ids, label: name,
      url: portal.url, key: portal.key, createdBy: userId, createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.liabilitySources.syncOne, { sourceId: id });
    return { id };
  },
});

/** Stops following; the record keeps its last value. */
export const disconnect = mutation({
  args: { liabilityId: v.optional(v.id("liabilities")), assetId: v.optional(v.id("assets")) },
  handler: async (ctx, { liabilityId, assetId }) => {
    const row = liabilityId
      ? await ctx.db.query("liabilitySources").withIndex("by_liability", (q) => q.eq("liabilityId", liabilityId)).first()
      : assetId ? await ctx.db.query("liabilitySources").withIndex("by_asset", (q) => q.eq("assetId", assetId)).first() : null;
    if (!row) return null;
    await requireEditor(ctx, row.portfolioId);
    await ctx.db.delete(row._id);
    return null;
  },
});

type Target = { id: Id<"liabilitySources">; url: string; key: string | null; metric: Metric };
const targetOf = (row: Doc<"liabilitySources">): Target => ({
  id: row._id, url: row.url, key: row.key ?? null,
  metric: row.metric === "investors" ? { kind: "investors", ids: row.investorIds ?? [] } : { kind: "shortfall" },
});

export const target = internalQuery({
  args: { sourceId: v.id("liabilitySources") },
  handler: async (ctx, { sourceId }): Promise<Target | null> => {
    const row = await ctx.db.get(sourceId);
    return row ? targetOf(row) : null;
  },
});

export const due = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Target[]> => {
    const out: Target[] = [];
    for await (const row of ctx.db.query("liabilitySources")) {
      if (row.checkedAt !== undefined && now - row.checkedAt < SCHEDULED_AGE_MS) continue;
      out.push(targetOf(row));
      if (out.length >= SCHEDULED_BATCH) break;
    }
    return out;
  },
});

const readingValidator = v.union(
  v.object({ status: v.literal("ok"), amount: v.number(), currency: v.union(v.literal("EUR"), v.literal("USD")), asOf: v.number() }),
  v.object({ status: v.union(v.literal("incomplete"), v.literal("failed")), message: v.string() }),
);

/** Writes a reading: a complete one sets the record; any other only records why it didn't. */
export const save = internalMutation({
  args: { sourceId: v.id("liabilitySources"), reading: readingValidator, checkedAt: v.number() },
  handler: async (ctx, { sourceId, reading, checkedAt }): Promise<boolean> => {
    const row = await ctx.db.get(sourceId);
    if (!row) return false;
    const doc = row.liabilityId ? await ctx.db.get(row.liabilityId) : row.assetId ? await ctx.db.get(row.assetId) : null;
    if (!doc) { await ctx.db.delete(row._id); return false; }
    if (reading.status !== "ok") {
      await ctx.db.patch(row._id, { status: reading.status, message: reading.message, checkedAt });
      return false;
    }
    if (doc.balance !== reading.amount || doc.currency !== reading.currency) {
      await ctx.db.patch(doc._id, { balance: reading.amount, currency: reading.currency, updatedAt: checkedAt });
    }
    await ctx.db.patch(row._id, { status: "ok", message: undefined, checkedAt, readingAt: reading.asOf });
    return true;
  },
});

export const syncOne = internalAction({
  args: { sourceId: v.id("liabilitySources") },
  handler: async (ctx, { sourceId }): Promise<boolean> => {
    const t: Target | null = await ctx.runQuery(internal.liabilitySources.target, { sourceId });
    if (!t) return false;
    const now = Date.now();
    const reading = await fetchPortal(t.url, t.key ?? undefined, post, now, t.metric);
    return await ctx.runMutation(internal.liabilitySources.save, { sourceId, reading, checkedAt: now });
  },
});

/** Every 30 minutes: portals not read recently, a bounded batch at a time. */
export const refreshDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const targets: Target[] = await ctx.runQuery(internal.liabilitySources.due, { now });
    let saved = 0;
    for (const t of targets) {
      const reading = await fetchPortal(t.url, t.key ?? undefined, post, Date.now(), t.metric);
      if (await ctx.runMutation(internal.liabilitySources.save, { sourceId: t.id, reading, checkedAt: Date.now() })) saved += 1;
    }
    return saved;
  },
});
