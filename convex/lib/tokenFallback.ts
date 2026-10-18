/**
 * When a chain's explorer can't be reached (Base, Arbitrum and Polygon sometimes sit behind a bot
 * check), the wallet's main tokens are read straight from the chain instead: the native coin and
 * a fixed list of widely held tokens, in one Multicall3 request, priced by DefiLlama. Smaller
 * tokens are missed until the explorer answers again, and the wallet says so.
 */

import { firstWord, MULTICALL, multicall, pad } from "./evm";
import { formatUnits, type Call, type Get, type WalletToken } from "./publicWallets";

const ETH_TOKENS = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7", DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  stETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", wstETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", USDe: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
  PYUSD: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
};

/** The tokens checked when the explorer is down, by chain. Symbols are only labels; DefiLlama names them. */
export const FALLBACK_TOKENS: Record<string, Record<string, string>> = {
  ethereum: ETH_TOKENS,
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", WETH: "0x4200000000000000000000000000000000000006",
    cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
    weETH: "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A", AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", VIRTUAL: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
    DEGEN: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
  },
  arbitrum: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC.e": "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548", GMX: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", wstETH: "0x5979D7b546E38E414F7E9822514be443A4800529",
    LINK: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
  },
  optimism: {
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC.e": "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", USDT: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", WETH: "0x4200000000000000000000000000000000000006", WBTC: "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
    OP: "0x4200000000000000000000000000000000000042", wstETH: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", VELO: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db",
  },
  polygon: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "USDC.e": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    WPOL: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", LINK: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", AAVE: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
  },
};

const NATIVE = "0x0000000000000000000000000000000000000000";
const MIN_TOKEN_USD = 1;
const round = (n: number) => Math.round(n * 100) / 100;
type Chain = { id: string; name: string; rpc: string; coin: string; coinName: string };

/** The native coin and the listed tokens this address holds on one chain, priced. */
export async function fallbackTokens(chain: Chain, owner: string, call: Call, get: Get): Promise<WalletToken[]> {
  const listed = Object.values(FALLBACK_TOKENS[chain.id] ?? {});
  const results = await multicall(call, chain.rpc, [
    { to: MULTICALL, data: "0x4d2301cc" + pad(owner) }, // getEthBalance
    ...listed.map((token) => ({ to: token, data: "0x70a08231" + pad(owner) })),
  ]);
  if (firstWord(results[0]) === null) throw new Error("bad response");
  const held = [NATIVE, ...listed].map((token, i) => ({ token, raw: firstWord(results[i]) ?? 0n })).filter((x) => x.raw > 0n);
  if (!held.length) return [];
  const body = (await get(`https://coins.llama.fi/prices/current/${held.map((h) => `${chain.id}:${h.token.toLowerCase()}`).join(",")}`)) as { coins?: Record<string, { price?: number; decimals?: number; symbol?: string }> };
  if (!body?.coins || typeof body.coins !== "object") throw new Error("bad response");
  const out: WalletToken[] = [];
  for (const h of held) {
    const p = body.coins[`${chain.id}:${h.token.toLowerCase()}`];
    if (!p || typeof p.price !== "number" || typeof p.decimals !== "number") continue;
    const native = h.token === NATIVE;
    const quantity = formatUnits(h.raw.toString(), p.decimals);
    const valueUsd = round(Number(quantity) * p.price);
    if (valueUsd < MIN_TOKEN_USD) continue;
    out.push({
      id: native ? `${chain.id}:native` : `${chain.id}:${h.token.toLowerCase()}`, chain: chain.id, chainName: chain.name,
      ...(native ? {} : { tokenAddress: h.token.toLowerCase() }),
      symbol: native ? chain.coin : String(p.symbol ?? "?").slice(0, 24), name: native ? chain.coinName : String(p.symbol ?? "?").slice(0, 80),
      quantity, priceUsd: p.price, valueUsd, verified: true, suspectedSpam: false,
    });
  }
  return out.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}
