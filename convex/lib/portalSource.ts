/**
 * A debt that follows a company portal: the portal's agent link (MCP) has a read-only
 * `company_balance` tool that says how far the company's balance is below what it owes. The debt
 * is that shortfall. A reading the portal can't complete leaves the debt as it was, never zero.
 */

export type PortalReading =
  | { status: "ok"; shortfall: number; currency: "EUR" | "USD"; asOf: number }
  | { status: "incomplete"; message: string };

export type Post = (url: string, headers: Record<string, string>, body: string) => Promise<{ ok: boolean; status: number; text: string }>;

const MAX_MESSAGE = 140;
const clip = (s: string) => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);

/** An https link to a named host; no credentials, local hosts or bare IP addresses. Returns the cleaned link or null. */
export function checkPortalUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > 500) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return null;
  return url.toString();
}

/** The `company_balance` result: the shortfall when the portal could give a complete difference. */
export function readCompanyBalance(text: string, now: number): PortalReading {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { status: "incomplete", message: "The portal answered in a form Numa can't read" }; }
  const d = data as { asOf?: unknown; summary?: unknown; difference?: { amount?: { amount?: unknown; currency?: unknown } } | null };
  const amount = d.difference?.amount?.amount;
  const currency = d.difference?.amount?.currency;
  const value = typeof amount === "string" || typeof amount === "number" ? Number(amount) : NaN;
  if (!Number.isFinite(value) || (currency !== "EUR" && currency !== "USD")) {
    return { status: "incomplete", message: clip(typeof d.summary === "string" && d.summary ? d.summary : "The portal couldn't give a complete difference") };
  }
  const asOf = typeof d.asOf === "string" ? Date.parse(d.asOf) : NaN;
  return { status: "ok", shortfall: Math.max(0, Math.round(-value * 100) / 100), currency, asOf: Number.isFinite(asOf) ? asOf : now };
}

/** The JSON-RPC reply, whether sent as plain JSON or as a server-sent event. */
function rpcReply(body: string): { result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> }; error?: { message?: string } } | null {
  const candidates = [body, ...body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && ("result" in parsed || "error" in parsed)) return parsed;
    } catch { /* try the next form */ }
  }
  return null;
}

/** Asks the portal once. The key, when given, travels only in this request's Authorization header. */
export async function fetchCompanyBalance(url: string, key: string | undefined, post: Post, now: number): Promise<PortalReading | { status: "failed"; message: string }> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key ? { authorization: `Bearer ${key}` } : {}) };
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "company_balance", arguments: {} } });
  let response: Awaited<ReturnType<Post>>;
  try { response = await post(url, headers, body); } catch (error) {
    // Say what went wrong, so a link that never reaches the portal can be told apart from a slow one.
    const why = error instanceof Error ? (error.name === "TimeoutError" ? "it took too long" : error.message) : "";
    return { status: "failed", message: clip(why ? `The portal didn't answer: ${why}` : "The portal didn't answer") };
  }
  if (response.status === 401 || response.status === 403) return { status: "failed", message: "The portal refused the link. It may have been disconnected" };
  if (!response.ok) return { status: "failed", message: `The portal answered with an error (${response.status})` };
  const reply = rpcReply(response.text);
  if (!reply) return { status: "failed", message: "The portal answered in a form Numa can't read" };
  if (reply.error) return { status: "failed", message: clip(reply.error.message || "The portal returned an error") };
  const text = reply.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (reply.result?.isError) return { status: "failed", message: clip(text || "The portal returned an error") };
  return readCompanyBalance(text, now);
}
