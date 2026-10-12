# Module: Edge API

The edge API module is a set of Vercel serverless functions for provider-facing, paid, or external integration work.

## Responsibilities

- Protect AI, OCR, market, FX, push, and webhook provider calls with method checks, input validation, auth or token validation, CORS rules, and Convex-backed rate limits.
- Keep browser-exposed serverless routes separate from Convex product mutations.
- Use internal secrets only server-side.
- Normalize provider fallbacks where local/dev or provider outage would otherwise break passive UI.

## Key Files

- [`api/_utils/auth.ts`](../../../api/_utils/auth.ts) - bearer token to Convex user id.
- [`api/_utils/rate-limit.ts`](../../../api/_utils/rate-limit.ts) - rate-limit bucket consumption, global AI budget helper, allow-origin helper.
- [`api/_utils/ai.ts`](../../../api/_utils/ai.ts) - shared AI Gateway model slug.
- [`api/chat.ts`](../../../api/chat.ts) - streaming assistant.
- [`api/parse-receipt.ts`](../../../api/parse-receipt.ts) - receipt/voice parser.
- [`api/merchant-image.ts`](../../../api/merchant-image.ts) - merchant image cache/generation.
- [`api/market-quotes.ts`](../../../api/market-quotes.ts) - market quote fanout.
- [`api/fx-rates.ts`](../../../api/fx-rates.ts) - FX proxy/fallback.
- [`api/push-send.ts`](../../../api/push-send.ts) - internal web-push fanout.
- [`api/webhooks/transaction.ts`](../../../api/webhooks/transaction.ts) - external token-auth transaction ingest.
- [`vite.config.ts`](../../../vite.config.ts) - dev-only fallbacks for `/api/fx-rates` and `/api/market-quotes` under Vite.

## Public API

See [api.md](../api.md) for route table.

## Internal Structure

Each route owns method and body validation. Paid routes resolve a Convex user id from the bearer token, then consume per-user and daily global buckets before provider calls. Internal routes use `NUMA_PUSH_INTERNAL_SECRET`. Webhook ingest hashes the raw webhook token locally and delegates final validation/write to Convex.

## Dependencies

- Convex HTTP client and generated API for rate limits, push, webhook, merchant image storage.
- Vercel AI Gateway and external market/FX providers.
- `web-push` for browser push delivery.

## Notable Patterns / Gotchas

- Vite dev serves `api/*.ts` as source modules unless `vite.config.ts` middleware handles a path; do not use Vite dev as proof for all serverless routes.
- Avoid wildcard CORS for sensitive routes.
- Keep provider calls after guards.
- Do not log or return secrets/tokens.
