import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import type { CryptoWalletSnapshot } from "../src/lib/types.js";
import { getRequestUserId } from "./_utils/auth.js";
import {
  allowedOrigin,
  consumeDailyGlobalBudget,
  consumeRateLimit
} from "./_utils/rate-limit.js";
import {
  CryptoProviderError,
  refreshMoralisWallet
} from "./_utils/crypto-provider.js";

declare const process: {
  env: Record<string, string | undefined>;
};

const TOKEN_CACHE_MS = 10 * 60 * 1000;
const DEFI_CACHE_MS = 6 * 60 * 60 * 1000;
const FORCED_TOKEN_COOLDOWN_MS = 60 * 1000;
const DEFI_SYNC_ENABLED = process.env.NUMA_CRYPTO_DEFI_ENABLED === "1";
const DAY_MS = 24 * 60 * 60 * 1000;
const BodySchema = z.object({
  walletIds: z.array(z.string().min(1)).min(1).max(8),
  force: z.boolean().optional().default(false)
});

interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(statusCode: number): {
    json(payload: unknown): void;
    end(): void;
  };
}

let cachedClient: ConvexHttpClient | null = null;
function getConvexClient() {
  if (cachedClient) return cachedClient;
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";
  if (!url) throw new Error("Convex URL is not configured.");
  cachedClient = new ConvexHttpClient(url);
  return cachedClient;
}

function publicError(error: unknown) {
  if (error instanceof CryptoProviderError) return error.message;
  if (error instanceof Error && /rate limit/i.test(error.message)) {
    return "Wallet data is temporarily rate limited.";
  }
  return "Wallet data could not refresh. Last successful values are still shown.";
}

function positiveLimit(envVar: string, fallback: number) {
  const parsed = Number(process.env[envVar]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function consumeUserWalletBudget(
  request: ApiRequest,
  response: ApiResponse,
  userId: string,
  options: { route: string; envVar: string; defaultLimit: number }
) {
  return await consumeRateLimit(request, response, {
    route: `${options.route}:user-daily-budget`,
    identity: userId,
    limit: positiveLimit(options.envVar, options.defaultLimit),
    windowMs: DAY_MS
  });
}

export function tokenNeedsRefresh(
  snapshot: CryptoWalletSnapshot | undefined,
  force: boolean,
  now: number
) {
  if (!snapshot) return true;
  const age = now - snapshot.tokensFetchedAt;
  return age >= TOKEN_CACHE_MS || (force && age >= FORCED_TOKEN_COOLDOWN_MS);
}

export function defiNeedsRefresh(
  wallet: { addressType: "evm" | "solana" | "bitcoin"; snapshot?: CryptoWalletSnapshot },
  now: number,
  enabled = DEFI_SYNC_ENABLED
) {
  return enabled && wallet.addressType !== "bitcoin" &&
    (!wallet.snapshot?.defiFetchedAt ||
      now - wallet.snapshot.defiFetchedAt >= DEFI_CACHE_MS);
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const origin = allowedOrigin(request);
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const userId = await getRequestUserId(request);
  if (!userId) {
    response.status(401).json({ error: "Sign in to refresh wallet data." });
    return;
  }
  const parsed = BodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Choose between 1 and 8 tracked wallets." });
    return;
  }

  const internalSecret = process.env.NUMA_PUSH_INTERNAL_SECRET;
  if (!internalSecret) {
    response.status(500).json({ error: "Wallet sync is not configured." });
    return;
  }

  const convex = getConvexClient();
  let wallets: Array<{
    _id: Id<"cryptoWallets">;
    address: string;
    addressType: "evm" | "solana" | "bitcoin";
    updatedAt: number;
    snapshot?: CryptoWalletSnapshot;
  }>;
  try {
    wallets = await convex.query(api.cryptoWallets.listForApi, {
      internalSecret,
      userId: userId as Id<"users">,
      walletIds: [...new Set(parsed.data.walletIds)].map(
        (id) => id as Id<"cryptoWallets">
      )
    });
  } catch {
    response.status(403).json({ error: "One or more wallets are not accessible." });
    return;
  }

  const now = Date.now();
  const needsProvider = wallets.some((wallet) => {
    return tokenNeedsRefresh(wallet.snapshot, parsed.data.force, now) ||
      defiNeedsRefresh(wallet, now);
  });

  if (!needsProvider) {
    response.setHeader("Cache-Control", "private, no-store");
    response.status(200).json({
      provider: "moralis",
      refreshed: false,
      wallets: wallets.map((wallet) => ({
        walletId: String(wallet._id),
        snapshot: wallet.snapshot,
        cached: true,
        defiDisabled: wallet.addressType !== "bitcoin" && !DEFI_SYNC_ENABLED
      }))
    });
    return;
  }

  const providerKey = process.env.MORALIS_API_KEY;
  if (!providerKey) {
    const cached = wallets.filter((wallet) => wallet.snapshot);
    if (cached.length > 0) {
      response.setHeader("Cache-Control", "private, no-store");
      response.status(200).json({
        provider: "moralis",
        refreshed: false,
        configured: false,
        wallets: wallets.map((wallet) => ({
          walletId: String(wallet._id),
          snapshot: wallet.snapshot,
          cached: true,
          defiDisabled: wallet.addressType !== "bitcoin" && !DEFI_SYNC_ENABLED,
          error: wallet.snapshot ? "Provider not configured; showing saved values." : "Provider not configured."
        }))
      });
      return;
    }
    response.status(503).json({
      error: "Wallet sync is not configured. Set MORALIS_API_KEY on Vercel."
    });
    return;
  }

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/crypto-wallet-sync",
    limit: 4,
    windowMs: 60_000,
    identity: userId
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
    return;
  }

  const plans: Array<{
    wallet: (typeof wallets)[number];
    refreshTokens: boolean;
    refreshDefi: boolean;
    tokenDeferred: boolean;
    defiDeferred: boolean;
    blockedWithoutSnapshot: boolean;
    leaseId?: string;
    leaseDeferred: boolean;
  }> = [];
  for (const wallet of wallets) {
    const wantsDefiBeforeBudget = defiNeedsRefresh(wallet, now);
    const wantsTokens = tokenNeedsRefresh(wallet.snapshot, parsed.data.force, now) ||
      Boolean(wantsDefiBeforeBudget && wallet.snapshot?.tokensTruncated);
    let leaseId: string | undefined;
    let leaseDeferred = false;
    if (wantsTokens || wantsDefiBeforeBudget) {
      leaseId = globalThis.crypto.randomUUID();
      try {
        const claimed = await convex.mutation(api.cryptoWallets.claimRefreshForApi, {
          internalSecret,
          userId: userId as Id<"users">,
          walletId: wallet._id,
          leaseId,
          expectedWalletUpdatedAt: wallet.updatedAt,
          now
        });
        leaseDeferred = !claimed;
      } catch {
        leaseDeferred = true;
      }
    }
    if (leaseDeferred) {
      plans.push({
        wallet,
        refreshTokens: false,
        refreshDefi: false,
        tokenDeferred: false,
        defiDeferred: false,
        blockedWithoutSnapshot: false,
        leaseDeferred: true
      });
      continue;
    }
    let refreshTokens = wantsTokens;
    if (wantsTokens) {
      const userBudget = await consumeUserWalletBudget(request, response, userId, {
        route: "/api/crypto-wallet-sync:tokens",
        envVar: "NUMA_CRYPTO_DAILY_USER_TOKEN_LIMIT",
        defaultLimit: 12
      });
      if (!userBudget.allowed) {
        refreshTokens = false;
      } else {
        const globalBudget = await consumeDailyGlobalBudget(request, response, {
          route: "/api/crypto-wallet-sync:tokens",
          envVar: "NUMA_CRYPTO_DAILY_TOKEN_LIMIT",
          defaultLimit: 60
        });
        refreshTokens = globalBudget.allowed;
      }
    }
    const tokenDeferred = wantsTokens && !refreshTokens;
    const blockedWithoutSnapshot = tokenDeferred && !wallet.snapshot;
    const wantsDefi =
      !blockedWithoutSnapshot &&
      (refreshTokens || !wantsTokens) &&
      wantsDefiBeforeBudget;
    plans.push({
      wallet,
      refreshTokens,
      refreshDefi: wantsDefi,
      tokenDeferred,
      defiDeferred: false,
      blockedWithoutSnapshot,
      leaseId,
      leaseDeferred: false
    });
  }

  const results = await Promise.all(
    plans.map(async ({
      wallet,
      refreshTokens,
      refreshDefi,
      tokenDeferred,
      defiDeferred,
      blockedWithoutSnapshot,
      leaseId,
      leaseDeferred
    }) => {
      const releaseLease = async () => {
        if (!leaseId) return;
        await convex.mutation(api.cryptoWallets.releaseRefreshForApi, {
          internalSecret,
          userId: userId as Id<"users">,
          walletId: wallet._id,
          leaseId
        }).catch(() => undefined);
      };
      if (leaseDeferred) {
        return {
          walletId: String(wallet._id),
          snapshot: wallet.snapshot,
          cached: Boolean(wallet.snapshot),
          refreshInProgress: true,
          error: wallet.snapshot ? undefined : "This wallet is already refreshing in another view."
        };
      }
      if (blockedWithoutSnapshot) {
        await releaseLease();
        return {
          walletId: String(wallet._id),
          cached: false,
          tokenDeferred: true,
          error: "The daily wallet refresh budget is used up. Try again tomorrow."
        };
      }
      if (!refreshTokens && !refreshDefi && wallet.snapshot) {
        await releaseLease();
        return {
          walletId: String(wallet._id),
          snapshot: wallet.snapshot,
          cached: true,
          tokenDeferred,
          defiDeferred,
          defiDisabled: wallet.addressType !== "bitcoin" && !DEFI_SYNC_ENABLED
        };
      }
      try {
        let defiBudgetDecision: "pending" | "allowed" | "denied" = refreshDefi
          ? "pending"
          : "allowed";
        const snapshot = await refreshMoralisWallet({
          address: wallet.address,
          addressType: wallet.addressType,
          apiKey: providerKey,
          cached: wallet.snapshot,
          refreshTokens,
          refreshDefi,
          defiDisabled: wallet.addressType !== "bitcoin" && !DEFI_SYNC_ENABLED,
          authorizeDefi: refreshDefi
            ? async () => {
                const userBudget = await consumeUserWalletBudget(
                  request,
                  response,
                  userId,
                  {
                    route: "/api/crypto-wallet-sync:defi",
                    envVar: "NUMA_CRYPTO_DAILY_USER_DEFI_LIMIT",
                    defaultLimit: 4
                  }
                );
                if (!userBudget.allowed) {
                  defiBudgetDecision = "denied";
                  return false;
                }
                const globalBudget = await consumeDailyGlobalBudget(request, response, {
                  route: "/api/crypto-wallet-sync:defi",
                  envVar: "NUMA_CRYPTO_DAILY_WALLET_LIMIT",
                  defaultLimit: 12
                });
                defiBudgetDecision = globalBudget.allowed ? "allowed" : "denied";
                return globalBudget.allowed;
              }
            : undefined,
          now
        });
        await convex.mutation(api.cryptoWallets.saveSnapshotForApi, {
          internalSecret,
          userId: userId as Id<"users">,
          walletId: wallet._id,
          leaseId: leaseId!,
          snapshot
        });
        const tokenSourceRefreshed = refreshTokens && snapshot.tokensFetchedAt === now;
        const defiSourceRefreshed =
          refreshDefi &&
          defiBudgetDecision === "allowed" &&
          snapshot.defiFetchedAt === now;
        const sourceRefreshFailed =
          (refreshTokens && !tokenSourceRefreshed) ||
          (refreshDefi &&
            defiBudgetDecision === "allowed" &&
            !defiSourceRefreshed);
        return {
          walletId: String(wallet._id),
          snapshot,
          cached: Boolean(wallet.snapshot) && !tokenSourceRefreshed && !defiSourceRefreshed,
          tokenDeferred,
          defiDeferred: defiDeferred || defiBudgetDecision === "denied",
          error: sourceRefreshFailed
            ? "Some wallet data could not refresh. Available and last successful values are shown."
            : undefined,
          defiDisabled: wallet.addressType !== "bitcoin" && !DEFI_SYNC_ENABLED
        };
      } catch (error) {
        await releaseLease();
        return {
          walletId: String(wallet._id),
          snapshot: wallet.snapshot,
          cached: Boolean(wallet.snapshot),
          error: publicError(error)
        };
      }
    })
  );

  const hasData = results.some((result) => result.snapshot);
  response.setHeader("Cache-Control", "private, no-store");
  response.status(hasData ? 200 : 502).json({
    provider: "moralis",
    refreshed: results.some(
      (result) => !result.cached && "snapshot" in result && Boolean(result.snapshot)
    ),
    wallets: results,
    ...(hasData ? {} : { error: "Wallet data could not be read." })
  });
}
