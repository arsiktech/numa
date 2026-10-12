import { describe, expect, it } from "vitest";
import {
  cryptoCapitalAmounts,
  cryptoWalletInputProblem,
  detectCryptoWalletAddressType,
  normalizeCryptoWalletAddress,
  rollupCryptoWallets,
  walletSnapshotIsFresh
} from "./cryptoWallets";
import type { CryptoWallet, CryptoWalletSnapshot } from "./types";

const EVM = "0xA12b34C56d78E90fA12b34C56d78E90fA12b34C5";
const SOLANA = "So11111111111111111111111111111111111111112";
const BITCOIN = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

function snapshot(patch: Partial<CryptoWalletSnapshot> = {}): CryptoWalletSnapshot {
  const now = Date.now();
  return {
    provider: "moralis",
    addressType: "evm",
    tokenValueUsd: 100,
    defiValueUsd: 50,
    debtValueUsd: 20,
    totalValueUsd: 130,
    tokens: [],
    defiPositions: [],
    chains: ["Ethereum"],
    failedChains: [],
    tokensFetchedAt: now,
    defiFetchedAt: now,
    updatedAt: now,
    partial: false,
    ...patch
  };
}

function wallet(patch: Partial<CryptoWallet> = {}): CryptoWallet {
  return {
    id: "cw_1",
    portfolioId: "pf_1",
    address: EVM.toLowerCase(),
    addressType: "evm",
    label: "Main wallet",
    includeInNetWorth: true,
    createdAt: 1,
    updatedAt: 1,
    snapshot: snapshot(),
    ...patch
  };
}

describe("crypto wallet addresses", () => {
  it("detects EVM, Solana, and Bitcoin without changing case-sensitive addresses", () => {
    expect(detectCryptoWalletAddressType(EVM)).toBe("evm");
    expect(detectCryptoWalletAddressType(SOLANA)).toBe("solana");
    expect(detectCryptoWalletAddressType(BITCOIN)).toBe("bitcoin");
    expect(normalizeCryptoWalletAddress(EVM)?.address).toBe(EVM.toLowerCase());
    expect(normalizeCryptoWalletAddress(SOLANA)?.address).toBe(SOLANA);
    expect(normalizeCryptoWalletAddress(BITCOIN)?.address).toBe(BITCOIN);
  });

  it("rejects likely private keys and recovery phrases before persistence", () => {
    expect(cryptoWalletInputProblem("abandon ".repeat(12).trim())).toBe("suspected-secret");
    expect(cryptoWalletInputProblem("f".repeat(64))).toBe("suspected-secret");
    expect(cryptoWalletInputProblem("not a wallet")).toBe("invalid");
    expect(cryptoWalletInputProblem("2".repeat(32))).toBe("invalid");
    expect(cryptoWalletInputProblem(`${BITCOIN.slice(0, -1)}q`)).toBe("invalid");
    expect(cryptoWalletInputProblem("tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe("invalid");
  });
});

describe("crypto wallet rollup", () => {
  it("keeps tracked value visible but excludes opted-out wallets from Capital", () => {
    const result = rollupCryptoWallets([
      wallet(),
      wallet({
        id: "cw_2",
        includeInNetWorth: false,
        snapshot: snapshot({ tokenValueUsd: 200, defiValueUsd: 0, debtValueUsd: 0, totalValueUsd: 200 })
      })
    ]);
    expect(result.totalValueUsd).toBe(330);
    expect(result.includedValueUsd).toBe(150);
    expect(result.includedDebtUsd).toBe(20);
  });

  it("converts included assets and debt exactly once", () => {
    const amounts = cryptoCapitalAmounts([wallet()], { EUR: 1, USD: 2 }, "EUR");
    expect(amounts.assets).toBe(75);
    expect(amounts.debts).toBe(10);
    expect(amounts.net).toBe(65);
  });

  it("treats stale DeFi independently from fresh tokens", () => {
    const now = Date.now();
    expect(walletSnapshotIsFresh(snapshot({ tokensFetchedAt: now, defiFetchedAt: now - 7 * 60 * 60 * 1000 }), now)).toBe(false);
    expect(walletSnapshotIsFresh(snapshot({ addressType: "bitcoin", tokensFetchedAt: now, defiFetchedAt: undefined }), now)).toBe(true);
    expect(walletSnapshotIsFresh(snapshot({ defiFetchedAt: undefined, defiDisabled: true }), now)).toBe(true);
  });
});
