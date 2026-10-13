import * as XLSX from 'xlsx';

export type SheetTab = { name: string; csv: string };

const TEXT = /\.(csv|tsv|txt)$/i;

/**
 * Turns a chosen file into tabs of comma-separated text, the same form a paste produces.
 * Excel and OpenDocument cells are read as they are shown in the sheet ("€1,200" as written),
 * except dates, which are always written YYYY-MM-DD so no date is ever read as an amount.
 */
export function readSpreadsheet(name: string, bytes: Uint8Array): SheetTab[] {
  if (TEXT.test(name)) return [{ name: name.replace(/\.[^.]+$/, ''), csv: new TextDecoder().decode(bytes) }];
  const book = XLSX.read(bytes, { type: 'array', cellDates: true });
  return book.SheetNames
    .map((sheet) => ({ name: sheet, csv: XLSX.utils.sheet_to_csv(datesAsText(book.Sheets[sheet]), { blankrows: false }) }))
    .filter((tab) => tab.csv.trim().length > 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Writes every date cell as YYYY-MM-DD. Excel stores dates as day counts, and a date cell
 * whose format is lost would otherwise come out as a number like 45630 and read as money.
 */
function datesAsText(sheet: XLSX.WorkSheet): XLSX.WorkSheet {
  for (const ref of Object.keys(sheet)) {
    if (ref.startsWith('!')) continue;
    const cell = sheet[ref] as XLSX.CellObject;
    if (cell.t === 'd' && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
      const d = cell.v;
      cell.w = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
  }
  return sheet;
}
