import type { CloudPortfolioData } from "@/services/cloudStore";
import type { FxRates } from "./fx";
import type { MarketQuote } from "./types";
import { convertCurrency } from "./fx";
import { rollupNetWorth } from "./analytics";
import { walletSnapshotIsFresh } from "./cryptoWallets";
import { quoteIsCurrent } from "@/services/marketData";
import { addMoney, majorUnits, minorUnits } from "../../convex/lib/finance";

export function buildAutoSnapshot(data: Pick<CloudPortfolioData, "portfolio" | "assets" | "holdings" | "liabilities" | "cryptoWallets">, quotes: Record<string, MarketQuote>, rates: FxRates, now: number) {
  const { portfolio, assets, holdings, liabilities, cryptoWallets } = data;
  const currency = portfolio.defaultCurrency;
  if (currency !== "USD" && currency !== "EUR") return null;
  if (!assets.length && !holdings.length && !liabilities.length && !cryptoWallets.length) return null;
  if (holdings.some(holding => !quoteIsCurrent(quotes[holding.symbol], now))) return null;
  if (cryptoWallets.some(wallet => wallet.includeInNetWorth &&
      (!wallet.snapshot || wallet.snapshot.partial || !walletSnapshotIsFresh(wallet.snapshot, now)))) return null;
  const breakdown = rollupNetWorth(assets, holdings, liabilities, quotes, { rates, currency });
  let cryptoAssets = 0, cryptoDebts = 0;
  for (const wallet of cryptoWallets) {
    if (!wallet.includeInNetWorth || !wallet.snapshot) continue;
    cryptoAssets += convertCurrency(wallet.snapshot.tokenValueUsd + wallet.snapshot.defiValueUsd, "USD", currency, rates);
    cryptoDebts += convertCurrency(wallet.snapshot.debtValueUsd, "USD", currency, rates);
  }
  try {
    const liquid = majorUnits(minorUnits(breakdown.liquid));
    const invested = addMoney(breakdown.invested, cryptoAssets);
    const hardAssets = majorUnits(minorUnits(breakdown.hardAssets));
    const debt = addMoney(breakdown.liabilities, cryptoDebts);
    return {
      takenAt: now, liquid, invested, hardAssets, liabilities: debt,
      netWorth: addMoney(liquid, invested, hardAssets, -debt), currency, isAuto: true
    };
  } catch { return null; }
}
