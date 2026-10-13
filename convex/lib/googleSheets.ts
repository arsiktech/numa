/**
 * Reading a Google Sheet the person links to. Only the sheet's ID and tab ID are taken from
 * what they paste; the request always goes to Google's own CSV export, so a link can never
 * point the server anywhere else.
 */

export type SheetRef = { id: string; gid: string | null };

/** Max size of an export. A wealth log or a year of bank rows is far smaller. */
export const MAX_SHEET_BYTES = 5_000_000;

export function parseSheetLink(input: string): SheetRef | null {
  const text = input.trim();
  if (!text || text.length > 2_000) return null;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const match = url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/);
  if (!match) return null;
  // The open tab is in the hash (#gid=123) or the query (?gid=123).
  const gid = url.hash.match(/gid=(\d{1,12})/)?.[1] ?? url.searchParams.get("gid");
  return { id: match[1], gid: gid && /^\d{1,12}$/.test(gid) ? gid : null };
}

/**
 * A link naming a tab exports that tab as CSV. A plain share link names no tab, so the whole
 * workbook comes as Excel and the app picks the tab it understands.
 */
export function exportUrl(ref: SheetRef): string {
  return ref.gid
    ? `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=csv&gid=${ref.gid}`
    : `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=xlsx`;
}

export type SheetFetch =
  | { status: "ok"; csv: string }
  | { status: "ok"; xlsx: string }
  | { status: "private" | "missing" | "tooBig" | "failed" };

const XLSX_TYPE = /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i;

function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** A whole workbook, passed to the app as base64 Excel. */
export function classifyWorkbook(httpStatus: number, contentType: string, bytes: Uint8Array): SheetFetch {
  if (httpStatus === 401 || httpStatus === 403) return { status: "private" };
  if (httpStatus === 404) return { status: "missing" };
  if (httpStatus !== 200) return { status: "failed" };
  if (!XLSX_TYPE.test(contentType)) return { status: "private" };
  if (bytes.length > MAX_SHEET_BYTES) return { status: "tooBig" };
  return { status: "ok", xlsx: base64(bytes) };
}

/** What Google's answer means. A private sheet answers with a sign-in page, not CSV. */
export function classifyExport(httpStatus: number, contentType: string, body: string): SheetFetch {
  if (httpStatus === 401 || httpStatus === 403) return { status: "private" };
  if (httpStatus === 404) return { status: "missing" };
  if (httpStatus !== 200) return { status: "failed" };
  if (!/text\/csv|text\/plain|application\/octet-stream/i.test(contentType) || /^\s*<!doctype html|^\s*<html/i.test(body)) return { status: "private" };
  if (body.length > MAX_SHEET_BYTES) return { status: "tooBig" };
  return { status: "ok", csv: body };
}

/**
 * Where a redirect from the export may lead. A shared sheet hands the file over from
 * googleusercontent.com; a private one sends the browser to sign in. Anything else is refused.
 */
export function redirectTarget(location: string | null, from: string): { kind: "follow"; url: string } | { kind: "private" } | { kind: "refused" } {
  if (!location) return { kind: "refused" };
  let url: URL;
  try { url = new URL(location, from); } catch { return { kind: "refused" }; }
  if (url.protocol !== "https:") return { kind: "refused" };
  if (url.hostname === "accounts.google.com") return { kind: "private" };
  if (url.hostname === "docs.google.com" || /^[a-z0-9-]+\.googleusercontent\.com$/.test(url.hostname)) return { kind: "follow", url: url.toString() };
  return { kind: "refused" };
}
