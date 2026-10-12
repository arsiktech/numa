# Module: Convex Backend

Convex is Numa's product data source, auth backend, mutation boundary, server-side validation layer, and rate-limit/audit storage.

## Responsibilities

- Define all product tables and indexes.
- Enforce auth, portfolio membership, editor/owner role checks, pod access, and native verified-identity linking.
- Provide query/mutation APIs for portfolios, finance, wealth, shared pods, AI action drafts, push, webhooks, ledger, and mobile snapshots.
- Deduplicate replayed mutations with `clientMutationId` receipts.
- Keep generated API bindings current.

## Key Files

- [`convex/schema.ts`](../../../convex/schema.ts) - tables and indexes.
- [`convex/lib/access.ts`](../../../convex/lib/access.ts) - `requireUser`, `ensureUser`, `requireMember`, `requireEditor`, `requireOwner`.
- [`convex/lib/mutationReceipts.ts`](../../../convex/lib/mutationReceipts.ts) - replay/idempotency helper.
- [`convex/moneyPods.ts`](../../../convex/moneyPods.ts) - shared pod CRUD, bundled reads, expenses, settlements, invite codes.
- [`convex/mobile.ts`](../../../convex/mobile.ts) - iOS/mobile bootstrap, portfolio/pod snapshots, mobile mutations.
- [`convex/ledger.ts`](../../../convex/ledger.ts) - ledger account/transaction/line foundation.
- [`convex/aiActions.ts`](../../../convex/aiActions.ts) - AI draft audit lifecycle.
- [`convex/rateLimits.ts`](../../../convex/rateLimits.ts) - server-side buckets consumed by Vercel functions.

## Public API

- Generated module API under [`convex/_generated/api.d.ts`](../../../convex/_generated/api.d.ts).
- Access helpers: `requireUser`, `ensureUser`, `requireMember`, `requireEditor`, `requireOwner`.
- Receipt helper: `withMutationReceipt`.
- Mobile functions such as `mobile:bootstrap`, `mobile:portfolioSnapshot`, `mobile:podSnapshot`, `mobile:createExpense`.

## Internal Structure

Schema tables cluster around users/profiles, portfolios/memberships, money/wealth records, money pods, AI/ops, ledger, and integration credentials. Mutations usually validate access first, normalize input, enforce domain invariants, then optionally wrap inserts/updates in `withMutationReceipt`.

## Dependencies

- Browser client depends on generated API bindings through Convex React hooks.
- Vercel API functions use `ConvexHttpClient` for rate limits, push subscriptions, merchant image storage, and webhook ingest.
- iOS uses mobile functions via Convex Swift.

## Notable Patterns / Gotchas

- Convex currency fields are currently `USD | EUR`; client types are wider.
- Generated files in `convex/_generated/` are tracked but generated. Run `npx convex codegen`; do not hand-edit.
- Ledger exists as a foundation, not yet the only source for all UI rollups.
- Pod member removal is tombstoned to preserve historical settlement math.
