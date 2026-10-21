import { APPLE_ISSUER, verifyAppleSignedClaims, type AppleJwk } from "./appleIdentity";
import { APPLE_CLIENTS } from "./appleTokens";
export type AppleRevocationEvent = { subject: string; audience: string; at: number; eventId: string };
/** No email or notification payload is persisted. Only destructive, signed Apple events are accepted. */
export async function verifyAppleRevocationEvent(token: string, keys: AppleJwk[], now: number): Promise<AppleRevocationEvent | null> {
  const claims = await verifyAppleSignedClaims(token, keys);
  if (claims.iss !== APPLE_ISSUER || typeof claims.aud !== "string" || !(APPLE_CLIENTS as readonly string[]).includes(claims.aud)) throw new Error("Invalid Apple notification audience");
  if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat) || claims.iat * 1000 > now + 60000 || now - claims.iat * 1000 >= 86400000) throw new Error("Stale Apple notification");
  if (claims.exp !== undefined && (typeof claims.exp !== "number" || claims.exp * 1000 < now)) throw new Error("Expired Apple notification");
  if (typeof claims.jti !== "string" || !claims.jti || claims.jti.length > 200) throw new Error("Invalid Apple event id");
  let event: unknown = claims.events;
  if (typeof event === "string") { try { event = JSON.parse(event); } catch { throw new Error("Invalid Apple event"); } }
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid Apple event");
  const e = event as Record<string, unknown>;
  if (e.type !== "consent-revoked" && e.type !== "account-deleted") return null;
  if (typeof e.sub !== "string" || !e.sub || e.sub.length > 300 || typeof e.event_time !== "number" || !Number.isFinite(e.event_time)) throw new Error("Invalid Apple event identity");
  const at = e.event_time * 1000;
  if (at > now + 60000 || now - at >= 86400000 || at < 0) throw new Error("Stale Apple event");
  return { subject: e.sub, audience: claims.aud, at, eventId: claims.jti };
}
