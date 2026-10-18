// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aerodrome, chainDrafts, priceDrafts, rangeAmounts, uniswapV4, V4 } from "./lib/defiPositions";
import { decodeAggregate3, encodeAggregate3, MULTICALL } from "./lib/evm";
import { keccak256, keccakHex } from "./lib/keccak";
import { fetchPublicWallet, type Call, type Get } from "./lib/publicWallets";
import { fallbackTokens, FALLBACK_TOKENS } from "./lib/tokenFallback";

const OWNER = "0x15536350beb171a2826ea1ba13e3c23fb052a2d8";
const BASE = { id: "base", name: "Base", rpc: "https://base-rpc.publicnode.com", host: "https://base.blockscout.com", coin: "ETH", coinName: "Ether" };
const WETH = "0x4200000000000000000000000000000000000006", USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const word = (n: bigint | number | string) => (typeof n === "string" ? n.replace(/^0x/, "").padStart(64, "0") : (BigInt(n) < 0n ? 2n ** 256n + BigInt(n) : BigInt(n)).toString(16).padStart(64, "0"));
const ret = (...xs: Array<bigint | number | string>) => "0x" + xs.map(word).join("");
const zero = ret(0, 0, 0, 0, 0, 0);
const prices = { coins: { [`base:${WETH}`]: { price: 2000, decimals: 18, symbol: "WETH" }, [`base:${USDC}`]: { price: 1, decimals: 6, symbol: "USDC" }, "base:0x940181a94a35a4569e4529a3cdfb74e38fd98631": { price: 0.5, decimals: 18, symbol: "AERO" } } };

/** A Multicall3 that answers each inner call with `answer`, the way the contract encodes it. */
function multicallAnswer(data: string, answer: (to: string, data: string) => string | null): string {
  const h = data.slice(10);
  const at = (byte: number) => Number(BigInt("0x" + h.slice(byte * 2, byte * 2 + 64)));
  const n = at(32), base = 64;
  const results = Array.from({ length: n }, (_, i) => {
    const t = base + at(base + i * 32);
    const to = "0x" + h.slice((t + 12) * 2, (t + 32) * 2), len = at(t + 96);
    return answer(to, "0x" + h.slice((t + 128) * 2, (t + 128 + len) * 2));
  });
  const tuples = results.map((r) => { const d = (r ?? "0x").slice(2); return word(r === null ? 0 : 1) + word(0x40) + word(d.length / 2) + d.padEnd(Math.ceil(d.length / 64) * 64, "0"); });
  let off = n * 32;
  const heads = tuples.map((t) => { const x = off; off += t.length / 2; return word(x); });
  return "0x" + word(0x20) + word(n) + heads.join("") + tuples.join("");
}

describe("keccak and multicall", () => {
  it("hashes like Ethereum does, across several blocks", () => {
    expect(keccak256(new Uint8Array())).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(keccak256(new TextEncoder().encode("balanceOf(address)")).slice(0, 10)).toBe("0x70a08231");
    // Checked against web3_sha3 on a public node: 200 bytes of 0xab spans two blocks.
    expect(keccakHex("ab".repeat(200))).toBe("0x8ca353cee0a5c5b999a0916e88da37a16293cf14a73c735d6b5197b50c3d6656");
  });

  it("encodes Multicall3 batches and reads each result, failed ones as null", () => {
    const data = encodeAggregate3([{ to: USDC, data: "0x70a08231" + word(OWNER) }, { to: WETH, data: "0x18160ddd" }]);
    expect(data.slice(0, 10)).toBe("0x82ad56cb");
    const out = decodeAggregate3(multicallAnswer(data, (to, d) => (to === USDC && d.startsWith("0x70a08231") ? ret(42) : null)));
    expect(out).toEqual([ret(42), null]);
  });
});

describe("Uniswap V4", () => {
  const v4 = V4.base;
  it("prices a range from the pool price, with fees from fee growth, and names its pool", () => {
    const { amount0, amount1 } = rangeAmounts(1e12, 2 ** 96, -100, 100);
    expect(amount0).toBeCloseTo(amount1, 0);
    expect(rangeAmounts(1e12, 2 ** 96, 100, 200).amount1).toBe(0);
  });

  it("lists V4 NFTs through the explorer and values the open ones", async () => {
    const asked: string[] = [];
    const info = (100n << 32n) | ((2n ** 24n - 100n) << 8n); // tickUpper 100, tickLower -100.
    const call: Call = async (_rpc, to, data) => {
      const sel = data.slice(0, 10);
      if (to === MULTICALL) return multicallAnswer(data, (_t, d) => ret(d.endsWith(word(7)) ? 0 : 10n ** 12n));
      if (to === v4.pm && sel === "0x70a08231") return ret(2);
      if (to === v4.pm && sel === "0x7ba03aad") return ret(0, USDC, 500, 10, 0, info);
      if (to === v4.stateView) {
        asked.push(sel);
        if (sel === "0xc815641c") return ret(2n ** 96n, 0, 0, 0);
        if (sel === "0x53e9c1fb") return ret(5n << 128n, 0);
        if (sel === "0xdacf1d2f") return ret(10n ** 12n, 2n << 128n, 0);
      }
      throw new Error(`unexpected ${to} ${sel}`);
    };
    const get: Get = async (url) => {
      expect(url).toBe(`https://base.blockscout.com/api/v2/tokens/${v4.pm}/instances?holder_address_hash=${OWNER}`);
      return { items: [{ id: "8" }, { id: "7" }] };
    };
    const drafts = await uniswapV4(BASE, OWNER, call, get);
    expect(drafts.map((d) => d.id)).toEqual(["base:uniswap-v4:8"]);
    expect(asked.sort()).toEqual(["0x53e9c1fb", "0xc815641c", "0xdacf1d2f"]);
    // Native ETH is currency0 (the zero address); fees: (5 - 2) units of growth on 1e12 liquidity.
    expect(drafts[0].legs[0].token).toBe("0x0000000000000000000000000000000000000000");
    expect(drafts[0].legs[0].raw - rangeAmounts(1e12, 2 ** 96, -100, 100).amount0).toBeCloseTo(3e12, -3);
  });

  it("asks nobody when the wallet holds no V4 NFT, and counts the rest when the explorer is down", async () => {
    let explorer = 0;
    const none: Call = async () => zero;
    expect(await uniswapV4(BASE, OWNER, none, async () => { explorer++; return {}; })).toEqual([]);
    expect(explorer).toBe(0);
    const some: Call = async (_rpc, to, data) => (to === v4.pm && data.startsWith("0x70a08231") ? ret(1) : zero);
    const r = await chainDrafts(BASE, OWNER, some, async () => { throw new Error("bot check"); });
    expect(r).toEqual({ drafts: [], incomplete: true });
  });
});

describe("Aerodrome through Sugar", () => {
  it("finds staked positions the wallet doesn't hold, with fees and AERO rewards, a thousand pools at a time", async () => {
    const pool = "0x222ccbe78890a4d9ef8d22d7fc1b968be0f2c653";
    const offsets: string[] = [];
    const call: Call = async (_rpc, to, data) => {
      const sel = data.slice(0, 10);
      if (sel === "0xefde4e64") return ret(to.toLowerCase() === "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a" ? 2500 : 0);
      if (sel === "0x0d0154a9") {
        offsets.push(BigInt("0x" + data.slice(74, 138)).toString());
        if (!data.slice(74, 138).endsWith("7d0")) return ret(0x20, 0); // Only the page at offset 2000 has it.
        // id, pool, liquidity, staked, amount0, amount1, staked0, staked1, fees0, fees1, AERO, then range fields.
        return ret(0x20, 1, 77, pool, 0, 5, 0, 0, 10n ** 18n, 1_000_000_000, 10n ** 16n, 0, 4n * 10n ** 18n, 0, 0, 0, 0, 0, 0, 0);
      }
      if (to === MULTICALL) return multicallAnswer(data, (_t, d) => ret(d === "0x0dfe1681" ? WETH : USDC));
      return zero;
    };
    const drafts = await aerodrome(BASE, OWNER, call);
    expect(offsets).toEqual(["0", "1000", "2000"]);
    const [p] = await priceDrafts(drafts, async () => prices);
    expect(p).toMatchObject({ id: "base:aerodrome:77", protocol: "Aerodrome", label: "WETH / USDC pool, staked", symbols: ["WETH", "USDC", "AERO"] });
    // 1.01 WETH, 1,000 USDC and 4 AERO.
    expect(p.assetValueUsd).toBe(2020 + 1000 + 2);
  });
});

describe("tokens without the explorer", () => {
  it("reads the native coin and listed tokens from the chain in one request, priced, skipping dust", async () => {
    const usdc = FALLBACK_TOKENS.base.USDC.toLowerCase();
    const call: Call = async (_rpc, to, data) => {
      expect(to).toBe(MULTICALL);
      return multicallAnswer(data, (t, d) => (d.startsWith("0x4d2301cc") ? ret(5n * 10n ** 17n) : t === usdc ? ret(250_000_000) : ret(1)));
    };
    const get: Get = async (url) => {
      expect(url.split(",").length).toBe(Object.keys(FALLBACK_TOKENS.base).length + 1);
      return { coins: { "base:0x0000000000000000000000000000000000000000": { price: 2000, decimals: 18, symbol: "ETH" }, [`base:${usdc}`]: { price: 1, decimals: 6, symbol: "USDC" } } };
    };
    const tokens = await fallbackTokens(BASE, OWNER, call, get);
    expect(tokens.map((t) => [t.symbol, t.quantity, t.valueUsd])).toEqual([["ETH", "0.5", 1000], ["USDC", "250", 250]]);
  });

  it("falls back per chain when the explorer is down, and says which chains", async () => {
    const call: Call = async (rpc, to, data) => {
      if (to === MULTICALL && rpc.includes("base")) return multicallAnswer(data, (_t, d) => (d.startsWith("0x4d2301cc") ? ret(10n ** 18n) : ret(0)));
      return zero;
    };
    const get: Get = async (url) => {
      if (url.startsWith("https://coins.llama.fi/")) return { coins: { "base:0x0000000000000000000000000000000000000000": { price: 2000, decimals: 18, symbol: "ETH" } } };
      if (url.startsWith("https://eth.blockscout.com/api/v2/addresses/") && url.endsWith("/tokens?type=ERC-20")) return { items: [] };
      if (url.startsWith("https://eth.blockscout.com/api/v2/addresses/")) return { coin_balance: "0" };
      throw new Error("bot check");
    };
    const s = await fetchPublicWallet(OWNER, "evm", get, 1000, call);
    // Base's chain answered; the others' nodes didn't either, so they stay unchecked, not zero.
    expect(s.tokenFallbackChains).toEqual(["base"]);
    expect(s.tokenFailedChains).toEqual(["arbitrum", "optimism", "polygon"]);
    expect(s.tokens.map((t) => [t.chain, t.symbol, t.valueUsd])).toEqual([["base", "ETH", 2000]]);
    expect(s).toMatchObject({ totalValueUsd: 2000, partial: true });
  });
});
