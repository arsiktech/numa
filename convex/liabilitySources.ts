import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { checkPortalUrl, fetchCompanyBalance, type Post } from "./lib/portalSource";

/** Debts that follow a company portal. Read every 30 minutes; the portal link is read-only. */

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
      liabilityId: r.liabilityId, host: new URL(r.url).hostname, status: r.status ?? null, message: r.message ?? null,
      checkedAt: r.checkedAt ?? null, readingAt: r.readingAt ?? null,
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

/** Stops following; the debt keeps its last value. */
export const disconnect = mutation({
  args: { liabilityId: v.id("liabilities") },
  handler: async (ctx, { liabilityId }) => {
    const row = await ctx.db.query("liabilitySources").withIndex("by_liability", (q) => q.eq("liabilityId", liabilityId)).first();
    if (!row) return null;
    await requireEditor(ctx, row.portfolioId);
    await ctx.db.delete(row._id);
    return null;
  },
});

type Target = { id: Id<"liabilitySources">; url: string; key: string | null };

export const target = internalQuery({
  args: { sourceId: v.id("liabilitySources") },
  handler: async (ctx, { sourceId }): Promise<Target | null> => {
    const row = await ctx.db.get(sourceId);
    return row ? { id: row._id, url: row.url, key: row.key ?? null } : null;
  },
});

export const due = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Target[]> => {
    const out: Target[] = [];
    for await (const row of ctx.db.query("liabilitySources")) {
      if (row.checkedAt !== undefined && now - row.checkedAt < SCHEDULED_AGE_MS) continue;
      out.push({ id: row._id, url: row.url, key: row.key ?? null });
      if (out.length >= SCHEDULED_BATCH) break;
    }
    return out;
  },
});

const readingValidator = v.union(
  v.object({ status: v.literal("ok"), shortfall: v.number(), currency: v.union(v.literal("EUR"), v.literal("USD")), asOf: v.number() }),
  v.object({ status: v.union(v.literal("incomplete"), v.literal("failed")), message: v.string() }),
);

/** Writes a reading: a complete one sets the debt; any other only records why it didn't. */
export const save = internalMutation({
  args: { sourceId: v.id("liabilitySources"), reading: readingValidator, checkedAt: v.number() },
  handler: async (ctx, { sourceId, reading, checkedAt }): Promise<boolean> => {
    const row = await ctx.db.get(sourceId);
    if (!row) return false;
    const debt = await ctx.db.get(row.liabilityId);
    if (!debt) { await ctx.db.delete(row._id); return false; }
    if (reading.status !== "ok") {
      await ctx.db.patch(row._id, { status: reading.status, message: reading.message, checkedAt });
      return false;
    }
    if (debt.balance !== reading.shortfall || debt.currency !== reading.currency) {
      await ctx.db.patch(debt._id, { balance: reading.shortfall, currency: reading.currency, updatedAt: checkedAt });
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
    const reading = await fetchCompanyBalance(t.url, t.key ?? undefined, post, now);
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
      const reading = await fetchCompanyBalance(t.url, t.key ?? undefined, post, Date.now());
      if (await ctx.runMutation(internal.liabilitySources.save, { sourceId: t.id, reading, checkedAt: Date.now() })) saved += 1;
    }
    return saved;
  },
});
