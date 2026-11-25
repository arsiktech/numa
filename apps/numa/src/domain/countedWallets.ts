/**
 * What a tracked wallet adds to net worth.
 *
 * The home screen, the overview (get_overview / the mobile dashboard) and a saved
 * history point all call this, so a wallet cannot land in one total and not the others.
 * Coins and deposits are liquid: the screen treats a wallet as sellable within a week.
 * What the wallet has borrowed is owed, on its own, so net worth is coins and deposits
 * minus that borrowing. Dollars are converted one wallet at a time and then added.
 * A wallet that is not counted, or that has never been checked, adds nothing — unknown
 * is not zero.
 */

export type CountedWallet = {
  includeInNetWorth: boolean;
  snapshot?: { totalValueUsd: number; debtValueUsd?: number } | null;
};

export type WalletCents = { ownedCents: number; owedCents: number };

const usdCents = (usd: number, currency: 'USD' | 'EUR', usdPerEur: number | null): number | null => {
  if (!Number.isFinite(usd)) return null;
  // Round the dollar amount to cents first, then convert. This is the home screen's
  // convertCents(Math.round(usd * 100), 'USD', currency, rate).
  const cents = Math.round(usd * 100);
  if (!Number.isSafeInteger(cents)) return null;
  if (currency === 'USD') return cents;
  if (!(usdPerEur !== null && usdPerEur > 0 && Number.isFinite(usdPerEur))) return null;
  const converted = Math.round(cents / usdPerEur);
  return Number.isSafeInteger(converted) ? converted : null;
};

/** Cents this wallet contributes, or null when it is left out of the total. */
export function countedWalletCents(wallet: CountedWallet, currency: 'USD' | 'EUR', usdPerEur: number | null): WalletCents | 'unconverted' | null {
  if (!wallet.includeInNetWorth || !wallet.snapshot) return null;
  const owedUsd = wallet.snapshot.debtValueUsd ?? 0;
  // totalValueUsd is coins and deposits minus borrowing. Adding the borrowing back is the
  // amount owned; the borrowing itself is what is owed. Net worth is unchanged either way.
  const owned = usdCents(wallet.snapshot.totalValueUsd + owedUsd, currency, usdPerEur);
  const owed = usdCents(owedUsd, currency, usdPerEur);
  if (owned === null || owed === null) return 'unconverted';
  return { ownedCents: owned, owedCents: owed };
}

/** Every counted wallet, summed in cents. One wallet that cannot be converted fails the whole sum. */
export function countedWalletsCents(wallets: readonly CountedWallet[], currency: 'USD' | 'EUR', usdPerEur: number | null): WalletCents | 'unconverted' {
  let ownedCents = 0;
  let owedCents = 0;
  for (const wallet of wallets) {
    const share = countedWalletCents(wallet, currency, usdPerEur);
    if (share === 'unconverted') return 'unconverted';
    if (!share) continue;
    ownedCents += share.ownedCents;
    owedCents += share.owedCents;
  }
  if (!Number.isSafeInteger(ownedCents) || !Number.isSafeInteger(owedCents)) return 'unconverted';
  return { ownedCents, owedCents };
}

export type CentParts = { liquidCents: number; investedCents: number; hardCents: number; oweCents: number };

/** The parts plus counted wallets: owned cents join liquid, borrowed cents join what is owed. */
export function includeCountedWallets(
  parts: CentParts,
  wallets: readonly CountedWallet[],
  currency: 'USD' | 'EUR',
  usdPerEur: number | null,
): (CentParts & { netCents: number }) | 'unconverted' {
  if (!Number.isSafeInteger(parts.liquidCents) || !Number.isSafeInteger(parts.investedCents) || !Number.isSafeInteger(parts.hardCents) || !Number.isSafeInteger(parts.oweCents)) return 'unconverted';
  const share = countedWalletsCents(wallets, currency, usdPerEur);
  if (share === 'unconverted') return 'unconverted';
  const liquidCents = parts.liquidCents + share.ownedCents;
  const oweCents = parts.oweCents + share.owedCents;
  const netCents = liquidCents + parts.investedCents + parts.hardCents - oweCents;
  if (!Number.isSafeInteger(liquidCents) || !Number.isSafeInteger(oweCents) || !Number.isSafeInteger(netCents)) return 'unconverted';
  return { liquidCents, investedCents: parts.investedCents, hardCents: parts.hardCents, oweCents, netCents };
}

type MajorParts = { liquid: number; invested: number; hardAssets: number; liabilities: number; netWorth: number };

/**
 * Same addition for a breakdown already expressed in major units (the legacy screens).
 * The wallet portion is still the shared cent conversion; the other parts are not re-rounded.
 */
export function foldCountedWallets<T extends MajorParts>(base: T, wallets: readonly CountedWallet[], currency: 'USD' | 'EUR', usdPerEur: number | null): T | 'unconverted' {
  const share = countedWalletsCents(wallets, currency, usdPerEur);
  if (share === 'unconverted') return 'unconverted';
  const owned = share.ownedCents / 100;
  const owed = share.owedCents / 100;
  return { ...base, liquid: base.liquid + owned, liabilities: base.liabilities + owed, netWorth: base.netWorth + owned - owed };
}
