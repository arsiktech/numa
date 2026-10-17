import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { assertExistingAccount, requireUser } from "./lib/access";
import { rateLimitExpiresAt } from "./lib/privacyRetention";

/**
 * Connecting an AI agent to the user's account. The user presses Connect in
 * Settings and gets one secret link to paste into their agent. The agent then
 * calls /mcp with it and acts as the user through its own auth session, so
 * every rule the app follows applies to the agent too. The user can see what
 * each agent did and disconnect it at any time.
 */

declare const process: { env: Record<string, string | undefined> };

const TOKEN_PREFIX = "numa_agent_";
/** An agent stays connected for a year unless the user disconnects it sooner. */
const SESSION_MS = 365 * 24 * 3_600_000;
const MAX_CONNECTIONS = 10;
const ACTIVITY_KEEP_MS = 90 * 24 * 3_600_000;
/** Calls per agent per minute. Generous for a conversation, low enough to stop a runaway loop. */
const CALLS_PER_MINUTE = 120;

export async function sha256Hex(input: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const agentEndpoint = () => `${(process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/mcp`;

const accessValidator = v.union(v.literal("full"), v.literal("read"));

/** Creates a connection and returns its secret link. The secret is shown once; only its hash is kept. */
export const connect = mutation({
  args: { name: v.string(), access: accessValidator },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim().slice(0, 60) || "My agent";
    const active = (await ctx.db.query("agentConnections").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      .filter((c) => c.revokedAt === undefined);
    if (active.length >= MAX_CONNECTIONS) {
      throw new ConvexError({ code: "TOO_MANY_AGENTS", message: `Up to ${MAX_CONNECTIONS} agents can be connected. Disconnect one first.` });
    }
    const now = Date.now();
    const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: now + SESSION_MS });
    const secret = newSecret();
    const id = await ctx.db.insert("agentConnections", {
      userId, sessionId, name, access: args.access, tokenHash: await sha256Hex(secret), tokenHint: secret.slice(0, TOKEN_PREFIX.length + 4), createdAt: now,
    });
    const endpoint = agentEndpoint();
    return { id, name, access: args.access, endpoint, secret, link: `${endpoint}/${secret}` };
  },
});

/** The user's connected agents, without anything that could be used to act as them. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db.query("agentConnections").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const now = Date.now();
    const out = [];
    for (const row of rows) {
      if (row.revokedAt !== undefined) continue;
      const session = await ctx.db.get(row.sessionId);
      out.push({
        id: row._id, name: row.name, access: row.access, hint: row.tokenHint, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt ?? null,
        // Signing out other devices ends the agent's session too.
        active: session !== null && session.expirationTime > now,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Disconnects an agent at once: its secret stops working on the next call. */
export const disconnect = mutation({
  args: { id: v.id("agentConnections") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Agent not found" });
    if (row.revokedAt === undefined) await ctx.db.patch(id, { revokedAt: Date.now() });
    if (await ctx.db.get(row.sessionId)) await ctx.db.delete(row.sessionId);
    return null;
  },
});

/** The latest things connected agents did, newest first. */
export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 30)));
    const rows = await ctx.db.query("agentActivity").withIndex("by_user_at", (q) => q.eq("userId", userId)).order("desc").take(limit);
    const names = new Map<string, string>();
    for (const row of rows) {
      const key = String(row.connectionId);
      if (!names.has(key)) names.set(key, (await ctx.db.get(row.connectionId))?.name ?? "Disconnected agent");
    }
    return rows.map((r) => ({ id: r._id, agent: names.get(String(r.connectionId))!, tool: r.tool, write: r.write, ok: r.ok, error: r.error ?? null, at: r.at }));
  },
});

export type AgentAuth =
  | { ok: true; userId: Id<"users">; sessionId: Id<"authSessions">; connectionId: Id<"agentConnections">; access: Doc<"agentConnections">["access"] }
  | { ok: false; reason: "unknown" | "disconnected" | "expired" | "account" | "limited" };

async function consumeCall(ctx: MutationCtx, connectionId: Id<"agentConnections">, now: number): Promise<boolean> {
  const windowMs = 60_000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `agent-mcp:${connectionId}:${windowStart}`;
  const bucket = await ctx.db.query("rateLimitBuckets").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (!bucket) {
    await ctx.db.insert("rateLimitBuckets", { key, route: "agent-mcp", identityHash: String(connectionId), windowStart, windowMs, limit: CALLS_PER_MINUTE, count: 1, updatedAt: now, expiresAt: rateLimitExpiresAt(windowStart, windowMs) });
    return true;
  }
  if (bucket.count >= CALLS_PER_MINUTE) return false;
  await ctx.db.patch(bucket._id, { count: bucket.count + 1, updatedAt: now });
  return true;
}

/** Checks an agent's secret on every call, and counts the call. */
export const authenticate = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }): Promise<AgentAuth> => {
    const row = await ctx.db.query("agentConnections").withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash)).unique();
    if (!row) return { ok: false, reason: "unknown" };
    if (row.revokedAt !== undefined) return { ok: false, reason: "disconnected" };
    const now = Date.now();
    const session = await ctx.db.get(row.sessionId);
    if (!session || session.expirationTime <= now) return { ok: false, reason: "expired" };
    try { await assertExistingAccount(ctx, row.userId); } catch { return { ok: false, reason: "account" }; }
    if (!(await consumeCall(ctx, row._id, now))) return { ok: false, reason: "limited" };
    if (row.lastUsedAt === undefined || now - row.lastUsedAt > 60_000) await ctx.db.patch(row._id, { lastUsedAt: now });
    return { ok: true, userId: row.userId, sessionId: row.sessionId, connectionId: row._id, access: row.access };
  },
});

/** Notes one tool call for the user's activity list. */
export const record = internalMutation({
  args: { connectionId: v.id("agentConnections"), userId: v.id("users"), tool: v.string(), write: v.boolean(), ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const at = Date.now();
    await ctx.db.insert("agentActivity", { ...args, tool: args.tool.slice(0, 60), error: args.error?.slice(0, 300), at, expiresAt: at + ACTIVITY_KEEP_MS });
    return null;
  },
});

/** Daily: forget activity older than 90 days. */
export const expireActivity = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agentActivity").withIndex("by_expires", (q) => q.lte("expiresAt", Date.now())).take(200);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
