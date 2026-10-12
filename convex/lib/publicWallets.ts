/**
 * Balances for public wallet addresses from free, keyless public APIs: mempool.space for
 * Bitcoin and Blockscout explorers for EVM chains. Each chain is checked on its own; one that
 * can't be reached is listed in `failedChains`, never counted as zero.
 */

export type Get = (url: string) => Promise<unknown>;

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

export type PublicWalletSnapshot = {
  provider: "public";
  addressType: "bitcoin" | "evm";
  tokenValueUsd: number;
  defiValueUsd: number;
  debtValueUsd: number;
  totalValueUsd: number;
  tokens: WalletToken[];
  defiPositions: never[];
  chains: string[];
  failedChains: string[];
  tokensFetchedAt: number;
  updatedAt: number;
  partial: boolean;
};

export const EVM_CHAINS = [
  { id: "ethereum", name: "Ethereum", host: "https://eth.blockscout.com", coin: "ETH", coinName: "Ether" },
  { id: "base", name: "Base", host: "https://base.blockscout.com", coin: "ETH", coinName: "Ether" },
  { id: "arbitrum", name: "Arbitrum", host: "https://arbitrum.blockscout.com", coin: "ETH", coinName: "Ether" },
  { id: "optimism", name: "Optimism", host: "https://explorer.optimism.io", coin: "ETH", coinName: "Ether" },
  { id: "polygon", name: "Polygon", host: "https://polygon.blockscout.com", coin: "POL", coinName: "Polygon" },
] as const;

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

async function evmChain(chain: (typeof EVM_CHAINS)[number], address: string, get: Get): Promise<WalletToken[]> {
  const info = (await get(`${chain.host}/api/v2/addresses/${address}`)) as { coin_balance?: unknown; exchange_rate?: unknown };
  if (!info || typeof info !== "object") throw new Error("bad response");
  const out: WalletToken[] = [];
  const coin = typeof info.coin_balance === "string" ? info.coin_balance : info.coin_balance === null ? "0" : null;
  if (coin === null) throw new Error("bad response");
  if (coin !== "0") {
    out.push(priced({ id: `${chain.id}:native`, chain: chain.id, chainName: chain.name, symbol: chain.coin, name: chain.coinName, quantity: formatUnits(coin, 18), verified: true, suspectedSpam: false }, num(info.exchange_rate)));
  }
  const page = (await get(`${chain.host}/api/v2/addresses/${address}/tokens?type=ERC-20`)) as { items?: unknown };
  const items = Array.isArray(page?.items) ? page.items : [];
  const tokens: WalletToken[] = [];
  for (const item of items as Array<{ value?: unknown; token?: Record<string, unknown> }>) {
    const t = item.token;
    if (!t || typeof item.value !== "string" || typeof t.symbol !== "string") continue;
    if (t.reputation === "scam") continue;
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

export async function fetchPublicWallet(address: string, addressType: "bitcoin" | "evm", get: Get, now: number): Promise<PublicWalletSnapshot> {
  const jobs = addressType === "bitcoin"
    ? [{ id: "bitcoin", run: () => bitcoin(address, get) }]
    : EVM_CHAINS.map((chain) => ({ id: chain.id, run: () => evmChain(chain, address, get) }));
  const results = await Promise.allSettled(jobs.map((job) => job.run()));
  const tokens: WalletToken[] = [];
  const chains: string[] = [];
  const failedChains: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { chains.push(jobs[i].id); tokens.push(...r.value); }
    else failedChains.push(jobs[i].id);
  });
  if (!chains.length) throw new Error("No chain could be checked");
  const tokenValueUsd = round(tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0));
  const unpriced = tokens.some((t) => t.valueUsd === undefined && Number(t.quantity) > 0);
  return {
    provider: "public", addressType, tokenValueUsd, defiValueUsd: 0, debtValueUsd: 0, totalValueUsd: tokenValueUsd,
    tokens, defiPositions: [], chains, failedChains, tokensFetchedAt: now, updatedAt: now,
    partial: failedChains.length > 0 || unpriced,
  };
}
