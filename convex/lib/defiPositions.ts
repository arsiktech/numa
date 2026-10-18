/**
 * DeFi positions beyond Aave, read for free: liquidity pools (Uniswap V3, PancakeSwap V3 and
 * Aerodrome Slipstream) and Compound V3 straight from their contracts over public RPC nodes,
 * Morpho from its public API, and token prices from DefiLlama. Like wallet tokens, a position
 * holding a token nobody prices is left out: that is almost always spam.
 */

import type { Call, DefiPosition, Get } from "./publicWallets";

export type Post = (url: string, body: unknown) => Promise<unknown>;
type Chain = { id: string; name: string; rpc: string };

/** An amount of one token in a position, in the token's smallest unit. */
type Leg = { token: string; raw: number; debt?: boolean };
/** A position before prices: its legs and how to name it once symbols are known. */
export type Draft = { id: string; chain: Chain; protocol: string; kind: DefiPosition["kind"]; legs: Leg[]; label: (symbols: string[]) => string; positionAddress?: string };

const MAX_SCANNED = 30;
const MAX_OPEN = 10;
const MIN_POSITION_USD = 1;

const pad = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const uint = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");
const words = (hex: string) => {
  if (!/^0x([0-9a-f]{64})+$/i.test(hex)) throw new Error("bad response");
  return Array.from({ length: (hex.length - 2) / 64 }, (_, i) => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64)));
};
const int = (w: bigint) => (w >= 2n ** 255n ? w - 2n ** 256n : w);
const address = (w: bigint) => "0x" + w.toString(16).padStart(40, "0");

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

/** Pools and Compound on one chain. A failure anywhere fails the chain, so nothing is half counted. */
export async function chainDrafts(chain: Chain, owner: string, call: Call): Promise<Draft[]> {
  const pools = await Promise.all((MANAGERS[chain.id] ?? []).map((m) => managerPositions(chain, m, owner, call)));
  const comets = await Promise.all((COMETS[chain.id] ?? []).map((c) => cometPosition(chain, c, owner, call)));
  return [...pools.flat(), ...comets.filter((d): d is Draft => d !== null)];
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
    const symbols = [...new Set(legs.filter((l) => l.p).map((l) => l.p!.symbol.slice(0, 24)))];
    out.push({
      id: d.id, chain: d.chain.id, chainName: d.chain.name, protocol: d.protocol, label: d.label(symbols), kind: d.kind,
      valueUsd: round(asset - debt), assetValueUsd: asset, debtValueUsd: debt, symbols, ...(d.positionAddress ? { positionAddress: d.positionAddress } : {}),
    });
  }
  return out;
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
      positions.push({
        id: `${chain.id}:morpho:${String(m.market?.marketId ?? symbols.join("-")).toLowerCase()}`, chain: chain.id, chainName: chain.name, protocol: "Morpho",
        label: debt > 0 ? `Morpho ${symbols.join(" / ")} lending and borrowing` : `Morpho ${loan} lending`, kind: "supplied",
        valueUsd: round(asset - debt), assetValueUsd: asset, debtValueUsd: debt, symbols,
      });
    }
    for (const v of user.vaultPositions ?? []) {
      const usd = v.state?.assetsUsd;
      if (typeof usd !== "number" || usd < MIN_POSITION_USD) continue;
      positions.push({
        id: `${chain.id}:morpho-vault:${String(v.vault?.address ?? v.vault?.name).toLowerCase()}`, chain: chain.id, chainName: chain.name, protocol: "Morpho",
        label: `${String(v.vault?.name ?? "Morpho vault").slice(0, 60)}`, kind: "supplied", valueUsd: round(usd), assetValueUsd: round(usd), debtValueUsd: 0,
        symbols: v.vault?.asset?.symbol ? [v.vault.asset.symbol] : [], ...(v.vault?.address ? { positionAddress: v.vault.address.toLowerCase() } : {}),
      });
    }
  }
  return { positions, failed };
}

const round = (n: number) => Math.round(n * 100) / 100;
