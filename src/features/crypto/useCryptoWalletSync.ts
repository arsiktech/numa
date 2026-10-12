import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { walletSnapshotIsFresh } from "@/lib/cryptoWallets";
import type { CryptoWallet, CryptoWalletSnapshot } from "@/lib/types";

type SyncState = "idle" | "syncing" | "refreshing" | "error";

interface SyncPayload {
  error?: string;
  configured?: boolean;
  wallets?: Array<{
    walletId?: string;
    error?: string;
    tokenDeferred?: boolean;
    defiDeferred?: boolean;
    defiDisabled?: boolean;
    refreshInProgress?: boolean;
    snapshot?: CryptoWalletSnapshot;
  }>;
}

function errorMessage(payload: SyncPayload | null, status: number) {
  if (payload?.error) return payload.error;
  if (status === 401) return "Sign in again to refresh wallet data.";
  if (status === 429) return "Wallet refresh is cooling down. Try again shortly.";
  return "Wallet data could not refresh. Last successful values are still shown.";
}

export function useCryptoWalletSync(wallets: CryptoWallet[]) {
  const authToken = useAuthToken();
  const [state, setState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set());
  const [optimisticSnapshots, setOptimisticSnapshots] = useState<
    Record<string, CryptoWalletSnapshot>
  >({});
  const autoKeyRef = useRef("");
  const walletKey = useMemo(
    () => wallets.map((wallet) => `${wallet.id}:${wallet.snapshot?.updatedAt ?? 0}`).join("|"),
    [wallets]
  );

  const syncWalletIds = useCallback(
    async (walletIds: string[], force = false) => {
      const ids = [...new Set(walletIds)].slice(0, 8);
      if (ids.length === 0) return null;
      if (!authToken) {
        setState("error");
        setError("Sign in again to refresh wallet data.");
        return null;
      }
      setState(force ? "refreshing" : "syncing");
      setError(null);
      setWarning(null);
      setSyncingIds(new Set(ids));
      try {
        const response = await fetch("/api/crypto-wallet-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ walletIds: ids, force })
        });
        const payload = await response.json().catch(() => null) as SyncPayload | null;
        if (!response.ok) throw new Error(errorMessage(payload, response.status));
        const messages = payload?.wallets
          ?.flatMap((wallet) => {
            if (wallet.error) return [wallet.error];
            if (wallet.refreshInProgress) {
              return ["This wallet is already updating in another Numa Pro view."];
            }
            if (wallet.tokenDeferred) {
              return ["Saved values shown; today’s shared wallet refresh budget is used up."];
            }
            if (wallet.defiDisabled) {
              return ["Token balances updated; DeFi tracking is disabled for this deployment."];
            }
            if (wallet.defiDeferred) {
              return ["Token balances updated; DeFi refresh is deferred by the shared usage limit."];
            }
            return [];
          }) ?? [];
        setOptimisticSnapshots((current) => {
          const next = { ...current };
          for (const wallet of payload?.wallets ?? []) {
            if (wallet.walletId && wallet.snapshot) next[wallet.walletId] = wallet.snapshot;
          }
          return next;
        });
        setWarning(messages[0] ?? (payload?.configured === false
          ? "Provider not configured; showing saved values."
          : null));
        setState("idle");
        return payload;
      } catch (caught) {
        setState("error");
        setError(caught instanceof Error ? caught.message : "Wallet data could not refresh.");
        return null;
      } finally {
        setSyncingIds(new Set());
      }
    },
    [authToken]
  );

  useEffect(() => {
    if (!authToken || wallets.length === 0) return;
    const staleIds = wallets
      .filter((wallet) => !walletSnapshotIsFresh(wallet.snapshot))
      .map((wallet) => wallet.id);
    if (staleIds.length === 0) return;
    const autoKey = staleIds.join("|");
    if (autoKeyRef.current === autoKey) return;
    autoKeyRef.current = autoKey;
    void syncWalletIds(staleIds, false);
  }, [authToken, syncWalletIds, walletKey, wallets]);

  useEffect(() => {
    setOptimisticSnapshots((current) => {
      let changed = false;
      const next = { ...current };
      for (const wallet of wallets) {
        const optimistic = next[wallet.id];
        if (
          optimistic &&
          wallet.snapshot &&
          wallet.snapshot.updatedAt >= optimistic.updatedAt
        ) {
          delete next[wallet.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [walletKey, wallets]);

  const currentWallets = useMemo(
    () => wallets.map((wallet) => ({
      ...wallet,
      snapshot: optimisticSnapshots[wallet.id] ?? wallet.snapshot
    })),
    [optimisticSnapshots, wallets]
  );

  return {
    state,
    error,
    warning,
    wallets: currentWallets,
    optimisticSnapshots,
    syncingIds,
    isSyncing: state === "syncing" || state === "refreshing",
    syncWalletIds,
    refreshAll: () => syncWalletIds(wallets.map((wallet) => wallet.id), true)
  };
}
