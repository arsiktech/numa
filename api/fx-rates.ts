import { consumeRateLimit } from "./_utils/rate-limit.js";
import { parseFxQuote } from "../src/lib/fx.js";

interface FxRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface FxResponse {
  setHeader(name: string, value: string): void;
  status(statusCode: number): {
    json(payload: unknown): void;
  };
}

export default async function handler(request: FxRequest, response: FxResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/fx-rates",
    limit: 120,
    windowMs: 60_000
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
    return;
  }

  try {
    const result = await fetch("https://api.frankfurter.app/latest?from=EUR", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000)
    });
    if (!result.ok) {
      throw new Error(`Frankfurter responded ${result.status}`);
    }

    const data = await result.json();
    const quote = parseFxQuote({ ...data, provider: "frankfurter" });
    response.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    response.status(200).json(quote);
  } catch {
    response.setHeader("Cache-Control", "no-store");
    response.status(503).json({ error: "FX rates are temporarily unavailable." });
  }
}
