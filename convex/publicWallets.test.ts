import { describe, expect, it } from "vitest";
import { fetchPublicWallet, formatUnits, isAaveToken, type Call, type Get } from "./lib/publicWallets";

const BTC = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const EVM = "0x3304e22ddaa22bcdc5fca2269b418046ae7b566a";

function fake(routes: Record<string, unknown>): Get {
  return async (url) => {
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        if (body instanceof Error) throw body;
        return body;
      }
    }
    throw new Error(`blocked ${url}`);
  };
}

describe("formatUnits", () => {
  it("keeps every digit", () => {
    expect(formatUnits("1234500", 6)).toBe("1.2345");
    expect(formatUnits("5769549980403065014", 18)).toBe("5.769549980403065014");
    expect(formatUnits("100000000", 8)).toBe("1");
    expect(formatUnits("0", 18)).toBe("0");
  });
  it("rejects anything that isn't a whole number", () => {
    expect(() => formatUnits("1.5", 2)).toThrow();
    expect(() => formatUnits("-3", 2)).toThrow();
  });
});

describe("fetchPublicWallet", () => {
  it("reads a Bitcoin balance including unconfirmed coins, priced in USD", async () => {
    const s = await fetchPublicWallet(BTC, "bitcoin", fake({
      [`https://mempool.space/api/address/${BTC}`]: { chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 50_000_000 }, mempool_stats: { funded_txo_sum: 10_000_000, spent_txo_sum: 0 } },
      "https://mempool.space/api/v1/prices": { USD: 80_000 },
    }), 1000);
    expect(s.tokens).toEqual([expect.objectContaining({ symbol: "BTC", quantity: "1.1", priceUsd: 80_000, valueUsd: 88_000 })]);
    expect(s).toMatchObject({ provider: "public", totalValueUsd: 88_000, chains: ["bitcoin"], failedChains: [], partial: false, updatedAt: 1000 });
  });

  it("keeps a Bitcoin balance without a price as unknown, not zero", async () => {
    const s = await fetchPublicWallet(BTC, "bitcoin", fake({
      [`https://mempool.space/api/address/${BTC}`]: { chain_stats: { funded_txo_sum: 100_000_000, spent_txo_sum: 0 } },
      "https://mempool.space/api/v1/prices": new Error("down"),
    }), 1000);
    expect(s.tokens[0].valueUsd).toBeUndefined();
    expect(s.partial).toBe(true);
  });

  it("adds native coins and priced tokens per chain and lists chains it couldn't reach", async () => {
    const s = await fetchPublicWallet(EVM, "evm", fake({
      [`https://eth.blockscout.com/api/v2/addresses/${EVM}/tokens`]: { items: [
        { value: "6017015879", token: { address_hash: "0xA0b8", symbol: "USDC", name: "USDC", decimals: "6", exchange_rate: "1", reputation: "ok" } },
        { value: "999", token: { address_hash: "0xspam", symbol: "FREE", name: "Claim now", decimals: "0", exchange_rate: null, reputation: "ok" } },
        { value: "5000000000000000000", token: { address_hash: "0xscam", symbol: "SCAM", decimals: "18", exchange_rate: "100", reputation: "scam" } },
        { value: "1", token: { address_hash: "0xdust", symbol: "DUST", decimals: "18", exchange_rate: "0.5", reputation: "ok" } },
      ] },
      [`https://eth.blockscout.com/api/v2/addresses/${EVM}`]: { coin_balance: "2000000000000000000", exchange_rate: "2500" },
      [`https://explorer.optimism.io/api/v2/addresses/${EVM}/tokens`]: { items: [] },
      [`https://explorer.optimism.io/api/v2/addresses/${EVM}`]: { coin_balance: "0", exchange_rate: "2500" },
    }), 1000);
    expect(s.tokens.map((t) => [t.chain, t.symbol, t.quantity, t.valueUsd])).toEqual([
      ["ethereum", "ETH", "2", 5000],
      ["ethereum", "USDC", "6017.015879", 6017.02],
    ]);
    expect(s.chains).toEqual(["ethereum", "optimism"]);
    expect(s.failedChains).toEqual(["base", "arbitrum", "polygon"]);
    expect(s).toMatchObject({ totalValueUsd: 11017.02, partial: true });
  });

  it("fails when no chain answers, so the last good snapshot stays", async () => {
    await expect(fetchPublicWallet(EVM, "evm", fake({}), 1000)).rejects.toThrow();
  });

  it("counts an Aave V3 position as what it holds less what it owes, and skips Aave's own tokens", async () => {
    const word = (n: bigint) => n.toString(16).padStart(64, "0");
    // 109,583.16 supplied, 36,422.29 borrowed, health factor 2.5.
    const account = "0x" + [10958316000000n, 3642229000000n, 0n, 0n, 0n, 2_500000000000000000n].map(word).join("");
    const calls: string[] = [];
    const call: Call = async (rpc, to, data) => {
      calls.push(`${rpc} ${to} ${data.slice(0, 10)}`);
      if (rpc.includes("base")) return account;
      if (rpc.includes("polygon")) throw new Error("down");
      return "0x" + word(0n).repeat(6);
    };
    const s = await fetchPublicWallet(EVM, "evm", fake({
      [`https://eth.blockscout.com/api/v2/addresses/${EVM}/tokens`]: { items: [
        { value: "1000000000", token: { address_hash: "0xa", symbol: "aEthUSDC", name: "Aave Ethereum USDC", decimals: "6", exchange_rate: "1", reputation: "ok" } },
        { value: "1000000000", token: { address_hash: "0xd", symbol: "variableDebtEthUSDC", name: "Aave Ethereum Variable Debt USDC", decimals: "6", exchange_rate: "1", reputation: "ok" } },
      ] },
      [`https://eth.blockscout.com/api/v2/addresses/${EVM}`]: { coin_balance: "1000000000000000000", exchange_rate: "2500" },
    }), 1000, call);
    expect(calls).toContain(`https://base-rpc.publicnode.com 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 0xbf92857c`);
    expect(s.tokens.map((t) => t.symbol)).toEqual(["ETH"]);
    expect(s.defiPositions).toEqual([expect.objectContaining({ chain: "base", protocol: "Aave V3", assetValueUsd: 109583.16, debtValueUsd: 36422.29, valueUsd: 73160.87, healthFactor: 2.5 })]);
    expect(s).toMatchObject({ tokenValueUsd: 2500, defiValueUsd: 109583.16, debtValueUsd: 36422.29, totalValueUsd: 75660.87, partial: true });
    // Base's explorer didn't answer but its Aave position did: Base still counts, with the gap named.
    expect(s.chains).toEqual(["ethereum", "base", "arbitrum", "optimism"]);
    expect(s.tokenFailedChains).toEqual(["base", "arbitrum", "optimism", "polygon"]);
    expect(s.defiFailedChains).toEqual(["polygon"]);
    expect(s.failedChains).toEqual(["base", "arbitrum", "optimism", "polygon"]);
  });

  it("recognises Aave deposit and loan tokens, and nothing else", () => {
    expect(isAaveToken("aBasUSDC", "Aave Base USDC")).toBe(true);
    expect(isAaveToken("variableDebtBasUSDC", "Aave Base Variable Debt USDC")).toBe(true);
    expect(isAaveToken("aArbWETH", "")).toBe(true);
    expect(isAaveToken("AAVE", "Aave Token")).toBe(false);
    expect(isAaveToken("axlUSDC", "Axelar Wrapped USDC")).toBe(false);
  });
});
