/**
 * What DeFi strategies have earned, from one reading a day of what each one holds and owes, coin by
 * coin. Earnings are growth in what a position is worth in its own coin: lent USDC that became more
 * USDC, a vault share (liquidUSD, sUSDe, weETH) worth more dollars or ether than the day before. A
 * coin's market price moving is not earned. Interest on a loan is the debt growing the same way.
 *
 * A balance that changes faster than any yield could is money moved in or out, not earned: that day
 * counts only the growth on what stayed. A reading that can't be valued is counted as unknown, never zero.
 */

/** USD prices of the units vault shares are measured in. Missing when they couldn't be read. */
export type Refs = { ETH?: number; BTC?: number; EUR?: number };
type Unit = "USD" | "EUR" | "ETH" | "BTC";

/** One coin in one position (or held as a yield-bearing token) on one day. */
export type ReadingRow = {
  position: string; protocol: string; chainName: string; label: string;
  symbol: string; debt?: boolean; quantity: number; valueUsd: number;
};
export type Reading = { day: string; takenAt: number; refs: Refs; rows: ReadingRow[] };

/** `peg`: worth one unit, so its count is what grows. Otherwise a share whose worth in the unit grows. */
const FAMILY: Record<string, { unit: Unit; peg: boolean }> = Object.fromEntries([
  ...["BTC", "WBTC", "CBBTC", "TBTC", "BTCB", "FBTC", "LBTC", "SOLVBTC", "EBTC"].map((k) => [k, { unit: "BTC", peg: true }]),
  ...["ETH", "WETH", "STETH", "EETH", "OETH", "FRXETH"].map((k) => [k, { unit: "ETH", peg: true }]),
  ...["WSTETH", "RETH", "CBETH", "WEETH", "EZETH", "RSETH", "METH", "SFRXETH", "SWETH", "ETHX", "OSETH", "LIQUIDETH"].map((k) => [k, { unit: "ETH", peg: false }]),
  ...["USDC", "USDT", "DAI", "USDS", "USDE", "PYUSD", "FDUSD", "TUSD", "GHO", "LUSD", "USDC.E", "USDBC", "FRAX", "CRVUSD", "RLUSD", "USDG"].map((k) => [k, { unit: "USD", peg: true }]),
  ...["SUSDE", "SDAI", "SUSDS", "LIQUIDUSD"].map((k) => [k, { unit: "USD", peg: false }]),
  ...["EURC", "EURE", "EURS", "AGEUR", "EURA"].map((k) => [k, { unit: "EUR", peg: true }]),
  ...["WEEUR"].map((k) => [k, { unit: "EUR", peg: false }]),
] as [string, { unit: Unit; peg: boolean }][]);
/** Tokens whose count grows in the wallet itself. */
const REBASING = new Set(["STETH", "EETH", "OETH"]);

/** Faster than this, a balance or a share price changed because money moved, not because it earned. */
const MAX_DAILY_RATE = 0.5 / 365;
const DAY_MS = 86_400_000;

type SnapshotLike = {
  tokens: Array<{ chainName: string; symbol: string; quantity: string; valueUsd?: number }>;
  defiPositions?: Array<{ id: string; protocol: string; chainName: string; label: string; assets?: Array<{ symbol: string; quantity?: string; valueUsd: number; debt?: boolean }> }>;
};

/** Today's rows from a wallet reading: every coin in a position, and yield-bearing tokens held as they are. */
export function readingRows(s: SnapshotLike): ReadingRow[] {
  const rows: ReadingRow[] = [];
  for (const p of s.defiPositions ?? []) {
    for (const a of p.assets ?? []) {
      const symbol = a.symbol.toUpperCase();
      // Without a count, a dollar coin's count is its value; anything else can't be followed.
      const quantity = a.quantity !== undefined ? Number(a.quantity) : FAMILY[symbol]?.unit === "USD" && FAMILY[symbol].peg ? a.valueUsd : NaN;
      if (!Number.isFinite(quantity) || quantity <= 0 || !(a.valueUsd > 0)) continue;
      rows.push({ position: p.id, protocol: p.protocol, chainName: p.chainName, label: p.label, symbol: a.symbol, ...(a.debt ? { debt: true } : {}), quantity, valueUsd: a.valueUsd });
    }
  }
  for (const t of s.tokens) {
    const symbol = t.symbol.toUpperCase();
    const f = FAMILY[symbol];
    if (!f || (f.peg && !REBASING.has(symbol))) continue;
    const quantity = Number(t.quantity);
    if (!(quantity > 0) || !(t.valueUsd !== undefined && t.valueUsd > 0)) continue;
    rows.push({ position: `wallet:${t.chainName}:${symbol}`, protocol: "Wallet", chainName: t.chainName, label: `${t.symbol} held`, symbol: t.symbol, quantity, valueUsd: t.valueUsd });
  }
  return rows;
}

export type PositionEarnings = {
  position: string; protocol: string; chainName: string; label: string;
  /** Earned on what it holds, and interest paid on what it owes, in dollars at each day's prices. */
  earnedUsd: number; paidUsd: number;
  /** What it holds and owes now. */
  heldUsd: number; owedUsd: number;
  /** Per day it was read: [earned, interest paid], in dollars. */
  daily: Record<string, [number, number]>;
  /** Days that couldn't be valued and are left out. */
  unknown: number;
  /** When it was first read, in the readings given. */
  since: number;
};

const keyOf = (r: ReadingRow) => `${r.position}|${r.debt ? "debt" : "own"}|${r.symbol.toUpperCase()}`;

/** Earnings per position across a wallet's readings, oldest first. */
export function earningsOf(readings: Reading[]): PositionEarnings[] {
  const sorted = [...readings].sort((a, b) => a.takenAt - b.takenAt);
  const out = new Map<string, PositionEarnings>();
  const entry = (r: ReadingRow, at: number) => {
    let e = out.get(r.position);
    if (!e) { e = { position: r.position, protocol: r.protocol, chainName: r.chainName, label: r.label, earnedUsd: 0, paidUsd: 0, heldUsd: 0, owedUsd: 0, daily: {}, unknown: 0, since: at }; out.set(r.position, e); }
    return e;
  };
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i], a = sorted[i - 1];
    const before = new Map((a?.rows ?? []).map((r) => [keyOf(r), r]));
    for (const rb of b.rows) {
      const e = entry(rb, b.takenAt);
      e.label = rb.label;
      const ra = before.get(keyOf(rb));
      if (!a || !ra) continue; // New today: nothing to compare with yet.
      const usd = segment(ra, rb, a, b);
      if (usd === null) { e.unknown += 1; continue; }
      if (usd === 0) continue;
      const d = e.daily[b.day] ?? [0, 0];
      if (rb.debt) { e.paidUsd += -usd; d[1] += -usd; } else { e.earnedUsd += usd; d[0] += usd; }
      e.daily[b.day] = d;
    }
  }
  const last = sorted[sorted.length - 1];
  for (const r of last?.rows ?? []) {
    const e = out.get(r.position)!;
    if (r.debt) e.owedUsd += r.valueUsd; else e.heldUsd += r.valueUsd;
  }
  return [...out.values()].map((e) => ({ ...e, earnedUsd: round(e.earnedUsd), paidUsd: round(e.paidUsd), heldUsd: round(e.heldUsd), owedUsd: round(e.owedUsd), daily: Object.fromEntries(Object.entries(e.daily).map(([d, [x, y]]) => [d, [round(x), round(y)]])) }));
}

/**
 * Dollars earned by one coin from one reading to the next: positive for what is held, negative
 * (interest) for what is owed. Null when it can't be valued.
 */
function segment(ra: ReadingRow, rb: ReadingRow, a: Reading, b: Reading): number | null {
  const f = FAMILY[rb.symbol.toUpperCase()];
  const days = Math.max((b.takenAt - a.takenAt) / DAY_MS, 1 / 24);
  const limit = MAX_DAILY_RATE * days;
  // How many units of what it really is one token is worth: one for a coin, more over time for a share.
  const per = (r: ReadingRow, at: Reading) => {
    if (!f || f.peg) return 1;
    const ref = f.unit === "USD" ? 1 : at.refs[f.unit];
    return ref && ref > 0 ? r.valueUsd / r.quantity / ref : null;
  };
  const pa = per(ra, a), pb = per(rb, b);
  if (pa === null || pb === null) return null;
  // A share price that jumps is a bad price, not yield.
  if (Math.abs(pb / pa - 1) > limit) return null;
  const qa = ra.quantity, qb = rb.quantity;
  const moved = Math.abs(qb - qa) > qa * limit;
  const units = moved ? Math.min(qa, qb) * (pb - pa) : qb * pb - qa * pa;
  const usdPerUnit = rb.valueUsd / (qb * pb);
  const usd = units * usdPerUnit;
  return rb.debt ? -usd : usd;
}

const round = (x: number) => Math.round(x * 100) / 100;
