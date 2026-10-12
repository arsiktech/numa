import type { CloudAsset, CloudCategory, CloudHolding, CloudLiability } from '@/cloud/api';
import type { Currency } from '@/domain/types';

/**
 * Turns a short sentence into a draft or a question. Runs on the device with plain rules:
 * no AI provider sees the words. Every draft is shown to the person and saved only when
 * they press Save.
 */

export type TransactionDraft = {
  type: 'transaction';
  kind: 'expense' | 'income';
  description: string;
  amountCents: number;
  currency: Currency;
  occurredAt: number;
  categoryId: string | null;
  categoryName: string | null;
};

export type AssetDraft = {
  type: 'asset';
  name: string;
  assetKind: CloudAsset['kind'];
  amountCents: number;
  currency: Currency;
  /** Set when the sentence updates an account Numa already has. */
  existing: { id: string; name: string; kind: CloudAsset['kind']; balanceCents: number; currency: Currency } | null;
};

export type DebtDraft = {
  type: 'debt';
  name: string;
  debtKind: CloudLiability['kind'];
  amountCents: number;
  currency: Currency;
  dueDate: number | null;
  existing: { id: string; name: string; kind: CloudLiability['kind']; balanceCents: number; currency: Currency; dueDate: number | null } | null;
};

export type HoldingDraft = {
  type: 'holding';
  symbol: string;
  name: string;
  holdingKind: CloudHolding['kind'];
  /** Units bought (mode add) or now held (mode set). */
  quantity: number;
  mode: 'add' | 'set';
  /** Price paid per unit, or null when the sentence did not say. */
  priceCents: number | null;
  currency: Currency;
  existing: { id: string; name: string; kind: CloudHolding['kind']; quantity: number; costBasisCents: number; currency: Currency; acquiredAt: number } | null;
};

export type Draft = TransactionDraft | AssetDraft | DebtDraft | HoldingDraft;
export type Topic = 'net' | 'cash' | 'liquid' | 'owe' | 'spent' | 'income' | 'kept' | 'help';
export type Parsed = { type: 'draft'; draft: Draft } | { type: 'question'; topic: Topic } | { type: 'unknown' };

export type AskContext = {
  currency: Currency;
  now: Date;
  categories: CloudCategory[];
  assets: (Pick<CloudAsset, 'id' | 'name' | 'kind' | 'balance' | 'currency'>)[];
  liabilities: (Pick<CloudLiability, 'id' | 'name' | 'kind' | 'balance' | 'currency' | 'dueDate'>)[];
  holdings: (Pick<CloudHolding, 'id' | 'symbol' | 'name' | 'kind' | 'quantity' | 'costBasis' | 'currency'> & { acquiredAt?: number })[];
};

const DAY = 86_400_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CRYPTO: Record<string, [string, string]> = {
  btc: ['BTC', 'Bitcoin'], bitcoin: ['BTC', 'Bitcoin'], eth: ['ETH', 'Ethereum'], ether: ['ETH', 'Ethereum'], ethereum: ['ETH', 'Ethereum'],
  sol: ['SOL', 'Solana'], solana: ['SOL', 'Solana'], usdc: ['USDC', 'USD Coin'], usdt: ['USDT', 'Tether'],
};
const ETFS = new Set(['VOO', 'VTI', 'SPY', 'QQQ', 'IWDA', 'VWCE', 'VUSA', 'CSPX', 'VT', 'SCHD']);
const NOT_TICKERS = new Set(['EUR', 'USD', 'K', 'M', 'I', 'A', 'MY', 'ON', 'AT', 'IN', 'TO', 'OF', 'THE', 'FOR']);
const SPEND_CATEGORIES: [RegExp, string][] = [
  [/\b(grocer(y|ies)|supermarket|mercadona|lidl|aldi|carrefour|market)\b/, 'Groceries'],
  [/\b(coffee|lunch|dinner|breakfast|restaurant|cafe|café|bar|pizza|sushi|burger|drinks?|takeaway|delivery)\b/, 'Dining'],
  [/\b(uber|taxi|cab|bus|train|metro|fuel|petrol|gas station|flight|parking|bolt|cabify)\b/, 'Transport'],
  [/\b(rent)\b/, 'Rent'],
  [/\b(electricity|water bill|internet|phone bill|utilities|power bill|gas bill)\b/, 'Utilities'],
  [/\b(netflix|spotify|subscription|icloud|chatgpt|claude|youtube|disney|hbo|figma|notion|github)\b/, 'Subscriptions'],
];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tidy = (s: string) => s.replace(/[^\p{L}\p{N}&'’ -]/gu, ' ').replace(/\s+/g, ' ').trim();

/** "1,200" "4.50" "4,50" "12.5k" "€250k" "$1.2m" → cents and an optional currency. */
const MONEY = /(?:([€$])\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)\s?(k|m)?(?![a-z])(?:\s?(€|\$|eur(?:os?)?\b|usd\b|dollars?\b))?/i;

export function parseMoney(text: string): { cents: number; currency: Currency | null; match: string } | null {
  const m = MONEY.exec(text);
  if (!m) return null;
  const whole = Number(m[2].replace(/,/g, ''));
  const frac = m[3] ? Number(m[3].padEnd(2, '0')) / 100 : 0;
  const scale = m[4]?.toLowerCase() === 'k' ? 1_000 : m[4]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  const cents = Math.round((whole + frac) * scale * 100);
  const sym = (m[1] ?? m[5] ?? '').toLowerCase();
  const currency: Currency | null = sym === '€' || sym.startsWith('eur') ? 'EUR' : sym === '$' || sym === 'usd' || sym.startsWith('dollar') ? 'USD' : null;
  return { cents, currency, match: m[0] };
}

/** Pulls a date out of the sentence. `prefer` decides which year an ambiguous day lands in. */
export function parseDate(text: string, now: Date, prefer: 'past' | 'future'): { at: number; match: string } | null {
  const noon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  let m = /\b(today|yesterday|tomorrow)\b/i.exec(text);
  if (m) {
    const shift = { today: 0, yesterday: -1, tomorrow: 1 }[m[1].toLowerCase() as 'today'];
    return { at: shift === 0 ? now.getTime() : noon(new Date(now.getTime() + shift * DAY)), match: m[0] };
  }
  m = /\bin (\d{1,3}) days?\b/i.exec(text);
  if (m) return { at: noon(new Date(now.getTime() + Number(m[1]) * DAY)), match: m[0] };
  const monthRe = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthRe}\\b`, 'i').exec(text);
  let day: number | null = null, month: number | null = null;
  if (m) { day = Number(m[1]); month = MONTHS.indexOf(m[2].toLowerCase()); }
  else {
    m = new RegExp(`\\b${monthRe}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i').exec(text);
    if (m) { month = MONTHS.indexOf(m[1].toLowerCase()); day = Number(m[2]); }
  }
  if (!m || day === null || month === null || day < 1 || day > 31) return null;
  let at = noon(new Date(now.getFullYear(), month, day));
  if (prefer === 'past' && at > now.getTime() + DAY) at = noon(new Date(now.getFullYear() - 1, month, day));
  if (prefer === 'future' && at < now.getTime() - DAY) at = noon(new Date(now.getFullYear() + 1, month, day));
  return { at, match: m[0] };
}

const without = (text: string, ...parts: (string | undefined)[]) => parts.reduce<string>((t, p) => (p ? t.replace(p, ' ') : t), text);
const sameName = (a: string, b: string) => {
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  return x === y || (x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x)));
};

function question(t: string): Topic | null {
  const isQuestion = /\?\s*$/.test(t) || /^(what|whats|what's|how|show|tell|where|which|am i|do i|did i)\b/.test(t);
  if (!isQuestion) return null;
  if (/\b(owe|debt|debts|loans?)\b/.test(t)) return 'owe';
  if (/\bliquid\b/.test(t)) return 'liquid';
  if (/\bcash\b/.test(t)) return 'cash';
  if (/\b(spen[dt]|spending|expenses?|outgoing)\b/.test(t)) return 'spent';
  if (/\b(kept|save|saved|saving|savings rate)\b/.test(t)) return 'kept';
  if (/\b(earn|earned|income|came in|made|revenue)\b/.test(t)) return 'income';
  if (/\b(net ?worth|worth|total|wealth|have)\b/.test(t)) return 'net';
  return 'help';
}

function holding(raw: string, t: string, ctx: AskContext): HoldingDraft | null {
  const re = /\b(?:(bought|buy|added|add|own|have|hold)\s+)?(\d+(?:[.,]\d+)?)\s*(?:shares?\s+(?:of\s+)?|units?\s+(?:of\s+)?|coins?\s+(?:of\s+)?)?([a-z]{2,10})\b/gi;
  for (const m of raw.matchAll(re)) {
    const token = m[3];
    const crypto = CRYPTO[token.toLowerCase()];
    const ticker = !crypto && token === token.toUpperCase() && token.length <= 5 && !NOT_TICKERS.has(token) ? token : null;
    if (!crypto && !ticker) continue;
    const symbol = crypto ? crypto[0] : ticker!;
    const quantity = Number(m[2].replace(',', '.'));
    if (!(quantity > 0)) return null;
    const rest = raw.slice((m.index ?? 0) + m[0].length);
    const unit = /^\s*(?:at|@)\s*([€$]?\s?[\d.,]+\s?[km]?\s?(?:€|\$|eur|usd)?)/i.exec(rest);
    const total = /^\s*for\s+([€$]?\s?[\d.,]+\s?[km]?\s?(?:€|\$|eur|usd)?)/i.exec(rest);
    const price = unit ? parseMoney(unit[1]) : total ? parseMoney(total[1]) : null;
    const priceCents = price ? (unit ? price.cents : Math.round(price.cents / quantity)) : null;
    const existing = ctx.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
    const verb = (m[1] ?? 'bought').toLowerCase();
    return {
      type: 'holding', symbol,
      name: existing?.name ?? (crypto ? crypto[1] : symbol),
      holdingKind: existing?.kind ?? (crypto ? 'crypto' : ETFS.has(symbol) ? 'etf' : 'stock'),
      quantity, mode: ['own', 'have', 'hold'].includes(verb) ? 'set' : 'add',
      priceCents, currency: price?.currency ?? existing?.currency ?? 'USD',
      existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, quantity: existing.quantity, costBasisCents: Math.round(existing.costBasis * 100), currency: existing.currency, acquiredAt: existing.acquiredAt ?? ctx.now.getTime() } : null,
    };
  }
  void t;
  return null;
}

export function parse(input: string, ctx: AskContext): Parsed {
  const raw = input.trim();
  const t = raw.toLowerCase();
  if (!t) return { type: 'unknown' };
  const topic = question(t);
  if (topic) return { type: 'question', topic };

  const h = holding(raw, t, ctx);
  if (h) return { type: 'draft', draft: h };

  const isDebt = /\b(owe|owed|debt|loan|mortgage|credit card|card bill|card balance|borrowed)\b/.test(t);
  const date = parseDate(raw, ctx.now, isDebt ? 'future' : 'past');
  const rest = without(raw, date?.match);
  const money = parseMoney(rest);
  if (!money || money.cents <= 0) return { type: 'unknown' };
  const currency = money.currency ?? ctx.currency;
  const words = tidy(without(rest, money.match).toLowerCase());

  if (isDebt) {
    const debtKind: CloudLiability['kind'] = /\bmortgage\b/.test(t) ? 'mortgage' : /\b(loan|borrowed)\b/.test(t) ? 'loan' : /\bcard\b/.test(t) ? 'credit_card' : 'other';
    const named = tidy(words.replace(/\b(i|owe|owed|on|my|the|a|due|debt|of|to|is|now|balance|bill|borrowed|from)\b/g, ' '));
    const name = cap(named) || { mortgage: 'Mortgage', loan: 'Loan', credit_card: 'Card', other: 'Debt' }[debtKind];
    const existing = ctx.liabilities.find((l) => sameName(l.name, name)) ?? null;
    return {
      type: 'draft',
      draft: {
        type: 'debt', name: existing?.name ?? name, debtKind: existing?.kind ?? debtKind, amountCents: money.cents, currency, dueDate: date?.at ?? existing?.dueDate ?? null,
        existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency, dueDate: existing.dueDate } : null,
      },
    };
  }

  const isAsset = /\b(balance|worth|valued?|value|savings|in the bank|have)\b/.test(t);
  if (isAsset) {
    const assetKind: CloudAsset['kind'] = /\b(house|flat|apartment|property|home|land)\b/.test(t) ? 'real_estate'
      : /\b(car|bike|motorbike|scooter|boat|van)\b/.test(t) ? 'vehicle'
      : /\b(watch|art|gold|silver|jewel\w*|painting|collection)\b/.test(t) ? 'collectible'
      : /\b(worth|valued?|value)\b/.test(t) ? 'other' : 'cash';
    const named = tidy(words.replace(/\b(i|have|has|my|the|a|is|are|now|balance|worth|valued|value|at|in|of|today|currently|got)\b/g, ' '));
    const name = cap(named) || (assetKind === 'cash' ? 'Cash' : 'Asset');
    const existing = ctx.assets.find((a) => sameName(a.name, name)) ?? null;
    return {
      type: 'draft',
      draft: {
        type: 'asset', name: existing?.name ?? name, assetKind: existing?.kind ?? assetKind, amountCents: money.cents, currency: money.currency ?? existing?.currency ?? ctx.currency,
        existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency } : null,
      },
    };
  }

  const isIncome = /^\+/.test(t) || /\b(got paid|paid by|received|income|salary|earned|invoice paid|payment from|refund|payout|dividend)\b/.test(t);
  const from = /\bfrom\s+([\p{L}\p{N}&' -]+)/iu.exec(without(rest, money.match));
  const description = isIncome
    ? cap(tidy(from?.[1] ?? '') || tidy(words.replace(/\b(got|paid|by|received|income|from|earned|for|the|a|my|payment|invoice)\b/g, ' ')) || 'Income')
    : cap(tidy(words.replace(/\b(spent|spend|paid|pay|for|on|a|an|the|my|bought|got|cost|was)\b/g, ' ')) || 'Spending');
  const kind = isIncome ? 'income' : 'expense';
  const wanted = isIncome
    ? (/\b(salary|payroll|wage)\b/.test(t) ? 'Salary' : /\b(client|invoice|freelance|project|consulting|contract)\b/.test(t) ? 'Freelance' : null)
    : SPEND_CATEGORIES.find(([re]) => re.test(t))?.[1] ?? null;
  const direct = ctx.categories.find((c) => c.kind === kind && new RegExp(`\\b${c.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
  const category = direct ?? (wanted ? ctx.categories.find((c) => c.kind === kind && c.name.toLowerCase() === wanted.toLowerCase()) : undefined) ?? null;
  return {
    type: 'draft',
    draft: { type: 'transaction', kind, description, amountCents: money.cents, currency, occurredAt: date?.at ?? ctx.now.getTime(), categoryId: category?.id ?? null, categoryName: category?.name ?? null },
  };
}

/** What still stops a draft from being saved, in plain words. Empty means it can be saved. */
export function draftProblems(d: Draft): string[] {
  const out: string[] = [];
  if (d.type === 'holding') {
    if (!(d.quantity > 0)) out.push('Add how many you have.');
    // The backend needs what was paid; Numa never invents a zero cost.
    if (d.priceCents === null || d.priceCents <= 0) {
      if (!(d.mode === 'set' && d.existing)) out.push(`Add the price you paid per ${d.symbol}.`);
    }
    return out;
  }
  if (d.amountCents <= 0) out.push('Add an amount.');
  if (d.type === 'transaction' && !d.description.trim()) out.push('Add what it was for.');
  if ((d.type === 'asset' || d.type === 'debt') && !d.name.trim()) out.push('Add a name.');
  return out;
}
