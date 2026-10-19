/**
 * Balances for public wallet addresses from free, keyless public APIs: mempool.space for
 * Bitcoin, Blockscout explorers for EVM tokens (with the chain itself as a fallback, see
 * `tokenFallback.ts`), and public RPC nodes for DeFi positions (Aave V3, Compound V3 and liquidity
 * pools; see `defiPositions.ts`), read straight from the protocols' contracts. Each chain is checked on its own; one that can't be reached is listed in
 * `failedChains`, never counted as zero.
 */

import { aaveLegs, chainDrafts, etherfiCash, fluidLending, morpho, priceDrafts, priceLegs, type Draft, type Post } from "./defiPositions";
import { BLOCKSCOUT_PRO, explorerGet } from "./evm";
import { fallbackTokens } from "./tokenFallback";

export type Get = (url: string) => Promise<unknown>;
/** A JSON-RPC `eth_call` against a chain's public node, optionally as `from`; returns the hex result. */
export type Call = (rpcUrl: string, to: string, data: string, from?: string) => Promise<string>;

export type WalletToken = {
  id: string;
  chain: string;
  chainName: string;
  tokenAddress?: string;
  symbol: string;
  name: string;
  quantity: string;
  priceUsd?: number;
  valueUsd?: number;
  verified: boolean;
  suspectedSpam: boolean;
};

export type DefiPosition = {
  id: string;
  chain: string;
  chainName: string;
  protocol: string;
  label: string;
  kind: "supplied" | "borrowed" | "liquidity";
  positionAddress?: string;
  valueUsd: number;
  assetValueUsd: number;
  debtValueUsd: number;
  healthFactor?: number;
  symbols: string[];
  /** Token by token, only when every part is priced; the totals above stay the authority. */
  assets?: DefiAsset[];
};

/** One token inside a DeFi position: supplied, or owed when `debt`. */
export type DefiAsset = { symbol: string; quantity?: string; valueUsd: number; debt?: boolean };

export type PublicWalletSnapshot = {
  provider: "public";
  addressType: "bitcoin" | "evm";
  tokenValueUsd: number;
  defiValueUsd: number;
  debtValueUsd: number;
  totalValueUsd: number;
  tokens: WalletToken[];
  defiPositions: DefiPosition[];
  chains: string[];
  failedChains: string[];
  tokenFailedChains: string[];
  /** Chains whose explorer was down, so only their main tokens were read from the chain itself. */
  tokenFallbackChains: string[];
  defiFailedChains: string[];
  tokensFetchedAt: number;
  defiFetchedAt?: number;
  updatedAt: number;
  partial: boolean;
};

// `aave` is the Aave V3 Pool on each chain; `rpc` is a keyless public node; `host` is its public explorer.
export const EVM_CHAIN_LIST = [
  { id: "ethereum", chainId: 1, name: "Ethereum", host: "https://eth.blockscout.com", coin: "ETH", coinName: "Ether", rpc: "https://ethereum-rpc.publicnode.com", aave: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" },
  { id: "base", chainId: 8453, name: "Base", host: "https://base.blockscout.com", coin: "ETH", coinName: "Ether", rpc: "https://base-rpc.publicnode.com", aave: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" },
  { id: "arbitrum", chainId: 42161, name: "Arbitrum", host: "https://arbitrum.blockscout.com", coin: "ETH", coinName: "Ether", rpc: "https://arbitrum-one-rpc.publicnode.com", aave: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" },
  { id: "optimism", chainId: 10, name: "Optimism", host: "https://explorer.optimism.io", coin: "ETH", coinName: "Ether", rpc: "https://optimism-rpc.publicnode.com", aave: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" },
  { id: "polygon", chainId: 137, name: "Polygon", host: "https://polygon.blockscout.com", coin: "POL", coinName: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", aave: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" },
] as const;

/**
 * Aave's own tokens for a deposit (aBasUSDC) or a loan (variableDebtBasUSDC). They are counted
 * through the Aave position instead, so they are never added as wallet tokens too.
 */
export const isAaveToken = (symbol: string, name: string) =>
  /^Aave (Ethereum|Base|Arbitrum|Optimism|Polygon) /.test(name) || /^(variableDebt|stableDebt)/.test(symbol) || /^a(Eth|Bas|Arb|Opt|Pol)[A-Z]/.test(symbol);

/** getUserAccountData(address): totals in US dollars with 8 decimals, and the health factor with 18. */
export async function aaveV3(chain: (typeof EVM_CHAIN_LIST)[number], address: string, call: Call): Promise<DefiPosition | null> {
  const hex = await call(chain.rpc, chain.aave, "0xbf92857c" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0"));
  if (!/^0x[0-9a-f]{384,}$/i.test(hex)) throw new Error("bad response");
  const word = (i: number) => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
  const usd = (raw: bigint) => Number(raw) / 1e8;
  const collateral = round(usd(word(0))), debt = round(usd(word(1)));
  if (collateral === 0 && debt === 0) return null;
  const health = word(5);
  return {
    id: `${chain.id}:aave-v3`, chain: chain.id, chainName: chain.name, protocol: "Aave V3", label: debt > 0 ? "Aave V3 lending and borrowing" : "Aave V3 lending",
    kind: "supplied", valueUsd: round(collateral - debt), assetValueUsd: collateral, debtValueUsd: debt,
    // With no loan the contract reports an endless health factor; that is left out, not stored as a huge number.
    healthFactor: debt > 0 && health < 10n ** 30n ? Number(health) / 1e18 : undefined,
    symbols: [],
  };
}

/** Priced tokens worth less than this are left out: they are mostly airdropped spam. */
const MIN_TOKEN_USD = 1;
const MAX_TOKENS_PER_CHAIN = 30;

/** "1234500", 6 → "1.2345". Exact, using integers, so big balances keep every digit. */
export function formatUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("bad amount");
  const value = BigInt(raw);
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

const num = (value: unknown): number | undefined => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const round = (n: number) => Math.round(n * 100) / 100;

function priced(token: Omit<WalletToken, "valueUsd" | "priceUsd">, priceUsd: number | undefined): WalletToken {
  if (priceUsd === undefined) return token;
  return { ...token, priceUsd, valueUsd: round(Number(token.quantity) * priceUsd) };
}

async function bitcoin(address: string, get: Get): Promise<WalletToken[]> {
  const [info, prices] = await Promise.allSettled([get(`https://mempool.space/api/address/${address}`), get("https://mempool.space/api/v1/prices")]);
  if (info.status === "rejected") throw info.reason;
  const stats = info.value as { chain_stats?: Record<string, number>; mempool_stats?: Record<string, number> };
  const c = stats.chain_stats, m = stats.mempool_stats;
  if (!c || typeof c.funded_txo_sum !== "number" || typeof c.spent_txo_sum !== "number") throw new Error("bad response");
  const sats = c.funded_txo_sum - c.spent_txo_sum + (m?.funded_txo_sum ?? 0) - (m?.spent_txo_sum ?? 0);
  const price = prices.status === "fulfilled" ? num((prices.value as { USD?: unknown }).USD) : undefined;
  return [priced({ id: "bitcoin:native", chain: "bitcoin", chainName: "Bitcoin", symbol: "BTC", name: "Bitcoin", quantity: formatUnits(String(Math.max(0, sats)), 8), verified: true, suspectedSpam: false }, price)];
}

type EvmChain = (typeof EVM_CHAIN_LIST)[number] & { hosts: readonly string[] };

async function evmChain(chain: EvmChain, address: string, get: Get): Promise<WalletToken[]> {
  const info = (await explorerGet(chain.hosts, `/api/v2/addresses/${address}`, get)) as { coin_balance?: unknown; exchange_rate?: unknown };
  if (!info || typeof info !== "object") throw new Error("bad response");
  const out: WalletToken[] = [];
  const coin = typeof info.coin_balance === "string" ? info.coin_balance : info.coin_balance === null ? "0" : null;
  if (coin === null) throw new Error("bad response");
  if (coin !== "0") {
    out.push(priced({ id: `${chain.id}:native`, chain: chain.id, chainName: chain.name, symbol: chain.coin, name: chain.coinName, quantity: formatUnits(coin, 18), verified: true, suspectedSpam: false }, num(info.exchange_rate)));
  }
  const page = (await explorerGet(chain.hosts, `/api/v2/addresses/${address}/tokens?type=ERC-20`, get)) as { items?: unknown };
  const items = Array.isArray(page?.items) ? page.items : [];
  const tokens: WalletToken[] = [];
  for (const item of items as Array<{ value?: unknown; token?: Record<string, unknown> }>) {
    const t = item.token;
    if (!t || typeof item.value !== "string" || typeof t.symbol !== "string") continue;
    if (t.reputation === "scam") continue;
    if (isAaveToken(t.symbol, String(t.name ?? ""))) continue;
    const price = num(t.exchange_rate);
    if (price === undefined) continue; // No market price: almost always spam, and never counted.
    let quantity: string;
    try { quantity = formatUnits(item.value, Number(t.decimals ?? 18)); } catch { continue; }
    const token = priced({
      id: `${chain.id}:${String(t.address_hash ?? t.symbol).toLowerCase()}`, chain: chain.id, chainName: chain.name,
      tokenAddress: typeof t.address_hash === "string" ? t.address_hash.toLowerCase() : undefined,
      symbol: t.symbol.slice(0, 24), name: String(t.name ?? t.symbol).slice(0, 80), quantity, verified: t.reputation === "ok", suspectedSpam: false,
    }, price);
    if ((token.valueUsd ?? 0) >= MIN_TOKEN_USD) tokens.push(token);
  }
  tokens.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return [...out, ...tokens.slice(0, MAX_TOKENS_PER_CHAIN)];
}

/** Aave, Compound and pools on one chain, before pool and Compound tokens are priced. */
async function evmDefi(chain: EvmChain, address: string, call: Call, get: Get): Promise<{ aave: DefiPosition | null; drafts: Draft[]; priced: DefiPosition[]; incomplete: boolean }> {
  const [aave, { drafts, incomplete }, fluid] = await Promise.all([aaveV3(chain, address, call), chainDrafts(chain, address, call, get), fluidLending(chain, address, get)]);
  // Aave's totals come from its own oracle; the token-by-token split is extra and may be missing.
  if (aave) {
    const assets = await aaveLegs(chain, address, call).then((legs) => priceLegs(chain.id, legs, get)).catch(() => null);
    if (assets) aave.assets = assets;
  }
  return { aave, drafts, priced: fluid, incomplete };
}

/** A chain's tokens from its explorer, or, when the explorer is down, its main tokens from the chain. */
async function evmTokens(chain: EvmChain, address: string, get: Get, call?: Call): Promise<{ tokens: WalletToken[]; fallback: boolean }> {
  try {
    return { tokens: await evmChain(chain, address, get), fallback: false };
  } catch (error) {
    if (!call) throw error;
    return { tokens: await fallbackTokens(chain, address, call, get), fallback: true };
  }
}

/**
 * `blockscoutPro`: the server holds a Blockscout PRO key, so an explorer that turns Numa away
 * (Base and Arbitrum sit behind a bot check for datacenters) is asked through PRO instead.
 */
export async function fetchPublicWallet(address: string, addressType: "bitcoin" | "evm", get: Get, now: number, call?: Call, post?: Post, blockscoutPro = false): Promise<PublicWalletSnapshot> {
  const EVM_CHAINS: EvmChain[] = EVM_CHAIN_LIST.map((c) => ({ ...c, hosts: blockscoutPro ? [c.host, `${BLOCKSCOUT_PRO}/${c.chainId}`] : [c.host] }));
  // Tokens and DeFi positions are read separately: a chain whose explorer is down still counts
  // its lending and pools, and the part that failed is named, never counted as zero.
  const tokenJobs = addressType === "bitcoin"
    ? [{ id: "bitcoin", run: async () => ({ tokens: await bitcoin(address, get), fallback: false }) }]
    : EVM_CHAINS.map((chain) => ({ id: chain.id, run: () => evmTokens(chain, address, get, call) }));
  const defiJobs = addressType === "evm" && call
    ? EVM_CHAINS.map((chain) => ({ id: chain.id, run: () => evmDefi(chain, address, call, get) }))
    : [];
  const [tokenResults, defiResults, morphoResult, etherfiResult] = await Promise.all([
    Promise.allSettled(tokenJobs.map((job) => job.run())),
    Promise.allSettled(defiJobs.map((job) => job.run())),
    defiJobs.length && post ? morpho([...EVM_CHAINS], address, post).catch(() => null) : Promise.resolve(undefined),
    defiJobs.length && call ? etherfiCash(address, call, get).catch(() => null) : Promise.resolve(undefined),
  ]);
  let tokens: WalletToken[] = [];
  const defiPositions: DefiPosition[] = [];
  const tokenFailedChains: string[] = [];
  const tokenFallbackChains: string[] = [];
  const defiFailed = new Set<string>();
  const drafts: Draft[] = [];
  tokenResults.forEach((r, i) => {
    if (r.status === "rejected") { tokenFailedChains.push(tokenJobs[i].id); return; }
    tokens.push(...r.value.tokens);
    if (r.value.fallback) tokenFallbackChains.push(tokenJobs[i].id);
  });
  defiResults.forEach((r, i) => {
    if (r.status === "rejected") { defiFailed.add(defiJobs[i].id); return; }
    if (r.value.aave) defiPositions.push(r.value.aave);
    defiPositions.push(...r.value.priced);
    if (r.value.incomplete) defiFailed.add(defiJobs[i].id);
    drafts.push(...r.value.drafts);
  });
  if (drafts.length) {
    try { defiPositions.push(...await priceDrafts(drafts, get)); } catch { drafts.forEach((d) => defiFailed.add(d.chain.id)); }
  }
  if (morphoResult === null) EVM_CHAINS.forEach((c) => defiFailed.add(c.id));
  else if (morphoResult) { defiPositions.push(...morphoResult.positions); morphoResult.failed.forEach((c) => defiFailed.add(c)); }
  // ether.fi Cash lives on Optimism (and Scroll, which Numa doesn't otherwise read); a failure is reported on Optimism.
  if (etherfiResult === null) defiFailed.add("optimism");
  else if (etherfiResult) defiPositions.push(...etherfiResult);
  const defiFailedChains: string[] = defiJobs.map((job) => job.id).filter((id) => defiFailed.has(id));
  // A Compound market or a Morpho vault is also a token in the wallet; it is counted once, as the position.
  const inDefi = new Set(defiPositions.map((p) => p.positionAddress).filter(Boolean));
  tokens = tokens.filter((t) => !t.tokenAddress || !inDefi.has(t.tokenAddress));
  const ids: string[] = tokenJobs.map((job) => job.id);
  const chains = ids.filter((id) => !tokenFailedChains.includes(id) || (defiJobs.length > 0 && !defiFailedChains.includes(id)));
  const failedChains = ids.filter((id) => tokenFailedChains.includes(id) || defiFailedChains.includes(id));
  if (!chains.length) throw new Error("No chain could be checked");
  const tokenValueUsd = round(tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0));
  const defiValueUsd = round(defiPositions.reduce((sum, p) => sum + p.assetValueUsd, 0));
  const debtValueUsd = round(defiPositions.reduce((sum, p) => sum + p.debtValueUsd, 0));
  const unpriced = tokens.some((t) => t.valueUsd === undefined && Number(t.quantity) > 0);
  return {
    provider: "public", addressType, tokenValueUsd, defiValueUsd, debtValueUsd, totalValueUsd: round(tokenValueUsd + defiValueUsd - debtValueUsd),
    tokens, defiPositions, chains, failedChains, tokenFailedChains, tokenFallbackChains, defiFailedChains, tokensFetchedAt: now, defiFetchedAt: defiJobs.length ? now : undefined, updatedAt: now,
    partial: failedChains.length > 0 || tokenFallbackChains.length > 0 || unpriced,
  };
}
