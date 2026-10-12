import { parseCsv, unixMsFromIsoDate, type TransactionImportRow } from "./csv";
import type { CurrencyCode, TxKind } from "./types";

/* ------------------------------------------------------------------ */
/* Bank CSV import presets                                             */
/*                                                                     */
/* Known bank export layouts (Revolut / N26) are matched by header     */
/* signature and normalized into the Numa-native TransactionImportRow. */
/* Banks change their export formats without notice, so detection is   */
/* deliberately a *subset* match (extra columns are fine) and the      */
/* generic column mapper is the contract of last resort: any layout    */
/* we cannot recognise can still be imported by hand-mapping columns.  */
/* ------------------------------------------------------------------ */

export type CsvDateFormat = "iso" | "iso-datetime" | "dd.mm.yyyy";
export type CsvDecimalSeparator = "." | ",";
export type CsvPresetId = "revolut" | "n26" | "generic";

export interface CsvPreset {
  id: CsvPresetId;
  label: string;
  delimiter: "," | ";";
  /** Lowercased column names that must ALL be present (subset match). */
  headerSignature: string[];
  dateColumn: string;
  dateFormat: CsvDateFormat;
  amountColumn: string;
  /** true: negative amount → expense (abs), positive → income. false: every row is an expense. */
  signedAmounts: boolean;
  decimalSeparator: CsvDecimalSeparator;
  /** Joined with " · ", empty cells skipped. */
  descriptionColumns: string[];
  /** Column holding the currency code; defaults to EUR when absent. */
  currencyColumn?: string;
  /** Row-level filter; receives lowercased-column-name → trimmed-value. */
  skipRow?: (row: Record<string, string>) => boolean;
}

const SUPPORTED_IMPORT_CURRENCIES: readonly CurrencyCode[] = ["USD", "EUR"];

/** Revolut personal-account export, as shipped 2023–2025. */
const REVOLUT_PRESET: CsvPreset = {
  id: "revolut",
  label: "Revolut",
  delimiter: ",",
  headerSignature: ["type", "completed date", "description", "amount", "currency", "state"],
  dateColumn: "Completed Date",
  dateFormat: "iso-datetime",
  amountColumn: "Amount",
  signedAmounts: true,
  decimalSeparator: ".",
  descriptionColumns: ["Description"],
  currencyColumn: "Currency",
  skipRow: (row) => (row["state"] ?? "").toUpperCase() !== "COMPLETED"
};

/** N26 export, 2023+ layout ("Booking Date" / "Partner Name"). */
const N26_PRESET: CsvPreset = {
  id: "n26",
  label: "N26",
  delimiter: ",",
  headerSignature: ["booking date", "partner name", "amount (eur)"],
  dateColumn: "Booking Date",
  dateFormat: "iso",
  amountColumn: "Amount (EUR)",
  signedAmounts: true,
  decimalSeparator: ".",
  descriptionColumns: ["Partner Name", "Payment Reference"]
};

/** N26 export, pre-2023 legacy layout ("Date" / "Payee"). Same preset id. */
const N26_LEGACY_PRESET: CsvPreset = {
  id: "n26",
  label: "N26",
  delimiter: ",",
  headerSignature: ["date", "payee", "amount (eur)"],
  dateColumn: "Date",
  dateFormat: "iso",
  amountColumn: "Amount (EUR)",
  signedAmounts: true,
  decimalSeparator: ".",
  descriptionColumns: ["Payee", "Payment reference"]
};

const BANK_PRESETS: readonly CsvPreset[] = [REVOLUT_PRESET, N26_PRESET, N26_LEGACY_PRESET];

function normalizeHeaderCells(headerRow: string[]): string[] {
  return headerRow.map((cell) => cell.trim().toLowerCase());
}

/**
 * Match a header row against the known bank presets. Subset matching: every
 * signature column must be present (lowercased, trimmed); extra columns are
 * ignored so minor bank-side format additions keep matching.
 */
export function detectPreset(headerRow: string[]): CsvPreset | null {
  const header = new Set(normalizeHeaderCells(headerRow));
  for (const preset of BANK_PRESETS) {
    if (preset.headerSignature.every((column) => header.has(column))) return preset;
  }
  return null;
}

/** True when the header looks like Numa's own transactions export. */
export function isNumaTransactionsHeader(headerRow: string[]): boolean {
  const header = new Set(normalizeHeaderCells(headerRow));
  return ["date", "description", "kind", "amount", "currency"].every((c) => header.has(c));
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

export interface PresetNormalizeResult {
  rows: TransactionImportRow[];
  /** Per-row problems, each prefixed with the 1-based CSV line number. */
  errors: string[];
  /** Rows dropped by the preset's skipRow filter (e.g. non-COMPLETED). */
  skipped: number;
  /** File-level advisories (e.g. the decimal separator looks misconfigured). */
  warnings: string[];
}

function parsePresetDate(raw: string, format: CsvDateFormat): number | null {
  const trimmed = raw.trim();
  if (format === "dd.mm.yyyy") {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
    if (!m) return null;
    return unixMsFromIsoDate(`${m[3]}-${m[2]}-${m[1]}`);
  }
  // "iso-datetime": truncate "2024-05-01 12:34:56" / "...T12:34:56Z" to the date part.
  const datePart = format === "iso-datetime" ? trimmed.slice(0, 10) : trimmed;
  return unixMsFromIsoDate(datePart);
}

/** Matches amounts unambiguously written with a decimal comma: "12,50", "-1.234,56". */
const COMMA_DECIMAL_GROUPED = /^-?\d{1,3}(\.\d{3})*,\d{1,2}$/;
const COMMA_DECIMAL_SIMPLE = /^-?\d+,\d{1,2}$/;

/** True when the value can only sensibly be read as a comma-decimal amount. */
export function looksCommaDecimal(raw: string): boolean {
  const s = raw.trim().replace(/[\s\u00a0]/g, "");
  return COMMA_DECIMAL_GROUPED.test(s) || COMMA_DECIMAL_SIMPLE.test(s);
}

function parsePresetAmount(raw: string, decimalSeparator: CsvDecimalSeparator): number | null {
  let s = raw.trim().replace(/[\s\u00a0]/g, "");
  if (s === "") return null;
  // Values that unambiguously use a decimal comma ("12,50", "1.234,56") are
  // parsed as such even when "." is the selected separator; otherwise a
  // misconfigured mapper silently turns 12,50 into 1250.
  if (decimalSeparator === "," || looksCommaDecimal(s)) {
    s = s.replace(/\./g, "").replace(",", "."); // 1.234,56 → 1234.56
  } else {
    s = s.replace(/,/g, ""); // 1,234.56 → 1234.56
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a parsed CSV matrix (header row included) into Numa import rows
 * using the given preset. Never throws: malformed rows become line-numbered
 * entries in `errors`, filtered rows (skipRow) increment `skipped`.
 */
export function normalizeWithPreset(matrix: string[][], preset: CsvPreset): PresetNormalizeResult {
  const result: PresetNormalizeResult = { rows: [], errors: [], skipped: 0, warnings: [] };
  if (matrix.length === 0) return result;

  // Track how many amount cells look comma-decimal so we can warn when the
  // selected "." separator appears to mismatch the file.
  let amountCells = 0;
  let commaDecimalCells = 0;

  const headerIndex = new Map<string, number>();
  normalizeHeaderCells(matrix[0]).forEach((name, idx) => {
    if (!headerIndex.has(name)) headerIndex.set(name, idx);
  });
  const valueOf = (row: string[], column: string): string => {
    const idx = headerIndex.get(column.trim().toLowerCase());
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r];
    const line = r + 1;
    if (row.every((cell) => cell.trim() === "")) continue;

    if (preset.skipRow) {
      const record: Record<string, string> = {};
      headerIndex.forEach((idx, name) => {
        record[name] = (row[idx] ?? "").trim();
      });
      if (preset.skipRow(record)) {
        result.skipped += 1;
        continue;
      }
    }

    const dateRaw = valueOf(row, preset.dateColumn);
    const occurredAt = parsePresetDate(dateRaw, preset.dateFormat);
    if (occurredAt == null) {
      result.errors.push(`Line ${line}: invalid date "${dateRaw}" in column "${preset.dateColumn}"`);
      continue;
    }

    const amountRaw = valueOf(row, preset.amountColumn);
    if (amountRaw !== "") {
      amountCells += 1;
      if (looksCommaDecimal(amountRaw)) commaDecimalCells += 1;
    }
    const signedAmount = parsePresetAmount(amountRaw, preset.decimalSeparator);
    if (signedAmount == null) {
      result.errors.push(`Line ${line}: invalid amount "${amountRaw}" in column "${preset.amountColumn}"`);
      continue;
    }
    const kind: TxKind = preset.signedAmounts ? (signedAmount < 0 ? "expense" : "income") : "expense";
    const amount = Math.abs(signedAmount);

    const currencyRaw = preset.currencyColumn ? valueOf(row, preset.currencyColumn).toUpperCase() : "EUR";
    if (!(SUPPORTED_IMPORT_CURRENCIES as readonly string[]).includes(currencyRaw)) {
      result.errors.push(`Line ${line}: unsupported currency "${currencyRaw}" (only USD and EUR can be imported)`);
      continue;
    }

    const description = preset.descriptionColumns
      .map((column) => valueOf(row, column))
      .filter((value) => value !== "")
      .join(" · ");
    if (description === "") {
      result.errors.push(`Line ${line}: empty description`);
      continue;
    }

    result.rows.push({
      occurredAt,
      description,
      kind,
      amount,
      currency: currencyRaw as CurrencyCode
    });
  }

  if (
    preset.decimalSeparator === "." &&
    amountCells > 0 &&
    commaDecimalCells / amountCells > 0.2
  ) {
    result.warnings.push(
      'Many amounts in this file look like comma decimals (e.g. "12,50"). They were parsed as comma-decimal anyway; double-check the amounts in the preview, or switch the decimal separator to comma.'
    );
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Generic column mapper                                               */
/* ------------------------------------------------------------------ */

export type GenericSignConvention = "signed" | "allExpense";

export interface GenericMapping {
  dateColumn: string;
  dateFormat: CsvDateFormat;
  amountColumn: string;
  decimalSeparator: CsvDecimalSeparator;
  signConvention: GenericSignConvention;
  descriptionColumns: string[];
}

/** Turn a hand-built column mapping into a runnable preset. */
export function buildGenericPreset(mapping: GenericMapping): CsvPreset {
  return {
    id: "generic",
    label: "Custom mapping",
    delimiter: ",",
    headerSignature: [],
    dateColumn: mapping.dateColumn,
    dateFormat: mapping.dateFormat,
    amountColumn: mapping.amountColumn,
    signedAmounts: mapping.signConvention === "signed",
    decimalSeparator: mapping.decimalSeparator,
    descriptionColumns: mapping.descriptionColumns.filter((c) => c !== "")
  };
}

/** Best-effort starting mapping for an unrecognised header. */
export function defaultGenericMapping(headerRow: string[]): GenericMapping {
  const header = normalizeHeaderCells(headerRow);
  const findBy = (...needles: string[]): string | undefined => {
    const idx = header.findIndex((name) => needles.some((needle) => name.includes(needle)));
    return idx === -1 ? undefined : headerRow[idx];
  };
  const dateColumn = findBy("date", "datum", "fecha") ?? headerRow[0] ?? "";
  const amountColumn = findBy("amount", "betrag", "importe", "sum") ?? headerRow[headerRow.length - 1] ?? "";
  const descriptionColumn =
    findBy("description", "payee", "partner", "merchant", "reference", "name", "concepto") ??
    headerRow.find((c) => c !== dateColumn && c !== amountColumn) ??
    "";
  return {
    dateColumn,
    dateFormat: "iso",
    amountColumn,
    decimalSeparator: ".",
    signConvention: "signed",
    descriptionColumns: [descriptionColumn]
  };
}

/** True when every column the mapping references exists in this header. */
export function mappingFitsHeader(mapping: GenericMapping, headerRow: string[]): boolean {
  const header = new Set(normalizeHeaderCells(headerRow));
  const referenced = [mapping.dateColumn, mapping.amountColumn, ...mapping.descriptionColumns].filter(
    (c) => c !== ""
  );
  return referenced.length > 0 && referenced.every((c) => header.has(c.trim().toLowerCase()));
}

/* ------------------------------------------------------------------ */
/* File analysis (delimiter sniff + routing)                           */
/* ------------------------------------------------------------------ */

export interface CsvAnalysis {
  matrix: string[][];
  delimiter: "," | ";";
  /** native: Numa's own export header; preset: known bank; unknown: needs the generic mapper. */
  kind: "empty" | "native" | "preset" | "unknown";
  preset?: CsvPreset;
}

/**
 * Parse a raw transactions CSV and decide which import path applies.
 * Tries comma first; if everything lands in a single column, retries with ";".
 */
export function analyzeTransactionsCsv(text: string): CsvAnalysis {
  let delimiter: "," | ";" = ",";
  let matrix = parseCsv(text, ",");
  if (matrix.length > 0 && matrix[0].length <= 1) {
    const retry = parseCsv(text, ";");
    if (retry.length > 0 && retry[0].length > matrix[0].length) {
      matrix = retry;
      delimiter = ";";
    }
  }
  if (matrix.length === 0 || matrix[0].every((cell) => cell.trim() === "")) {
    return { matrix: [], delimiter, kind: "empty" };
  }
  if (isNumaTransactionsHeader(matrix[0])) return { matrix, delimiter, kind: "native" };
  const preset = detectPreset(matrix[0]);
  if (preset) return { matrix, delimiter, kind: "preset", preset };
  return { matrix, delimiter, kind: "unknown" };
}

/* ------------------------------------------------------------------ */
/* Per-portfolio memory (localStorage)                                 */
/* ------------------------------------------------------------------ */

export interface CsvPresetMemory {
  presetId: CsvPresetId;
  accountId?: string;
  customMapping?: GenericMapping;
}

function memoryKey(portfolioId: string): string {
  return `numa:csvPreset:${portfolioId}`;
}

/** Last successful import choice for this portfolio, or null. */
export function loadCsvPresetMemory(portfolioId: string): CsvPresetMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(memoryKey(portfolioId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CsvPresetMemory;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.presetId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the choice that just imported successfully. Best-effort. */
export function saveCsvPresetMemory(portfolioId: string, memory: CsvPresetMemory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(memoryKey(portfolioId), JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}
