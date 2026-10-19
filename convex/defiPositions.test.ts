// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chainDrafts, morpho, priceDrafts, type Post } from "./lib/defiPositions";
import type { Call, Get } from "./lib/publicWallets";

const OWNER = "0x15536350beb171a2826ea1ba13e3c23fb052a2d8";
const BASE = { id: "base", name: "Base", rpc: "https://base-rpc.publicnode.com" };
const WETH = "0x4200000000000000000000000000000000000006", USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const UNI_BASE = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", COMET_USDC = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
const word = (n: bigint | number | string) => (typeof n === "string" ? n.replace(/^0x/, "").padStart(64, "0") : (BigInt(n) < 0n ? 2n ** 256n + BigInt(n) : BigInt(n)).toString(16).padStart(64, "0"));
const ret = (...xs: Array<bigint | number | string>) => "0x" + xs.map(word).join("");
const zero = ret(0, 0, 0, 0, 0, 0);
const noExplorer: Get = async () => { throw new Error("explorer not expected"); };

describe("DeFi positions", () => {
  it("reads open Uniswap positions newest first, with fees, and skips closed ones", async () => {
    const asked: string[] = [];
    const call: Call = async (_rpc, to, data, from) => {
      const sel = data.slice(0, 10);
      if (to !== UNI_BASE) return zero;
      asked.push(`${sel}${from ? " as owner" : ""}`);
      if (sel === "0x70a08231") return ret(2);
      if (sel === "0x2f745c59") return ret(data.endsWith(word(1)) ? 77 : 76);
      // positions(): nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, 2 fee growths, owed0, owed1.
      if (sel === "0x99fbab88") return data.endsWith(word(77)) ? ret(0, 0, WETH, USDC, 500, -200, 200, 10n ** 12n, 0, 0, 0, 0) : ret(0, 0, WETH, USDC, 500, -200, 200, 0, 0, 0, 0, 0);
      if (sel === "0xfc6f7865") return ret(10n ** 16n, 25_000_000); // 0.01 WETH and 25 USDC of fees.
      if (sel === "0x0c49ccbe") return ret(10n ** 18n, 3_000_000_000); // 1 WETH and 3,000 USDC in the range.
      throw new Error(`unexpected ${sel}`);
    };
    const { drafts } = await chainDrafts(BASE, OWNER, call, noExplorer);
    expect(drafts.map((d) => d.id)).toEqual(["base:uniswap-v3:77"]);
    expect(asked).toContain("0xfc6f7865 as owner");
    expect(asked).toContain("0x0c49ccbe as owner");
    const get: Get = async (url) => {
      expect(url).toBe(`https://coins.llama.fi/prices/current/base:${WETH},base:${USDC}`);
      return { coins: { [`base:${WETH}`]: { price: 2000, decimals: 18, symbol: "WETH" }, [`base:${USDC}`]: { price: 1, decimals: 6, symbol: "USDC" } } };
    };
    const [p] = await priceDrafts(drafts, get);
    expect(p).toMatchObject({ protocol: "Uniswap V3", kind: "liquidity", label: "WETH / USDC 0.05% pool", symbols: ["WETH", "USDC"], assetValueUsd: 2020 + 3025, debtValueUsd: 0, valueUsd: 5045 });
    expect(p.assets).toEqual([{ symbol: "USDC", quantity: "3025", valueUsd: 3025 }, { symbol: "WETH", quantity: "1.01", valueUsd: 2020 }]);
  });

  it("calls a position out of range when it holds only one token", async () => {
    const call: Call = async (_rpc, to, data) => {
      const sel = data.slice(0, 10);
      if (to !== UNI_BASE) return zero;
      if (sel === "0x70a08231") return ret(1);
      if (sel === "0x2f745c59") return ret(9);
      if (sel === "0x99fbab88") return ret(0, 0, WETH, USDC, 3000, 100, 200, 5, 0, 0, 0, 0);
      if (sel === "0xfc6f7865") throw new Error("reverted");
      return ret(0, 2_000_000);
    };
    const [p] = await priceDrafts((await chainDrafts(BASE, OWNER, call, noExplorer)).drafts, async () => ({ coins: { [`base:${WETH}`]: { price: 2000, decimals: 18, symbol: "WETH" }, [`base:${USDC}`]: { price: 1, decimals: 6, symbol: "USDC" } } }));
    expect(p).toMatchObject({ label: "WETH / USDC 0.3% pool, out of range", assetValueUsd: 2 });
  });

  it("reads Compound V3 lending and borrowing, with collateral, and leaves out positions with unpriced tokens", async () => {
    const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
    const call: Call = async (_rpc, to, data) => {
      const sel = data.slice(0, 10);
      if (to !== COMET_USDC) return zero;
      if (sel === "0xdc4abafd") return ret(-1000, 0, 0, 0b10, 0); // Borrowing, holding collateral asset 1.
      if (sel === "0xc55dae63") return ret(USDC);
      if (sel === "0x374c49b4") return ret(40_000_000_000); // 40,000 USDC owed.
      if (sel === "0xc8c7fe6b") { expect(data.endsWith(word(1))).toBe(true); return ret(1, CBBTC, 0, 0, 0, 0, 0, 0); }
      if (sel === "0x2b92a07d") return ret(100_000_000, 0); // 1 cbBTC.
      throw new Error(`unexpected ${sel}`);
    };
    const { drafts } = await chainDrafts(BASE, OWNER, call, noExplorer);
    const prices = { [`base:${USDC}`]: { price: 1, decimals: 6, symbol: "USDC" }, [`base:${CBBTC}`]: { price: 100_000, decimals: 8, symbol: "cbBTC" } };
    const [p] = await priceDrafts(drafts, async () => ({ coins: prices }));
    expect(p).toMatchObject({ protocol: "Compound V3", label: "Compound V3 lending and borrowing", assetValueUsd: 100_000, debtValueUsd: 40_000, valueUsd: 60_000, positionAddress: COMET_USDC.toLowerCase() });
    expect(p.assets).toEqual([{ symbol: "cbBTC", quantity: "1", valueUsd: 100_000 }, { symbol: "USDC", quantity: "40000", valueUsd: 40_000, debt: true }]);
    expect(await priceDrafts(drafts, async () => ({ coins: { [`base:${USDC}`]: prices[`base:${USDC}`] } }))).toEqual([]);
  });

  it("fails the whole chain when one contract can't be read, so nothing is half counted", async () => {
    const call: Call = async (_rpc, to) => { if (to === COMET_USDC) throw new Error("down"); return zero; };
    await expect(chainDrafts(BASE, OWNER, call, noExplorer)).rejects.toThrow();
  });

  it("reads Morpho markets and vaults per chain, skips dust and unpriced markets, and treats never-used as empty", async () => {
    let query = "";
    const post: Post = async (_url, body) => {
      query = (body as { query: string }).query;
      return {
        data: {
          ethereum: null,
          base: {
            marketPositions: [
              { market: { marketId: "0xAB", loanAsset: { symbol: "USDC" }, collateralAsset: { symbol: "cbBTC" } }, state: { supplyAssetsUsd: 0, borrowAssetsUsd: 7969.8, collateralUsd: 12147.1 } },
              { market: { marketId: "0xCD", loanAsset: { symbol: "KITE" }, collateralAsset: { symbol: "SENT" } }, state: { supplyAssetsUsd: 0, borrowAssetsUsd: null, collateralUsd: null } },
              { market: { marketId: "0xEF", loanAsset: { symbol: "USDC" }, collateralAsset: null }, state: { supplyAssetsUsd: 0.02, borrowAssetsUsd: 0, collateralUsd: 0 } },
            ],
            vaultPositions: [{ vault: { name: "Spark USDC Vault", address: "0x7BfA", asset: { symbol: "USDC" } }, state: { assetsUsd: 500 } }],
          },
        },
        errors: [{ path: ["ethereum"], status: "NOT_FOUND" }],
      };
    };
    const chains = [{ id: "ethereum", name: "Ethereum", rpc: "" }, BASE, { id: "arbitrum", name: "Arbitrum", rpc: "" }];
    const r = await morpho(chains, OWNER, post);
    expect(query).toContain(`base: userByAddress(address: "${OWNER}", chainId: 8453)`);
    expect(r.failed).toEqual(["arbitrum"]);
    expect(r.positions).toEqual([
      expect.objectContaining({ id: "base:morpho:0xab", label: "Morpho cbBTC / USDC lending and borrowing", assetValueUsd: 12147.1, debtValueUsd: 7969.8, assets: [{ symbol: "cbBTC", valueUsd: 12147.1 }, { symbol: "USDC", valueUsd: 7969.8, debt: true }] }),
      expect.objectContaining({ id: "base:morpho-vault:0x7bfa", label: "Spark USDC Vault", assetValueUsd: 500, positionAddress: "0x7bfa" }),
    ]);
  });
});
