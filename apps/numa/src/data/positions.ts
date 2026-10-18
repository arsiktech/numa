import type { CloudHolding, CloudWallet } from '@/cloud/api';
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

const COINS: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', USDC: 'USD Coin', USDT: 'Tether', DAI: 'Dai', POL: 'Polygon', MATIC: 'Polygon',
  ARB: 'Arbitrum', OP: 'Optimism', LINK: 'Chainlink', UNI: 'Uniswap', AAVE: 'Aave', WBTC: 'Wrapped Bitcoin', CBBTC: 'Coinbase Bitcoin', WETH: 'Wrapped Ether',
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
    // A pool is its own position, named by its pair; lending merges by protocol.
    if (p.kind === 'liquidity') {
      const pair = (p.symbols ?? []).join(' / ') || p.label;
      pieces.push({ key: `pool:${p.protocol}:${pair}`, name: `${pair} pool`, unit: null, quantity: null, valueCents: value(p.assetValueUsd), detail, tag: 'pool' });
    } else {
      pieces.push({ key: `lent:${p.protocol}`, name: `Lent on ${p.protocol}`, unit: null, quantity: null, valueCents: value(p.assetValueUsd), detail, tag: 'lent' });
    }
  }
  return pieces;
}

const QTY = /^([\d.,]+)\s+(\S+)$/;

/** What one record contributes, as pieces. Plain records are one piece of themselves. */
function piecesOf(item: Item): Piece[] {
  if (item.pieces) return item.pieces;
  if (item.type === 'holding') {
    const h = item.raw as CloudHolding;
    const symbol = h.symbol.toUpperCase();
    return [{ key: symbol, name: COINS[symbol] ?? (h.name || symbol), unit: h.symbol, quantity: h.quantity, valueCents: item.valueCents, detail: null }];
  }
  if (item.type === 'asset' && item.group === 'cash') {
    const cur = (item.raw as { currency?: string }).currency ?? '';
    return [{ key: `cur:${cur}`, name: CURRENCIES[cur] ?? cur, unit: cur, quantity: null, valueCents: item.valueCents, detail: null }];
  }
  // Demo records carry their amount in the detail, like "1 BTC". Only coins merge by unit.
  const m = item.group === 'crypto' && item.detail ? item.detail.match(QTY) : null;
  if (m) return [{ key: m[2].toUpperCase(), name: COINS[m[2].toUpperCase()] ?? item.name, unit: m[2], quantity: Number(m[1].replace(/,/g, '')), valueCents: item.valueCents, detail: null }];
  return [{ key: `item:${item.id}`, name: item.name, unit: null, quantity: null, valueCents: item.valueCents, detail: item.detail }];
}

/** The positions in one group, biggest first, with every place each one sits. */
export function positionsOf(items: Item[], group: GroupId): Position[] {
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
 * Robert Kiyosaki's four asset classes, as a second way to look at what you own. Cash counts with
 * paper assets, and crypto and things (gold, collectibles) with commodities.
 */
export const FOUR_CLASSES = [
  { id: 'business', name: 'Business', groups: ['business'] as GroupId[], note: 'Companies you own that earn without you.' },
  { id: 'realEstate', name: 'Real estate', groups: ['property'] as GroupId[], note: 'Property, for rent or to live in.' },
  { id: 'paper', name: 'Paper assets', groups: ['stocks', 'cash'] as GroupId[], note: 'Stocks, funds, bonds and cash.' },
  { id: 'commodities', name: 'Commodities', groups: ['crypto', 'things'] as GroupId[], note: 'Crypto, gold and other things.' },
] as const;
