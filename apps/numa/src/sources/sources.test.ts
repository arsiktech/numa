import type { AskContext } from '@/ask/parse';
import { parseAmount, parseDay, parseQuantity, parseTable } from './csv';
import { previewImport } from './importRows';

const now = new Date(2026, 9, 12, 10);
const ctx: AskContext & { existingTx: { occurredAt: number; amountMinor: number; description: string }[] } = {
  currency: 'EUR', now,
  categories: [{ id: 'c-rent', name: 'Rent', kind: 'expense' }, { id: 'c-sal', name: 'Salary', kind: 'income' }],
  assets: [{ id: 'a1', name: 'Main account', kind: 'cash', balance: 100, currency: 'EUR' }],
  liabilities: [], holdings: [{ id: 'h1', symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasis: 15000, currency: 'USD', acquiredAt: 1 }],
  existingTx: [{ occurredAt: new Date(2026, 9, 3, 12).getTime(), amountMinor: 120_000, description: 'October rent' }],
};

describe('parseTable', () => {
  it('reads pasted Google Sheets cells (tabs), CSV with quotes, and semicolons', () => {
    expect(parseTable('Name\tValue\nBank\t12,500\n')).toEqual([['Name', 'Value'], ['Bank', '12,500']]);
    expect(parseTable('a,b\n"Smith, J","say ""hi"""')).toEqual([['a', 'b'], ['Smith, J', 'say "hi"']]);
    expect(parseTable('Datum;Betrag\n03.10.2026;-1.200,00')).toEqual([['Datum', 'Betrag'], ['03.10.2026', '-1.200,00']]);
  });
});

describe('parseAmount and parseDay', () => {
  it.each([
    ['1,234.56', 123_456, null], ['1.234,56', 123_456, null], ['-€45', -4_500, 'EUR'], ['(45.00)', -4_500, null],
    ['$1 200', 120_000, 'USD'], ['12,5', 1_250, null], ['1.200', 120_000, null], ['45-', -4_500, null],
  ])('%s', (raw, cents, currency) => expect(parseAmount(raw)).toEqual({ cents, currency }));
  it('reads quantities with every decimal', () => {
    expect(parseQuantity('0.12345678')).toBe(0.12345678);
    expect(parseQuantity('1.200')).toBe(1.2);
    expect(parseQuantity('0,5')).toBe(0.5);
    expect(parseQuantity('1,000.5')).toBe(1000.5);
    expect(parseQuantity('0')).toBeNull();
  });
  it('reads common date formats day-first', () => {
    const d = (raw: string) => { const t = parseDay(raw); return t === null ? null : new Date(t).toDateString(); };
    expect(d('2026-10-03')).toBe(new Date(2026, 9, 3).toDateString());
    expect(d('03/10/2026')).toBe(new Date(2026, 9, 3).toDateString());
    expect(d('3.10.26')).toBe(new Date(2026, 9, 3).toDateString());
    expect(d('3 Oct 2026')).toBe(new Date(2026, 9, 3).toDateString());
    expect(d('Oct 3, 2026')).toBe(new Date(2026, 9, 3).toDateString());
    expect(d('31/02/2026')).toBeNull();
    expect(d('soon')).toBeNull();
  });
});

describe('previewImport', () => {
  it('reads a bank export of transactions, signs decide spent or received, duplicates are marked', () => {
    const p = previewImport(parseTable('Date,Description,Amount,Category\n2026-10-03,October rent,-1200,Rent\n2026-10-01,Payroll,3200,Salary\n2026-10-05,Coffee,-4.50,\nbad,Row,1,'), ctx);
    expect(p.kind).toBe('transactions');
    expect(p.rows[0]).toMatchObject({ duplicate: true, draft: { kind: 'expense', amountCents: 120_000, categoryId: 'c-rent' } });
    expect(p.rows[1].draft).toMatchObject({ kind: 'income', amountCents: 320_000, categoryId: 'c-sal' });
    expect(p.rows[2]).toMatchObject({ duplicate: false, draft: { description: 'Coffee', amountCents: 450 } });
    expect(p.rows[3]).toMatchObject({ draft: null, problem: 'No readable date' });
  });

  it('reads a balance sheet: accounts update by name, negative or debt rows become debts', () => {
    const p = previewImport(parseTable('Name\tType\tValue\tCurrency\nMain account\tBank\t12500\tEUR\nFlat\tProperty\t250000\tEUR\nCar loan\tLoan\t20000\tEUR\nCard\t\t-420\t'), ctx);
    expect(p.kind).toBe('balances');
    expect(p.rows.map((r) => r.draft?.type)).toEqual(['asset', 'asset', 'debt', 'debt']);
    expect(p.rows[0].draft).toMatchObject({ existing: { id: 'a1' }, amountCents: 1_250_000 });
    expect(p.rows[1].draft).toMatchObject({ assetKind: 'real_estate' });
    expect(p.rows[3].draft).toMatchObject({ amountCents: 42_000, debtKind: 'other' });
  });

  it('reads holdings with a total cost, and refuses new ones without a cost', () => {
    const p = previewImport(parseTable('Symbol,Quantity,Total cost,Currency\nVOO,10,5000,USD\nBTC,0.6,,\nAAPL,3,,'), ctx);
    expect(p.kind).toBe('holdings');
    expect(p.rows[0].draft).toMatchObject({ symbol: 'VOO', holdingKind: 'etf', quantity: 10, priceCents: 50_000, currency: 'USD', mode: 'set' });
    expect(p.rows[1]).toMatchObject({ problem: null, draft: { existing: { id: 'h1' }, quantity: 0.6 } });
    expect(p.rows[2].problem).toBe('No cost or price paid');
  });

  it('says it cannot tell what a table is instead of guessing', () => {
    expect(previewImport(parseTable('foo,bar\n1,2'), ctx).kind).toBeNull();
  });
});
