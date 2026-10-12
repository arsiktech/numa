import type { CloudAsset, CloudLiability } from '@/cloud/api';
import type { AskContext, AssetDraft, DebtDraft } from '@/ask/parse';
import type { Currency } from '@/domain/types';
import { parseAmount, parseDay } from './csv';

/**
 * A wealth log: one row per check-in date, with the value of every position in columns
 * grouped under headers such as FIAT, CRYPTO, STOCKS and HARD ASSETS, and an optional second
 * header row naming each position. Each dated row becomes one net-worth snapshot; the latest
 * row can also seed today's accounts and debts.
 */

type Group = 'liquid' | 'crypto' | 'stocks' | 'hard' | 'debt';
type Column = { index: number; group: Group; name: string; subtotal: boolean };

export type LogRow = {
  line: number;
  takenAt: number | null;
  /** Owned, by kind, and owed, in cents of `currency`. Net worth is their exact sum. */
  liquidCents: number;
  investedCents: number;
  hardCents: number;
  oweCents: number;
  netCents: number;
  /** The total the sheet itself shows, when it has one. */
  sheetNetCents: number | null;
  currency: Currency;
  problem: string | null;
  duplicate: boolean;
};

export type LogPosition = { group: Group; name: string; cents: number };

export type WealthLog = {
  rows: LogRow[];
  /** The newest readable row's positions, for setting up today. */
  latest: { takenAt: number; positions: LogPosition[] } | null;
};

const TOP = (label: string): Group | 'total' | 'liquidTotal' | 'subtotals' | 'date' | null => {
  const s = label.toLowerCase();
  if (!s) return null;
  if (/^date|^day/.test(s)) return 'date';
  if (/total|net ?worth/.test(s)) return 'total';
  if (/^liquid/.test(s)) return 'liquidTotal';
  if (/^shares?$|^split|^summary|^subtotal/.test(s)) return 'subtotals';
  return groupOf(s);
};
function groupOf(label: string): Group | null {
  const s = label.toLowerCase();
  if (/liabilit|debt|loan|owe|mortgage/.test(s)) return 'debt';
  if (/hard|property|real ?estate|not liquid|illiquid|physical/.test(s)) return 'hard';
  if (/crypto|coin|token|defi/.test(s)) return 'crypto';
  if (/stock|equit|etf|fund|broker|invest/.test(s)) return 'stocks';
  if (/fiat|cash|bank|money|saving/.test(s)) return 'liquid';
  return null;
}

/** True when the pasted table looks like a wealth log rather than a plain list. */
export function isWealthLog(table: string[][]): boolean {
  const head = table[0] ?? [];
  const tops = head.map(TOP);
  const groups = new Set(tops.filter((t): t is Group => t === 'liquid' || t === 'crypto' || t === 'stocks' || t === 'hard' || t === 'debt'));
  return tops.includes('date') && tops.includes('total') && groups.size >= 2;
}

function columnsOf(table: string[][]): { columns: Column[]; dateCol: number; totalCol: number; bodyStart: number } {
  const head = table[0];
  const sub = table[1] && !parseDay(table[1][0] ?? '') ? table[1] : null;
  const width = Math.max(...table.map((r) => r.length));
  const columns: Column[] = [];
  let dateCol = -1, totalCol = -1;
  let current: ReturnType<typeof TOP> = null;
  for (let i = 0; i < width; i++) {
    const top = TOP(head[i] ?? '');
    if (top) current = top;
    if (top === 'date' && dateCol < 0) { dateCol = i; continue; }
    if (top === 'total' && totalCol < 0) { totalCol = i; continue; }
    if (current === 'date' || current === 'total' || current === 'liquidTotal' || current === null) continue;
    const label = (sub?.[i] ?? '').trim();
    if (current === 'subtotals') {
      const g = groupOf(label);
      if (g) columns.push({ index: i, group: g, name: label, subtotal: true });
      continue;
    }
    columns.push({ index: i, group: current, name: label || (head[i] ?? '').trim(), subtotal: false });
  }
  return { columns, dateCol, totalCol, bodyStart: sub ? 2 : 1 };
}

const DATE_LIKE = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;
const dayKey = (t: number) => new Date(t).toDateString();

/**
 * Reads every dated row. Positive values count as owned, negative ones as owed, so a borrowed
 * stablecoin shows as debt rather than shrinking crypto. Position columns are used when present;
 * a group's own subtotal only when it has none. Blank cells are skipped, never read as zero.
 */
export function readWealthLog(table: string[][], ctx: { currency: Currency; existingDays: number[] }): WealthLog {
  const { columns, dateCol, totalCol, bodyStart } = columnsOf(table);
  const existing = new Set(ctx.existingDays.map(dayKey));
  const seen = new Set<string>();
  let latest: WealthLog['latest'] = null;
  const rows = table.slice(bodyStart).map((r, i): LogRow => {
    const line = bodyStart + i + 1;
    const takenAt = parseDay(r[dateCol] ?? '');
    const sheet = totalCol >= 0 ? parseAmount(r[totalCol] ?? '') : null;
    const currency: Currency = sheet?.currency ?? ctx.currency;
    const base = { line, takenAt, liquidCents: 0, investedCents: 0, hardCents: 0, oweCents: 0, netCents: 0, sheetNetCents: sheet?.cents ?? null, currency, duplicate: false };
    if (takenAt === null) return { ...base, problem: 'No readable date' };

    const positions: LogPosition[] = [];
    for (const group of ['liquid', 'crypto', 'stocks', 'hard', 'debt'] as Group[]) {
      const read = (subtotal: boolean) => columns
        .filter((c) => c.group === group && c.subtotal === subtotal)
        .flatMap((c) => {
          const raw = r[c.index] ?? '';
          // Repeated date columns ("4/25/2025", day or month first) are not amounts.
          if (!raw.trim() || DATE_LIKE.test(raw.trim()) || parseDay(raw) !== null) return [];
          const amount = parseAmount(raw);
          return amount && amount.cents !== 0 ? [{ group, name: c.name, cents: amount.cents }] : [];
        });
      const leaves = read(false);
      const subtotal = read(true);
      const sum = (ps: LogPosition[]) => ps.reduce((t, p) => t + p.cents, 0);
      // Positions show what is owned and owed inside a group, so they win when they agree with
      // the group's subtotal. When they don't (a hidden or extra column), the subtotal is the truth.
      const agrees = !subtotal.length || Math.abs(sum(leaves) - sum(subtotal)) <= 500;
      positions.push(...(leaves.length && agrees ? leaves : subtotal.length ? subtotal : leaves));
    }
    let liquid = 0, invested = 0, hard = 0, owe = 0;
    for (const p of positions) {
      if (p.cents < 0 || p.group === 'debt') { owe += Math.abs(p.cents); continue; }
      if (p.group === 'liquid') liquid += p.cents;
      else if (p.group === 'hard') hard += p.cents;
      else invested += p.cents;
    }
    const net = liquid + invested + hard - owe;
    const out = { ...base, liquidCents: liquid, investedCents: invested, hardCents: hard, oweCents: owe, netCents: net };
    if (!positions.length) return { ...out, problem: 'No values in this row' };
    // The sheet rounds to whole units, so allow a little; anything more means a column was misread.
    if (sheet && Math.abs(sheet.cents - net) > Math.max(500, Math.abs(sheet.cents) * 0.005)) {
      return { ...out, problem: `Adds up to ${(net / 100).toFixed(0)}, the sheet says ${(sheet.cents / 100).toFixed(0)}` };
    }
    const key = dayKey(takenAt);
    const duplicate = existing.has(key) || seen.has(key);
    seen.add(key);
    if (!latest || takenAt > latest.takenAt) latest = { takenAt, positions };
    return { ...out, problem: null, duplicate };
  });
  return { rows, latest };
}

const CURRENCY_NAMES = new Set(['EUR', 'USD', 'GBP', 'CHF']);
/** "REAL ESTATE" → "Real estate", "EUR" → "EUR"; tickers ("BTC", "STABLE$") stay as written. */
const nice = (name: string, group: Group) => {
  const t = name.trim();
  if (CURRENCY_NAMES.has(t.toUpperCase())) return t.toUpperCase();
  if ((group === 'hard' || group === 'liquid' || group === 'debt' || /\s/.test(t)) && t === t.toUpperCase()) return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  return t;
};

function hardKind(name: string): CloudAsset['kind'] {
  const s = name.toLowerCase();
  if (/real|estate|house|flat|apartment|property|land/.test(s)) return 'real_estate';
  if (/car|vehicle|bike|boat|moto/.test(s)) return 'vehicle';
  if (/gold|silver|watch|art|jewel|collect/.test(s)) return 'collectible';
  return 'other';
}

export type TodaySetup = {
  drafts: (AssetDraft | DebtDraft)[];
  /** Crypto and stock positions: they need a quantity so their value follows the price. */
  needQuantity: LogPosition[];
};

/**
 * Today's accounts and debts from the latest row. Cash and hard assets become accounts with the
 * sheet's value; negative values become debts. Crypto and stocks are listed, not created: a
 * value without a quantity can't follow the market.
 */
export function todayFromLatest(latest: NonNullable<WealthLog['latest']>, ctx: Pick<AskContext, 'assets' | 'liabilities'> & { currency: Currency }): TodaySetup {
  const drafts: (AssetDraft | DebtDraft)[] = [];
  const needQuantity: LogPosition[] = [];
  for (const p of latest.positions) {
    const label = nice(p.name, p.group);
    if (p.cents < 0 || p.group === 'debt') {
      const name = p.group === 'debt' ? label : `${label} ${p.group === 'liquid' ? 'owed' : 'borrowed'}`;
      const kind: CloudLiability['kind'] = p.group === 'debt' ? 'other' : p.group === 'liquid' ? 'other' : 'loan';
      const existing = ctx.liabilities.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? null;
      drafts.push({ type: 'debt', name: existing?.name ?? name, debtKind: existing?.kind ?? kind, amountCents: Math.abs(p.cents), currency: ctx.currency, dueDate: existing?.dueDate ?? null,
        existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency, dueDate: existing.dueDate } : null });
      continue;
    }
    if (p.group === 'crypto' || p.group === 'stocks') { needQuantity.push(p); continue; }
    const name = p.group === 'liquid' && CURRENCY_NAMES.has(label) ? `${label} cash` : label;
    const existing = ctx.assets.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null;
    drafts.push({ type: 'asset', name: existing?.name ?? name, assetKind: existing?.kind ?? (p.group === 'liquid' ? 'cash' : hardKind(p.name)), amountCents: p.cents, currency: ctx.currency,
      existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency } : null });
  }
  return { drafts, needQuantity: needQuantity.sort((a, b) => b.cents - a.cents) };
}
