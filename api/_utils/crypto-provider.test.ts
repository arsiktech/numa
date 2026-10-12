import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeMoralisDefiPages,
  normalizeMoralisTokenPages,
  refreshMoralisWallet
} from "./crypto-provider";
import type { CryptoWalletSnapshot } from "../../src/lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Moralis crypto normalizer", () => {
  it("accepts current camelCase and legacy snake_case token rows", () => {
    const result = normalizeMoralisTokenPages(
      [
        {
          meta: { failedChains: ["optimism"] },
          result: [
            {
              tokenAddress: "0xabc",
              chainId: "0x1",
              name: "USD Coin",
              symbol: "USDC",
              balance: "12.5",
              usdPrice: "1",
              usdValue: "12.5",
              verifiedContract: true,
              possibleSpam: false
            },
            {
              token_address: "0xdef",
              chain_id: "0x2105",
              name: "Ether",
              symbol: "ETH",
              balance: "2500000000000000000",
              balance_formatted: "2.5",
              usd_price: 3000,
              usd_value: 7500,
              verified_contract: true,
              possible_spam: false
            }
          ]
        }
      ],
      "0x0000000000000000000000000000000000000001",
      "evm"
    );
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0]).toMatchObject({ symbol: "ETH", quantity: "2.5", valueUsd: 7500, chainName: "Base" });
    expect(result.tokens[1]).toMatchObject({ symbol: "USDC", quantity: "12.5", verified: true });
    expect(result.failedChains).toContain("optimism");
  });

  it("keeps supplied value and borrowed debt separate", () => {
    const result = normalizeMoralisDefiPages(
      [
        {
          result: [
            {
              chainId: "0x1",
              protocolId: "aave-v3",
              protocolName: "Aave V3",
              position: {
                label: "lending",
                address: "0xsupply",
                balanceUsd: "1000",
                tokens: [{ tokenType: "supplied", symbol: "USDC", usdValue: "1000" }],
                details: { type: "lending", isDebt: false, lending: { healthFactor: "2.4" } }
              }
            },
            {
              chainId: "0x1",
              protocolId: "aave-v3",
              protocolName: "Aave V3",
              position: {
                label: "borrowed",
                balanceUsd: "400",
                unclaimedUsd: "25",
                address: "0xdebt",
                tokens: [{ tokenType: "borrowed", symbol: "ETH", usdValue: "400" }],
                details: { type: "lending", isDebt: true }
              }
            }
          ]
        }
      ],
      "0x0000000000000000000000000000000000000001"
    );
    expect(result.positions).toHaveLength(2);
    expect(result.positions.find((row) => row.kind === "supplied")).toMatchObject({ assetValueUsd: 1000, debtValueUsd: 0 });
    expect(result.positions.find((row) => row.kind === "borrowed")).toMatchObject({
      assetValueUsd: 25,
      debtValueUsd: 400,
      valueUsd: -375
    });
  });

  it("counts an exact receipt-token overlap only through its DeFi position", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [{
            tokenAddress: "0xlp",
            chainId: "0x1",
            name: "Pool receipt",
            symbol: "LP",
            balance: "1.000000000000000001",
            usdValue: 100,
            verifiedContract: true
          }],
          cursor: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [{
            chainId: "0x1",
            protocolId: "uniswap-v2",
            protocolName: "Uniswap V2",
            position: {
              label: "liquidity",
              address: "0xLP",
              balanceUsd: 100,
              tokens: [{ tokenType: "supplied", address: "0xusdc", symbol: "USDC", usdValue: 100 }],
              details: { type: "liquidity" }
            }
          }],
          cursor: null
        })
      }));

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: true,
      now: 100
    });

    expect(result.tokens[0]).toMatchObject({
      quantity: "1.000000000000000001",
      representedInDefi: true
    });
    expect(result).toMatchObject({ tokenValueUsd: 0, defiValueUsd: 100, totalValueUsd: 100 });
  });

  it("keeps totals complete when the stored display list is truncated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: Array.from({ length: 161 }, (_, index) => ({
          tokenAddress: `btc:${index}`,
          chainId: "bitcoin",
          name: `UTXO ${index}`,
          symbol: "BTC",
          balance: "0.00000001",
          usdValue: 1,
          verifiedContract: true
        })),
        cursor: null
      })
    }));

    const result = await refreshMoralisWallet({
      address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      addressType: "bitcoin",
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: false,
      now: 100
    });

    expect(result.tokenValueUsd).toBe(161);
    expect(result.tokens).toHaveLength(160);
    expect(result.partial).toBe(true);
  });

  it.each([
    ["solana", "11111111111111111111111111111111"],
    ["bitcoin", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"]
  ] as const)("lets Moralis infer the network for %s token balances", async (addressType, address) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [], cursor: null })
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshMoralisWallet({
      address,
      addressType,
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: false,
      now: 100
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("chains=");
  });

  it("filters EVM token balances to mainnets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [], cursor: null })
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: false,
      now: 100
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("chains=mainnets");
  });

  it("reserves bounded DeFi detail space for borrowing rows", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [], cursor: null })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [
            ...Array.from({ length: 100 }, (_, index) => ({
              chainId: "0x1",
              protocolId: `supply-${index}`,
              protocolName: `Supply ${index}`,
              position: {
                label: "supplied",
                address: `0xsupply${index}`,
                balanceUsd: 1,
                tokens: [{ tokenType: "supplied", symbol: "USDC", usdValue: 1 }],
                details: { type: "lending" }
              }
            })),
            {
              chainId: "0x1",
              protocolId: "borrow",
              protocolName: "Borrow",
              position: {
                label: "borrowed",
                address: "0xdebt",
                balanceUsd: 5,
                tokens: [{ tokenType: "borrowed", symbol: "ETH", usdValue: 5 }],
                details: { type: "lending", isDebt: true }
              }
            }
          ],
          cursor: null
        })
      }));

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: true,
      now: 100
    });

    expect(result.defiPositions).toHaveLength(100);
    expect(result.defiPositions.some((position) => position.kind === "borrowed")).toBe(true);
    expect(result).toMatchObject({ defiValueUsd: 100, debtValueUsd: 5, partial: true });
  });

  it("reconciles cached token totals when a DeFi-only refresh finds a receipt position", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [{
          chainId: "0x1",
          protocolId: "lido",
          protocolName: "Lido",
          position: {
            label: "staked",
            address: "0xsteth",
            balanceUsd: 100,
            tokens: [{ tokenType: "staked", symbol: "stETH", usdValue: 100 }],
            details: { type: "staking" }
          }
        }],
        cursor: null
      })
    }));
    const cached: CryptoWalletSnapshot = {
      provider: "moralis",
      addressType: "evm",
      tokenValueUsd: 100,
      defiValueUsd: 0,
      debtValueUsd: 0,
      totalValueUsd: 100,
      tokens: [{
        id: "steth",
        chain: "0x1",
        chainName: "Ethereum",
        tokenAddress: "0xStEth",
        symbol: "stETH",
        name: "Staked Ether",
        quantity: "1",
        valueUsd: 100,
        verified: true,
        suspectedSpam: false
      }],
      defiPositions: [],
      chains: ["Ethereum"],
      failedChains: [],
      tokensFetchedAt: 100,
      defiFetchedAt: 1,
      updatedAt: 100,
      partial: false
    };

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      cached,
      refreshTokens: false,
      refreshDefi: true,
      now: 1_000
    });

    expect(result.tokens[0].representedInDefi).toBe(true);
    expect(result).toMatchObject({ tokenValueUsd: 0, defiValueUsd: 100, totalValueUsd: 100 });
  });

  it("preserves the last-good snapshot when both provider calls fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const cached: CryptoWalletSnapshot = {
      provider: "moralis",
      addressType: "evm",
      tokenValueUsd: 100,
      defiValueUsd: 50,
      debtValueUsd: 10,
      totalValueUsd: 140,
      tokens: [],
      defiPositions: [],
      chains: ["Ethereum"],
      failedChains: [],
      tokensFetchedAt: 1,
      defiFetchedAt: 1,
      updatedAt: 1,
      partial: false
    };
    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      cached,
      refreshTokens: true,
      refreshDefi: true,
      now: 100
    });
    expect(result).toMatchObject({
      tokenValueUsd: 100,
      defiValueUsd: 50,
      debtValueUsd: 10,
      partial: true,
      tokensFetchedAt: 1,
      defiFetchedAt: 1
    });
  });

  it("does not spend or call DeFi when a required token refresh is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const authorizeDefi = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("fetch", fetchMock);
    const cached: CryptoWalletSnapshot = {
      provider: "moralis",
      addressType: "evm",
      tokenValueUsd: 100,
      defiValueUsd: 50,
      debtValueUsd: 10,
      totalValueUsd: 140,
      tokens: [],
      defiPositions: [],
      chains: ["Ethereum"],
      failedChains: [],
      tokensFetchedAt: 1,
      defiFetchedAt: 1,
      updatedAt: 1,
      partial: false
    };

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      cached,
      refreshTokens: true,
      refreshDefi: true,
      authorizeDefi,
      now: 100
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authorizeDefi).not.toHaveBeenCalled();
    expect(result).toMatchObject({ totalValueUsd: 140, updatedAt: 1, partial: true });
  });

  it("keeps a token-only snapshot when the DeFi budget is denied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [{
          tokenAddress: "0xusdc",
          chainId: "0x1",
          name: "USD Coin",
          symbol: "USDC",
          balance: "10",
          usdValue: 10
        }],
        cursor: null
      })
    });
    const authorizeDefi = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: true,
      authorizeDefi,
      now: 100
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authorizeDefi).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      tokenValueUsd: 10,
      defiValueUsd: 0,
      tokensFetchedAt: 100,
      defiFetchedAt: undefined,
      partial: true
    });
  });

  it("treats policy-disabled DeFi as a complete token-only snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [{
          tokenAddress: "0xusdc",
          chainId: "0x1",
          name: "USD Coin",
          symbol: "USDC",
          balance: "10",
          usdValue: 10
        }],
        cursor: null
      })
    }));

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      refreshTokens: true,
      refreshDefi: false,
      defiDisabled: true,
      now: 100
    });

    expect(result).toMatchObject({
      tokenValueUsd: 10,
      defiValueUsd: 0,
      debtValueUsd: 0,
      defiFetchedAt: undefined,
      defiDisabled: true,
      partial: false
    });
  });

  it("does not replace a last-good multichain snapshot with partial HTTP-200 data", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { failedChains: ["0x1"] },
          result: [],
          cursor: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [{
            chainId: "0x1",
            protocolId: "aave-v3",
            protocolName: "Aave V3",
            position: {
              label: "supplied",
              address: "0xnew",
              balanceUsd: 999,
              tokens: [{ tokenType: "supplied", symbol: "USDC", usdValue: 999 }],
              details: { type: "lending" }
            }
          }],
          cursor: null
        })
      }));
    const cached: CryptoWalletSnapshot = {
      provider: "moralis",
      addressType: "evm",
      tokenValueUsd: 100,
      defiValueUsd: 50,
      debtValueUsd: 10,
      totalValueUsd: 140,
      tokens: [{
        id: "eth",
        chain: "0x1",
        chainName: "Ethereum",
        tokenAddress: "native",
        symbol: "ETH",
        name: "Ether",
        quantity: "0.1",
        valueUsd: 100,
        verified: true,
        suspectedSpam: false
      }],
      defiPositions: [],
      chains: ["Ethereum"],
      failedChains: [],
      tokenFailedChains: [],
      defiFailedChains: [],
      tokensFetchedAt: 1,
      defiFetchedAt: 1,
      updatedAt: 1,
      partial: false
    };

    const result = await refreshMoralisWallet({
      address: "0x0000000000000000000000000000000000000001",
      addressType: "evm",
      apiKey: "test",
      cached,
      refreshTokens: true,
      refreshDefi: true,
      now: 100
    });

    expect(result).toMatchObject({
      tokenValueUsd: 100,
      defiValueUsd: 50,
      debtValueUsd: 10,
      totalValueUsd: 140,
      tokensFetchedAt: 1,
      defiFetchedAt: 1,
      updatedAt: 1,
      partial: true,
      tokenFailedChains: ["0x1"]
    });
  });
});
