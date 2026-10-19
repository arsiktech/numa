/**
 * DeFi positions beyond Aave, read for free: liquidity pools (Uniswap V3 and V4, PancakeSwap V3
 * and Aerodrome Slipstream, staked or not) and Compound V3 straight from their contracts over
 * public RPC nodes, Morpho from its public API, and token prices from DefiLlama. Like wallet tokens, a position
 * holding a token nobody prices is left out: that is almost always spam.
 */

import { address, explorerGet, firstWord, int, multicall, pad, uint, words } from "./evm";
import { keccakHex } from "./keccak";
import type { Call, DefiAsset, DefiPosition, Get } from "./publicWallets";

export type Post = (url: string, body: unknown) => Promise<unknown>;
/** A chain as the readers need it; `host` is its Blockscout explorer. */
/** `nftApi`: Alchemy's NFT API for this chain, key included, when the server has one. */
type Chain = { id: string; name: string; rpc: string; hosts?: readonly string[]; nftApi?: string };

/** An amount of one token in a position, in the token's smallest unit. */
type Leg = { token: string; raw: number; debt?: boolean };
/** A position before prices: its legs and how to name it once symbols are known. */
export type Draft = { id: string; chain: Chain; protocol: string; kind: DefiPosition["kind"]; legs: Leg[]; label: (symbols: string[]) => string; positionAddress?: string };

const MAX_SCANNED = 30;
const MAX_OPEN = 10;
const MIN_POSITION_USD = 1;

/** A concentrated-liquidity position manager: the contract whose NFTs are the positions. */
type Manager = { protocol: string; npm: string; tickSpacing?: boolean };
const UNI = (npm: string): Manager => ({ protocol: "Uniswap V3", npm });
const CAKE: Manager = { protocol: "PancakeSwap V3", npm: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" };
const UNI_MAIN = UNI("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
export const MANAGERS: Record<string, Manager[]> = {
  ethereum: [UNI_MAIN, CAKE],
  base: [
    UNI("0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1"),
    { protocol: "Aerodrome", npm: "0x827922686190790b37229fd06084350E74485b72", tickSpacing: true },
    CAKE,
  ],
  arbitrum: [UNI_MAIN, CAKE],
  optimism: [UNI_MAIN],
  polygon: [UNI_MAIN],
};

/** Compound V3 markets, one contract per borrowable asset. */
export const COMETS: Record<string, string[]> = {
  ethereum: ["0xc3d688B66703497DAA19211EEdff47f25384cdc3", "0xA17581A9E3356d9A858b789D68B4d866e593aE94", "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840"],
  base: ["0xb125E6687d4313864e53df431d5425969c15Eb2F", "0x46e6b214b524310239732D51387075E0e70970bf", "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf"],
  arbitrum: ["0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA", "0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486", "0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07"],
  optimism: ["0x2e44e174f7D53F0212823acC11C01A11d58c5bCB", "0x995E394b8B2437aC8Ce61Ee0bC610D617962B214", "0xE36A30D249f7761327fd973001A32010b521b6Fd"],
  polygon: ["0xF25212E676D1F7F89Cd72fFEe66158f541246445", "0xaeB318360f27748Acb200CE616E389A6C9409a07"],
};

async function managerPositions(chain: Chain, m: Manager, owner: string, call: Call): Promise<Draft[]> {
  const [count] = words(await call(chain.rpc, m.npm, "0x70a08231" + pad(owner)));
  const n = Number(count);
  const out: Draft[] = [];
  // Newest first: closed positions stay in the wallet as empty NFTs, and old ones are mostly closed.
  for (let i = n - 1; i >= Math.max(0, n - MAX_SCANNED) && out.length < MAX_OPEN; i--) {
    const [tokenId] = words(await call(chain.rpc, m.npm, "0x2f745c59" + pad(owner) + uint(i)));
    const w = words(await call(chain.rpc, m.npm, "0x99fbab88" + uint(tokenId)));
    const token0 = address(w[2]), token1 = address(w[3]), feeOrSpacing = int(w[4]), liquidity = w[7];
    let owed0 = w[10], owed1 = w[11];
    if (liquidity === 0n && owed0 === 0n && owed1 === 0n) continue;
    // Collecting as the owner, without sending, returns the fees earned so far including ones not yet booked.
    try {
      const max = (2n ** 128n - 1n).toString(16).padStart(64, "0");
      [owed0, owed1] = words(await call(chain.rpc, m.npm, "0xfc6f7865" + uint(tokenId) + pad(owner) + max + max, owner));
    } catch { /* The booked fees above are still right, just not the newest. */ }
    // Removing all liquidity as the owner, without sending, returns exactly what the position holds now.
    let amount0 = 0n, amount1 = 0n;
    if (liquidity > 0n) [amount0, amount1] = words(await call(chain.rpc, m.npm, "0x0c49ccbe" + uint(tokenId) + uint(liquidity) + uint(0) + uint(0) + uint(2n ** 64n), owner));
    const inRange = amount0 > 0n && amount1 > 0n;
    const fee = m.tickSpacing ? "" : ` ${Number(feeOrSpacing) / 10_000}%`;
    out.push({
      id: `${chain.id}:${m.protocol.toLowerCase().replace(/\W+/g, "-")}:${tokenId}`, chain, protocol: m.protocol, kind: "liquidity",
      legs: [{ token: token0, raw: Number(amount0 + owed0) }, { token: token1, raw: Number(amount1 + owed1) }],
      label: (s) => `${s.join(" / ")}${fee} pool${liquidity === 0n ? ", fees to collect" : inRange ? "" : ", out of range"}`,
    });
  }
  return out;
}

async function cometPosition(chain: Chain, comet: string, owner: string, call: Call): Promise<Draft | null> {
  // userBasic: signed principal (supplied when positive, borrowed when negative) and a bitmap of collateral held.
  const basic = words(await call(chain.rpc, comet, "0xdc4abafd" + pad(owner)));
  const principal = int(basic[0]), assetsIn = Number(basic[3]);
  if (principal === 0n && assetsIn === 0) return null;
  const base = address(words(await call(chain.rpc, comet, "0xc55dae63"))[0]);
  const legs: Leg[] = [];
  if (principal > 0n) legs.push({ token: base, raw: Number(words(await call(chain.rpc, comet, "0x70a08231" + pad(owner)))[0]) });
  if (principal < 0n) legs.push({ token: base, raw: Number(words(await call(chain.rpc, comet, "0x374c49b4" + pad(owner)))[0]), debt: true });
  for (let i = 0; i < 16; i++) {
    if (!(assetsIn & (1 << i))) continue;
    const asset = address(words(await call(chain.rpc, comet, "0xc8c7fe6b" + uint(i)))[1]);
    legs.push({ token: asset, raw: Number(words(await call(chain.rpc, comet, "0x2b92a07d" + pad(owner) + pad(asset)))[0]) });
  }
  const borrowing = principal < 0n;
  return {
    id: `${chain.id}:compound-v3:${comet.toLowerCase()}`, chain, protocol: "Compound V3", kind: "supplied", legs, positionAddress: comet.toLowerCase(),
    label: () => (borrowing ? "Compound V3 lending and borrowing" : "Compound V3 lending"),
  };
}

/** Token amounts in a range position at a pool price (Uniswap V3 whitepaper, 6.29 and 6.30). */
export function rangeAmounts(liquidity: number, sqrtPriceX96: number, tickLower: number, tickUpper: number): { amount0: number; amount1: number } {
  const p = sqrtPriceX96 / 2 ** 96, a = Math.sqrt(1.0001 ** tickLower), b = Math.sqrt(1.0001 ** tickUpper);
  if (p <= a) return { amount0: (liquidity * (b - a)) / (a * b), amount1: 0 };
  if (p >= b) return { amount0: 0, amount1: liquidity * (b - a) };
  return { amount0: (liquidity * (b - p)) / (p * b), amount1: liquidity * (p - a) };
}

/** Uniswap V4: the position manager that holds the NFTs, and StateView to read pool state. */
export const V4: Record<string, { pm: string; stateView: string }> = {
  ethereum: { pm: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e", stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227" },
  base: { pm: "0x7c5f5a4bbd8fd63184577525326123b519429bdc", stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71" },
  arbitrum: { pm: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869", stateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990" },
  optimism: { pm: "0x3c3ea4b57a46241e54610e5f022e5c45859a1017", stateView: "0xc18a3169788f4f75a170290584eca6395c75ecdb" },
  polygon: { pm: "0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9", stateView: "0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a" },
};
const int24 = (w: bigint) => { const x = Number(w & 0xffffffn); return x >= 0x800000 ? x - 0x1000000 : x; };
const MOD = 2n ** 256n;

/** The V4 position NFTs an owner holds: from the explorer, or from Alchemy's NFT API when the explorer refuses. */
async function v4Ids(chain: Chain, pm: string, owner: string, get: Get): Promise<bigint[]> {
  const digits = (x: unknown) => (typeof x === "string" && /^\d+$/.test(x) ? BigInt(x) : null);
  try {
    const page = (await explorerGet(chain.hosts ?? [], `/api/v2/tokens/${pm}/instances?holder_address_hash=${owner.toLowerCase()}`, get)) as { items?: Array<{ id?: unknown }> };
    if (!Array.isArray(page?.items)) throw new Error("bad response");
    return page.items.map((i) => digits(i.id)).filter((x): x is bigint => x !== null);
  } catch (error) {
    if (!chain.nftApi) throw error;
  }
  const body = (await get(`${chain.nftApi}/getNFTsForOwner?owner=${owner.toLowerCase()}&contractAddresses[]=${pm}&withMetadata=false&pageSize=100`)) as { ownedNfts?: Array<{ tokenId?: unknown }> };
  if (!Array.isArray(body?.ownedNfts)) throw new Error("bad response");
  return body.ownedNfts.map((n) => digits(n.tokenId)).filter((x): x is bigint => x !== null);
}

/**
 * Uniswap V4 positions can't be listed per owner on chain, so the explorer names the NFTs; the
 * chain then gives each one's pool, range, liquidity and uncollected fees. With no V4 NFT in the
 * wallet the explorer isn't asked at all.
 */
export async function uniswapV4(chain: Chain, owner: string, call: Call, get: Get): Promise<Draft[]> {
  const v4 = V4[chain.id];
  if (!v4) return [];
  const [count] = words(await call(chain.rpc, v4.pm, "0x70a08231" + pad(owner)));
  if (count === 0n) return [];
  const ids = (await v4Ids(chain, v4.pm, owner, get)).slice(0, 50);
  const liquidity = await multicall(call, chain.rpc, ids.map((id) => ({ to: v4.pm, data: "0x1efeed33" + uint(id) })));
  const open = ids.map((id, i) => ({ id, liquidity: firstWord(liquidity[i]) ?? 0n })).filter((x) => x.liquidity > 0n).slice(0, MAX_OPEN);
  return Promise.all(open.map(async ({ id, liquidity: L }) => {
    // getPoolAndPositionInfo: the pool key (5 words, which hash to the pool id) and the packed range.
    const w = words(await call(chain.rpc, v4.pm, "0x7ba03aad" + uint(id)));
    const poolId = keccakHex(w.slice(0, 5).map(uint).join(""));
    const tickLower = int24(w[5] >> 8n), tickUpper = int24(w[5] >> 32n);
    const [slot0, inside, last] = await Promise.all([
      call(chain.rpc, v4.stateView, "0xc815641c" + pad(poolId)),
      call(chain.rpc, v4.stateView, "0x53e9c1fb" + pad(poolId) + uint(tickLower) + uint(tickUpper)),
      call(chain.rpc, v4.stateView, "0xdacf1d2f" + pad(poolId) + pad(v4.pm) + uint(tickLower) + uint(tickUpper) + uint(id)),
    ]);
    const [sqrtPriceX96] = words(slot0), [g0, g1] = words(inside), [, l0, l1] = words(last);
    // Fees earned since the position last settled: growth inside its range times its liquidity.
    const fee0 = ((((g0 - l0) % MOD) + MOD) % MOD) * L >> 128n, fee1 = ((((g1 - l1) % MOD) + MOD) % MOD) * L >> 128n;
    const { amount0, amount1 } = rangeAmounts(Number(L), Number(sqrtPriceX96), tickLower, tickUpper);
    const feeTier = Number(w[2]);
    const fee = feeTier & 0x800000 ? " dynamic-fee" : ` ${feeTier / 10_000}%`;
    const inRange = amount0 > 0 && amount1 > 0;
    return {
      id: `${chain.id}:uniswap-v4:${id}`, chain, protocol: "Uniswap V4", kind: "liquidity" as const,
      legs: [{ token: address(w[0]), raw: amount0 + Number(fee0) }, { token: address(w[1]), raw: amount1 + Number(fee1) }],
      label: (s: string[]) => `${s.slice(0, 2).join(" / ")}${fee} pool${inRange ? "" : ", out of range"}`,
    };
  }));
}

/** Aerodrome's own read-only helper ("Sugar") and the Slipstream factories it reads positions from. */
const SUGAR = "0x69dD9db6d8f8E7d83887A704f447b1a584b599A1";
const SLIPSTREAM_FACTORIES = ["0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A", "0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a", "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef"];
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
/** Pools Sugar walks per request; more runs out of gas on public nodes. */
const SUGAR_POOLS = 1000;

/**
 * Aerodrome Slipstream positions, including those staked in a gauge (the gauge holds the NFT, so
 * the wallet doesn't): Sugar walks every pool, a thousand at a time, and returns each position's
 * tokens, fees and AERO rewards.
 */
export async function aerodrome(chain: Chain, owner: string, call: Call): Promise<Draft[]> {
  if (chain.id !== "base") return [];
  const counts = await Promise.all(SLIPSTREAM_FACTORIES.map(async (f) => Number(words(await call(chain.rpc, f, "0xefde4e64"))[0])));
  const pages = SLIPSTREAM_FACTORIES.flatMap((f, i) => Array.from({ length: Math.ceil(counts[i] / SUGAR_POOLS) }, (_, k) => ({ f, offset: k * SUGAR_POOLS })));
  const found = (await Promise.all(pages.map(async ({ f, offset }) => {
    const w = words(await call(chain.rpc, SUGAR, "0x0d0154a9" + uint(SUGAR_POOLS) + uint(offset) + pad(owner) + pad(f)));
    const n = Number(w[1]);
    return Array.from({ length: n }, (_, i) => w.slice(2 + i * 18, 2 + (i + 1) * 18));
  }))).flat();
  if (!found.length) return [];
  const pools = [...new Set(found.map((p) => address(p[1])))];
  const meta = await multicall(call, chain.rpc, pools.flatMap((pool) => [{ to: pool, data: "0x0dfe1681" }, { to: pool, data: "0xd21220a7" }]));
  const tokens = new Map(pools.map((pool, i) => [pool, [firstWord(meta[i * 2]), firstWord(meta[i * 2 + 1])]]));
  return found.slice(0, 20).map((p) => {
    const pool = address(p[1]);
    const [t0, t1] = tokens.get(pool) ?? [null, null];
    if (t0 === null || t1 === null) throw new Error("bad response");
    // Position fields: id, pool, liquidity, staked, amount0, amount1, staked0, staked1, fees0, fees1, AERO earned.
    const a0 = p[4] + p[6] + p[8], a1 = p[5] + p[7] + p[9], staked = p[3] > 0n;
    const inRange = p[4] + p[6] > 0n && p[5] + p[7] > 0n;
    return {
      id: `${chain.id}:aerodrome:${p[0] > 0n ? p[0] : pool}`, chain, protocol: "Aerodrome", kind: "liquidity" as const,
      legs: [{ token: address(t0), raw: Number(a0) }, { token: address(t1), raw: Number(a1) }, { token: AERO, raw: Number(p[10]) }],
      label: (s: string[]) => `${s.slice(0, 2).join(" / ")} pool${staked ? ", staked" : ""}${inRange ? "" : ", out of range"}`,
    };
  });
}

/**
 * Pools and Compound on one chain. A contract that can't be read fails the chain, so nothing is
 * half counted. Uniswap V4 is the exception: it needs the explorer to list positions, so when the
 * explorer is down the rest still counts and the chain is reported as incomplete.
 */
export async function chainDrafts(chain: Chain, owner: string, call: Call, get: Get): Promise<{ drafts: Draft[]; incomplete: boolean }> {
  let incomplete = false;
  const [pools, v4, aero, comets] = await Promise.all([
    Promise.all((MANAGERS[chain.id] ?? []).map((m) => managerPositions(chain, m, owner, call))),
    uniswapV4(chain, owner, call, get).catch(() => { incomplete = true; return [] as Draft[]; }),
    aerodrome(chain, owner, call),
    Promise.all((COMETS[chain.id] ?? []).map((c) => cometPosition(chain, c, owner, call))),
  ]);
  // Sugar also returns unstaked Aerodrome positions the wallet holds; each counts once.
  const seen = new Set(aero.map((d) => d.id));
  return { drafts: [...aero, ...pools.flat().filter((d) => !seen.has(d.id)), ...v4, ...comets.filter((d): d is Draft => d !== null)], incomplete };
}

type Price = { price: number; decimals: number; symbol: string };

/** One DefiLlama request prices every token in every draft. */
export async function priceDrafts(drafts: Draft[], get: Get): Promise<DefiPosition[]> {
  const keys = [...new Set(drafts.flatMap((d) => d.legs.map((l) => `${d.chain.id}:${l.token.toLowerCase()}`)))];
  if (!keys.length) return [];
  const body = (await get(`https://coins.llama.fi/prices/current/${keys.join(",")}`)) as { coins?: Record<string, Partial<Price>> };
  if (!body?.coins || typeof body.coins !== "object") throw new Error("bad response");
  const prices = new Map<string, Price>();
  for (const [k, c] of Object.entries(body.coins)) {
    if (typeof c.price === "number" && c.price > 0 && typeof c.decimals === "number" && typeof c.symbol === "string") prices.set(k.toLowerCase(), c as Price);
  }
  const out: DefiPosition[] = [];
  for (const d of drafts) {
    const legs = d.legs.map((l) => ({ ...l, p: prices.get(`${d.chain.id}:${l.token.toLowerCase()}`) }));
    if (legs.some((l) => !l.p && l.raw > 0)) continue;
    const usd = (l: (typeof legs)[number]) => (l.p ? (l.raw / 10 ** l.p.decimals) * l.p.price : 0);
    const asset = round(legs.filter((l) => !l.debt).reduce((s, l) => s + usd(l), 0));
    const debt = round(legs.filter((l) => l.debt).reduce((s, l) => s + usd(l), 0));
    if (asset < MIN_POSITION_USD && debt < MIN_POSITION_USD) continue;
    const legSymbols = legs.map((l) => l.p?.symbol.slice(0, 24) ?? "?");
    const assets = assetsOf(legs.filter((l): l is typeof l & { p: Price } => !!l.p));
    const symbols = [...new Set(legs.filter((l) => l.p && (l.raw > 0 || legs.indexOf(l) < 2)).map((l) => l.p!.symbol.slice(0, 24)))];
    out.push({
      id: d.id, chain: d.chain.id, chainName: d.chain.name, protocol: d.protocol, label: d.label(legSymbols), kind: d.kind,
      valueUsd: round(asset - debt), assetValueUsd: asset, debtValueUsd: debt, symbols, ...(d.positionAddress ? { positionAddress: d.positionAddress } : {}),
      ...(assets.length ? { assets } : {}),
    });
  }
  return out;
}

/** Priced legs as one entry per token and side, biggest first; dust under a cent is left out. */
function assetsOf(legs: Array<Leg & { p: Price }>): DefiAsset[] {
  const by = new Map<string, DefiAsset & { qty: number }>();
  for (const l of legs) {
    const qty = l.raw / 10 ** l.p.decimals, usd = qty * l.p.price, symbol = l.p.symbol.slice(0, 24);
    const key = `${l.debt ? "debt" : "own"}:${symbol}`;
    const a = by.get(key) ?? { symbol, qty: 0, valueUsd: 0, ...(l.debt ? { debt: true } : {}) };
    a.qty += qty; a.valueUsd += usd;
    by.set(key, a);
  }
  return [...by.values()].filter((a) => a.valueUsd >= 0.01).sort((a, b) => b.valueUsd - a.valueUsd)
    .map(({ qty, ...a }) => ({ ...a, quantity: String(Number(qty.toPrecision(12))), valueUsd: round(a.valueUsd) }));
}

/** Prices loose legs on one chain in one DefiLlama request. Null when any leg holding something has no price. */
export async function priceLegs(chainId: string, legs: Leg[], get: Get): Promise<DefiAsset[] | null> {
  const held = legs.filter((l) => l.raw > 0);
  if (!held.length) return [];
  const keys = [...new Set(held.map((l) => `${chainId}:${l.token.toLowerCase()}`))];
  const body = (await get(`https://coins.llama.fi/prices/current/${keys.join(",")}`)) as { coins?: Record<string, Partial<Price>> };
  if (!body?.coins || typeof body.coins !== "object") return null;
  const priced: Array<Leg & { p: Price }> = [];
  for (const l of held) {
    const c = Object.entries(body.coins).find(([k]) => k.toLowerCase() === `${chainId}:${l.token.toLowerCase()}`)?.[1];
    if (!c || typeof c.price !== "number" || !(c.price > 0) || typeof c.decimals !== "number" || typeof c.symbol !== "string") return null;
    priced.push({ ...l, p: c as Price });
  }
  return assetsOf(priced);
}

/**
 * What an Aave V3 account holds and owes, reserve by reserve: the Pool lists its reserves, and the
 * protocol's data provider (found through the Pool's addresses provider) gives each balance.
 */
export async function aaveLegs(chain: Chain & { aave: string }, owner: string, call: Call): Promise<Leg[]> {
  const list = words(await call(chain.rpc, chain.aave, "0xd1946dbc")); // getReservesList()
  const reserves = list.slice(2, 2 + Number(list[1] ?? 0n)).map(address);
  const provider = address(words(await call(chain.rpc, chain.aave, "0x0542975c"))[0]); // ADDRESSES_PROVIDER()
  const dataProvider = address(words(await call(chain.rpc, provider, "0xe860accb"))[0]); // getPoolDataProvider()
  // getUserReserveData: aToken balance, stable debt, variable debt, …
  const results = await multicall(call, chain.rpc, reserves.map((r) => ({ to: dataProvider, data: "0x28dd2d01" + pad(r) + pad(owner) })));
  const legs: Leg[] = [];
  results.forEach((r, i) => {
    if (!r) throw new Error("bad response");
    const w = words(r);
    if (w[0] > 0n) legs.push({ token: reserves[i], raw: Number(w[0]) });
    if (w[1] + w[2] > 0n) legs.push({ token: reserves[i], raw: Number(w[1] + w[2]), debt: true });
  });
  return legs;
}

const MORPHO_CHAINS: Record<string, number> = { ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10, polygon: 137 };
type MorphoUser = {
  marketPositions?: Array<{ market?: { marketId?: string; loanAsset?: { symbol?: string }; collateralAsset?: { symbol?: string } | null }; state?: { supplyAssetsUsd?: number | null; borrowAssetsUsd?: number | null; collateralUsd?: number | null; supplyAssets?: unknown; borrowAssets?: unknown; collateral?: unknown } | null }>;
  vaultPositions?: Array<{ vault?: { name?: string; address?: string; asset?: { symbol?: string } }; state?: { assetsUsd?: number | null } | null }>;
} | null;

/** Morpho markets and vaults on every chain in one request. Returns positions and the chains it couldn't read. */
export async function morpho(chains: Chain[], owner: string, post: Post): Promise<{ positions: DefiPosition[]; failed: string[] }> {
  const asked = chains.filter((c) => MORPHO_CHAINS[c.id]);
  const query = `{ ${asked.map((c) => `${c.id}: userByAddress(address: "${owner.toLowerCase()}", chainId: ${MORPHO_CHAINS[c.id]}) {
    marketPositions { market { marketId loanAsset { symbol } collateralAsset { symbol } } state { supplyAssetsUsd borrowAssetsUsd collateralUsd } }
    vaultPositions { vault { name address asset { symbol } } state { assetsUsd } } }`).join(" ")} }`;
  const body = (await post("https://blue-api.morpho.org/graphql", { query })) as { data?: Record<string, MorphoUser>; errors?: Array<{ path?: string[]; status?: string }> };
  if (!body || typeof body !== "object" || !body.data) throw new Error("bad response");
  const positions: DefiPosition[] = [], failed: string[] = [];
  for (const chain of asked) {
    const user = body.data[chain.id];
    if (user === undefined) { failed.push(chain.id); continue; }
    // An address that never used Morpho on a chain comes back as "not found", not as a failure.
    if (user === null) { if (!body.errors?.some((e) => e.path?.[0] === chain.id && e.status === "NOT_FOUND")) failed.push(chain.id); continue; }
    for (const m of user.marketPositions ?? []) {
      const s = m.state, loan = m.market?.loanAsset?.symbol ?? "?", coll = m.market?.collateralAsset?.symbol;
      if (!s || s.supplyAssetsUsd === null || s.borrowAssetsUsd === null || s.collateralUsd === null) continue; // Unpriced: spam markets.
      const asset = round((s.supplyAssetsUsd ?? 0) + (s.collateralUsd ?? 0)), debt = round(s.borrowAssetsUsd ?? 0);
      if (asset < MIN_POSITION_USD && debt < MIN_POSITION_USD) continue;
      const symbols = coll ? [coll, loan] : [loan];
      const assets: DefiAsset[] = [
        ...(coll && (s.collateralUsd ?? 0) >= 0.01 ? [{ symbol: coll, valueUsd: round(s.collateralUsd!) }] : []),
        ...((s.supplyAssetsUsd ?? 0) >= 0.01 ? [{ symbol: loan, valueUsd: round(s.supplyAssetsUsd!) }] : []),
        ...(debt > 0 ? [{ symbol: loan, valueUsd: debt, debt: true }] : []),
      ];
      positions.push({
        id: `${chain.id}:morpho:${String(m.market?.marketId ?? symbols.join("-")).toLowerCase()}`, chain: chain.id, chainName: chain.name, protocol: "Morpho",
        label: debt > 0 ? `Morpho ${symbols.join(" / ")} lending and borrowing` : `Morpho ${loan} lending`, kind: "supplied",
        valueUsd: round(asset - debt), assetValueUsd: asset, debtValueUsd: debt, symbols, assets,
      });
    }
    for (const v of user.vaultPositions ?? []) {
      const usd = v.state?.assetsUsd;
      if (typeof usd !== "number" || usd < MIN_POSITION_USD) continue;
      positions.push({
        id: `${chain.id}:morpho-vault:${String(v.vault?.address ?? v.vault?.name).toLowerCase()}`, chain: chain.id, chainName: chain.name, protocol: "Morpho",
        label: `${String(v.vault?.name ?? "Morpho vault").slice(0, 60)}`, kind: "supplied", valueUsd: round(usd), assetValueUsd: round(usd), debtValueUsd: 0,
        symbols: v.vault?.asset?.symbol ? [v.vault.asset.symbol] : [], ...(v.vault?.address ? { positionAddress: v.vault.address.toLowerCase() } : {}),
        ...(v.vault?.asset?.symbol ? { assets: [{ symbol: v.vault.asset.symbol, valueUsd: round(usd) }] } : {}),
      });
    }
  }
  return { positions, failed };
}

/**
 * ether.fi Cash: each card is a smart account whose collateral and loans sit in ether.fi's debt
 * manager, on Optimism (current) and Scroll (where earlier loans can still be open). The manager
 * reports totals in dollars with 6 decimals. On Optimism, loans taken since ether.fi's lending moved
 * to its LendGateway (on Aave v4) sit there instead, against the same collateral. Ordinary wallets
 * simply have none.
 */
export const ETHERFI_CASH = {
  debtManager: "0x0078c5a459132e279056b2371fe8a8ec973a9553",
  chains: [
    { id: "optimism", name: "Optimism", rpc: "https://optimism-rpc.publicnode.com", lendGateway: "0x01f8cdfb1694ea8fe4ed6c38a0fd78d1188e03f4" },
    { id: "scroll", name: "Scroll", rpc: "https://scroll-rpc.publicnode.com" },
  ] as Array<Chain & { lendGateway?: string }>,
};

/** A LendGateway account: its loans token by token and its health, in 6-decimal dollars. */
async function lendGateway(chain: Chain, gateway: string, owner: string, call: Call): Promise<{ debt: number; health: number | null; owed: Array<{ token: string; amount: bigint }> } | null> {
  // getAccountData(safe): (collateralUsd, debtUsd, availableBorrowsUsd, maxBorrowUsd, healthFactor).
  const data = words(await call(chain.rpc, gateway, "0x5d78650e" + pad(owner)));
  if (data.length < 5) return null;
  const debt = Number(data[1]) / 1e6;
  if (debt <= 0) return { debt: 0, health: null, owed: [] };
  // borrowableAssets(), then debtOf(safe, asset) for each.
  const list = words(await call(chain.rpc, gateway, "0x76636017"));
  const assets = Array.from({ length: Number(list[1] ?? 0n) }, (_, k) => address(list[2 + k]));
  const owed = await Promise.all(assets.map(async (token) => ({ token, amount: firstWord(await call(chain.rpc, gateway, "0x4c4ab169" + pad(owner) + pad(token))) ?? 0n })));
  return { debt, health: data[4] < 10n ** 30n ? Number(data[4]) / 1e18 : null, owed: owed.filter((t) => t.amount > 0n) };
}

/** Token amounts in a (token, amount)[] list that starts `at` words into an ABI result. */
function tokenList(w: bigint[], at: number): Array<{ token: string; amount: bigint }> {
  const n = Number(w[at]);
  return Array.from({ length: n }, (_, k) => ({ token: address(w[at + 1 + k * 2]), amount: w[at + 2 + k * 2] }));
}

export async function etherfiCash(owner: string, call: Call, get?: Get): Promise<DefiPosition[]> {
  // Only an ether.fi Cash account has dataProvider(); a plain wallet answers with no data, and the
  // debt manager would refuse it, so it isn't asked.
  // A smart wallet of another kind (a 7702-delegated account, a Safe) refuses the call; that isn't ether.fi either.
  const probe = await call(ETHERFI_CASH.chains[0].rpc, owner, "0xb334ed86").catch(() => "0x");
  if (!/^0x[0-9a-f]{64}/i.test(probe)) return [];
  const out: DefiPosition[] = [];
  for (const chain of ETHERFI_CASH.chains) {
    // collateralOf / borrowingOf: (TokenData[] tokens, uint256 totalUsd) with totals in 6-decimal dollars.
    const [collateral, borrowing] = await Promise.all([
      call(chain.rpc, ETHERFI_CASH.debtManager, "0x1aefb107" + pad(owner)),
      call(chain.rpc, ETHERFI_CASH.debtManager, "0x186c66cc" + pad(owner)),
    ]);
    const c = words(collateral), b = words(borrowing);
    const asset = Number(c[1]) / 1e6;
    const gateway = chain.lendGateway ? await lendGateway(chain, chain.lendGateway, owner, call).catch(() => null) : null;
    const debt = Number(b[1]) / 1e6 + (gateway?.debt ?? 0);
    if (asset < MIN_POSITION_USD && debt < MIN_POSITION_USD) continue;
    // A loan with no collateral left behind it would have been liquidated: it is what ether.fi's move
    // from Scroll to Optimism left in the old manager (the collateral went over in April 2026), not a debt.
    if (asset < MIN_POSITION_USD && !chain.lendGateway) continue;
    const held = tokenList(c, 2).filter((t) => t.amount > 0n), owed = [...tokenList(b, 2).filter((t) => t.amount > 0n), ...(gateway?.owed ?? [])];
    const tokens = [...held, ...owed].map((t) => t.token);
    const names = new Map(await Promise.all([...new Set(tokens)].map(async (t) => [t, await tokenSymbol(chain.rpc, t, call)] as const)));
    const symbols = [...new Set([...names.values()].filter((x): x is string => !!x))];
    const assets = await etherfiAssets(chain, held, owed, names, call, get).catch(() => null);
    out.push({
      id: `${chain.id}:etherfi-cash`, chain: chain.id, chainName: chain.name, protocol: "ether.fi Cash",
      label: debt > 0 && asset > 0 ? "ether.fi Cash collateral and loan" : debt > 0 ? "ether.fi Cash loan" : "ether.fi Cash collateral",
      kind: "supplied", valueUsd: round(asset - debt), assetValueUsd: round(asset), debtValueUsd: round(debt),
      ...(gateway?.health ? { healthFactor: gateway.health } : {}),
      symbols,
      ...(assets?.length ? { assets } : {}),
    });
  }
  return out;
}

async function tokenSymbol(rpc: string, token: string, call: Call): Promise<string | null> {
  try {
    const hex = await call(rpc, token, "0x95d89b41"); // symbol()
    const len = Number(BigInt("0x" + hex.slice(66, 130)));
    // Convex's runtime has no Node Buffer: decode the bytes by hand.
    const bytes = new Uint8Array((hex.slice(130, 130 + len * 2).match(/../g) ?? []).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes).slice(0, 24) || null;
  } catch { return null; }
}

/**
 * ether.fi's own collateral tokens (weEUR, liquidUSD…) have no market price elsewhere, so the debt
 * manager values each one (convertCollateralTokenToUsd, 6-decimal dollars). Loans are priced by DefiLlama.
 */
async function etherfiAssets(chain: Chain, held: Array<{ token: string; amount: bigint }>, owed: Array<{ token: string; amount: bigint }>, names: Map<string, string | null>, call: Call, get?: Get): Promise<DefiAsset[] | null> {
  // One Multicall3 request: a public node refuses a burst of a dozen separate calls.
  const results = await multicall(call, chain.rpc, held.flatMap((t) => [
    { to: ETHERFI_CASH.debtManager, data: "0xc5b66b4a" + pad(t.token) + uint(t.amount) }, // convertCollateralTokenToUsd
    { to: t.token, data: "0x313ce567" }, // decimals()
  ]));
  const own = held.map((t, i) => {
    const usd = firstWord(results[i * 2]), decimals = firstWord(results[i * 2 + 1]), symbol = names.get(t.token);
    if (usd === null || decimals === null || !symbol) throw new Error("bad response");
    return { symbol, quantity: String(Number((Number(t.amount) / 10 ** Number(decimals)).toPrecision(12))), valueUsd: round(Number(usd) / 1e6) };
  });
  const debt = owed.length ? (get ? await priceLegs(chain.id, owed.map((t) => ({ token: t.token, raw: Number(t.amount), debt: true })), get) : null) : [];
  if (!debt) return null;
  return [...own.filter((a) => a.valueUsd >= 0.01).sort((a, b) => b.valueUsd - a.valueUsd), ...debt];
}

const FLUID_CHAINS: Record<string, number> = { ethereum: 1, base: 8453, arbitrum: 42161, polygon: 137 };

/** Fluid lending (fTokens) from Fluid's public API, per chain, valued at its own prices. */
export async function fluidLending(chain: Chain, owner: string, get: Get): Promise<DefiPosition[]> {
  const chainId = FLUID_CHAINS[chain.id];
  if (!chainId) return [];
  const body = (await get(`https://api.fluid.instadapp.io/v2/lending/${chainId}/users/${owner.toLowerCase()}/positions`)) as {
    data?: Array<{ token?: { address?: string; symbol?: string; asset?: { symbol?: string; decimals?: number; price?: string } }; underlyingAssets?: string }>;
  };
  if (!Array.isArray(body?.data)) throw new Error("bad response");
  const out: DefiPosition[] = [];
  for (const p of body.data) {
    const a = p.token?.asset, raw = Number(p.underlyingAssets ?? 0), price = Number(a?.price);
    if (!a || !(raw > 0) || typeof a.decimals !== "number" || !(price > 0)) continue; // Unpriced or empty.
    const usd = round((raw / 10 ** a.decimals) * price);
    if (usd < MIN_POSITION_USD) continue;
    out.push({
      id: `${chain.id}:fluid:${String(p.token?.address).toLowerCase()}`, chain: chain.id, chainName: chain.name, protocol: "Fluid",
      label: `Fluid ${a.symbol ?? ""} lending`.replace(/\s+/g, " "), kind: "supplied", valueUsd: usd, assetValueUsd: usd, debtValueUsd: 0,
      symbols: a.symbol ? [a.symbol] : [], ...(p.token?.address ? { positionAddress: p.token.address.toLowerCase() } : {}),
      ...(a.symbol ? { assets: [{ symbol: a.symbol.slice(0, 24), quantity: String(Number((raw / 10 ** a.decimals).toPrecision(12))), valueUsd: usd }] } : {}),
    });
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
