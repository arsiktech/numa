/**
 * Turns a Numa Shared balance read into one Pro record per counterparty.
 * In Shared, a positive amount is owed to the unit and a negative amount means the unit owes.
 * Here that is an asset (money owed to you) or a liability. A failed read does not change amounts.
 */
import { checkPortalUrl, type Post } from "./portalSource";

export const DEFAULT_BALANCES_URL = "https://shared.numaworth.com/pro/balances";

const MAX_MESSAGE = 140;
const INTEGER = /^-?\d{1,15}$/;
const MAX_MINOR = 9_000_000_000_000n;
const clip = (s: string) => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);

export type SharedLine = { unitId: string; label: string; minorUnits: string };
export type SharedReading =
  | { status: "ok"; currency: "EUR" | "USD"; lines: SharedLine[] }
  | { status: "stale"; message: string };

export type HeldRecord = {
  id: string;
  table: "assets" | "liabilities";
  balance: number;
  currency: "EUR" | "USD";
  /** Set when this record already follows a counterparty. A hand-entered record has none. */
  unitId?: string;
};

export type RecordWrite = {
  id?: string;
  table: "assets" | "liabilities";
  unitId: string;
  label: string;
  balance: number;
  currency: "EUR" | "USD";
};

export type RecordPlan = { writes: RecordWrite[]; deletes: string[] };

/** The public balances address, or NUMA_SHARED_BALANCES_URL when that is an https host. */
export function sharedBalancesUrl(): string | null {
  return checkPortalUrl(process.env.NUMA_SHARED_BALANCES_URL?.trim() || DEFAULT_BALANCES_URL);
}

function sideOf(minorUnits: string): { table: "assets" | "liabilities"; balance: number } | "zero" | null {
  if (!INTEGER.test(minorUnits)) return null;
  const minor = BigInt(minorUnits);
  const abs = minor < 0n ? -minor : minor;
  if (abs > MAX_MINOR) return null;
  if (minor === 0n) return "zero";
  return { table: minor < 0n ? "liabilities" : "assets", balance: Number(abs) / 100 };
}

/** The JSON from POST /pro/balances. Anything incomplete stays stale instead of becoming zero. */
export function readSharedBalances(text: string): SharedReading {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { status: "stale", message: "Numa Shared answered in a form Numa can't read" }; }
  const body = data as {
    status?: unknown; currency?: unknown; exponent?: unknown; yourMinorUnits?: unknown;
    counterparties?: Array<{ unitId?: unknown; label?: unknown; minorUnits?: unknown }>;
  };
  if (body.status === "unavailable") return { status: "stale", message: "Numa Shared couldn't finish the balances" };
  if (body.status !== "ok") return { status: "stale", message: "Numa Shared answered in a form Numa can't read" };
  if (body.currency !== "EUR" && body.currency !== "USD") return { status: "stale", message: "Numa Shared uses a currency this space can't store" };
  if (body.exponent !== 2 || typeof body.yourMinorUnits !== "string" || !Array.isArray(body.counterparties)) {
    return { status: "stale", message: "Numa Shared answered in a form Numa can't read" };
  }
  const lines: SharedLine[] = [];
  let sum = 0n;
  const seen = new Set<string>();
  for (const row of body.counterparties) {
    if (typeof row.unitId !== "string" || typeof row.label !== "string" || typeof row.minorUnits !== "string") {
      return { status: "stale", message: "Numa Shared answered in a form Numa can't read" };
    }
    if (!row.unitId || row.unitId.length > 80 || seen.has(row.unitId) || sideOf(row.minorUnits) === null) {
      return { status: "stale", message: "Numa Shared answered in a form Numa can't read" };
    }
    seen.add(row.unitId);
    lines.push({ unitId: row.unitId, label: row.label.slice(0, 60), minorUnits: row.minorUnits });
    sum += BigInt(row.minorUnits);
  }
  if (!INTEGER.test(body.yourMinorUnits) || BigInt(body.yourMinorUnits) !== sum) {
    return { status: "stale", message: "Numa Shared balances did not add up" };
  }
  return { status: "ok", currency: body.currency, lines };
}

/**
 * One synced record per counterparty. A hand-entered record is never written or deleted.
 * A sign change removes the previous synced side so the amount counts once.
 */
export function planRecords(held: readonly HeldRecord[], lines: readonly SharedLine[], currency: "EUR" | "USD"): RecordPlan {
  const synced = held.filter((row) => row.unitId);
  const writes: RecordWrite[] = [];
  const deletes: string[] = [];
  const mentioned = new Set<string>();
  for (const line of lines) {
    mentioned.add(line.unitId);
    const side = sideOf(line.minorUnits);
    const rows = synced.filter((row) => row.unitId === line.unitId);
    if (side === "zero" || side === null) {
      for (const row of rows) writes.push({ id: row.id, table: row.table, unitId: line.unitId, label: line.label, balance: 0, currency: row.currency });
      continue;
    }
    const keep = rows.find((row) => row.table === side.table);
    for (const row of rows) if (row !== keep) deletes.push(row.id);
    writes.push({ id: keep?.id, table: side.table, unitId: line.unitId, label: line.label, balance: side.balance, currency });
  }
  for (const row of synced) {
    if (mentioned.has(row.unitId!)) continue;
    writes.push({ id: row.id, table: row.table, unitId: row.unitId!, label: "", balance: 0, currency: row.currency });
  }
  return { writes, deletes };
}

/** Asks Numa Shared once. The key travels only in this request's Authorization header. */
export async function fetchShared(url: string, key: string, householdId: string, post: Post): Promise<SharedReading> {
  const headers = { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` };
  let response: Awaited<ReturnType<Post>>;
  try { response = await post(url, headers, JSON.stringify({ household: householdId })); } catch (error) {
    const why = error instanceof Error ? (error.name === "TimeoutError" ? "it took too long" : error.message) : "";
    return { status: "stale", message: clip(why ? `Numa Shared didn't answer: ${why}` : "Numa Shared didn't answer") };
  }
  if (response.status === 401 || response.status === 403) return { status: "stale", message: "Numa Shared refused the key" };
  if (response.status === 404) return { status: "stale", message: "Numa Shared could not read that household" };
  if (!response.ok) return { status: "stale", message: `Numa Shared answered with an error (${response.status})` };
  return readSharedBalances(response.text);
}
