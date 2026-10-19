import type { CloudAsset, CloudLiability, CloudSnapshot } from '@/cloud/api';
import type { Currency } from '@/domain/types';
import { convertCents, type FxRate } from './fx';
import { groupNames, type Item, type ItemType } from './items';

/**
 * Money between the person and everyone else: who they owe, who owes them, and where their own
 * money sits. Debts group by who they are with (one row for Stas however many records), lending
 * protocols by protocol. Every number comes from records Home already counts, so the answer at
 * the top is net worth, reached the other way round.
 */
export type DebtEvent = { id: string; subject: string; kind: 'borrowed' | 'repaid' | 'lent' | 'received' | 'note'; amount: number | null; unit: string | null; applied: boolean; occurredAt: number; note: string | null };

export type PartyRecord = {
  /** "liability:<id>", "asset:<id>", or "defi:<walletId>:<positionId>" for a wallet borrowing. */
  subject: string;
  name: string;
  /** What is owed in its own terms: "26,800 USDC", "€19,670". */
  amount: string;
  cents: number | null;
  /** The currency or coin a payment is recorded in; null when it is read from a protocol. */
  unit: string | null;
  open: { pathname: '/item/[type]/[id]'; params: { type: ItemType; id: string } } | { pathname: '/loan/[key]'; params: { key: string } };
  since: number | null;
};

export type Party = { key: string; name: string; kind: 'person' | 'protocol'; owed: 'byYou' | 'toYou'; cents: number | null; unknown: number; records: PartyRecord[]; detail: string };
export type Spot = { key: string; name: string; detail: string; cents: number | null; pledged: boolean; open: PartyRecord['open'] | null };
export type MoneyMap = {
  netCents: number; ownCents: number; owedToYouCents: number; youOweCents: number; unknown: number;
  owedToYou: Party[]; people: Party[]; protocols: Party[]; spots: Spot[];
};

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const partyKey = (owed: Party['owed'], name: string) => `${owed === 'toYou' ? 'to' : 'by'}:${norm(name)}`;
const SYMBOL: Record<string, string> = { EUR: '€', USD: '$' };
const grouped = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : 8 });
const moneyText = (amount: number, currency: string) => (SYMBOL[currency] ? `${SYMBOL[currency]}${grouped(amount)}` : `${grouped(amount)} ${currency}`);
const list = (xs: string[]) => [...new Set(xs)].slice(0, 3).join(', ') + (new Set(xs).size > 3 ? '…' : '');

function sum<T extends { cents: number | null }>(xs: T[]) {
  return xs.reduce((t, x) => (x.cents === null ? { ...t, unknown: t.unknown + 1 } : { ...t, cents: t.cents + x.cents }), { cents: 0, unknown: 0 });
}

function party(owed: Party['owed'], kind: Party['kind'], name: string, records: PartyRecord[], detail: string): Party {
  const s = sum(records);
  return { key: kind === 'protocol' ? `protocol:${norm(name)}` : partyKey(owed, name), name, kind, owed, cents: records.length && s.unknown === records.length ? null : s.cents, unknown: s.unknown, records, detail };
}

const byCents = <T extends { cents: number | null }>(a: T, b: T) => (b.cents ?? -1) - (a.cents ?? -1);

/** Who a recorded debt is with: its counterparty when set, otherwise its own name. */
export const debtParty = (l: CloudLiability) => (l.counterparty?.trim() || l.name);

export function moneyMap(s: CloudSnapshot, items: Item[], currency: Currency, fx: FxRate | null): MoneyMap {
  const byId = new Map(items.map((i) => [`${i.type}:${i.id}`, i]));
  const usd = (n: number) => convertCents(Math.round(n * 100), 'USD', currency, fx);

  // Money lent out: assets marked with who owes them.
  const toYou = new Map<string, { name: string; records: PartyRecord[] }>();
  for (const a of s.assets) {
    if (!a.owedBy?.trim()) continue;
    const item = byId.get(`asset:${a.id}`);
    if (!item || item.group === 'debts') continue;
    const k = partyKey('toYou', a.owedBy);
    const g = toYou.get(k) ?? { name: a.owedBy.trim(), records: [] };
    g.records.push({ subject: `asset:${a.id}`, name: a.name, amount: moneyText(a.balance, a.currency), cents: item.valueCents, unit: a.currency, open: { pathname: '/item/[type]/[id]', params: { type: 'asset', id: a.id } }, since: a.acquiredAt ?? null });
    toYou.set(k, g);
  }
  const owedToYou = [...toYou.values()].map((g) => party('toYou', 'person', g.name, g.records, g.records.length === 1 ? g.records[0].name : `${g.records.length} loans`)).sort(byCents);

  // Recorded debts, by who they are with.
  const byYou = new Map<string, { name: string; records: PartyRecord[] }>();
  for (const l of s.liabilities) {
    const item = byId.get(`liability:${l.id}`);
    const who = debtParty(l);
    const k = partyKey('byYou', who);
    const g = byYou.get(k) ?? { name: who, records: [] };
    const amount = l.owedSymbol && l.owedQuantity != null ? `${grouped(l.owedQuantity)} ${l.owedSymbol}` : moneyText(l.balance, l.currency);
    g.records.push({ subject: `liability:${l.id}`, name: l.name, amount, cents: item?.valueCents ?? null, unit: l.owedSymbol || l.currency, open: { pathname: '/item/[type]/[id]', params: { type: 'liability', id: l.id } }, since: null });
    byYou.set(k, g);
  }
  // An overdrawn account is money owed to the bank.
  for (const i of items) {
    if (i.type !== 'asset' || i.group !== 'debts') continue;
    const a = i.raw as CloudAsset;
    const k = partyKey('byYou', a.name);
    const g = byYou.get(k) ?? { name: a.name, records: [] };
    g.records.push({ subject: `asset:${a.id}`, name: `${a.name} overdraft`, amount: i.valueCents === null ? '' : moneyText(i.valueCents / 100, currency), cents: i.valueCents, unit: null, open: { pathname: '/item/[type]/[id]', params: { type: 'asset', id: a.id } }, since: null });
    byYou.set(k, g);
  }
  const people = [...byYou.values()].map((g) => {
    const units = [...new Set(g.records.map((r) => r.unit ?? currency))];
    return party('byYou', 'person', g.name, g.records, g.records.length === 1 ? g.records[0].amount : `${g.records.length} debts · ${units.join(', ')}`);
  }).sort(byCents);

  // Borrowing read from wallets, by protocol.
  const byProtocol = new Map<string, { name: string; records: PartyRecord[]; debtUsd: number; collateralUsd: number; health: number[] }>();
  for (const w of s.wallets ?? []) {
    if (!w.includeInNetWorth || !w.snapshot) continue;
    for (const p of w.snapshot.defiPositions ?? []) {
      if (!(p.debtValueUsd > 0)) continue;
      const g = byProtocol.get(p.protocol) ?? { name: p.protocol, records: [], debtUsd: 0, collateralUsd: 0, health: [] };
      const owedCoins = (p.assets ?? []).filter((a) => a.debt).map((a) => `${a.quantity !== undefined ? grouped(Number(a.quantity)) + ' ' : ''}${a.symbol}`);
      g.records.push({ subject: `defi:${w.id}:${p.id}`, name: `${p.protocol} · ${p.chainName}`, amount: owedCoins.join(' + ') || moneyText(p.debtValueUsd, 'USD'), cents: usd(p.debtValueUsd), unit: null, open: { pathname: '/loan/[key]', params: { key: `defi:${w.id}:${p.id}` } }, since: null });
      g.debtUsd += p.debtValueUsd; g.collateralUsd += p.assetValueUsd;
      if (p.healthFactor !== undefined) g.health.push(p.healthFactor);
      byProtocol.set(p.protocol, g);
    }
  }
  const protocols = [...byProtocol.values()].map((g) => {
    const ltv = g.collateralUsd > 0 ? `${Math.round((g.debtUsd / g.collateralUsd) * 100)}% of collateral` : 'No collateral on this chain';
    const detail = g.health.length === 1 ? `${g.records[0].name.split(' · ')[1]} · health ${g.health[0].toFixed(2)}` : `${g.records.length === 1 ? g.records[0].name.split(' · ')[1] : `${g.records.length} loans`} · ${ltv}`;
    return party('byYou', 'protocol', g.name, g.records, detail);
  }).sort(byCents);

  // Where the person's own money sits: each wallet, then the rest by kind. Money lent out is above.
  const spots: Spot[] = [];
  const rest = new Map<string, Item[]>();
  for (const i of items) {
    if (i.group === 'debts') continue;
    if (i.type === 'asset' && (i.raw as CloudAsset).owedBy?.trim()) continue;
    if (i.type === 'wallet') {
      const w = s.wallets?.find((x) => x.id === i.id);
      const protos = [...new Set((w?.snapshot?.defiPositions ?? []).filter((p) => p.assetValueUsd > 0).map((p) => p.protocol))];
      const coins = (i.pieces ?? []).filter((p) => (p.valueCents ?? 0) > 0).sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0)).map((p) => p.unit ?? p.name);
      spots.push({ key: `wallet:${i.id}`, name: i.name, detail: [list(protos), list(coins)].filter(Boolean).join(' · ') || i.freshness.text, cents: i.valueCents, pledged: (w?.snapshot?.debtValueUsd ?? 0) > 0, open: { pathname: '/item/[type]/[id]', params: { type: 'wallet', id: i.id } } });
      continue;
    }
    rest.set(i.group, [...(rest.get(i.group) ?? []), i]);
  }
  for (const [group, xs] of rest) {
    const s2 = sum(xs.map((x) => ({ cents: x.valueCents })));
    spots.push({ key: `group:${group}`, name: groupNames[group as keyof typeof groupNames], detail: list(xs.sort(byCents2).filter((x) => x.valueCents !== 0).map((x) => x.name)), cents: xs.every((x) => x.valueCents === null) ? null : s2.cents, pledged: false, open: null });
  }
  spots.sort(byCents);

  const own = sum(spots), lent = sum(owedToYou), owe = sum([...people, ...protocols]);
  return {
    ownCents: own.cents, owedToYouCents: lent.cents, youOweCents: owe.cents, netCents: own.cents + lent.cents - owe.cents,
    // Records without a value, left out of every sum above.
    unknown: own.unknown + [...owedToYou, ...people, ...protocols].reduce((t, p) => t + p.unknown, 0),
    owedToYou, people, protocols, spots,
  };
}
const byCents2 = (a: Item, b: Item) => (b.valueCents ?? -1) - (a.valueCents ?? -1);

/** A party by its key, with everything that happened to its debts, oldest first. */
export function partyOf(map: MoneyMap, key: string): Party | null {
  return [...map.owedToYou, ...map.people, ...map.protocols].find((p) => p.key === key) ?? null;
}
export function historyOf(party: Party, events: DebtEvent[]): DebtEvent[] {
  const subjects = new Set(party.records.map((r) => r.subject));
  return events.filter((e) => subjects.has(e.subject)).sort((a, b) => a.occurredAt - b.occurredAt);
}
