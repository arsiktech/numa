import { foldCountedWallets } from "../../convex/lib/countedWallets";
import type { NetWorthBreakdown } from "./analytics";
import { cryptoCapitalAmounts } from "./cryptoWallets";
import type { FxRates } from "./fx";
import type { CryptoWallet, CurrencyCode } from "./types";

/** The legacy screens' net worth, with tracked wallets counted the same way as the home screen. */
export function withWallets(base: NetWorthBreakdown, wallets: CryptoWallet[], currency: CurrencyCode, rates: FxRates): NetWorthBreakdown {
  if (currency === "USD" || currency === "EUR") {
    const folded = foldCountedWallets(base, wallets, currency, rates.USD ?? null);
    if (folded !== "unconverted") return folded;
  }
  const crypto = cryptoCapitalAmounts(wallets, rates, currency);
  return {
    ...base,
    invested: base.invested + crypto.assets,
    liabilities: base.liabilities + crypto.debts,
    netWorth: base.netWorth + crypto.net
  };
}
