import type { CloudPortfolioData } from "@/services/cloudStore";
import type { FxRates } from "./fx";
import type { MarketQuote } from "./types";
import { rollupNetWorth } from "./analytics";
import { quoteIsCurrent } from "@/services/marketData";
import { includeCountedWallets } from "../../apps/numa/src/domain/countedWallets";
import { majorUnits, minorUnits } from "../../convex/lib/finance";

export function buildAutoSnapshot(data: Pick<CloudPortfolioData, "portfolio" | "assets" | "holdings" | "liabilities" | "cryptoWallets">, quotes: Record<string, MarketQuote>, rates: FxRates, now: number) {
  const { portfolio, assets, holdings, liabilities, cryptoWallets } = data;
  const currency = portfolio.defaultCurrency;
  if (currency !== "USD" && currency !== "EUR") return null;
  if (!assets.length && !holdings.length && !liabilities.length && !cryptoWallets.length) return null;
  if (holdings.some(holding => !quoteIsCurrent(quotes[holding.symbol], now))) return null;
  const breakdown = rollupNetWorth(assets, holdings, liabilities, quotes, { rates, currency });
  try {
    // A wallet with no check yet is left out, not treated as zero, and does not block the point.
    // A partial or old balance is counted at the value we have, the same way the home screen counts it.
    const included = includeCountedWallets({
      liquidCents: minorUnits(breakdown.liquid),
      investedCents: minorUnits(breakdown.invested),
      hardCents: minorUnits(breakdown.hardAssets),
      oweCents: minorUnits(breakdown.liabilities)
    }, cryptoWallets, currency, rates.USD ?? null);
    if (included === "unconverted") return null;
    return {
      takenAt: now,
      liquid: majorUnits(included.liquidCents),
      invested: majorUnits(included.investedCents),
      hardAssets: majorUnits(included.hardCents),
      liabilities: majorUnits(included.oweCents),
      netWorth: majorUnits(included.netCents),
      currency,
      isAuto: true
    };
  } catch { return null; }
}
