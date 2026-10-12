import type { CurrencyCode, HoldingKind } from "./types";

export interface AssetCatalogItem {
  symbol: string;
  name: string;
  kind: HoldingKind;
  currency: CurrencyCode;
  provider: "coingecko" | "finnhub" | "manual";
  aliases: string[];
}

export const ASSET_CATALOG: AssetCatalogItem[] = [
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", currency: "USD", provider: "coingecko", aliases: ["bitcoin", "биткоин", "btc"] },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", currency: "USD", provider: "coingecko", aliases: ["ethereum", "эфир", "eth"] },
  { symbol: "SOL", name: "Solana", kind: "crypto", currency: "USD", provider: "coingecko", aliases: ["solana", "sol"] },
  { symbol: "AAPL", name: "Apple Inc.", kind: "stock", currency: "USD", provider: "finnhub", aliases: ["apple", "эпл", "aapl"] },
  { symbol: "MSFT", name: "Microsoft", kind: "stock", currency: "USD", provider: "finnhub", aliases: ["microsoft", "майкрософт", "msft"] },
  { symbol: "NVDA", name: "NVIDIA", kind: "stock", currency: "USD", provider: "finnhub", aliases: ["nvidia", "нвидиа", "nvda"] },
  { symbol: "TSLA", name: "Tesla", kind: "stock", currency: "USD", provider: "finnhub", aliases: ["tesla", "тесла", "tsla"] },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", kind: "etf", currency: "USD", provider: "finnhub", aliases: ["s&p 500", "sp500", "voo", "index fund"] },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", currency: "USD", provider: "finnhub", aliases: ["s&p 500", "spy"] },
  { symbol: "QQQ", name: "Invesco QQQ Trust", kind: "etf", currency: "USD", provider: "finnhub", aliases: ["nasdaq", "qqq"] },
  { symbol: "VWCE", name: "Vanguard FTSE All-World UCITS ETF", kind: "etf", currency: "EUR", provider: "manual", aliases: ["all world", "vwce", "vanguard all world"] },
  { symbol: "IBEX", name: "IBEX 35", kind: "index", currency: "EUR", provider: "manual", aliases: ["ibex", "spain index", "испания индекс"] }
];

export function searchAssetCatalog(query: string): AssetCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return ASSET_CATALOG.slice(0, 8);
  return ASSET_CATALOG.filter((item) => {
    const haystack = [item.symbol, item.name, item.kind, ...item.aliases].join(" ").toLowerCase();
    return haystack.includes(q);
  }).slice(0, 8);
}
