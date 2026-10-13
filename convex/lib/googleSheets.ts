/**
 * Reading a Google Sheet the person links to. Only the sheet's ID and tab ID are taken from
 * what they paste; the request always goes to Google's own CSV export, so a link can never
 * point the server anywhere else.
 */

export type SheetRef = { id: string; gid: string | null };

/** Max size of an exported tab. A wealth log or a year of bank rows is far smaller. */
export const MAX_SHEET_BYTES = 2_000_000;

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

export function exportUrl(ref: SheetRef): string {
  return `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=csv${ref.gid ? `&gid=${ref.gid}` : ""}`;
}

export type SheetFetch =
  | { status: "ok"; csv: string }
  | { status: "private" | "missing" | "tooBig" | "failed" };

/** What Google's answer means. A private sheet answers with a sign-in page, not CSV. */
export function classifyExport(httpStatus: number, contentType: string, body: string): SheetFetch {
  if (httpStatus === 401 || httpStatus === 403) return { status: "private" };
  if (httpStatus === 404) return { status: "missing" };
  if (httpStatus !== 200) return { status: "failed" };
  if (!/text\/csv|text\/plain|application\/octet-stream/i.test(contentType) || /^\s*<!doctype html|^\s*<html/i.test(body)) return { status: "private" };
  if (body.length > MAX_SHEET_BYTES) return { status: "tooBig" };
  return { status: "ok", csv: body };
}
