# Risks And Unknowns

Historical wiki context. Current operating and verification rules are in
the root README; confirm any suspected issue in current source.

## High-Risk Areas

- **Production and data safety** - do not run production deploys, env changes, migrations, wipes, or destructive Convex operations without exact current-thread confirmation.
- **Shared-pot real data** - the shared-pot import lane is append-only. Do not full-rebuild, overwrite, or regenerate human-tuned settlements.
- **Auth/onboarding gates** - `/welcome` is the real pre-auth surface; `/login` and `/signup` redirect there. Existing cloud users must not be re-onboarded as fresh accounts.
- **Cloud/local id switching** - active portfolio selection must prefer cloud ids. Drafts or writes during hydration can strand work on local placeholder ids if not settled first.
- **`/pod` density** - [`src/routes/pod/page.tsx`](../../src/routes/pod/page.tsx) is a large, critical workflow file. It depends on pure helpers in `src/lib/pod*`, but changes should still include focused route and money-math verification.
- **Queued writes** - every queued operation kind needs an executor in [`writeQueue.tsx`](../../src/services/writeQueue.tsx). Offline child writes that need server-generated parent ids are dangerous unless handled atomically server-side.
- **API spend/data boundaries** - AI/OCR/market/push/webhook routes must keep auth or token validation, input parsing, and rate limits before provider calls.

## Unknowns / Needs Fresh Verification

- **Ledger adoption** - Convex ledger tables and mutations exist, but most UI rollups still read legacy finance tables. New finance movement should be checked against the ledger direction before adding more legacy-only logic.
- **Vercel runtime settings** - docs and CI say Node 24.x; confirm Vercel dashboard before runtime-sensitive dependency or release work.
- **AI Gateway availability** - AI chat/image/receipt routes require AI Gateway credits and env keys; deterministic `/numa` pieces work with AI off.
- **Authenticated E2E availability** - auth suites skip without `NUMA_E2E_*` credentials or disposable QA flags.

## Before Implementation, Inspect Next

- The specific route/component the change touches plus its nearest helpers.
- [`ERRORS.md`](../../ERRORS.md) for recurring traps in that area.
- [`DECISIONS.md`](../../DECISIONS.md) for constraints that would make a naive refactor unsafe.
- The relevant Convex mutation and client action boundary for any product write.
- Focused unit tests under `src/**/*.test.ts(x)` and E2E coverage in [`tests/numa.spec.ts`](../../tests/numa.spec.ts).
- Use the [current verification map](../../README.md#current-app-and-verification)
  and affected rendered journeys for UI changes.
