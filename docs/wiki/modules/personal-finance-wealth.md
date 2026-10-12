# Module: Personal Finance And Wealth

This module covers personal transactions, categories, budgets, buckets/goals, recurring rules, assets, liabilities, holdings, net-worth snapshots, and analytical helpers.

## Responsibilities

- Light mode: weekly spend, buckets, money/history, simple capture, settings.
- Advanced mode: capital/wealth, Numa AI, goals, insights, money/history, settings.
- Keep transaction, category, recurring, asset, liability, holding, snapshot, and goal writes behind typed actions and Convex access checks.
- Maintain money correctness: amounts in major units, sign from `kind`, ownership/split basis points, cash-account balance deltas.

## Key Files

- [`src/routes/home-light/page.tsx`](../../../src/routes/home-light/page.tsx) - light/simple home.
- [`src/routes/money/page.tsx`](../../../src/routes/money/page.tsx) - transaction history, categories, recurring, budgets.
- [`src/routes/buckets/page.tsx`](../../../src/routes/buckets/page.tsx) - light buckets backed by goals/savings.
- [`src/routes/wealth/page.tsx`](../../../src/routes/wealth/page.tsx) - capital/wealth surface.
- [`src/routes/advanced/GoalsPage.tsx`](../../../src/routes/advanced/GoalsPage.tsx), [`src/routes/advanced/InsightsPage.tsx`](../../../src/routes/advanced/InsightsPage.tsx) - advanced goals and insight surfaces.
- [`src/components/features/AddTransactionDialog.tsx`](../../../src/components/features/AddTransactionDialog.tsx), [`GoalDialog.tsx`](../../../src/components/features/GoalDialog.tsx), [`AddHoldingDialog.tsx`](../../../src/components/features/AddHoldingDialog.tsx), [`AssetDialog.tsx`](../../../src/components/features/AssetDialog.tsx), [`LiabilityDialog.tsx`](../../../src/components/features/LiabilityDialog.tsx) - core edit/capture flows.
- [`src/lib/analytics.ts`](../../../src/lib/analytics.ts), [`src/lib/money.ts`](../../../src/lib/money.ts), [`src/lib/goals.ts`](../../../src/lib/goals.ts), [`src/lib/ledger.ts`](../../../src/lib/ledger.ts) - pure finance helpers.
- Convex files: [`transactions.ts`](../../../convex/transactions.ts), [`categories.ts`](../../../convex/categories.ts), [`assets.ts`](../../../convex/assets.ts), [`liabilities.ts`](../../../convex/liabilities.ts), [`holdings.ts`](../../../convex/holdings.ts), [`wealthSnapshots.ts`](../../../convex/wealthSnapshots.ts), [`recurring.ts`](../../../convex/recurring.ts), [`goals.ts`](../../../convex/goals.ts).

## Public API

- Store hooks for transactions, categories, assets, liabilities, holdings, goals, recurring, snapshots.
- `useDomainActions()` for all personal finance/wealth writes.
- Pure helpers such as `rollupNetWorth`, money formatters, goal migration/progress helpers, and ledger tests.

## Internal Structure

Page modules read through store hooks. Dialogs use domain actions for writes. Convex functions validate membership/editor role, normalize mutable fields, and use mutation receipts where replay can duplicate rows. Analytics and chart modules stay pure and are covered by Vitest.

## Dependencies

- Uses `cloudStore` for detail hydration on routes that need portfolio-level records.
- Uses market quote and FX services for holdings/currency-adjacent UI.
- Advanced Numa AI consumes this module as grounding context.

## Notable Patterns / Gotchas

- Add any route that reads portfolio detail to `fetchPortfolioDetails` in `cloudStore.tsx`.
- Goal dialog state must not be reset by late async defaults after the user types.
- Convex currency is narrowed to USD/EUR even if client `CurrencyCode` is wider.
- Ledger completion is a roadmap direction, not complete UI source of truth yet.
