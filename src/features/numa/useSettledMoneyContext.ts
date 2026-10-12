import { useCallback, useLayoutEffect, useRef } from "react";
import { isCloudId, useCloudState, type CloudState } from "@/services/cloudStore";

export function settledMoneyContextStatus(cloud: CloudState, portfolioId: string) {
  if (!cloud.enabled) return { ready: true, cloudBacked: false };
  if (isCloudId(cloud, portfolioId) && cloud.byPortfolio[portfolioId]) {
    return { ready: true, cloudBacked: true };
  }
  return { ready: false, cloudBacked: false };
}

export interface SettledMoneyContextResult {
  ready: boolean;
  cloudBacked: boolean;
  cloud: CloudState;
  portfolioId: string;
}

/**
 * Right after sign-in there is a short window where the current portfolio is
 * still the local pf_* placeholder while cloud state hydrates; the store then
 * swaps it for the user's cloud portfolio. A draft parsed inside that window
 * carries local portfolio/category ids into a portfolio that is about to be
 * replaced — the entry would strand invisibly. This hook returns an awaitable
 * that resolves once the money context is settled (or after a bounded wait),
 * so conversational capture parses against ids that will still exist a second
 * later. Resolves immediately in the common case.
 */
export function useSettledMoneyContext(portfolioId: string): () => Promise<SettledMoneyContextResult> {
  const cloud = useCloudState();
  const latest = useRef<{ cloud: CloudState; portfolioId: string }>({ cloud, portfolioId });
  useLayoutEffect(() => {
    latest.current = { cloud, portfolioId };
  }, [cloud, portfolioId]);

  return useCallback(async () => {
    const deadline = Date.now() + 4000;
    for (;;) {
      const { cloud: c, portfolioId: id } = latest.current;
      const status = settledMoneyContextStatus(c, id);
      if (status.ready) return { ...status, cloud: c, portfolioId: id };
      if (Date.now() >= deadline) return { ...status, cloud: c, portfolioId: id };
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }, []);
}
