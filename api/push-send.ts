/**
 * POST /api/push-send — fan out a Web Push to every subscription owned by
 * the target user.
 *
 * Auth: this endpoint is INTERNAL. There is no end-user session here —
 * Convex Auth lives in the browser, not in serverless functions. To keep
 * the surface safe, callers must present a shared bearer that matches
 * `NUMA_PUSH_INTERNAL_SECRET`:
 *
 *   X-Numa-Push-Secret: <value>
 *
 * Server-side jobs (cron, edge functions, other API routes) hold the
 * secret. The browser never does.
 *
 * The function:
 *   1. Validates body and the shared secret.
 *   2. Looks up subscriptions in Convex via ConvexHttpClient (configured
 *      with VITE_CONVEX_URL).
 *   3. Sends a notification to each via the `web-push` library.
 *   4. Prunes any subscription that returns 404/410 (user uninstalled the
 *      app, browser revoked the subscription, etc).
 *   5. Returns { delivered, failed, removed }.
 */

import webpush from "web-push";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { consumeRateLimit } from "./_utils/rate-limit.js";

declare const process: {
  env: Record<string, string | undefined>;
};

interface SendRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: {
    userId?: string;
    title?: string;
    body?: string;
    url?: string;
  };
}

interface JsonResponse {
  json(payload: unknown): void;
  end(): void;
}

interface SendResponse {
  setHeader(name: string, value: string): this;
  status(statusCode: number): JsonResponse;
}

interface PushSubscriptionRow {
  _id: Id<"pushSubscriptions">;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function readHeader(
  headers: SendRequest["headers"],
  name: string
): string | null {
  if (!headers) return null;
  const lowered = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== lowered) continue;
    if (Array.isArray(v)) return v[0] ?? null;
    if (typeof v === "string") return v;
  }
  return null;
}

let cachedClient: ConvexHttpClient | null = null;
function getConvexClient(): ConvexHttpClient {
  if (cachedClient) return cachedClient;
  const url =
    process.env.CONVEX_URL ??
    process.env.VITE_CONVEX_URL ??
    "";
  if (!url) {
    throw new Error("Missing CONVEX_URL / VITE_CONVEX_URL for push-send");
  }
  cachedClient = new ConvexHttpClient(url);
  return cachedClient;
}

let vapidConfigured = false;
function configureVapidOnce(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NUMA_PUSH_VAPID_PUBLIC;
  const privateKey = process.env.NUMA_PUSH_VAPID_PRIVATE;
  const subject =
    process.env.NUMA_PUSH_VAPID_SUBJECT ?? "mailto:noreply@numa.local";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export default async function handler(
  request: SendRequest,
  response: SendResponse
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedSecret = process.env.NUMA_PUSH_INTERNAL_SECRET;
  if (!expectedSecret) {
    response.status(500).json({
      error: "Server is not configured (NUMA_PUSH_INTERNAL_SECRET missing)."
    });
    return;
  }
  const providedSecret = readHeader(request.headers, "x-numa-push-secret");
  if (providedSecret !== expectedSecret) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!configureVapidOnce()) {
    response.status(500).json({
      error:
        "Server is not configured (NUMA_PUSH_VAPID_PUBLIC / NUMA_PUSH_VAPID_PRIVATE missing)."
    });
    return;
  }

  const userId = request.body?.userId;
  const title = request.body?.title;
  const bodyText = request.body?.body;
  const url = request.body?.url;

  if (!userId || typeof userId !== "string") {
    response.status(400).json({ error: "Send a non-empty `userId`." });
    return;
  }
  if (!title || typeof title !== "string") {
    response.status(400).json({ error: "Send a non-empty `title`." });
    return;
  }
  if (!bodyText || typeof bodyText !== "string") {
    response.status(400).json({ error: "Send a non-empty `body`." });
    return;
  }
  if (url !== undefined && typeof url !== "string") {
    response.status(400).json({ error: "`url` must be a string if provided." });
    return;
  }

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/push-send",
    limit: 120,
    windowMs: 60_000,
    identity: userId
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
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

  let subs: PushSubscriptionRow[];
  try {
    subs = (await client.query(api.pushSubscriptions.listForUser, {
      userId: userId as Id<"users">,
      serverSecret: expectedSecret
    })) as PushSubscriptionRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    response.status(502).json({ error: "Convex query failed", message });
    return;
  }

  if (subs.length === 0) {
    response.setHeader("Cache-Control", "no-store");
    response
      .status(200)
      .json({ delivered: 0, failed: 0, removed: 0, total: 0 });
    return;
  }

  // No preview-detail opt-in exists. Caller-provided content can contain money,
  // names or capability URLs, so none of it leaves the server for a lock screen.
  const payload = JSON.stringify({ title: "Numa Pro", body: "Your update is ready. Open Numa Pro to view it.", url: "/" });

  let delivered = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        );
        delivered += 1;
      } catch (err) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          try {
            await client.mutation(api.pushSubscriptions.pruneByEndpoint, {
              endpoint: sub.endpoint,
              serverSecret: expectedSecret
            });
            removed += 1;
          } catch {
            failed += 1;
          }
        } else {
          failed += 1;
        }
      }
    })
  );

  response.setHeader("Cache-Control", "no-store");
  response
    .status(200)
    .json({ delivered, failed, removed, total: subs.length });
}
