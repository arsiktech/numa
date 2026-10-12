# Module: Shared Pod

The shared pod module is the primary mobile-first joint-expense workflow: create a pot, invite people, label cards, record expenses, split by people/groups/custom shares, settle partially, and keep the balance clear.

## Responsibilities

- Make shared mode home render the pod directly.
- Keep personal wealth/portfolio surfaces hidden in shared mode.
- Support one-thumb add expense, smart/batch quick add, category inference, paid-by-card labels, member cards, groups, invite links, leave/delete, history, and settlements.
- Use one settlement math implementation shared between client and server/mobile.
- Preserve all-history balances and tombstoned members.

## Key Files

- [`src/routes/pod/page.tsx`](../../../src/routes/pod/page.tsx) - main `/pod` route, sheets, desktop dashboard, first-run setup, join links.
- [`src/services/podActions.ts`](../../../src/services/podActions.ts) - typed pod writes and queue integration.
- [`convex/moneyPods.ts`](../../../convex/moneyPods.ts) - pod backend, bundled reads, access checks, validation, invite codes.
- [`convex/mobile.ts`](../../../convex/mobile.ts) - mobile pod snapshot and pod mutations.
- [`convex/lib/settlementMath.ts`](../../../convex/lib/settlementMath.ts) - shared settlement core.
- [`src/lib/podSettlement.ts`](../../../src/lib/podSettlement.ts), [`src/lib/podSettlementView.ts`](../../../src/lib/podSettlementView.ts) - client settlement derivations and view labels.
- [`src/lib/podCategories.ts`](../../../src/lib/podCategories.ts), [`src/lib/podExpenseCopy.ts`](../../../src/lib/podExpenseCopy.ts), [`src/lib/podPageHelpers.ts`](../../../src/lib/podPageHelpers.ts) - route helpers.

## Public API

- `usePodActions()` for pod writes.
- Store hooks: `useMoneyPods`, `usePodMembers`, `usePodGroups`, `usePodExpenses`, `usePodSettlements`.
- Convex functions: `moneyPods.listMine`, `moneyPods.getBundle`, `moneyPods.addExpense`, `moneyPods.updateExpense`, `moneyPods.addSettlement`, `moneyPods.createInviteCode`, `moneyPods.joinPodByCode`.

## Internal Structure

`PodPage` selects the active pod and handles `?join=CODE`. `PodSurface` derives balances, settlement views, member/group labels, setup tasks, and sheet state. Expense, history, settle, and people sheets own detailed workflows. Pure pod helpers keep category inference, settlement math, copy, rail names, and balance labels testable.

## Dependencies

- Uses store/cloud hooks, FX rates, domain actions for category creation, pod actions for writes, Framer Motion, lucide icons, and design tokens.
- Backend depends on `requirePodEditor`, `requirePodCurrency`, member/group validators, and mutation receipts.

## Notable Patterns / Gotchas

- Custom split basis points must sum to exactly `10000`.
- Pod rows must use pod currency until server-side FX exists.
- Settlements reject self-transfers.
- Group labels should be visible counterparties; do not imply debt inside a family/group.
- Do not render fallback empty arrays as real settled data while cloud bundle loads.
