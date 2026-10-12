# API Surface

Numa has two API families: Convex functions under [`convex/`](../../convex) and Vercel functions under [`api/`](../../api). Convex is the product data source; Vercel functions are provider-facing or webhook-facing boundaries.

## Vercel Functions

| Route | File | Purpose | Guard pattern |
| --- | --- | --- | --- |
| `POST /api/chat` | [`api/chat.ts`](../../api/chat.ts) | Streams Numa AI replies through Vercel AI Gateway. | Signed-in Convex user token, per-user rate limit, daily global AI budget. |
| `POST /api/parse-receipt` | [`api/parse-receipt.ts`](../../api/parse-receipt.ts) | Parses receipt images or voice transcripts into structured transactions. | Signed-in user token, per-user rate limit, daily global scan budget. |
| `POST /api/merchant-image` | [`api/merchant-image.ts`](../../api/merchant-image.ts) | Generates and caches transparent merchant studio-shot PNGs in Convex storage. | Signed-in user token, Convex cache first, per-user rate limit, daily global image budget, internal secret for storage mutations. |
| `GET /api/market-quotes` | [`api/market-quotes.ts`](../../api/market-quotes.ts) | Fetches crypto/equity quotes from CoinGecko, Alpha Vantage, Stooq, or seeded fallback. | Convex-backed rate limit. |
| `GET /api/fx-rates` | [`api/fx-rates.ts`](../../api/fx-rates.ts) | Fetches EUR-based FX rates from Frankfurter or fallback rates. | Convex-backed rate limit. |
| `POST /api/push-send` | [`api/push-send.ts`](../../api/push-send.ts) | Internal web-push fanout and dead-subscription pruning. | `X-Numa-Push-Secret`, VAPID env, per-user rate limit. |
| `POST /api/webhooks/transaction` | [`api/webhooks/transaction.ts`](../../api/webhooks/transaction.ts) | External transaction ingest using one-time-shown user webhook tokens. | Token hash, internal secret to Convex, rate limit keyed by token hash, Convex atomic validation/write. |

Shared utilities:

- [`api/_utils/auth.ts`](../../api/_utils/auth.ts) resolves a Convex user id from a bearer token.
- [`api/_utils/rate-limit.ts`](../../api/_utils/rate-limit.ts) consumes Convex-backed rate buckets and applies CORS allow-origin behavior.
- [`api/_utils/ai.ts`](../../api/_utils/ai.ts) centralizes the AI Gateway model slug.

## Convex Function Groups

| Area | Files |
| --- | --- |
| Auth/profile/account | [`auth.ts`](../../convex/auth.ts), [`authConfig.ts`](../../convex/authConfig.ts), [`authManagement.ts`](../../convex/authManagement.ts), [`profiles.ts`](../../convex/profiles.ts), [`users.ts`](../../convex/users.ts) |
| Access/idempotency | [`lib/access.ts`](../../convex/lib/access.ts), [`lib/mutationReceipts.ts`](../../convex/lib/mutationReceipts.ts) |
| Personal finance | [`portfolios.ts`](../../convex/portfolios.ts), [`transactions.ts`](../../convex/transactions.ts), [`categories.ts`](../../convex/categories.ts), [`recurring.ts`](../../convex/recurring.ts), [`goals.ts`](../../convex/goals.ts) |
| Wealth/capital | [`assets.ts`](../../convex/assets.ts), [`liabilities.ts`](../../convex/liabilities.ts), [`holdings.ts`](../../convex/holdings.ts), [`wealthSnapshots.ts`](../../convex/wealthSnapshots.ts), [`ledger.ts`](../../convex/ledger.ts) |
| Shared pod | [`moneyPods.ts`](../../convex/moneyPods.ts), [`lib/settlementMath.ts`](../../convex/lib/settlementMath.ts), [`mobile.ts`](../../convex/mobile.ts) |
| AI/ops | [`aiActions.ts`](../../convex/aiActions.ts), [`merchantImages.ts`](../../convex/merchantImages.ts), [`rateLimits.ts`](../../convex/rateLimits.ts), [`pushSubscriptions.ts`](../../convex/pushSubscriptions.ts), [`webhookTokens.ts`](../../convex/webhookTokens.ts), [`clientErrors.ts`](../../convex/clientErrors.ts) |

## API Rules

- Do not expose raw Convex product mutations through unauthenticated serverless routes.
- Hash external tokens before forwarding to Convex.
- Keep provider calls after auth/token validation, input validation, and rate limiting.
- Prefer one Convex mutation for aggregate writes that must be replay-safe.
