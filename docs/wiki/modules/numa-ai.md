# Module: Numa AI

Numa AI is the advanced conversational money surface. It combines deterministic day threads and local draft parsing with optional AI Gateway chat/image generation behind feature flags, auth, rate limits, and audit rows.

## Product Thesis: Agent Money Safety

Source studied on 2026-07-07: local synthesis
a saved copy of the article (not in this repo).
Treat it as product framing, not an implementation spec or official transcript.

The relevant idea for Numa is not "build another autonomous agent." It is that
AI touching money needs infrastructure around permissions, spend limits,
trusted memory, sandboxed execution, replay/debug, and audit evidence. Numa's
consumer-facing version of that thesis is a money assistant that can notice and
propose actions, but only execute through bounded, user-confirmed, typed writes.

Numa-relevant themes from the agent-startup map:

- Spend controls: budgets, caps, provider rate limits, action limits, and clear
  kill switches before any expensive or financial operation.
- Delegated authority: explicit user confirmation, owner/editor/viewer roles,
  scoped permissions, and no blind provider/account linking.
- Trusted memory: grounded context from real portfolios, pods, transactions,
  holdings, FX, goals, and source-aware summaries instead of generic chat.
- Replay/debug: `aiActionDrafts`, idempotency receipts, error states, and
  evidence trails that explain why an AI proposal existed.
- Sandbox first: test/simulated rails, draft previews, and provider/API guards
  before anything that could spend money, expose data, or mutate finances.

## Responsibilities

- Render `/numa` as day-thread plus catalog views over real transactions.
- Keep deterministic thread/catolog behavior working with AI disabled.
- Build grounded chat context from portfolio, transactions, categories, assets, liabilities, holdings, quotes, goals, pods, and FX.
- Parse local Notice -> Propose -> Execute action drafts before calling AI.
- Create, confirm, cancel, and fail `aiActionDrafts` rows for cloud drafts.
- Generate/cache merchant visuals without paying twice for the same merchant/category key.

## Key Files

- [`src/routes/advanced/NumaPage.tsx`](../../../src/routes/advanced/NumaPage.tsx) - thin route shell.
- [`src/features/numa/NumaOS.tsx`](../../../src/features/numa/NumaOS.tsx) - full-screen thread/catalog experience.
- [`src/features/numa/engine.ts`](../../../src/features/numa/engine.ts) - pure context building, local draft parsing, draft copy, execution helpers, friendly errors.
- [`src/features/numa/threads.ts`](../../../src/features/numa/threads.ts) - day keys, localStorage thread cache, deterministic day briefs.
- [`src/features/numa/useSettledMoneyContext.ts`](../../../src/features/numa/useSettledMoneyContext.ts) - avoids drafting against pre-hydration local placeholder ids.
- [`src/components/features/AIChatDialog.tsx`](../../../src/components/features/AIChatDialog.tsx) - quick chat dialog sharing the same engine.
- [`api/chat.ts`](../../../api/chat.ts) - AI Gateway streaming route.
- [`api/merchant-image.ts`](../../../api/merchant-image.ts), [`convex/merchantImages.ts`](../../../convex/merchantImages.ts) - image generation/cache boundary.
- [`convex/aiActions.ts`](../../../convex/aiActions.ts) - draft audit lifecycle.

## Public API

- `buildContext`, `parseActionDraft`, `executeDraft`, `draftTitle`, `draftSubtitle`, `draftDoneMessage`.
- `loadThread`, `saveThread`, `groupByDay`, `dayBrief`.
- Convex mutations: `aiActions.createDraft`, `confirmDraft`, `cancelDraft`, `markFailed`.

## Internal Structure

`NumaOS` builds a money context from store hooks, groups transactions by day, stores chat per day in localStorage, and tries `parseActionDraft` before calling `/api/chat`. If a local draft is cloud-safe, it creates an `aiActionDrafts` row. Confirmed drafts execute via typed actions and then update the audit row.

## Dependencies

- Uses store hooks, `useCloudMutations`, `useDomainActions`, Convex auth token, FX rates, merchant image hooks, Framer Motion, and CSS/WebGL fallback components.
- Server routes use Vercel AI SDK Gateway, Convex HTTP client, and rate-limit utilities.

## Notable Patterns / Gotchas

- AI feature flag controls provider-backed pieces, not the entire `/numa` surface.
- Draft parsing must wait for settled cloud money context to avoid local placeholder ids.
- Do not let chat/receipt/voice directly mutate finance data without confirmation and audit.
- Merchant image cache keys are shared generic merchant/category keys; do not store personal data in prompts/keys.
