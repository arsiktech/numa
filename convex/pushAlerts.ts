import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { dueAlerts, EXPO_TOKEN, limitAlerts, localClock, pickToSend, type Alert } from "./lib/pushAlerts";

declare const process: { env: Record<string, string | undefined> };

/**
 * Phone alerts for the rebuilt app, sent through Expo's push service. Each hour, a person with a
 * registered phone gets what Home's "Needs you" would raise: debts due soon and spending limits.
 * At most three a day, never between 22:00 and 8:00 their time, and never the same one twice.
 */

const MAX_DEVICES = 10;
const DAY = 86_400_000;

async function requireUserId(ctx: Parameters<typeof getAuthUserId>[0]) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to turn on alerts" });
  return userId;
}

export const registerDevice = mutation({
  args: { token: v.string(), platform: v.union(v.literal("ios"), v.literal("android")), timeZone: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (!session || session.userId !== userId || session.expirationTime <= Date.now()) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in again to enable alerts for this session" });
    }
    if (!EXPO_TOKEN.test(args.token)) throw new ConvexError({ code: "INVALID_PUSH_TOKEN", message: "That isn’t a push token" });
    const timeZone = args.timeZone.slice(0, 64);
    const now = Date.now();
    const existing = await ctx.db.query("expoPushTokens").withIndex("by_token", (q) => q.eq("token", args.token)).unique();
    // A phone that changes hands follows its latest signed-in person.
    if (existing) {
      await ctx.db.patch(existing._id, { userId, sessionId: session._id, platform: args.platform, timeZone, updatedAt: now });
      return null;
    }
    const mine = await ctx.db.query("expoPushTokens").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_DEVICES + 1);
    if (mine.length >= MAX_DEVICES) {
      const oldest = mine.sort((a, b) => a.updatedAt - b.updatedAt)[0];
      await ctx.db.delete(oldest._id);
    }
    await ctx.db.insert("expoPushTokens", { userId, sessionId: session._id, token: args.token, platform: args.platform, timeZone, createdAt: now, updatedAt: now });
    return null;
  },
});

export const unregisterDevice = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.query("expoPushTokens").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (row && row.userId === userId) await ctx.db.delete(row._id);
    return null;
  },
});

export const deviceRegistered = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const row = await ctx.db.query("expoPushTokens").withIndex("by_token", (q) => q.eq("token", token)).unique();
    const sessionId = await getAuthSessionId(ctx);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    return Boolean(row?.userId === userId && row.sessionId === sessionId && session?.userId === userId && session.expirationTime > Date.now());
  },
});

type Target = { userId: Id<"users">; tokens: string[]; timeZone: string };

export const targets = internalQuery({
  args: {},
  handler: async (ctx): Promise<Target[]> => {
    const byUser = new Map<Id<"users">, Target>();
    for await (const row of ctx.db.query("expoPushTokens")) {
      // Old unbound tokens fail closed. Re-enabling alerts binds them to the current session.
      const session = row.sessionId ? await ctx.db.get(row.sessionId) : null;
      if (!session || session.userId !== row.userId || session.expirationTime <= Date.now()) continue;
      const t = byUser.get(row.userId) ?? { userId: row.userId, tokens: [], timeZone: row.timeZone };
      t.tokens.push(row.token);
      byUser.set(row.userId, t);
    }
    return [...byUser.values()];
  },
});

/** Everything that could be sent to one person now, and what already went out. */
export const plan = internalQuery({
  args: { userId: v.id("users"), timeZone: v.string(), now: v.number() },
  handler: async (ctx, { userId, timeZone, now }): Promise<{ alerts: Alert[]; sentKeys: string[]; sentToday: number; hour: number }> => {
    const clock = localClock(now, timeZone);
    const monthKey = clock.day.slice(0, 7);
    const monthStart = now - 32 * DAY;
    const alerts: Alert[] = [];
    const memberships = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).take(20);
    for (const m of memberships) {
      const portfolio = await ctx.db.get(m.portfolioId);
      if (!portfolio) continue;
      const liabilities = await ctx.db.query("liabilities").withIndex("by_portfolio", (q) => q.eq("portfolioId", m.portfolioId)).take(200);
      alerts.push(...dueAlerts(liabilities.map((l) => ({ id: l._id, name: l.name, balance: Math.abs(l.balance), dueDate: l.dueDate })), now, timeZone));
      const categories = (await ctx.db.query("categories").withIndex("by_portfolio", (q) => q.eq("portfolioId", m.portfolioId)).take(200))
        .filter((c) => c.kind === "expense" && c.monthlyLimit);
      if (!categories.length) continue;
      const recent = await ctx.db.query("transactions").withIndex("by_portfolio_time", (q) => q.eq("portfolioId", m.portfolioId).gte("occurredAt", monthStart)).take(2000);
      const thisMonth = recent.filter((t) => t.kind === "expense" && localClock(t.occurredAt, timeZone).day.startsWith(monthKey));
      alerts.push(...limitAlerts(
        categories.map((c) => ({ id: c._id, name: c.name, monthlyLimit: c.monthlyLimit, currency: c.monthlyLimitCurrency ?? portfolio.defaultCurrency ?? "EUR" })),
        thisMonth.map((t) => ({ categoryId: t.categoryId, amount: t.amount, currency: t.currency })),
        monthKey,
      ));
    }
    const since = now - clock.minutesIntoDay * 60_000;
    const sent = await ctx.db.query("pushAlertsSent").withIndex("by_user_sent", (q) => q.eq("userId", userId).gte("sentAt", now - 40 * DAY)).take(500);
    return { alerts, sentKeys: sent.map((s) => s.key), sentToday: sent.filter((s) => s.sentAt >= since).length, hour: clock.hour };
  },
});

export const recordSent = internalMutation({
  args: { userId: v.id("users"), keys: v.array(v.string()), now: v.number(), deadTokens: v.array(v.string()) },
  handler: async (ctx, { userId, keys, now, deadTokens }): Promise<null> => {
    for (const key of keys) await ctx.db.insert("pushAlertsSent", { userId, key, sentAt: now });
    for (const token of deadTokens) {
      const row = await ctx.db.query("expoPushTokens").withIndex("by_token", (q) => q.eq("token", token)).unique();
      if (row) await ctx.db.delete(row._id);
    }
    // Keep only what the no-repeat rule needs.
    const old = await ctx.db.query("pushAlertsSent").withIndex("by_user_sent", (q) => q.eq("userId", userId).lt("sentAt", now - 60 * DAY)).take(100);
    for (const row of old) await ctx.db.delete(row._id);
    return null;
  },
});

type Ticket = { status: "ok" | "error"; details?: { error?: string } };

/** Hourly: work out each person's alerts and send the ones the rules allow. */
export const sendDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const all: Target[] = await ctx.runQuery(internal.pushAlerts.targets, {});
    let delivered = 0;
    for (const target of all) {
      const p: { alerts: Alert[]; sentKeys: string[]; sentToday: number; hour: number } = await ctx.runQuery(internal.pushAlerts.plan, { userId: target.userId, timeZone: target.timeZone, now });
      const send = pickToSend(p.alerts, new Set(p.sentKeys), p.sentToday, p.hour);
      if (!send.length) continue;
      // A logout can race an already planned send. Never put private account data on a lock screen.
      const messages = send.flatMap(() => target.tokens.map((to) => ({ to, title: "Numa Pro", body: "Open Numa Pro to review your alerts.", sound: "default", data: { url: "/" } })));
      const dead = new Set<string>();
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) { console.warn("push send failed", response.status); continue; }
        const tickets = ((await response.json()) as { data?: Ticket[] }).data ?? [];
        tickets.forEach((t, i) => { if (t.status === "error" && t.details?.error === "DeviceNotRegistered") dead.add(messages[i].to); });
        delivered += tickets.filter((t) => t.status === "ok").length;
      } catch {
        console.warn("push send failed", "network");
        continue;
      }
      await ctx.runMutation(internal.pushAlerts.recordSent, { userId: target.userId, keys: send.map((a) => a.key), now, deadTokens: [...dead] });
    }
    return delivered;
  },
});
