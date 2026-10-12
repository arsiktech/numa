# Module: Client State And Actions

This module presents product state to React components and routes writes through typed, replay-aware action layers.

## Responsibilities

- Maintain local compatibility state for UI prefs, cache/fallback paths, and reducer-era surfaces.
- Mirror Convex data into `CloudState` with route-scoped list/detail queries.
- Prefer Convex data in read hooks while preserving local fallback behavior.
- Route portfolio/money/wealth writes through domain actions.
- Route shared pod writes through pod actions.
- Queue transient/offline writes with `clientMutationId` and retry/backoff.

## Key Files

- [`src/services/store.tsx`](../../../src/services/store.tsx) - reducer, starter state, read hooks, local compatibility state.
- [`src/services/cloudStore.tsx`](../../../src/services/cloudStore.tsx) - Convex query mirror, mappers, route-scoped fetch flags, mutation bundle.
- [`src/services/domainActions.ts`](../../../src/services/domainActions.ts) - typed portfolio, transaction, category, asset, liability, holding, goal, recurring, snapshot writes.
- [`src/services/podActions.ts`](../../../src/services/podActions.ts) - typed money pod, member, group, expense, settlement, invite writes.
- [`src/services/writeQueue.tsx`](../../../src/services/writeQueue.tsx) - durable local retry queue, executors, retry delay, transient-error handling.
- [`src/lib/cloudSnapshotCache.ts`](../../../src/lib/cloudSnapshotCache.ts) - read-only startup snapshots for heavy shared pod first paint.

## Public API

- Store hooks such as `useNuma`, `useCurrentUser`, `useCurrentPortfolioId`, `useTransactions`, `useMoneyPods`, `usePodExpenses`.
- `useCloudState()`, `useCloudMutations()`, `isCloudId()`.
- `useDomainActions()`, `usePodActions()`, `useWriteQueue()`.
- `makeClientMutationId(operation)`.

## Internal Structure

The provider stack is `CloudDataProvider -> StoreProvider -> WriteQueueProvider`. `cloudStore` fetches lightweight lists first and route-scoped details later. `store` exposes hooks that select cloud data when available. Action hooks decide cloud vs local path, generate `clientMutationId`, and call `writeQueue.runOrQueue` for replayable operations.

## Dependencies

- Uses Convex React hooks and generated API types.
- Depends on `src/lib/types.ts` for shared client type shapes.
- Depends on Convex mutations accepting matching payloads and receipt behavior.

## Notable Patterns / Gotchas

- Do not add new product cloud writes via raw dispatch.
- If a new authenticated route reads portfolio detail hooks, update `fetchPortfolioDetails` in `cloudStore.tsx`.
- `cloud.byPod[pod.id]` must exist before a known cloud pod renders real settlement math; fallback empty arrays create false zeroes.
- Queue executors must cover every queued operation kind.
