import type { CloudAsset, CloudHolding, CloudLiability, CloudWallet } from '@/cloud/api';
import type { Currency } from '@/domain/types';
import { convertCents, type FxRate } from './fx';
import type { GroupId, Item } from './items';

/**
 * A group seen by what is in it rather than by record: one Bitcoin position however many wallets,
 * exchanges and records hold it, one Euro position across every euro account. Each position lists
 * its places, so a person can see exactly where their money sits.
 */

/** One part of a record that holds several things, like a wallet with BTC and an Aave deposit. */
export type Piece = { key: string; name: string; unit: string | null; quantity: number | null; valueCents: number | null; detail: string | null; tag?: 'pledged' | 'lent' | 'locked' | 'pool'; /** Where this piece is, when the record's own name doesn't say. */ where?: string };

/** Where (part of) a position sits. Opens the record it comes from. */
export type Place = { itemId: string; itemType: Item['type']; where: string; detail: string | null; quantity: number | null; unit: string | null; valueCents: number | null; tag?: Piece['tag'] };

export type Position = { key: string; group: GroupId; name: string; unit: string | null; quantity: number | null; valueCents: number | null; unknown: number; places: Place[] };

/** Shared by the list subtitle and the treemap's retained detail line. */
export const positionPlacesText = (p: Position) => p.places.length === 1 ? p.places[0].where : `${p.places.length} places`;

const COINS: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', USDC: 'USD Coin', USDT: 'Tether', DAI: 'Dai', POL: 'Polygon', MATIC: 'Polygon',
  ARB: 'Arbitrum', OP: 'Optimism', LINK: 'Chainlink', UNI: 'Uniswap', AAVE: 'Aave', WBTC: 'Wrapped Bitcoin', CBBTC: 'Coinbase Bitcoin', WETH: 'Wrapped Ether',
  TBTC: 'tBTC', WSTETH: 'Lido staked Ether', STETH: 'Lido staked Ether', WEETH: 'ether.fi staked Ether', EZETH: 'Renzo restaked Ether', CBETH: 'Coinbase staked Ether', GHO: 'GHO', EURC: 'Euro Coin',
};
const CURRENCIES: Record<string, string> = { EUR: 'Euro', USD: 'US dollar', GBP: 'Pound sterling', CHF: 'Swiss franc' };
export const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/**
 * The tokens and lending inside one wallet, in the portfolio currency. Each token is its own
 * piece; a token without a price keeps its amount and an unknown value.
 */
export function walletPieces(w: CloudWallet, currency: Currency, fx: FxRate | null): Piece[] {
  const s = w.snapshot;
  if (!s) return [];
  const value = (usd: number | undefined) => (usd === undefined ? null : convertCents(Math.round(usd * 100), 'USD', currency, fx));
  const pieces: Piece[] = s.tokens.filter((t) => Number(t.quantity) > 0).map((t) => ({
    key: t.symbol.toUpperCase(), name: COINS[t.symbol.toUpperCase()] ?? t.name, unit: t.symbol, quantity: Number(t.quantity), valueCents: value(t.valueUsd),
    detail: `${shortAddress(w.address)} · ${t.chainName}`,
  }));
  for (const p of s.defiPositions ?? []) {
    const detail = `${shortAddress(w.address)} · ${p.protocol} on ${p.chainName}`;
    const own = (p.assets ?? []).filter((a) => !a.debt && a.valueUsd > 0);
    // Token by token when the position says what it holds: WBTC lent on Compound is WBTC you own.
    // Values follow the position's own total (Aave's oracle, ether.fi's manager), shared by token.
    if (own.length) {
      const sum = own.reduce((t, a) => t + a.valueUsd, 0);
      const tag: Piece['tag'] = p.kind === 'liquidity' ? 'pool' : p.debtValueUsd > 0 ? 'pledged' : 'lent';
      for (const a of own) {
        const symbol = a.symbol.toUpperCase();
        pieces.push({
          key: symbol, name: COINS[symbol] ?? a.symbol, unit: a.symbol, quantity: a.quantity === undefined ? null : Number(a.quantity),
          valueCents: value(sum > 0 ? (a.valueUsd / sum) * p.assetValueUsd : undefined), detail, tag, where: `${w.label} · ${p.protocol}`,
        });
      }
      continue;
    }
    if (!(p.assetValueUsd > 0)) continue; // Only a loan: it is under What you owe.
    // A pool is its own position, named by its pair; lending merges by protocol.
    if (p.kind === 'liquidity') {
      const pair = (p.symbols ?? []).join(' / ') || p.label;
      pieces.push({ key: `pool:${p.protocol}:${pair}`, name: `${pair} pool`, unit: null, quantity: null, valueCents: value(p.assetValueUsd), detail, tag: 'pool', where: `${w.label} · ${p.protocol}` });
    } else {
      pieces.push({ key: `lent:${p.protocol}`, name: `Lent on ${p.protocol}`, unit: null, quantity: null, valueCents: value(p.assetValueUsd), detail, tag: 'lent', where: `${w.label} · ${p.protocol}` });
    }
  }
  return pieces;
}

const QTY = /^([\d.,]+)\s+(\S+)$/;
/** A record's own "where it is", when the person saved one. */
const placeOf = (r: { location?: string | null }): Pick<Piece, 'where'> => (r.location ? { where: r.location } : {});

/** What one record contributes, as pieces. Plain records are one piece of themselves. */
function piecesOf(item: Item): Piece[] {
  if (item.pieces) return item.pieces;
  if (item.type === 'holding') {
    const h = item.raw as CloudHolding;
    const symbol = h.symbol.toUpperCase();
    return [{ key: symbol, name: COINS[symbol] ?? (h.name || symbol), unit: h.symbol, quantity: h.quantity, valueCents: item.valueCents, detail: null, ...placeOf(h) }];
  }
  if (item.type === 'asset' && item.group === 'cash') {
    const cur = (item.raw as { currency?: string }).currency ?? '';
    return [{ key: `cur:${cur}`, name: CURRENCIES[cur] ?? cur, unit: cur, quantity: null, valueCents: item.valueCents, detail: null, ...(item.raw as CloudAsset).location ? { where: `${item.name} · ${(item.raw as CloudAsset).location}` } : {} }];
  }
  // Demo records carry their amount in the detail, like "1 BTC". Only coins merge by unit.
  const m = item.group === 'crypto' && item.detail ? item.detail.match(QTY) : null;
  if (m) return [{ key: m[2].toUpperCase(), name: COINS[m[2].toUpperCase()] ?? item.name, unit: m[2], quantity: Number(m[1].replace(/,/g, '')), valueCents: item.valueCents, detail: null }];
  return [{ key: `item:${item.id}`, name: item.name, unit: null, quantity: null, valueCents: item.valueCents, detail: item.detail, ...(item.type === 'asset' ? placeOf(item.raw as CloudAsset) : {}) }];
}

/**
 * What one debt is owed in: each coin a wallet borrowed (USDC on Compound, GHO on Aave), a record's
 * coin (BTC) or its currency (EUR). A wallet's total is shared out by what each loan is worth.
 */
function debtPiecesOf(item: Item): Piece[] {
  if (item.type === 'wallet') {
    const w = item.raw as CloudWallet;
    const loans = (w.snapshot?.defiPositions ?? []).filter((p) => p.debtValueUsd > 0);
    const total = loans.reduce((t, p) => t + p.debtValueUsd, 0);
    const share = (usd: number) => (item.valueCents === null || total <= 0 ? null : Math.round((usd / total) * item.valueCents));
    const out: Piece[] = [];
    for (const p of loans) {
      const where = `${w.label} · ${p.protocol}`;
      const owed = (p.assets ?? []).filter((a) => a.debt && a.valueUsd > 0);
      const sum = owed.reduce((t, a) => t + a.valueUsd, 0);
      if (!owed.length) { out.push({ key: `owed:${p.protocol}`, name: `Borrowed on ${p.protocol}`, unit: null, quantity: null, valueCents: share(p.debtValueUsd), detail: p.chainName, where }); continue; }
      for (const a of owed) {
        const symbol = a.symbol.toUpperCase();
        out.push({ key: symbol, name: COINS[symbol] ?? a.symbol, unit: a.symbol, quantity: a.quantity === undefined ? null : Number(a.quantity), valueCents: share((a.valueUsd / sum) * p.debtValueUsd), detail: p.chainName, where });
      }
    }
    return out.length ? out : [{ key: `item:${item.id}`, name: item.name, unit: null, quantity: null, valueCents: item.valueCents, detail: item.detail }];
  }
  if (item.type === 'liability') {
    const l = item.raw as CloudLiability;
    if (l.owedSymbol && l.owedQuantity != null) {
      const symbol = l.owedSymbol.toUpperCase();
      return [{ key: symbol, name: COINS[symbol] ?? l.owedSymbol, unit: l.owedSymbol, quantity: l.owedQuantity, valueCents: item.valueCents, detail: null, where: item.name }];
    }
    return [{ key: `cur:${l.currency}`, name: CURRENCIES[l.currency] ?? l.currency, unit: l.currency, quantity: null, valueCents: item.valueCents, detail: null, where: item.name }];
  }
  const cur = (item.raw as { currency?: string }).currency ?? '';
  return [{ key: `cur:${cur}`, name: CURRENCIES[cur] ?? cur, unit: cur, quantity: null, valueCents: item.valueCents, detail: item.detail, where: item.name }];
}

/** The positions in one group, biggest first, with every place each one sits. */
export function positionsOf(items: Item[], group: GroupId): Position[] {
  return collect(items, group, piecesOf);
}

/** What you owe by what is owed (USDC, BTC, EUR…), each with the debts it is owed in. */
export function debtAssetsOf(items: Item[]): Position[] {
  return collect(items, 'debts', debtPiecesOf);
}

function collect(items: Item[], group: GroupId, piecesOf: (item: Item) => Piece[]): Position[] {
  const byKey = new Map<string, Position>();
  for (const item of items) {
    if (item.group !== group) continue;
    for (const piece of piecesOf(item)) {
      let pos = byKey.get(piece.key);
      if (!pos) {
        pos = { key: piece.key, group, name: piece.name, unit: piece.unit, quantity: piece.quantity === null ? null : 0, valueCents: 0, unknown: 0, places: [] };
        byKey.set(piece.key, pos);
      }
      // One unknown amount makes the total amount unknown; values add up and unknowns are counted.
      pos.quantity = pos.quantity === null || piece.quantity === null ? null : pos.quantity + piece.quantity;
      if (piece.valueCents === null) pos.unknown += 1; else pos.valueCents = (pos.valueCents ?? 0) + piece.valueCents;
      const where = piece.where ?? (piece.key.startsWith('item:') ? 'Your record' : item.name === piece.name ? (item.type === 'wallet' ? 'Wallet' : 'Your record') : item.name);
      pos.places.push({ itemId: item.id, itemType: item.type, where, detail: piece.detail ?? (piece.key.startsWith('item:') ? null : item.freshness.text), quantity: piece.quantity, unit: piece.unit, valueCents: piece.valueCents, tag: piece.tag });
    }
  }
  const out = [...byKey.values()];
  for (const p of out) p.places.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1));
  return out.sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0) || b.places.length - a.places.length);
}

/**
 * What a token really is underneath: wrapped, bridged and staked versions of Bitcoin are Bitcoin,
 * and so on. `peg` marks a token worth one of the underlying, so amounts can be added up.
 */
const UNDERLYING: Record<string, { family: 'BTC' | 'ETH' | 'USD' | 'EUR'; peg: boolean }> = Object.fromEntries([
  ...['BTC', 'WBTC', 'CBBTC', 'TBTC', 'BTCB', 'FBTC', 'LBTC', 'SOLVBTC', 'EBTC'].map((k) => [k, { family: 'BTC', peg: true }]),
  ...['ETH', 'WETH', 'STETH', 'EETH', 'OETH', 'FRXETH'].map((k) => [k, { family: 'ETH', peg: true }]),
  ...['WSTETH', 'RETH', 'CBETH', 'WEETH', 'EZETH', 'RSETH', 'METH', 'SFRXETH', 'SWETH', 'ETHX', 'OSETH', 'LIQUIDETH'].map((k) => [k, { family: 'ETH', peg: false }]),
  ...['USDC', 'USDT', 'USDT0', 'USD₮0', 'DAI', 'USDS', 'USDE', 'PYUSD', 'FDUSD', 'TUSD', 'GHO', 'LUSD', 'USDC.E', 'USDBC', 'FRAX', 'CRVUSD', 'RLUSD', 'USDG'].map((k) => [k, { family: 'USD', peg: true }]),
  ...['SUSDE', 'SDAI', 'SUSDS', 'LIQUIDUSD'].map((k) => [k, { family: 'USD', peg: false }]),
  ...['EURC', 'EURE', 'EURS', 'AGEUR', 'EURA'].map((k) => [k, { family: 'EUR', peg: true }]),
  ...['WEEUR'].map((k) => [k, { family: 'EUR', peg: false }]),
  // Money itself, for what you owe in a currency.
  ['USD', { family: 'USD', peg: true }], ['EUR', { family: 'EUR', peg: true }],
] as [string, { family: 'BTC' | 'ETH' | 'USD' | 'EUR'; peg: boolean }][]);
export const FAMILY_NAMES = { BTC: 'Bitcoin', ETH: 'Ether', USD: 'US dollar', EUR: 'Euro' } as const;
/** What a token is underneath (Bitcoin, Ether, a dollar, a euro), when known. */
export const underlyingOf = (symbol: string) => UNDERLYING[symbol.toUpperCase()];

/** Assets that are the same thing underneath, with the versions held. One version stays a plain position. */
export type Family = { key: string; name: string; unit: string | null; quantity: number | null; valueCents: number | null; unknown: number; members: Position[] };
export const familyMembersText = (f: Family) => f.members.map((m) => m.unit ?? m.name).join(', ');
export const isFamilyKey = (key: string) => key.startsWith('fam:');

/** Positions grouped by what they really are, biggest first. Amounts add up only when every version is worth one. */
export function familiesOf(positions: Position[]): Family[] {
  const by = new Map<string, Family>();
  const out: Family[] = [];
  for (const p of positions) {
    const u = p.unit ? UNDERLYING[p.unit.toUpperCase()] : undefined;
    if (!u) { out.push({ key: p.key, name: p.name, unit: p.unit, quantity: p.quantity, valueCents: p.valueCents, unknown: p.unknown, members: [p] }); continue; }
    let f = by.get(u.family);
    if (!f) { f = { key: `fam:${u.family}`, name: FAMILY_NAMES[u.family], unit: u.family === 'BTC' || u.family === 'ETH' ? u.family : null, quantity: 0, valueCents: 0, unknown: 0, members: [] }; by.set(u.family, f); out.push(f); }
    f.members.push(p);
    f.quantity = f.quantity === null || !u.peg || p.quantity === null ? null : f.quantity + p.quantity;
    f.valueCents = (f.valueCents ?? 0) + (p.valueCents ?? 0);
    f.unknown += p.unknown;
  }
  // A family of one is just that position, under its own name.
  const flat = out.map((f) => (f.members.length === 1 ? { ...f, key: f.members[0].key, name: f.members[0].name, unit: f.members[0].unit, quantity: f.members[0].quantity } : f));
  for (const f of flat) if (f.unit === null) f.quantity = null;
  return flat.sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0));
}

/** One place things sit: a wallet, a protocol inside it, an account. What it holds and its value. */
export type Spot = { key: string; name: string; items: { id: string; type: Item['type'] }[]; assets: string[]; valueCents: number | null; unknown: number };

/** The same asset list in By place rows and tiles, including the unknown-value notice. */
export function spotDetail(spot: Spot): string {
  const assets = spot.assets.length > 4 ? `${spot.assets.slice(0, 4).join(', ')} +${spot.assets.length - 4}` : spot.assets.join(', ');
  return assets + (spot.unknown > 0 ? ` · ${spot.unknown} without a value` : '');
}

/** The same group seen by where things are instead of what they are, biggest first. */
export function spotsOf(items: Item[], group: GroupId): Spot[] {
  const by = new Map<string, Spot>();
  for (const item of items) {
    if (item.group !== group) continue;
    for (const piece of piecesOf(item)) {
      // A wallet's own tokens sit in the wallet; what it lent or pooled sits in that protocol.
      const name = item.type === 'wallet' ? piece.where ?? `${item.name} · Wallet` : piece.where ?? item.name;
      let spot = by.get(name);
      if (!spot) { spot = { key: name, name, items: [], assets: [], valueCents: 0, unknown: 0 }; by.set(name, spot); }
      if (!spot.items.some((i) => i.id === item.id)) spot.items.push({ id: item.id, type: item.type });
      const label = piece.unit ?? piece.name;
      if (!spot.assets.includes(label)) spot.assets.push(label);
      if (piece.valueCents === null) spot.unknown += 1; else spot.valueCents = (spot.valueCents ?? 0) + piece.valueCents;
    }
  }
  return [...by.values()].sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0));
}

/**
 * Robert Kiyosaki's four asset classes, as a second way to look at what you own. Cash counts with
 * paper assets, and crypto and things (gold, collectibles) with commodities.
 */
export const FOUR_CLASSES = [
  { id: 'business', name: 'Business', groups: ['business'] as GroupId[], note: 'Companies you own that earn without you.' },
  { id: 'realEstate', name: 'Real estate', groups: ['property'] as GroupId[], note: 'Property, for rent or to live in.' },
  { id: 'paper', name: 'Paper assets', groups: ['stocks', 'cash'] as GroupId[], note: 'Stocks, funds, bonds and cash.' },
  { id: 'commodities', name: 'Commodities', groups: ['crypto', 'things'] as GroupId[], note: 'Crypto, gold and other things.' },
] as const;
