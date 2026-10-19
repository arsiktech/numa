// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aaveLegs, aerodrome, chainDrafts, etherfiCash, fluidLending, priceDrafts, priceLegs, rangeAmounts, uniswapV4, V4 } from "./lib/defiPositions";
import { decodeAggregate3, encodeAggregate3, MULTICALL } from "./lib/evm";
import { keccak256, keccakHex } from "./lib/keccak";
import { fetchPublicWallet, type Call, type Get } from "./lib/publicWallets";
import { fallbackTokens, FALLBACK_TOKENS } from "./lib/tokenFallback";

const OWNER = "0x15536350beb171a2826ea1ba13e3c23fb052a2d8";
const BASE = { id: "base", name: "Base", rpc: "https://base-rpc.publicnode.com", hosts: ["https://base.blockscout.com"], coin: "ETH", coinName: "Ether" };
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
    // With a free Alchemy key, its NFT API lists the positions instead; closed ones (no liquidity) count as nothing.
    const nftApi = "https://base-mainnet.g.alchemy.com/nft/v3/free-key";
    const closed: Call = async (_rpc, to, data) => (to === MULTICALL ? multicallAnswer(data, () => ret(0)) : some(_rpc, to, data));
    const viaAlchemy = await chainDrafts({ ...BASE, nftApi }, OWNER, closed, async (url) => {
      if (url.startsWith("https://base.blockscout.com")) throw new Error("bot check");
      expect(url).toBe(`${nftApi}/getNFTsForOwner?owner=${OWNER}&contractAddresses[]=${v4.pm}&withMetadata=false&pageSize=100`);
      return { ownedNfts: [{ tokenId: "2589280" }, { tokenId: "15787" }] };
    });
    expect(viaAlchemy).toEqual({ drafts: [], incomplete: false });
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

const GATEWAY = "0x01f8cdfb1694ea8fe4ed6c38a0fd78d1188e03f4", OP_USDC = "0x0b2c639c533813f4aa9d7837caf62653d097ff85";

describe("ether.fi Cash and Fluid", () => {
  it("reads ether.fi Cash collateral and its LendGateway loan on Optimism, and drops what the Scroll move left behind", async () => {
    const WEEUR = "0xcc476b1a49bcdf5192561e87b6fb8ea78aa28c13";
    const SYMBOL = "0x" + word(0x20) + word(5) + Buffer.from("weEUR").toString("hex").padEnd(64, "0");
    const call: Call = async (rpc, to, data) => {
      const sel = data.slice(0, 10);
      if (sel === "0xb334ed86") return to === OWNER ? ret("0xdc515cb479a64552c5a11a57109c314e40a1a778") : "0x";
      if (sel === "0x95d89b41") return SYMBOL;
      if (rpc.includes("optimism") && sel === "0x1aefb107") return ret(0x40, 40_851_644_527, 1, WEEUR, 23_090n * 10n ** 18n);
      // The old Scroll manager still lists a loan, but the collateral behind it moved to Optimism.
      if (rpc.includes("scroll") && sel === "0x186c66cc") return ret(0x40, 12_738_000_716, 1, USDC, 12_738_000_716);
      // LendGateway on Optimism: getAccountData, borrowableAssets, debtOf.
      if (to === GATEWAY && sel === "0x5d78650e") return ret(40_893_708_395, 5_080_447_881, 31_185_931_530, 36_266_379_411, 7_133_512_384_212_123_875n);
      if (to === GATEWAY && sel === "0x76636017") return ret(0x20, 1, OP_USDC);
      if (to === GATEWAY && sel === "0x4c4ab169") return ret(5_080_447_881);
      // convertCollateralTokenToUsd (ether.fi values its own tokens) and decimals(), in one Multicall3 request.
      if (to === MULTICALL) return multicallAnswer(data, (_t, d) => (d.startsWith("0xc5b66b4a") ? ret(26_536_750_000) : d.startsWith("0x313ce567") ? ret(18) : null));
      return ret(0x40, 0, 0);
    };
    expect(await etherfiCash("0x3115b79b73562aa183500752a0bb11bf082765e8", call)).toEqual([]);
    const refuses: Call = async (rpc, to, data) => (data.startsWith("0xb334ed86") ? Promise.reject(new Error("execution reverted")) : call(rpc, to, data));
    expect(await etherfiCash("0xbce2bd513714d294ded39c7e6a5bc52020588289", refuses)).toEqual([]);
    const out = await etherfiCash(OWNER, call);
    expect(out).toEqual([
      expect.objectContaining({ id: "optimism:etherfi-cash", assetValueUsd: 40851.64, debtValueUsd: 5080.45, healthFactor: 7.133512384212124, label: "ether.fi Cash collateral and loan" }),
    ]);
    // With prices, each token shows on its own: collateral valued by ether.fi, the loan by DefiLlama.
    const get: Get = async () => ({ coins: { [`optimism:${OP_USDC}`]: { price: 1, decimals: 6, symbol: "USDC" } } });
    // Convex's default runtime has no Node Buffer; the reader must not need it.
    const buffer = globalThis.Buffer;
    let split: Awaited<ReturnType<typeof etherfiCash>>;
    try { (globalThis as { Buffer?: unknown }).Buffer = undefined; split = await etherfiCash(OWNER, call, get); }
    finally { globalThis.Buffer = buffer; }
    expect(split[0].assets?.[0]).toEqual({ symbol: "weEUR", quantity: "23090", valueUsd: 26536.75 });
    expect(split[0].assets).toContainEqual({ symbol: "USDC", quantity: "5080.447881", valueUsd: 5080.45, debt: true });
    expect(split).toHaveLength(1);
  });

  it("reads Fluid lending from its API and skips unpriced or empty positions", async () => {
    const get: Get = async (url) => {
      expect(url).toBe(`https://api.fluid.instadapp.io/v2/lending/42161/users/${OWNER}/positions`);
      return { data: [
        { token: { address: "0xF1", asset: { symbol: "USDT", decimals: 6, price: "0.999" } }, underlyingAssets: "15110495700" },
        { token: { address: "0xF2", asset: { symbol: "WETH", decimals: 18, price: "2345" } }, underlyingAssets: "0" },
        { token: { address: "0xF3", asset: { symbol: "XYZ", decimals: 18 } }, underlyingAssets: "1000" },
      ] };
    };
    const out = await fluidLending({ id: "arbitrum", name: "Arbitrum", rpc: "" }, OWNER, get);
    expect(out).toEqual([expect.objectContaining({ id: "arbitrum:fluid:0xf1", protocol: "Fluid", label: "Fluid USDT lending", assetValueUsd: 15095.39, positionAddress: "0xf1" })]);
    expect(await fluidLending({ id: "optimism", name: "Optimism", rpc: "" }, OWNER, get)).toEqual([]);
  });

  it("splits an Aave account into what it supplies and owes, reserve by reserve", async () => {
    const POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", PROVIDER = "0x00000000000000000000000000000000000000aa", DP = "0x00000000000000000000000000000000000000dd", GHO = "0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee";
    const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
    const reply = (data: string) => {
      const sel = data.slice(0, 10);
      if (sel === "0x28dd2d01") {
        const asset = "0x" + data.slice(34, 74);
        return asset === CBBTC ? ret(134_213_134, 0, 0) : asset === USDC ? ret(0, 0, 20_731_027_841n) : asset === GHO ? ret(0, 0, 15_706n * 10n ** 18n) : ret(0, 0, 0);
      }
      throw new Error(`unexpected ${sel}`);
    };
    const call: Call = async (_rpc, to, data) => {
      const sel = data.slice(0, 10);
      if (to === POOL && sel === "0xd1946dbc") return ret(32, 4, USDC, CBBTC, GHO, WETH);
      if (to === POOL && sel === "0x0542975c") return ret(PROVIDER);
      if (to === PROVIDER && sel === "0xe860accb") return ret(DP);
      if (to === MULTICALL && sel === "0x82ad56cb") return multicallAnswer(data, (_to, d) => reply(d));
      throw new Error(`unexpected ${to} ${sel}`);
    };
    const legs = await aaveLegs({ ...BASE, aave: POOL }, OWNER, call);
    expect(legs).toEqual([{ token: USDC, raw: 20_731_027_841, debt: true }, { token: CBBTC, raw: 134_213_134 }, { token: GHO, raw: 15706e18, debt: true }]);
    const get: Get = async () => ({ coins: { [`base:${USDC}`]: { price: 1, decimals: 6, symbol: "USDC" }, [`base:${CBBTC}`]: { price: 100_000, decimals: 8, symbol: "cbBTC" }, [`base:${GHO}`]: { price: 1, decimals: 18, symbol: "GHO" } } });
    expect(await priceLegs("base", legs, get)).toEqual([
      { symbol: "cbBTC", quantity: "1.34213134", valueUsd: 134_213.13 },
      { symbol: "USDC", quantity: "20731.027841", valueUsd: 20_731.03, debt: true },
      { symbol: "GHO", quantity: "15706", valueUsd: 15_706, debt: true },
    ]);
    // One unpriced token: no split at all, rather than a split that doesn't add up.
    expect(await priceLegs("base", legs, async () => ({ coins: { [`base:${USDC}`]: { price: 1, decimals: 6, symbol: "USDC" } } }))).toBeNull();
  });
});
