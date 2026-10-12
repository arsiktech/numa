import { Component, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useCloudState } from "@/services/cloudStore";
import type { StillLifeKind } from "./stillLife";

/**
 * Resolves AI studio shots for merchant keys. Read path is a Convex batch
 * query over the shared render cache (UI asset lookup, not product money
 * data — which is why it doesn't route through the store mirror). This is a
 * cache-only read: misses keep the hand-drawn still-life. Merchant text is
 * never sent to an AI endpoint as a background side effect.
 */

/** Must mirror api/merchant-image.ts keyOf — same normalization, same key. */
export function merchantImageKey(merchant: string, kind: StillLifeKind): string {
  const normalized = merchant
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${kind}:${normalized || "misc"}`;
}

/**
 * Renders nothing and feeds resolved URLs upward. Lives inside
 * `MerchantImagesBoundary` so a failing cache query (schema drift, cold
 * deployment) can NEVER take the money surface down with it — the app just
 * keeps the hand-drawn still-lifes.
 */
export function MerchantImagesFeed({
  wanted,
  onUrls
}: {
  wanted: Array<{ merchant: string; kind: StillLifeKind }>;
  onUrls: (urls: Map<string, string>) => void;
}) {
  const urls = useMerchantImages(wanted);
  useEffect(() => {
    onUrls(urls);
  }, [urls, onUrls]);
  return null;
}

export class MerchantImagesBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[numa] merchant image feed disabled:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function useMerchantImages(
  wanted: Array<{ merchant: string; kind: StillLifeKind }>
): Map<string, string> {
  const cloud = useCloudState();

  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const item of wanted) set.add(merchantImageKey(item.merchant, item.kind));
    return [...set].slice(0, 120);
  }, [wanted]);

  const cachedRows = useQuery(
    api.merchantImages.urlsForKeys,
    cloud.enabled && keys.length > 0 ? { keys } : "skip"
  );

  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of cachedRows ?? []) map.set(row.key, row.url);
    return map;
  }, [cachedRows]);

  return urls;
}
