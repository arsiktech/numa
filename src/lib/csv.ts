import type {
  Asset,
  AssetKind,
  Category,
  CategoryKind,
  CurrencyCode,
  CryptoWallet,
  Holding,
  Liability,
  LiabilityKind,
  PodExpense,
  PodSettlement,
  Transaction,
  TxKind,
} from "./types";
import { looksCommaDecimal } from "./csvPresets";

/* ------------------------------------------------------------------ */
/* Generic CSV                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse a CSV string into a matrix of cells. RFC 4180-compliant:
 * - Handles quoted fields containing commas, newlines, and escaped quotes (`""`).
 * - Strips a leading UTF-8 BOM (U+FEFF) if present.
 * - Accepts both `\r\n` and `\n` line terminators.
 * - Returns an empty array if the input is empty / whitespace.
 * - `delimiter` defaults to `","`; pass `";"` for semicolon-separated exports
 *   (common in European bank CSVs).
 */
export function parseCsv(text: string, delimiter: "," | ";" = ","): string[][] {
  if (text.length === 0) return [];

  // Strip BOM
  let input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  // Normalize CRLF -> LF (safe inside quotes too: a quoted CRLF becomes LF, which the parser still captures verbatim once it's inside quotes)
  input = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && input[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted section
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush trailing field/row (unless input ended on a newline with no data)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop a single trailing empty row from a final newline followed by nothing
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") rows.pop();
  }

  return rows;
}

/**
 * Serialize a matrix of cells into an RFC 4180-compliant CSV string.
 * Cells containing commas, quotes, or newlines are quoted; internal quotes are doubled.
 * Rows are joined with `\r\n` (the spec's canonical line terminator).
 */
export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/**
 * Spreadsheet formula-injection guard (OWASP CSV injection): text cells
 * beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed with an
 * apostrophe so Excel / Sheets / Numbers treat them as literal text instead
 * of executing them. Plain numbers the app itself serializes (e.g. "-12.5",
 * "1e-7") are left untouched.
 */
function needsFormulaGuard(value: string): boolean {
  if (!/^[=+\-@\t\r]/.test(value)) return false;
  return !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(value);
}

function escapeCell(value: string): string {
  const guarded = needsFormulaGuard(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const TX_KINDS: readonly TxKind[] = ["income", "expense"] as const;
const CATEGORY_KINDS: readonly CategoryKind[] = ["income", "expense"] as const;
const ASSET_KINDS: readonly AssetKind[] = [
  "cash",
  "real_estate",
  "vehicle",
  "collectible",
  "other",
] as const;
const LIABILITY_KINDS: readonly LiabilityKind[] = [
  "credit_card",
  "loan",
  "mortgage",
  "other",
] as const;
const CURRENCIES: readonly CurrencyCode[] = ["USD", "EUR"] as const;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function isoFromUnixMs(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse a strict `yyyy-mm-dd` date into unix ms (UTC midnight), or null. */
export function unixMsFromIsoDate(iso: string): number | null {
  const trimmed = iso.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

function parseNumber(value: string): number | null {
  // Normalize the same way csvPresets.parsePresetAmount does, so a Numa export
  // edited in a European-locale spreadsheet ("1.234,56", "12,50") round-trips
  // instead of every amount row being rejected (QA 2026-06-24).
  let trimmed = value.trim().replace(/[\s\u00a0]/g, "");
  if (trimmed === "") return null;
  if (looksCommaDecimal(trimmed)) {
    trimmed = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    trimmed = trimmed.replace(/,/g, "");
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function getField(row: string[], index: number): string {
  return index < row.length ? (row[index] ?? "") : "";
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

/* ------------------------------------------------------------------ */
/* Domain writers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Serialize transactions to CSV with the header
 * `date,description,kind,amount,currency,category,account,notes`.
 * Category and account names are resolved via the supplied lookup maps;
 * unknown IDs serialize to an empty cell.
 */
export function transactionsToCsv(
  transactions: Transaction[],
  categoryNameById: Record<string, string>,
  accountNameById: Record<string, string>,
): string {
  const header = ["date", "description", "kind", "amount", "currency", "category", "account", "notes"];
  const rows: string[][] = [header];
  for (const tx of transactions) {
    rows.push([
      isoFromUnixMs(tx.occurredAt),
      tx.description,
      tx.kind,
      String(tx.amount),
      tx.currency,
      tx.categoryId ? categoryNameById[tx.categoryId] ?? "" : "",
      tx.accountId ? accountNameById[tx.accountId] ?? "" : "",
      tx.notes ?? "",
    ]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize assets to CSV with the header `name,kind,balance,currency,notes`.
 */
export function assetsToCsv(assets: Asset[]): string {
  const header = ["name", "kind", "balance", "currency", "notes"];
  const rows: string[][] = [header];
  for (const a of assets) {
    rows.push([a.name, a.kind, String(a.balance), a.currency, a.notes ?? ""]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize liabilities to CSV with the header
 * `name,kind,balance,currency,interestRate,dueDate,notes`.
 * `dueDate` is rendered as ISO `yyyy-mm-dd` when present.
 */
export function liabilitiesToCsv(liabilities: Liability[]): string {
  const header = ["name", "kind", "balance", "currency", "interestRate", "dueDate", "notes"];
  const rows: string[][] = [header];
  for (const l of liabilities) {
    rows.push([
      l.name,
      l.kind,
      String(l.balance),
      l.currency,
      l.interestRate != null ? String(l.interestRate) : "",
      l.dueDate != null ? isoFromUnixMs(l.dueDate) : "",
      l.notes ?? "",
    ]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize holdings to CSV with the header
 * `symbol,name,kind,quantity,costBasis,currency,acquiredAt`.
 */
export function holdingsToCsv(holdings: Holding[]): string {
  const header = ["symbol", "name", "kind", "quantity", "costBasis", "currency", "acquiredAt"];
  const rows: string[][] = [header];
  for (const h of holdings) {
    rows.push([
      h.symbol,
      h.name,
      h.kind,
      String(h.quantity),
      String(h.costBasis),
      h.currency,
      isoFromUnixMs(h.acquiredAt),
    ]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize tracked public wallets and their last-good read-only snapshots.
 * Snapshot collections stay in JSON cells so an export preserves every
 * supported token and DeFi position without flattening them into lossy rows.
 */
export function cryptoWalletsToCsv(wallets: CryptoWallet[]): string {
  const header = [
    "label",
    "publicAddress",
    "addressType",
    "includeInNetWorth",
    "chains",
    "tokenValueUsd",
    "defiValueUsd",
    "debtValueUsd",
    "totalValueUsd",
    "snapshotUpdatedAt",
    "partial",
    "walletCreatedAtMs",
    "walletUpdatedAtMs",
    "tokensJson",
    "defiPositionsJson",
    "snapshotJson",
  ];
  const rows: string[][] = [header];
  for (const wallet of wallets) {
    const snapshot = wallet.snapshot;
    rows.push([
      wallet.label,
      wallet.address,
      wallet.addressType,
      String(wallet.includeInNetWorth),
      snapshot?.chains.join("; ") ?? "",
      snapshot ? String(snapshot.tokenValueUsd) : "",
      snapshot ? String(snapshot.defiValueUsd) : "",
      snapshot ? String(snapshot.debtValueUsd) : "",
      snapshot ? String(snapshot.totalValueUsd) : "",
      snapshot ? new Date(snapshot.updatedAt).toISOString() : "",
      snapshot ? String(snapshot.partial) : "",
      String(wallet.createdAt),
      String(wallet.updatedAt),
      snapshot ? JSON.stringify(snapshot.tokens) : "",
      snapshot ? JSON.stringify(snapshot.defiPositions) : "",
      snapshot ? JSON.stringify(snapshot) : "",
    ]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize pod expenses to CSV with the header
 * `date,description,amount,currency,payer,participants,splitMode,card,notes`.
 */
export function podExpensesToCsv(
  expenses: PodExpense[],
  memberNameById: Record<string, string>,
): string {
  const header = [
    "date",
    "description",
    "amount",
    "currency",
    "payer",
    "participants",
    "splitMode",
    "card",
    "notes",
  ];
  const rows: string[][] = [header];
  for (const expense of expenses) {
    rows.push([
      isoFromUnixMs(expense.occurredAt),
      expense.description,
      String(expense.amount),
      expense.currency,
      memberNameById[expense.paidByMemberId] ?? "",
      expense.participantMemberIds.map((id) => memberNameById[id] ?? id).join("; "),
      expense.splitMode,
      expense.paidByCard ?? "",
      expense.notes ?? "",
    ]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize pod settlements to CSV with the header
 * `date,from,to,amount,currency,note`.
 */
export function podSettlementsToCsv(
  settlements: PodSettlement[],
  memberNameById: Record<string, string>,
): string {
  const header = ["date", "from", "to", "amount", "currency", "note"];
  const rows: string[][] = [header];
  for (const settlement of settlements) {
    rows.push([
      isoFromUnixMs(settlement.occurredAt),
      memberNameById[settlement.fromMemberId] ?? "",
      memberNameById[settlement.toMemberId] ?? "",
      String(settlement.amount),
      settlement.currency,
      settlement.note ?? "",
    ]);
  }
  return serializeCsv(rows);
}

/**
 * Serialize categories to CSV with the header
 * `name,kind,icon,color,emoji,monthlyLimit`.
 */
export function categoriesToCsv(categories: Category[]): string {
  const header = ["name", "kind", "icon", "color", "emoji", "monthlyLimit"];
  const rows: string[][] = [header];
  for (const c of categories) {
    rows.push([
      c.name,
      c.kind,
      c.icon,
      c.color,
      c.emoji ?? "",
      c.monthlyLimit != null ? String(c.monthlyLimit) : ""
    ]);
  }
  return serializeCsv(rows);
}

/* ------------------------------------------------------------------ */
/* Domain readers                                                      */
/* ------------------------------------------------------------------ */

/** Result of an import: parsed rows plus any per-line validation errors. */
export interface ImportResult<T> {
  rows: T[];
  errors: { line: number; message: string }[];
}

/**
 * Shape of a transaction parsed from CSV. The caller is responsible for
 * generating `id`, attaching `portfolioId` / `createdByUserId`, and resolving
 * `categoryName` / `accountName` to actual IDs.
 */
export type TransactionImportRow = Omit<
  Transaction,
  "id" | "portfolioId" | "createdByUserId" | "splits"
> & { categoryName?: string; accountName?: string };

/** Shape of an asset parsed from CSV. */
export type AssetImportRow = Omit<Asset, "id" | "portfolioId" | "updatedAt">;

/** Shape of a liability parsed from CSV. */
export type LiabilityImportRow = Omit<Liability, "id" | "portfolioId" | "updatedAt">;

/** Shape of a category parsed from CSV. */
export type CategoryImportRow = Omit<Category, "id" | "portfolioId">;

interface HeaderMap {
  [columnName: string]: number;
}

function buildHeaderMap(header: string[]): HeaderMap {
  const map: HeaderMap = {};
  header.forEach((name, idx) => {
    map[name.trim().toLowerCase()] = idx;
  });
  return map;
}

function cell(row: string[], header: HeaderMap, name: string): string {
  const idx = header[name];
  if (idx === undefined) return "";
  return getField(row, idx).trim();
}

/**
 * Walk CSV data rows (header consumed, blank rows skipped, 1-based line
 * numbers preserved) delegating each row to `parseRow`. All four entity
 * parsers below share this skeleton.
 */
function parseCsvRows<T>(
  text: string,
  parseRow: (row: string[], header: HeaderMap) => T | string
): ImportResult<T> {
  const result: ImportResult<T> = { rows: [], errors: [] };
  const matrix = parseCsv(text);
  if (matrix.length === 0) return result;

  const header = buildHeaderMap(matrix[0]);
  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r];
    const line = r + 1;
    if (isBlankRow(row)) continue;
    const outcome = parseRow(row, header);
    if (typeof outcome === "string") result.errors.push({ line, message: outcome });
    else result.rows.push(outcome);
  }
  return result;
}

/**
 * Parse a transactions CSV. The header row is consumed; malformed rows are
 * skipped with a descriptive error referencing the original 1-based line number.
 */
export function parseTransactionsCsv(text: string): ImportResult<TransactionImportRow> {
  return parseCsvRows(text, (row, header) => {
    const dateRaw = cell(row, header, "date");
    const description = cell(row, header, "description");
    const kindRaw = cell(row, header, "kind").toLowerCase();
    const amountRaw = cell(row, header, "amount");
    const currencyRaw = cell(row, header, "currency").toUpperCase();
    const categoryName = cell(row, header, "category");
    const accountName = cell(row, header, "account");
    const notes = cell(row, header, "notes");

    const occurredAt = unixMsFromIsoDate(dateRaw);
    if (occurredAt == null) {
      return `Invalid or missing date (expected yyyy-mm-dd): "${dateRaw}"`;
    }
    if (description === "") return "Missing description";
    if (!isOneOf(kindRaw, TX_KINDS)) {
      return `Invalid kind "${kindRaw}" (expected income|expense)`;
    }
    const amount = parseNumber(amountRaw);
    if (amount == null || amount < 0) return `Invalid amount: "${amountRaw}"`;
    if (!isOneOf(currencyRaw, CURRENCIES)) {
      return `Invalid currency "${currencyRaw}" (expected EUR|USD)`;
    }

    const out: TransactionImportRow = {
      occurredAt,
      description,
      kind: kindRaw,
      amount,
      currency: currencyRaw,
    };
    if (notes) out.notes = notes;
    if (categoryName) out.categoryName = categoryName;
    if (accountName) out.accountName = accountName;
    return out;
  });
}

/**
 * Parse an assets CSV. Returns parsed rows and line-numbered errors for any
 * malformed entries (which are skipped, not fatal).
 */
export function parseAssetsCsv(text: string): ImportResult<AssetImportRow> {
  return parseCsvRows(text, (row, header) => {
    const name = cell(row, header, "name");
    const kindRaw = cell(row, header, "kind").toLowerCase();
    const balanceRaw = cell(row, header, "balance");
    const currencyRaw = cell(row, header, "currency").toUpperCase();
    const notes = cell(row, header, "notes");

    if (name === "") return "Missing name";
    if (!isOneOf(kindRaw, ASSET_KINDS)) {
      return `Invalid asset kind "${kindRaw}" (expected ${ASSET_KINDS.join("|")})`;
    }
    const balance = parseNumber(balanceRaw);
    if (balance == null) return `Invalid balance: "${balanceRaw}"`;
    if (!isOneOf(currencyRaw, CURRENCIES)) {
      return `Invalid currency "${currencyRaw}" (expected EUR|USD)`;
    }

    const out: AssetImportRow = { name, kind: kindRaw, balance, currency: currencyRaw };
    if (notes) out.notes = notes;
    return out;
  });
}

/**
 * Parse a liabilities CSV. `interestRate` and `dueDate` are optional; invalid
 * values for either short-circuit the row with a line-numbered error.
 */
export function parseLiabilitiesCsv(text: string): ImportResult<LiabilityImportRow> {
  return parseCsvRows(text, (row, header) => {
    const name = cell(row, header, "name");
    const kindRaw = cell(row, header, "kind").toLowerCase();
    const balanceRaw = cell(row, header, "balance");
    const currencyRaw = cell(row, header, "currency").toUpperCase();
    const interestRaw = cell(row, header, "interestrate");
    const dueDateRaw = cell(row, header, "duedate");
    const notes = cell(row, header, "notes");

    if (name === "") return "Missing name";
    if (!isOneOf(kindRaw, LIABILITY_KINDS)) {
      return `Invalid liability kind "${kindRaw}" (expected ${LIABILITY_KINDS.join("|")})`;
    }
    const balance = parseNumber(balanceRaw);
    if (balance == null) return `Invalid balance: "${balanceRaw}"`;
    if (!isOneOf(currencyRaw, CURRENCIES)) {
      return `Invalid currency "${currencyRaw}" (expected EUR|USD)`;
    }

    let interestRate: number | undefined;
    if (interestRaw !== "") {
      const parsed = parseNumber(interestRaw);
      if (parsed == null) return `Invalid interestRate: "${interestRaw}"`;
      interestRate = parsed;
    }

    let dueDate: number | undefined;
    if (dueDateRaw !== "") {
      const parsed = unixMsFromIsoDate(dueDateRaw);
      if (parsed == null) {
        return `Invalid dueDate (expected yyyy-mm-dd): "${dueDateRaw}"`;
      }
      dueDate = parsed;
    }

    const out: LiabilityImportRow = { name, kind: kindRaw, balance, currency: currencyRaw };
    if (interestRate !== undefined) out.interestRate = interestRate;
    if (dueDate !== undefined) out.dueDate = dueDate;
    if (notes) out.notes = notes;
    return out;
  });
}

/**
 * Parse a categories CSV. The `emoji` and `monthlyLimit` columns are accepted
 * for forward-compatibility but currently dropped, as the `Category` type does
 * not yet carry those fields. `sortOrder` defaults to the row's position.
 */
export function parseCategoriesCsv(text: string): ImportResult<CategoryImportRow> {
  let order = 0;
  return parseCsvRows(text, (row, header) => {
    const name = cell(row, header, "name");
    const kindRaw = cell(row, header, "kind").toLowerCase();
    const icon = cell(row, header, "icon");
    const color = cell(row, header, "color");

    if (name === "") return "Missing name";
    if (!isOneOf(kindRaw, CATEGORY_KINDS)) {
      return `Invalid category kind "${kindRaw}" (expected income|expense)`;
    }

    const out: CategoryImportRow = {
      name,
      kind: kindRaw,
      icon: icon || "tag",
      color: color || "#888888",
      sortOrder: order,
    };
    order += 1;
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* Browser download helper                                             */
/* ------------------------------------------------------------------ */

/**
 * Trigger a browser download of the supplied CSV text as `filename`.
 * No-op on non-browser runtimes (SSR, tests).
 */
export function downloadCsv(filename: string, csvText: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
