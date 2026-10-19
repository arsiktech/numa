import type { CloudHolding, CloudSnapshot, CloudWallet } from '@/cloud/api';
import type { Currency } from '@/domain/types';
import { convertCents, type FxRate } from './fx';
import type { Item, ItemType } from './items';
import { STALE_AFTER, walletLoanId } from './wallets';

/**
 * A loan seen whole: what backs it, what is owed, and where the borrowed money went. The places it
 * went are already counted under What you own, so linking them never changes net worth; it shows
 * whether borrowing has paid off and how much is pledged.
 *
 * Keys match `convex/lib/loanLinks.ts`: "defi:<walletId>:<positionId>" for a wallet borrowing or
 * position, "token:<walletId>:<tokenId>", "holding:<id>", "asset:<id>" and "liability:<id>".
 */
export type LoanRole = 'deployed' | 'collateral';
/** Only this many of one coin in a place; without it the whole place belongs to the loan. */
export type LoanPart = { symbol: string; quantity: number };
export type LoanTarget = { key: string; role: LoanRole; part?: LoanPart };
export type CloudLoanLink = { loanKey: string; targets: LoanTarget[]; updatedAt: number };

export type Open = { type: ItemType; id: string };
/** One coin in a place, valued at the place's own total. */
export type Coin = { symbol: string; quantity: number | null; valueCents: number | null };
/**
 * One place money can sit. `gone` when a link names something that is no longer there. With a
 * `part`, the value is only that share; `wholeCents` keeps what the whole place is worth.
 */
export type LoanPlace = { key: string; name: string; detail: string | null; valueCents: number | null; open: Open | null; coins: Coin[]; gone?: boolean; part?: LoanPart; wholeCents?: number | null };

export type Loan = {
  key: string;
  kind: 'wallet' | 'debt';
  name: string;
  /** The wallet it sits in, or "Your record". */
  where: string;
  open: Open;
  /** What is owed, in the borrowed coins when known: "12,734.68 USDC". */
  owed: { symbol: string; quantity: number | null }[];
  debtCents: number | null;
  /** What backs it: read from the protocol for a wallet borrowing, linked by hand for a recorded debt. */
  collateral: LoanPlace[];
  deployed: LoanPlace[];
  collateralCents: number | null;
  deployedCents: number | null;
  /** Linked places without a value (no price, or no longer there), left out of the sums. */
  gaps: number;
  /** Collateral plus what the money bought, minus what is owed. */
  netCents: number | null;
  /** What the money bought is worth now, against what is owed now. Only when every place has a value. */
  resultCents: number | null;
  /** Owed against collateral. Only from a fresh protocol read, or from the person's own records. */
  ltv: number | null;
  /** The loan to value at which the protocol sells collateral, from its health factor. */
  liquidationLtv: number | null;
  healthFactor: number | null;
  /** When the protocol was read; null for a recorded debt. */
  checkedAt: number | null;
  linked: boolean;
};

const usdCents = (usd: number, currency: Currency, fx: FxRate | null) => convertCents(Math.round(usd * 100), 'USD', currency, fx);
const counted = (s: CloudSnapshot) => (s.wallets ?? []).filter((w) => w.includeInNetWorth && w.snapshot);

/** Every place a loan's money can go, by key. Only places that count in net worth. */
export function loanPlaces(s: CloudSnapshot, items: Item[], currency: Currency, fx: FxRate | null): Map<string, LoanPlace> {
  const out = new Map<string, LoanPlace>();
  for (const w of counted(s)) {
    const open: Open = { type: 'wallet', id: w.id };
    for (const p of w.snapshot!.defiPositions ?? []) {
      if (!(p.assetValueUsd > 0)) continue;
      const own = (p.assets ?? []).filter((a) => !a.debt);
      const what = (own.length ? own.map((a) => a.symbol) : p.symbols ?? []).join(', ');
      // Coin values follow the position's own total, as on Home.
      const sum = own.reduce((t, a) => t + a.valueUsd, 0);
      const coins = own.map((a) => ({ symbol: a.symbol, quantity: a.quantity === undefined ? null : Number(a.quantity), valueCents: sum > 0 ? usdCents((a.valueUsd / sum) * p.assetValueUsd, currency, fx) : null }));
      out.set(`defi:${w.id}:${p.id}`, { key: `defi:${w.id}:${p.id}`, name: `${p.protocol} · ${p.chainName}`, detail: what ? `${w.label} · ${what}` : w.label, valueCents: usdCents(p.assetValueUsd, currency, fx), open, coins });
    }
    for (const t of w.snapshot!.tokens) {
      if (!(Number(t.quantity) > 0)) continue;
      const valueCents = t.valueUsd === undefined ? null : usdCents(t.valueUsd, currency, fx);
      out.set(`token:${w.id}:${t.id}`, { key: `token:${w.id}:${t.id}`, name: `${t.symbol} · ${t.chainName}`, detail: `${w.label} · ${t.quantity} ${t.symbol}`, valueCents, open, coins: [{ symbol: t.symbol, quantity: Number(t.quantity), valueCents }] });
    }
  }
  for (const i of items) {
    if (i.group === 'debts' || (i.type !== 'holding' && i.type !== 'asset')) continue;
    const h = i.type === 'holding' ? (i.raw as CloudHolding) : null;
    const coins = h ? [{ symbol: h.symbol, quantity: h.quantity, valueCents: i.valueCents }] : [];
    out.set(`${i.type}:${i.id}`, { key: `${i.type}:${i.id}`, name: i.name, detail: i.detail, valueCents: i.valueCents, open: { type: i.type, id: i.id }, coins });
  }
  return out;
}

/** Wrapped forms count as the coin they wrap, so "0.377 BTC" finds WBTC, cbBTC or tBTC. */
const FAMILY: Record<string, string> = { BTC: 'BTC', WBTC: 'BTC', CBBTC: 'BTC', TBTC: 'BTC', BTCB: 'BTC', ETH: 'ETH', WETH: 'ETH' };
export const coinFamily = (symbol: string) => FAMILY[symbol.toUpperCase()] ?? symbol.toUpperCase();

/** What `part` of a place is worth: its coins' own price times the amount. Unknown without a price. */
export function partValue(coins: Coin[], part: LoanPart): number | null {
  const match = coins.filter((c) => coinFamily(c.symbol) === coinFamily(part.symbol));
  if (!match.length || match.some((c) => c.valueCents === null || c.quantity === null)) return null;
  const qty = match.reduce((t, c) => t + (c.quantity ?? 0), 0);
  const cents = match.reduce((t, c) => t + (c.valueCents ?? 0), 0);
  return qty > 0 ? Math.round((cents / qty) * part.quantity) : null;
}

/** The coins a place holds, grouped as parts can name them: "BTC" for WBTC and cbBTC together. */
export function partChoices(place: LoanPlace): { symbol: string; quantity: number | null }[] {
  const by = new Map<string, number | null>();
  for (const c of place.coins) {
    const f = coinFamily(c.symbol), q = by.has(f) ? by.get(f)! : 0;
    by.set(f, q === null || c.quantity === null ? null : q + c.quantity);
  }
  return [...by].map(([symbol, quantity]) => ({ symbol, quantity }));
}

const goneName = (key: string) => (key.startsWith('defi:') ? 'A position no longer in the wallet' : key.startsWith('token:') ? 'A token no longer in the wallet' : 'A deleted record');

function sum(places: LoanPlace[]): { cents: number | null; gaps: number } {
  if (!places.length) return { cents: null, gaps: 0 };
  return places.reduce((t, p) => (p.valueCents === null ? { ...t, gaps: t.gaps + 1 } : { ...t, cents: (t.cents ?? 0) + p.valueCents }), { cents: null as number | null, gaps: 0 });
}

/** The collateral a protocol reports, coin by coin, valued at the position's own total. */
function walletCollateral(w: CloudWallet, p: NonNullable<NonNullable<CloudWallet['snapshot']>['defiPositions']>[number], currency: Currency, fx: FxRate | null): LoanPlace[] {
  const own = (p.assets ?? []).filter((a) => !a.debt && a.valueUsd > 0);
  const open: Open = { type: 'wallet', id: w.id };
  if (!own.length) return p.assetValueUsd > 0 ? [{ key: `defi:${w.id}:${p.id}`, name: `${p.protocol} collateral`, detail: null, valueCents: usdCents(p.assetValueUsd, currency, fx), open, coins: [] }] : [];
  const total = own.reduce((t, a) => t + a.valueUsd, 0);
  return own.map((a) => ({ key: `defi:${w.id}:${p.id}#${a.symbol}`, name: a.symbol, detail: a.quantity === undefined ? null : `${a.quantity} ${a.symbol}`, valueCents: usdCents((a.valueUsd / total) * p.assetValueUsd, currency, fx), open, coins: [] }));
}

/** Every loan in the space, biggest first, with its links resolved against what is there now. */
export function loansOf(s: CloudSnapshot, items: Item[], links: CloudLoanLink[], currency: Currency, fx: FxRate | null, now: number): Loan[] {
  const places = loanPlaces(s, items, currency, fx);
  const byLoan = new Map(links.map((l) => [l.loanKey, l]));
  const resolve = (key: string, role: LoanRole) => (byLoan.get(key)?.targets ?? []).filter((t) => t.role === role).map((t): LoanPlace => {
    const place = places.get(t.key);
    if (!place) return { key: t.key, name: goneName(t.key), detail: null, valueCents: null, open: null, coins: [], gone: true, part: t.part };
    if (!t.part) return place;
    return { ...place, part: t.part, wholeCents: place.valueCents, valueCents: partValue(place.coins, t.part) };
  });
  const loans: Loan[] = [];

  const finish = (base: Omit<Loan, 'collateralCents' | 'deployedCents' | 'gaps' | 'netCents' | 'resultCents' | 'ltv' | 'liquidationLtv' | 'linked'>, trustLtv: boolean): Loan => {
    const c = sum(base.collateral), d = sum(base.deployed);
    const debt = base.debtCents;
    const netCents = debt === null || c.gaps || d.gaps ? null : (c.cents ?? 0) + (d.cents ?? 0) - debt;
    const resultCents = debt === null || d.cents === null || d.gaps ? null : d.cents - debt;
    const ltv = trustLtv && debt !== null && c.cents !== null && c.cents > 0 && !c.gaps ? debt / c.cents : null;
    const liquidationLtv = ltv !== null && base.healthFactor ? ltv * base.healthFactor : null;
    return { ...base, collateralCents: c.cents, deployedCents: d.cents, gaps: c.gaps + d.gaps, netCents, resultCents, ltv, liquidationLtv, linked: byLoan.has(base.key) };
  };

  for (const w of counted(s)) {
    const snap = w.snapshot!;
    const fresh = now - snap.updatedAt <= STALE_AFTER;
    for (const p of snap.defiPositions ?? []) {
      if (!(p.debtValueUsd > 0)) continue;
      const key = `defi:${w.id}:${p.id}`;
      loans.push(finish({
        key, kind: 'wallet', name: `${p.protocol} · ${p.chainName}`, where: w.label, open: { type: 'wallet', id: walletLoanId(w.id) },
        owed: (p.assets ?? []).filter((a) => a.debt).map((a) => ({ symbol: a.symbol, quantity: a.quantity === undefined ? null : Number(a.quantity) })),
        debtCents: usdCents(p.debtValueUsd, currency, fx), collateral: walletCollateral(w, p, currency, fx), deployed: resolve(key, 'deployed'),
        healthFactor: p.healthFactor ?? null, checkedAt: snap.updatedAt,
      }, fresh));
    }
  }
  const debtItems = new Map(items.filter((i) => i.type === 'liability').map((i) => [i.id, i]));
  for (const l of s.liabilities) {
    const key = `liability:${l.id}`;
    loans.push(finish({
      key, kind: 'debt', name: l.name, where: 'Your record', open: { type: 'liability', id: l.id },
      owed: l.owedSymbol ? [{ symbol: l.owedSymbol, quantity: l.owedQuantity ?? null }] : [],
      debtCents: debtItems.get(l.id)?.valueCents ?? null, collateral: resolve(key, 'collateral'), deployed: resolve(key, 'deployed'),
      healthFactor: null, checkedAt: null,
    }, true));
  }
  return loans.sort((a, b) => (b.debtCents ?? -1) - (a.debtCents ?? -1));
}

/**
 * Which loans already use each place, and whether whole. A place linked whole belongs to that loan
 * alone; parts of one place can go to several loans.
 */
export type Taken = Map<string, { loanKey: string; whole: boolean }[]>;
export function takenBy(links: CloudLoanLink[]): Taken {
  const out: Taken = new Map();
  for (const l of links) for (const t of l.targets) out.set(t.key, [...(out.get(t.key) ?? []), { loanKey: l.loanKey, whole: !t.part }]);
  return out;
}
