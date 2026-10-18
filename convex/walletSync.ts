import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { cryptoWalletSnapshotValidator } from "./lib/cryptoValidators";
import type { Post } from "./lib/defiPositions";
import { fetchPublicWallet, type Call, type Get } from "./lib/publicWallets";

/**
 * Keeps tracked public wallets current from free public explorers. Nothing here moves money
 * or touches keys: wallets are public addresses only (checked when they are added).
 */

const TIMEOUT_MS = 12_000;
/** A person can refresh by hand at most this often per wallet; the schedule runs every 30 minutes. */
const MIN_MANUAL_GAP_MS = 60_000;
const SCHEDULED_AGE_MS = 25 * 60_000;
const SCHEDULED_BATCH = 25;

const get: Get = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
};

const post: Post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
};

const call: Call = async (rpcUrl, to, data, from) => {
  const response = await fetch(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data, ...(from ? { from } : {}) }, "latest"] }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: unknown };
  if (typeof body.result !== "string") throw new Error("RPC error");
  return body.result;
};

type Target = { id: Id<"cryptoWallets">; address: string; addressType: "bitcoin" | "evm"; checkedAt: number | null };

export const walletForRefresh = internalQuery({
  args: { walletId: v.id("cryptoWallets"), userId: v.id("users") },
  handler: async (ctx, { walletId, userId }): Promise<Target | "forbidden" | "unsupported"> => {
    const wallet = await ctx.db.get(walletId);
    if (!wallet) return "forbidden";
    const membership = await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("portfolioId"), wallet.portfolioId)).unique();
    if (!membership || membership.role === "viewer") return "forbidden";
    if (wallet.addressType === "solana") return "unsupported";
    return { id: wallet._id, address: wallet.address, addressType: wallet.addressType, checkedAt: wallet.snapshot?.updatedAt ?? null };
  },
});

export const dueWallets = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Target[]> => {
    const out: Target[] = [];
    for await (const wallet of ctx.db.query("cryptoWallets")) {
      if (wallet.addressType === "solana") continue;
      const checkedAt = wallet.snapshot?.updatedAt ?? null;
      if (checkedAt !== null && now - checkedAt < SCHEDULED_AGE_MS) continue;
      out.push({ id: wallet._id, address: wallet.address, addressType: wallet.addressType, checkedAt });
      if (out.length >= SCHEDULED_BATCH) break;
    }
    return out;
  },
});

export const saveSnapshot = internalMutation({
  args: { walletId: v.id("cryptoWallets"), snapshot: cryptoWalletSnapshotValidator },
  handler: async (ctx, { walletId, snapshot }): Promise<boolean> => {
    const wallet = await ctx.db.get(walletId);
    // A wallet removed meanwhile stays removed, and a slower request never overwrites a newer one.
    if (!wallet || (wallet.snapshot && wallet.snapshot.updatedAt > snapshot.updatedAt)) return false;
    await ctx.db.patch(walletId, { snapshot, updatedAt: Date.now() });
    return true;
  },
});

async function check(target: Target, now: number) {
  try {
    return await fetchPublicWallet(target.address, target.addressType, get, now, call, post);
  } catch {
    return null;
  }
}

export type RefreshResult = { status: "ok" | "partial" | "failed" | "recent" | "unsupported" };

/** Checks one wallet now, for a member who can edit its space. */
export const refresh = action({
  args: { walletId: v.id("cryptoWallets") },
  handler: async (ctx, { walletId }): Promise<RefreshResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to refresh wallets" });
    const target: Target | "forbidden" | "unsupported" = await ctx.runQuery(internal.walletSync.walletForRefresh, { walletId, userId });
    if (target === "forbidden") throw new ConvexError({ code: "FORBIDDEN", message: "Wallet is not accessible" });
    if (target === "unsupported") return { status: "unsupported" };
    const now = Date.now();
    if (target.checkedAt !== null && now - target.checkedAt < MIN_MANUAL_GAP_MS) return { status: "recent" };
    const snapshot = await check(target, now);
    if (!snapshot) return { status: "failed" };
    await ctx.runMutation(internal.walletSync.saveSnapshot, { walletId, snapshot });
    return { status: snapshot.partial ? "partial" : "ok" };
  },
});

/** Every 30 minutes: wallets not checked recently, a bounded batch at a time. */
export const refreshDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const due: Target[] = await ctx.runQuery(internal.walletSync.dueWallets, { now });
    let saved = 0;
    for (const target of due) {
      const snapshot = await check(target, Date.now());
      if (snapshot && await ctx.runMutation(internal.walletSync.saveSnapshot, { walletId: target.id, snapshot })) saved += 1;
    }
    return saved;
  },
});
