/** Only categorical diagnostics cross the telemetry boundary. No free-text
 * message, stack, location query, user agent or user identity is retained. */
export function privateDiagnostic(input: { source: string; message: string; url?: string; release?: string }) {
  const sources = new Set(["boundary", "window", "promise", "route", "manual"]);
  const source = sources.has(input.source) ? input.source : "manual";
  const match = /^(TypeError|RangeError|ReferenceError|SyntaxError|AbortError|TimeoutError)(?::|$)/.exec(input.message);
  const message = match?.[1] ?? "ApplicationError";
  const allowedRoutes = new Set(["/", "/welcome", "/landing", "/privacy", "/terms", "/home", "/money", "/wealth", "/settings", "/pod", "/goals", "/income"]);
  let url = "/other";
  try {
    const pathname = new URL(input.url ?? "", "https://numa.invalid").pathname;
    if (allowedRoutes.has(pathname)) url = pathname;
  } catch { /* no arbitrary URL text */ }
  const release = /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(input.release ?? "") ? input.release! : "unknown";
  return { fingerprint: `private-v1:${source}:${message}:${url}:${release}`, source, message, url, release };
}
