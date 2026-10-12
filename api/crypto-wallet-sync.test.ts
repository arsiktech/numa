import { describe, expect, it } from "vitest";
import { defiNeedsRefresh, tokenNeedsRefresh } from "./crypto-wallet-sync";
import type { CryptoWalletSnapshot } from "../src/lib/types";

function snapshot(patch: Partial<CryptoWalletSnapshot> = {}): CryptoWalletSnapshot {
  return {
    provider: "moralis",
    addressType: "evm",
    tokenValueUsd: 1,
    defiValueUsd: 0,
    debtValueUsd: 0,
    totalValueUsd: 1,
    tokens: [],
    defiPositions: [],
    chains: ["Ethereum"],
    failedChains: [],
    tokensFetchedAt: 1_000_000,
    defiFetchedAt: 1_000_000,
    updatedAt: 1_000_000,
    partial: false,
    ...patch,
  };
}

describe("crypto wallet refresh policy", () => {
  it("lets manual refresh bypass only the token TTL after a hard cooldown", () => {
    const cached = snapshot();
    expect(tokenNeedsRefresh(cached, true, 1_030_000)).toBe(false);
    expect(tokenNeedsRefresh(cached, true, 1_061_000)).toBe(true);
    expect(tokenNeedsRefresh(cached, false, 1_061_000)).toBe(false);
  });

  it("never lets a manual action bypass the DeFi TTL", () => {
    const cached = snapshot();
    expect(defiNeedsRefresh({ addressType: "evm", snapshot: cached }, 1_061_000, true)).toBe(false);
    expect(defiNeedsRefresh(
      { addressType: "evm", snapshot: cached },
      1_000_000 + 6 * 60 * 60 * 1000,
      true
    )).toBe(true);
    expect(defiNeedsRefresh({ addressType: "bitcoin", snapshot: undefined }, 2_000_000, true)).toBe(false);
    expect(defiNeedsRefresh({ addressType: "evm", snapshot: undefined }, 2_000_000, false)).toBe(false);
  });
});
