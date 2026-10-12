/**
 * POST /api/webhooks/transaction — accepts a transaction payload from an
 * external service (Zapier / IFTTT / Apple Shortcuts / email-to-API) that
 * carries one of the user's personal webhook tokens, then writes it into
 * the target portfolio.
 *
 * Auth model:
 *   1. Caller passes the raw `numa_wh_<hex>` token in the JSON body.
 *   2. We SHA-256 it here and forward only the hash to Convex along with
 *      the shared `NUMA_PUSH_INTERNAL_SECRET` (same secret already used by
 *      push-send, deliberately reused for ops simplicity).
 *   3. Convex's `webhookTokens.ingestTransaction` is the single source of
 *      truth — it re-validates the hash, re-checks the issuing user's
 *      portfolio membership, resolves categoryName -> categoryId, and
 *      inserts the row atomically. We never expose `transactions.add`
 *      directly because that mutation pulls userId from an auth session
 *      this serverless function does not have.
 *
 * CORS: no wildcard. Browser preflight is allowed only for configured origins;
 * server-to-server webhook callers do not need CORS.
 */

import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../convex/_generated/api.js";
import { allowedOrigin, consumeRateLimit } from "../_utils/rate-limit.js";

declare const process: {
  env: Record<string, string | undefined>;
};

interface WebhookRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface JsonResponse {
  json(payload: unknown): void;
  end(): void;
}

interface WebhookResponse {
  setHeader(name: string, value: string): this;
  status(statusCode: number): JsonResponse;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function applyCors(request: WebhookRequest, response: WebhookResponse): void {
  const origin = allowedOrigin(request);
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.setHeader(name, value);
  }
}

const BodySchema = z.object({
  token: z
    .string()
    .min(8)
    .regex(/^numa_wh_[0-9a-f]+$/i, "token must look like numa_wh_<hex>"),
  amount: z.number().positive().finite(),
  currency: z.enum(["USD", "EUR"]),
  kind: z.enum(["income", "expense"]),
  description: z.string().min(1).max(200),
  // Accept ISO strings ("2026-05-14T10:00:00Z") OR epoch millis. Anything
  // Date.parse can chew on is fine.
  occurredAt: z.union([z.string(), z.number()]),
  categoryName: z.string().max(60).optional(),
  notes: z.string().max(500).optional()
});

let cachedClient: ConvexHttpClient | null = null;
function getConvexClient(): ConvexHttpClient {
  if (cachedClient) return cachedClient;
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";
  if (!url) {
    throw new Error("Missing CONVEX_URL / VITE_CONVEX_URL for webhook ingest");
  }
  cachedClient = new ConvexHttpClient(url);
  return cachedClient;
}

async function sha256Hex(input: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(
  request: WebhookRequest,
  response: WebhookResponse
): Promise<void> {
  applyCors(request, response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const serverSecret = process.env.NUMA_PUSH_INTERNAL_SECRET;
  if (!serverSecret) {
    response.status(500).json({
      error: "Server is not configured (NUMA_PUSH_INTERNAL_SECRET missing)."
    });
    return;
  }

  const parsed = BodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid payload",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message
      }))
    });
    return;
  }
  const body = parsed.data;

  // Normalize occurredAt to epoch millis.
  const occurredAtMs =
    typeof body.occurredAt === "number"
      ? body.occurredAt
      : Date.parse(body.occurredAt);
  if (!Number.isFinite(occurredAtMs)) {
    response.status(400).json({
      error: "Invalid `occurredAt` — must be ISO date or epoch millis."
    });
    return;
  }

  let client: ConvexHttpClient;
  try {
    client = getConvexClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    response.status(500).json({ error: message });
    return;
  }

  const tokenHash = await sha256Hex(body.token);

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/webhooks/transaction",
    limit: 60,
    windowMs: 60_000,
    identity: tokenHash
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
    return;
  }

  // Single atomic Convex call — validates the token, re-checks the issuer's
  // portfolio membership, resolves categoryName, inserts the transaction,
  // and bumps usage counters in one transaction.
  type IngestResult =
    | { ok: true; transactionId: string; portfolioId: string; categoryResolved: boolean }
    | { ok: false; reason: "invalid_token" | "wrong_scope" | "access_revoked" };

  let result: IngestResult;
  try {
    result = (await client.mutation(api.webhookTokens.ingestTransaction, {
      tokenHash,
      serverSecret,
      occurredAt: occurredAtMs,
      description: body.description,
      kind: body.kind,
      amount: body.amount,
      currency: body.currency,
      categoryName: body.categoryName,
      notes: body.notes
    })) as IngestResult;
  } catch (err) {
    void err;
    response.status(502).json({ error: "Webhook ingest failed" });
    return;
  }

  response.setHeader("Cache-Control", "no-store");

  if (result.ok === false) {
    // Token miss / scope mismatch / membership revoked all collapse to 401
    // here — we deliberately don't leak which one to the caller.
    const reason = result.reason;
    const status = reason === "wrong_scope" ? 403 : 401;
    response.status(status).json({
      ok: false,
      error:
        reason === "invalid_token"
          ? "Invalid token"
          : reason === "wrong_scope"
            ? "Token does not have add-transaction scope"
            : "Token issuer no longer has edit access on the portfolio"
    });
    return;
  }

  response.status(200).json({
    ok: true,
    id: result.transactionId,
    portfolioId: result.portfolioId,
    categoryResolved: result.categoryResolved
  });
}
