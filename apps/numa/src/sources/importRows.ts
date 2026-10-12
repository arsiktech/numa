import type { CloudAsset, CloudHolding, CloudLiability } from '@/cloud/api';
import type { AskContext, Draft } from '@/ask/parse';
import { parseAmount, parseDay, parseQuantity } from './csv';

export type ImportKind = 'transactions' | 'balances' | 'holdings';
export type ImportRow = { line: number; draft: Draft | null; problem: string | null; duplicate: boolean };
export type ImportPreview = { kind: ImportKind | null; rows: ImportRow[]; headers: string[] };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
const find = (headers: string[], ...names: string[]) => headers.findIndex((h) => names.includes(norm(h)));

const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'ADA', 'DOT', 'XRP', 'DOGE', 'AVAX', 'MATIC', 'LINK']);
const ETFS = new Set(['VOO', 'VTI', 'SPY', 'QQQ', 'IWDA', 'VWCE', 'VUSA', 'CSPX', 'VT', 'SCHD']);

function assetKind(t: string): CloudAsset['kind'] {
  const s = t.toLowerCase();
  if (/house|flat|apartment|property|home|real|land/.test(s)) return 'real_estate';
  if (/car|vehicle|bike|boat/.test(s)) return 'vehicle';
  if (/watch|art|gold|silver|collect|jewel/.test(s)) return 'collectible';
  if (/cash|bank|saving|account|checking|current|deposit|wallet/.test(s) || !s) return 'cash';
  return 'other';
}
function debtKind(t: string): CloudLiability['kind'] | null {
  const s = t.toLowerCase();
  if (/mortgage/.test(s)) return 'mortgage';
  if (/loan|borrow/.test(s)) return 'loan';
  if (/card|credit/.test(s)) return 'credit_card';
  if (/debt|owe|liabilit/.test(s)) return 'other';
  return null;
}

/**
 * Reads a pasted table: transactions (date, description, amount), balances (name, value)
 * or holdings (symbol, quantity, cost). Every row becomes a draft the person reviews before
 * import, and rows that look already imported are marked so they are skipped.
 */
export function previewImport(table: string[][], ctx: AskContext & { existingTx: { occurredAt: number; amountMinor: number; description: string }[] }): ImportPreview {
  if (table.length < 2) return { kind: null, rows: [], headers: table[0] ?? [] };
  const [headers, ...body] = table;
  const col = {
    date: find(headers, 'date', 'day', 'bookingdate', 'transactiondate', 'valuedate', 'completeddate', 'startedDate'.toLowerCase()),
    desc: find(headers, 'description', 'details', 'name', 'merchant', 'payee', 'counterparty', 'memo', 'reference', 'account', 'asset', 'item'),
    amount: find(headers, 'amount', 'value', 'balance', 'total', 'sum', 'worth', 'eur', 'usd'),
    currency: find(headers, 'currency', 'ccy', 'cur'),
    type: find(headers, 'type', 'kind', 'category', 'group', 'class', 'direction'),
    symbol: find(headers, 'symbol', 'ticker', 'isin', 'coin', 'asset'),
    qty: find(headers, 'quantity', 'qty', 'shares', 'units', 'amountheld', 'holding'),
    cost: find(headers, 'cost', 'costbasis', 'invested', 'paid', 'totalcost', 'purchaseprice', 'price', 'buyprice'),
  };
  const kind: ImportKind | null = col.date >= 0 && col.amount >= 0 ? 'transactions' : col.symbol >= 0 && col.qty >= 0 ? 'holdings' : col.desc >= 0 && col.amount >= 0 ? 'balances' : null;
  if (!kind) return { kind, rows: [], headers };
  const cell = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  const currencyOf = (r: string[], fromAmount: 'EUR' | 'USD' | null) => {
    const c = cell(r, col.currency).toUpperCase();
    return c === 'USD' || c === 'EUR' ? c : fromAmount ?? ctx.currency;
  };

  const rows: ImportRow[] = body.map((r, i): ImportRow => {
    const line = i + 2;
    const fail = (problem: string): ImportRow => ({ line, draft: null, problem, duplicate: false });
    if (kind === 'transactions') {
      const at = parseDay(cell(r, col.date));
      if (at === null) return fail('No readable date');
      const amount = parseAmount(cell(r, col.amount));
      if (!amount || amount.cents === 0) return fail('No amount');
      const type = cell(r, col.type).toLowerCase();
      const income = /income|credit|in\b|deposit|salary|refund/.test(type) ? true : /expense|debit|out\b|payment|card/.test(type) ? false : amount.cents > 0;
      const description = cell(r, col.desc) || (income ? 'Income' : 'Spending');
      const category = ctx.categories.find((c) => c.kind === (income ? 'income' : 'expense') && c.name.toLowerCase() === type);
      const cents = Math.abs(amount.cents);
      const duplicate = ctx.existingTx.some((t) => Math.abs(t.amountMinor) === cents && new Date(t.occurredAt).toDateString() === new Date(at).toDateString() && t.description.toLowerCase() === description.toLowerCase());
      return { line, problem: null, duplicate, draft: { type: 'transaction', kind: income ? 'income' : 'expense', description, amountCents: cents, currency: currencyOf(r, amount.currency), occurredAt: at, categoryId: category?.id ?? null, categoryName: category?.name ?? null } };
    }
    if (kind === 'holdings') {
      const symbol = cell(r, col.symbol).toUpperCase().replace(/[^A-Z0-9.]/g, '');
      if (!symbol) return fail('No symbol');
      const units = parseQuantity(cell(r, col.qty));
      if (units === null) return fail('No quantity');
      const cost = parseAmount(cell(r, col.cost));
      const isTotal = col.cost >= 0 && /cost|invested|paid|total/.test(norm(headers[col.cost]));
      const priceCents = cost && cost.cents > 0 ? (isTotal ? Math.round(cost.cents / units) : cost.cents) : null;
      const existing = ctx.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
      const name = (col.desc >= 0 && col.desc !== col.symbol ? cell(r, col.desc) : '') || existing?.name || symbol;
      return {
        line, problem: priceCents === null && !existing ? 'No cost or price paid' : null, duplicate: false,
        draft: { type: 'holding', symbol, name, holdingKind: (existing?.kind ?? (CRYPTO.has(symbol) ? 'crypto' : ETFS.has(symbol) ? 'etf' : 'stock')) as CloudHolding['kind'], quantity: units, mode: 'set', priceCents, currency: currencyOf(r, cost?.currency ?? null),
          existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, quantity: existing.quantity, costBasisCents: Math.round(existing.costBasis * 100), currency: existing.currency, acquiredAt: existing.acquiredAt ?? ctx.now.getTime() } : null },
      };
    }
    const name = cell(r, col.desc);
    if (!name) return fail('No name');
    const amount = parseAmount(cell(r, col.amount));
    if (!amount) return fail('No value');
    const type = cell(r, col.type);
    const dk = debtKind(type) ?? (amount.cents < 0 ? 'other' : null);
    const currency = currencyOf(r, amount.currency);
    if (dk) {
      const existing = ctx.liabilities.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? null;
      return { line, problem: null, duplicate: false, draft: { type: 'debt', name: existing?.name ?? name, debtKind: existing?.kind ?? dk, amountCents: Math.abs(amount.cents), currency, dueDate: existing?.dueDate ?? null,
        existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency, dueDate: existing.dueDate } : null } };
    }
    const existing = ctx.assets.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null;
    return { line, problem: null, duplicate: false, draft: { type: 'asset', name: existing?.name ?? name, assetKind: existing?.kind ?? assetKind(type || name), amountCents: amount.cents, currency,
      existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency } : null } };
  });
  return { kind, rows, headers };
}
