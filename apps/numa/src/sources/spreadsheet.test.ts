import * as XLSX from 'xlsx';

import { parseTable } from './csv';
import { readSpreadsheet } from './spreadsheet';
import { isWealthLog, readWealthLog } from './wealthLog';

/** A made-up wealth log saved as Excel, with real date cells and currency formats. */
function workbook(): Uint8Array {
  const rows: (string | number | Date | null)[][] = [
    ['DATE', 'TOTAL BALANCE', 'FIAT', null, 'CRYPTO', null, 'HARD ASSETS'],
    [null, null, 'EUR', 'USD', 'BTC', 'STABLE$', 'CAR'],
    [new Date(Date.UTC(2026, 0, 5)), 10500, 2000, 0, 9500, -1000, 0],
    [new Date(Date.UTC(2026, 1, 20)), 25000, 0, 0, 11000, -6000, 20000],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  for (const ref of Object.keys(sheet)) {
    const cell = sheet[ref];
    if (ref.startsWith('!') || !cell) continue;
    if (cell.t === 'd') cell.z = 'mmm d yyyy';
    else if (cell.t === 'n') cell.z = '"€"#,##0';
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Notes'], ['nothing here']]), 'Notes');
  XLSX.utils.book_append_sheet(book, sheet, 'Wealth Log');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), 'Empty');
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
}

describe('readSpreadsheet', () => {
  it('reads every non-empty tab of an Excel file as the sheet shows it', () => {
    const tabs = readSpreadsheet('money.xlsx', workbook());
    expect(tabs.map((t) => t.name)).toEqual(['Notes', 'Wealth Log']);
    const log = tabs[1].csv.split('\n');
    expect(log[2]).toBe('2026-01-05,"€10,500","€2,000",€0,"€9,500","-€1,000",€0');
  });

  it('feeds the wealth log reader exactly like a paste', () => {
    const table = parseTable(readSpreadsheet('money.xlsx', workbook())[1].csv);
    expect(isWealthLog(table)).toBe(true);
    const { rows } = readWealthLog(table, { currency: 'EUR', existingDays: [] });
    expect(rows.map((r) => [r.problem, r.netCents, r.oweCents])).toEqual([[null, 1_050_000, 100_000], [null, 2_500_000, 600_000]]);
  });

  it('never turns a date cell into an amount, even without a date format', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['DATE', 'TOTAL', 'FIAT', 'CRYPTO'], [null, null, 'EUR', 'BTC'], [new Date(Date.UTC(2024, 11, 4)), 300, new Date(Date.UTC(2024, 11, 4)), 300]], { cellDates: true });
    for (const ref of ['A3', 'C3']) delete (sheet[ref] as XLSX.CellObject).z;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Log');
    const csv = readSpreadsheet('log.xlsx', new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })))[0].csv;
    expect(csv.split('\n')[2]).toBe('2024-12-04,300,2024-12-04,300');
  });

  it('reads a CSV file as text', () => {
    const tabs = readSpreadsheet('bank.csv', new TextEncoder().encode('Date,Description,Amount\n2026-10-03,Rent,-1200'));
    expect(tabs).toEqual([{ name: 'bank', csv: 'Date,Description,Amount\n2026-10-03,Rent,-1200' }]);
  });
});
