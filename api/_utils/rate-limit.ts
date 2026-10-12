import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

declare const process: {
  env: Record<string, string | undefined>;
};

interface ApiRequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponseLike {
  setHeader(name: string, value: string): unknown;
}

interface RateLimitOptions {
  route: string;
  limit: number;
  windowMs: number;
  identity?: string;
}

interface RateLimitResult {
  allowed: boolean;
  status: number;
  retryAfter?: number;
  error?: string;
}

let cachedClient: ConvexHttpClient | null = null;

export function readHeader(headers: ApiRequestLike["headers"], name: string): string | null {
  if (!headers) return null;
  const lowered = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowered) continue;
    if (Array.isArray(value)) return value[0] ?? null;
    if (typeof value === "string") return value;
  }
  return null;
}

function getConvexClient(): ConvexHttpClient {
  if (cachedClient) return cachedClient;
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";
  if (!url) throw new Error("Convex URL is not configured.");
  cachedClient = new ConvexHttpClient(url);
  return cachedClient;
}

async function sha256Hex(input: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requestIdentity(request: ApiRequestLike) {
  // IP only. The User-Agent used to be part of the key, but it is fully
  // attacker-controlled, so rotating it minted a fresh bucket per request and
  // defeated the limit. Authenticated routes pass an explicit per-user
  // identity instead (see options.identity).
  const forwardedFor = readHeader(request.headers, "x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? readHeader(request.headers, "x-real-ip") ?? "unknown";
}

export async function consumeRateLimit(
  request: ApiRequestLike,
  response: ApiResponseLike,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const serverSecret =
    process.env.NUMA_RATE_LIMIT_INTERNAL_SECRET ??
    process.env.NUMA_PUSH_INTERNAL_SECRET;
  if (!serverSecret) {
    return {
      allowed: false,
      status: 500,
      error: "Server is not configured for rate limiting."
    };
  }

  let client: ConvexHttpClient;
  try {
    client = getConvexClient();
  } catch {
    return {
      allowed: false,
      status: 500,
      error: "Server is not configured for rate limiting."
    };
  }

  const identityHash = await sha256Hex(options.identity ?? requestIdentity(request));
  const result = await client.mutation(api.rateLimits.consume, {
    serverSecret,
    route: options.route,
    identityHash,
    limit: options.limit,
    windowMs: options.windowMs,
    now: Date.now()
  });

  response.setHeader("X-RateLimit-Remaining", String(result.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    response.setHeader("Retry-After", String(retryAfter));
    return {
      allowed: false,
      status: 429,
      retryAfter,
      error: "Rate limit exceeded."
    };
  }

  return { allowed: true, status: 200 };
}

/**
 * Deployment-wide daily budget for paid AI routes — the backstop above the
 * per-user limits. With per-user metering alone, N users can each spend up to
 * their personal cap; this bounds the TOTAL provider spend per UTC day no
 * matter how many accounts exist. Limits are request counts (a stable proxy
 * for cost at fixed model/route) and configurable per route via env so the
 * ceiling can be raised without a code change:
 *
 *   NUMA_AI_DAILY_LIMIT_CHAT  (default 400 requests/day)
 *   NUMA_AI_DAILY_LIMIT_SCAN  (default 200 requests/day)
 *
 * Reuses the same Convex-backed buckets as per-user limiting, keyed to the
 * fixed identity "global", with a 24h UTC window. Fails closed like
 * consumeRateLimit (no secret/Convex → request rejected).
 */
export async function consumeDailyGlobalBudget(
  request: ApiRequestLike,
  response: ApiResponseLike,
  options: { route: string; envVar: string; defaultLimit: number }
): Promise<RateLimitResult> {
  const parsed = Number(process.env[options.envVar]);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : options.defaultLimit;
  return consumeRateLimit(request, response, {
    route: `${options.route}:daily-budget`,
    identity: "global",
    limit,
    windowMs: 24 * 60 * 60 * 1000
  });
}

export function allowedOrigin(request: ApiRequestLike): string | null {
  const configured = process.env.NUMA_ALLOWED_ORIGIN ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = readHeader(request.headers, "origin");
  if (!configured || !origin) return null;
  const normalized = configured.startsWith("http") ? configured : `https://${configured}`;
  return origin === normalized ? origin : null;
}
