import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { readHeader } from "./rate-limit.js";
import { AI_SHARING_VERSION } from "../../convex/lib/privacyPolicy.js";

interface ApiRequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

export function requestDeploymentMatchesConfigured(
  requestedDeployment: string,
  configuredDeployment: string
) {
  try {
    return new URL(requestedDeployment).origin === new URL(configuredDeployment).origin;
  } catch {
    return false;
  }
}

/**
 * Resolves the signed-in Convex user id from a request's `Authorization:
 * Bearer <token>` header, or null if the token is missing/invalid. The paid
 * AI and OCR edge functions call this to require a real account before
 * spending on the provider and to meter usage per user.
 *
 * A fresh ConvexHttpClient is created per call so setting auth never leaks
 * into the shared (secret-authenticated) rate-limit client.
 */
function requestClient(request: ApiRequestLike): ConvexHttpClient | null {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";
  if (!url) return null;

  // Native clients declare which Convex deployment minted their bearer. A
  // Debug token can therefore never be presented to a production API host (or
  // vice versa) without failing before any paid provider call.
  const requestedDeployment = readHeader(request.headers, "x-numa-convex-deployment");
  if (
    requestedDeployment &&
    !requestDeploymentMatchesConfigured(requestedDeployment, url)
  ) return null;

  const header = readHeader(request.headers, "authorization");
  const token = header && /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "").trim() : null;
  if (!token) return null;

  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return client;
}

export async function getRequestUserId(request: ApiRequestLike): Promise<string | null> {
  try {
    const client = requestClient(request);
    if (!client) return null;
    const userId = await client.query(api.profiles.viewerId, {});
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}

/** A fresh authenticated query per request; no module-level consent cache. */
export async function getRequestAIIdentity(request: ApiRequestLike) {
  try {
    const client = requestClient(request);
    if (!client) return { state: "signed-out" as const };
    const permission = await client.query(api.privacy.status, {});
    if (!permission.userId) return { state: "signed-out" as const };
    if (permission.allowed !== true || permission.requiredVersion !== AI_SHARING_VERSION) return { state: "consent-required" as const };
    return { state: "allowed" as const, userId: String(permission.userId) };
  } catch {
    return { state: "unavailable" as const };
  }
}
