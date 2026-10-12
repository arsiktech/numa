/** Keep application abuse counters through the entire enforcement window and
 * one additional day. Expiry is stamped on NEW rows only; legacy cleanup needs
 * an explicit inventory/authorization, not a hidden migration on deployment. */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
export function rateLimitExpiresAt(windowStart: number, windowMs: number): number {
  const expiresAt = windowStart + windowMs + RATE_LIMIT_RETENTION_MS;
  if (!Number.isFinite(expiresAt)) throw new Error("Invalid rate-limit expiry");
  return expiresAt;
}
