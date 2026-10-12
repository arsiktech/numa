# Numa Code Wiki

Generated from local checkout `5ab39d4acec976dbf149b7f7e6f207a8e7ec0514` on 2026-07-06.

This is a historical code map, not standing agent instructions or release
evidence. Current guidance is in the root README, the
[runtime map](../agent-memory/architecture.md), and
[workflows](../agent-memory/workflows.md). Confirm module details in source.

Numa is a cloud-first money app: a Vite + React SPA backed by Convex Auth and Convex data, with Vercel functions for AI, receipt parsing, market/FX data, push, and webhook ingest. The product has three user modes: `light`, `advanced`, and `shared`; `/pod` is the mobile-first shared-money surface and should not leak personal wealth UI into shared mode.

## Key Concepts

- **Cloud-first runtime** - [`src/services/auth.tsx`](../../src/services/auth.tsx) refuses to mount the product app unless `VITE_NUMA_CLOUD_AUTH=1` and `VITE_CONVEX_URL` are configured.
- **Typed write boundary** - product writes flow through [`domainActions.ts`](../../src/services/domainActions.ts), [`podActions.ts`](../../src/services/podActions.ts), or [`writeQueue.tsx`](../../src/services/writeQueue.tsx), not raw reducer dispatch.
- **Convex mirror** - [`cloudStore.tsx`](../../src/services/cloudStore.tsx) maps Convex queries into client state consumed by hooks in [`store.tsx`](../../src/services/store.tsx).
- **Replay safety** - retryable mutations carry `clientMutationId` and use [`convex/lib/mutationReceipts.ts`](../../convex/lib/mutationReceipts.ts).
- **Shared-pot math** - settlements and group-party labels are central to `/pod`; shared pod rows must preserve all-history balances and tombstoned members.
- **AI is draft-first** - Numa AI can draft actions, but confirmed writes require explicit user action and audit rows in `aiActionDrafts`.

## Entrypoints

- [`src/main.tsx`](../../src/main.tsx) - applies theme, palette, mode, error reporting, asset recovery, font CSS, and install prompt capture before mounting React.
- [`src/App.tsx`](../../src/App.tsx) - lazy route tree, route error recovery, auth gate, onboarding gate, mode gates, and provider stack.
- [`src/routes/layout.tsx`](../../src/routes/layout.tsx) - authenticated shell: sidebar, bottom nav, floating add/search/scan cluster, banners, proximity docks, lazy import/tour dialogs.
- [`convex/schema.ts`](../../convex/schema.ts) - Convex table source of truth.
- [`api/chat.ts`](../../api/chat.ts), [`api/parse-receipt.ts`](../../api/parse-receipt.ts), [`api/webhooks/transaction.ts`](../../api/webhooks/transaction.ts) - cost/data boundary edge routes.
- [`ios/Numa/Numa/NumaApp.swift`](../../ios/Numa/Numa/NumaApp.swift) - native SwiftUI app root for the iOS companion/parity surface.

## High-Level Architecture

Numa has four runtime layers: browser SPA, Convex backend, Vercel edge functions, and an iOS SwiftUI companion that talks to Convex mobile functions. Client state is a hybrid: Convex is the product database, `cloudStore` mirrors it, and local reducer/localStorage paths remain for UI preferences, caches, compatibility, and offline queue state.

See [architecture.md](architecture.md) for diagrams and data flow.

## Module Map

| Module | Purpose |
| --- | --- |
| [App shell and routing](modules/app-shell-routing.md) | Boot, route tree, app-mode gates, authenticated layout, PWA/asset recovery. |
| [Auth, onboarding, settings](modules/auth-onboarding-settings.md) | Convex Auth, welcome flow, onboarding persistence, profile/settings/security controls. |
| [Client state and actions](modules/client-state-actions.md) | Store hooks, Convex mirror, typed domain/pod actions, durable write queue. |
| [Convex backend](modules/convex-backend.md) | Schema, access helpers, idempotency receipts, portfolios, pods, ledger, mobile API. |
| [Shared pod](modules/shared-pod.md) | `/pod` one-thumb UI, expense/split/settlement/member/group flows, invite links. |
| [Personal finance and wealth](modules/personal-finance-wealth.md) | Money, buckets, wealth, goals, holdings, assets, liabilities, recurring and analytics. |
| [Numa AI](modules/numa-ai.md) | `/numa`, day threads, local draft parser, chat/image generation, audit rows. |
| [Edge API](modules/edge-api.md) | Vercel functions, auth/rate-limit guards, provider calls, push and webhook ingest. |
| [Design system and UI](modules/design-system-ui.md) | Tokens, themes, motion, layout primitives, dialogs, nav, charts, brand assets. |
| [Quality, tooling, and iOS](modules/quality-tooling-ios.md) | Tests, CI, bundle budget, production smokes, scripts, Swift companion app. |

## Build And Test Commands

See [development workflows](../agent-memory/workflows.md) for current setup,
check selection, and authenticated QA requirements.

## Unknowns And Risky Areas

- Charting uses local SVG/math. Native setup and Convex Auth are documented in
  [ios/Numa/README.md](../../ios/Numa/README.md).
- `/pod` is large and high-risk. It has helper seams in `src/lib/pod*`, but the route file remains a dense UI/workflow surface.
- Ledger tables and APIs exist, but many UI rollups still read legacy finance tables.
- Shared-pot import/real data must remain append-only; do not rebuild or overwrite tuned settlements.
- Production deploy/env/migration/destructive Convex actions require explicit current-thread confirmation.

See [risks-and-unknowns.md](risks-and-unknowns.md).
