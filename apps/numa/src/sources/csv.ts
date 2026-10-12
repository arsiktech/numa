/** Splits pasted spreadsheet cells or a CSV file into rows. Handles quotes, and tab, comma or semicolon separators. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const body = lines.join('\n');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ''));
}

/**
 * "1,234.56", "1.234,56", "-€45", "(45.00)", "$1 200" → cents, or null. A dot before
 * exactly three digits ("1.200") is a thousands separator, as European sheets write money.
 * Unit counts use parseQuantity instead.
 */
export function parseAmount(raw: string): { cents: number; currency: 'EUR' | 'USD' | null } | null {
  let s = raw.trim();
  if (!s) return null;
  const currency = /€|eur/i.test(s) ? 'EUR' : /\$|usd/i.test(s) ? 'USD' : null;
  const negative = /^\(.*\)$/.test(s) || /^[−-]/.test(s.replace(/[€$\s]|eur|usd/gi, '')) || /-$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  let normal: string;
  if (lastDot >= 0 && lastComma >= 0) normal = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lastComma >= 0) normal = /,\d{1,2}$/.test(s) && !/,\d{3}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  else normal = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  const value = Number(normal);
  if (!Number.isFinite(value)) return null;
  return { cents: Math.round(value * 100) * (negative ? -1 : 1), currency };
}

/** Unit counts keep every decimal ("0.12345678" BTC); a comma counts as the decimal mark only when there is no dot. */
export function parseQuantity(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  const normal = s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
  const value = Number(normal.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 2026-10-03, 03/10/2026, 03.10.2026, 3 Oct 2026, Oct 3 2026 → local noon of that day. Day-first for slashes. */
export function parseDay(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return day(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (m) return day(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[2])) return day(+m[3], MONTHS.indexOf(m[2]), +m[1]);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[1])) return day(+m[3], MONTHS.indexOf(m[1]), +m[2]);
  return null;
}
function day(y: number, mo: number, d: number): number | null {
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const t = new Date(y, mo, d, 12);
  return t.getMonth() === mo ? t.getTime() : null;
}
