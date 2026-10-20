import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { cryptoWalletSnapshotValidator } from "./lib/cryptoValidators";
import type { Post } from "./lib/defiPositions";
import { BLOCKSCOUT_PRO } from "./lib/evm";
import { readingRows, type Refs } from "./lib/defiEarnings";
import { fetchPublicWallet, type Call, type Get } from "./lib/publicWallets";

/**
 * Keeps tracked public wallets current from free public explorers (and Blockscout PRO or Alchemy, when a key is set). Nothing here moves money
 * or touches keys: wallets are public addresses only (checked when they are added).
 */

const TIMEOUT_MS = 12_000;
/** A person can refresh by hand at most this often per wallet; the schedule runs every 30 minutes. */
const MIN_MANUAL_GAP_MS = 60_000;
const SCHEDULED_AGE_MS = 25 * 60_000;
const SCHEDULED_BATCH = 25;

/** Optional. With it, Base and Arbitrum are read through Blockscout PRO when their public explorers refuse datacenters. */
const blockscoutKey = () => process.env.BLOCKSCOUT_API_KEY || "";

const get: Get = async (url) => {
  // The key travels only in a header, and only to Blockscout PRO.
  const key = url.startsWith(`${BLOCKSCOUT_PRO}/`) ? blockscoutKey() : "";
  const response = await fetch(url, { headers: { accept: "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
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

class Reverted extends Error {}

async function callOnce(rpcUrl: string, to: string, data: string, from?: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data, ...(from ? { from } : {}) }, "latest"] }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: { message?: unknown } };
  if (typeof body.result === "string") return body.result;
  if (/revert/i.test(String(body.error?.message ?? ""))) throw new Reverted("execution reverted");
  throw new Error("RPC error");
}

/** One eth_call, tried twice: public nodes drop the odd request under a burst. A contract that reverts isn't asked again. */
const call: Call = async (rpcUrl, to, data, from) => {
  try {
    return await callOnce(rpcUrl, to, data, from);
  } catch (error) {
    if (error instanceof Reverted) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return await callOnce(rpcUrl, to, data, from);
  }
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

const refsValidator = v.object({ ETH: v.optional(v.number()), BTC: v.optional(v.number()), EUR: v.optional(v.number()) });

export const saveSnapshot = internalMutation({
  args: { walletId: v.id("cryptoWallets"), snapshot: cryptoWalletSnapshotValidator, refs: v.optional(refsValidator) },
  handler: async (ctx, { walletId, snapshot, refs }): Promise<boolean> => {
    const wallet = await ctx.db.get(walletId);
    // A wallet removed meanwhile stays removed, and a slower request never overwrites a newer one.
    if (!wallet || (wallet.snapshot && wallet.snapshot.updatedAt > snapshot.updatedAt)) return false;
    await ctx.db.patch(walletId, { snapshot, updatedAt: Date.now() });
    // The day's reading for earnings. A coin missing from one reading (a chain that failed) only skips that
    // day for it, so a partial read still counts, but never replaces a complete one from the same day.
    const day = new Date(snapshot.updatedAt).toISOString().slice(0, 10);
    const reading = { portfolioId: wallet.portfolioId, walletId, day, takenAt: snapshot.updatedAt, refs: refs ?? {}, rows: readingRows(snapshot) };
    const existing = await ctx.db.query("defiReadings").withIndex("by_wallet_day", (q) => q.eq("walletId", walletId).eq("day", day)).unique();
    if (existing && !snapshot.partial) await ctx.db.replace(existing._id, reading);
    else if (!existing && reading.rows.length) await ctx.db.insert("defiReadings", reading);
    return true;
  },
});

/** Ether, bitcoin and euro prices in dollars, for valuing vault shares. Empty when DefiLlama can't answer. */
async function refsNow(): Promise<Refs> {
  try {
    const body = (await get("https://coins.llama.fi/prices/current/coingecko:ethereum,coingecko:bitcoin,coingecko:euro-coin")) as { coins?: Record<string, { price?: unknown }> };
    const price = (id: string) => { const p = body?.coins?.[id]?.price; return typeof p === "number" && p > 0 ? p : undefined; };
    const refs: Refs = { ETH: price("coingecko:ethereum"), BTC: price("coingecko:bitcoin"), EUR: price("coingecko:euro-coin") };
    return Object.fromEntries(Object.entries(refs).filter(([, x]) => x !== undefined)) as Refs;
  } catch {
    return {};
  }
}

async function check(target: Target, now: number) {
  try {
    return await fetchPublicWallet(target.address, target.addressType, get, now, call, post, { blockscoutPro: Boolean(blockscoutKey()), alchemyKey: process.env.ALCHEMY_API_KEY || undefined });
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
    const [snapshot, refs] = await Promise.all([check(target, now), refsNow()]);
    if (!snapshot) return { status: "failed" };
    await ctx.runMutation(internal.walletSync.saveSnapshot, { walletId, snapshot, refs });
    return { status: snapshot.partial ? "partial" : "ok" };
  },
});

/** Every 30 minutes: wallets not checked recently, a bounded batch at a time. */
export const refreshDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const due: Target[] = await ctx.runQuery(internal.walletSync.dueWallets, { now });
    const refs = due.length ? await refsNow() : {};
    let saved = 0;
    for (const target of due) {
      const snapshot = await check(target, Date.now());
      if (snapshot && await ctx.runMutation(internal.walletSync.saveSnapshot, { walletId: target.id, snapshot, refs })) saved += 1;
    }
    return saved;
  },
});
