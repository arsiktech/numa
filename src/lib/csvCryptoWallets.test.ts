import { describe, expect, it } from "vitest";
import { cryptoWalletsToCsv, parseCsv } from "./csv";
import type { CryptoWallet } from "./types";

describe("cryptoWalletsToCsv", () => {
  it("exports the public address and complete last-good snapshot", () => {
    const wallet: CryptoWallet = {
      id: "wallet-1",
      portfolioId: "portfolio-1",
      address: "0x000000000000000000000000000000000000dead",
      addressType: "evm",
      label: "Main wallet",
      includeInNetWorth: true,
      createdAt: 1,
      updatedAt: 2,
      snapshot: {
        provider: "moralis",
        addressType: "evm",
        tokenValueUsd: 125,
        defiValueUsd: 50,
        debtValueUsd: 25,
        totalValueUsd: 150,
        tokens: [{
          id: "eth",
          chain: "0x1",
          chainName: "Ethereum",
          symbol: "ETH",
          name: "Ether",
          quantity: "0.05",
          valueUsd: 125,
          verified: true,
          suspectedSpam: false,
        }],
        defiPositions: [{
          id: "aave",
          chain: "0x1",
          chainName: "Ethereum",
          protocol: "Aave",
          label: "Supplied",
          kind: "supplied",
          valueUsd: 50,
          assetValueUsd: 50,
          debtValueUsd: 0,
          symbols: ["USDC"],
        }],
        chains: ["Ethereum"],
        failedChains: [],
        tokensFetchedAt: 1_720_000_000_000,
        defiFetchedAt: 1_720_000_000_000,
        updatedAt: 1_720_000_000_000,
        partial: false,
      },
    };

    const rows = parseCsv(cryptoWalletsToCsv([wallet]));
    const header = rows[0];
    const values = Object.fromEntries(header.map((name, index) => [name, rows[1][index]]));

    expect(values.publicAddress).toBe(wallet.address);
    expect(values.totalValueUsd).toBe("150");
    expect(values.snapshotUpdatedAt).toBe("2024-07-03T09:46:40.000Z");
    expect(values.walletCreatedAtMs).toBe("1");
    expect(values.walletUpdatedAtMs).toBe("2");
    expect(JSON.parse(values.tokensJson)).toEqual(wallet.snapshot?.tokens);
    expect(JSON.parse(values.defiPositionsJson)).toEqual(wallet.snapshot?.defiPositions);
    expect(JSON.parse(values.snapshotJson)).toEqual(wallet.snapshot);
  });
});
