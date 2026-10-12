import { allowedOrigin } from "./_utils/rate-limit.js";

/** Optional merchant-art generation is off for beta. Free-text counterparties
 * must not become provider prompts or shared cache keys without an explicit
 * ownership/retention contract. Existing built-in illustrations need no AI. */
export default async function handler(
  request: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown },
  response: { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void; end(): void } },
): Promise<void> {
  const origin = allowedOrigin(request);
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") { response.status(204).end(); return; }
  if (request.method !== "POST") { response.status(405).json({ error: "Method not allowed" }); return; }
  response.status(410).json({ code: "MERCHANT_ART_DISABLED", error: "AI merchant art is unavailable in this beta. Built-in illustrations remain available." });
}
