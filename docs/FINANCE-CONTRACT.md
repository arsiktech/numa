# Management-finance contract v1

ARS-87 establishes a financing-safe foundation, not statutory bookkeeping or a
ledger migration. These rules apply to the Convex/mobile boundary and shared
ledger helpers. Existing `/pod` settlement math and data are unchanged.

## Amounts and periods

- Persist and transmit **major units** in USD or EUR. New transaction/ledger
  writes require positive amounts with at most two decimal places. Splitting
  principal, interest or distribution remains explicit, not inferred from text.
- Calculate in integer cents. Convert historical decimal amounts per row using
  decimal half-away-from-zero rounding; do not rewrite stored history. Supported
  magnitude is 9,000,000,000,000 cents (90 billion major units); larger totals,
  missing/invalid/non-finite money and unsupported currencies fail closed.
- Ledger totals require one portfolio and one currency; no implicit FX. Cash
  account writes require the transaction's currency and owning portfolio.
- Timestamps are integer Unix milliseconds. Mobile monthly reporting uses UTC
  calendar months, inclusive start/exclusive end, excluding records after the
  snapshot's `recordedThrough` time. Scheduled rules themselves are not income.
  Existing recurring materialization behavior is not redesigned here (ARS-90).
- Mobile totals retain existing USD/EUR fallback conversion. `dataQuality`
  exposes the rates, `fxEstimated: true`, `fxAsOf: null`, precision, period,
  timezone and calculation `generatedAt`. This is not fresh market/FX evidence.
  An invalid input fails the snapshot; it never becomes a plausible zero.

## Separate sources — never add them together

**Native app balances still come from legacy transactions/assets/liabilities and
holdings.** Legacy `income` maps to earned income and `expense` to spending.
They are not reclassified from descriptions, categories or historical guesses.
`monthCashflow` is recorded income minus expenses, not financing-inclusive bank
movement or net-worth change. Legacy `monthDelta` is retained for compatibility,
not a comparable-period net-worth delta; Today does not display it as one.

The existing ledger remains a separate foundation. Typed
`ledger.recordClassifiedTransaction` creates exactly two balanced lines and
does **not** also change legacy cash or create a legacy income/expense row.
Native snapshots explicitly say `rollupSource: legacy-finance-tables` and
`ledgerIncluded: false`. A future cutover must reconcile opening balances and
source identities before selecting the ledger; never sum mirrored histories.
Financing entry UI, loan schedules, ARR eligibility and cutover are successors.

| Classification | Debit | Credit | Operating income/expense effect |
| --- | --- | --- | --- |
| Earned income | Asset | Income | Income increases |
| Expense | Expense | Asset | Expense increases |
| Transfer | Asset | Different asset | None |
| Opening asset balance | Asset | Equity | None |
| Opening debt balance | Equity | Liability | None |
| Loan advance | Asset | Liability | None |
| Principal repayment | Liability | Asset | None |
| Funding distribution | Equity | Asset | None |

Funding distribution here is an owner/funder distribution, not interest or a
computed profit-share agreement. Those terms and allocations are separate work.

## Identity, reversals and safety

- Classified writes require a stable source event ID and transport
  `clientMutationId`. A transfer is one event with two lines, never two expenses.
  Within a portfolio, repeated source identity returns its original entry;
  conflicting financial content with a fresh transport key is rejected.
- The transport key is authoritative: its replay returns the original receipt,
  not a new write, even if a retry payload changed. Do not reuse keys for new
  intent. Authorization is checked before replay. New receipts record scope.
- Old receipts without scope remain compatible: a surviving result must match
  the requested portfolio. If the result is gone, only the original authenticated
  actor receives acknowledgement of that completed operation—no execution or
  invented scope. Scoped deletion retries re-check current portfolio access.
- Classified entries cannot be deleted. `reverseClassifiedTransaction` adds a
  single, full, opposite posting linked to the original. A refund reduces the
  original income or expense in the **refund's** period; earlier periods are not
  rewritten. A reversal cannot predate or reverse a reversal. Partial refunds
  are not supported by this foundation API. Account financial definitions are
  frozen once posted; names remain editable.
- Missing/deleted historical categories do not block undo/clearing. Newly
  assigned categories must match kind and portfolio. Invalid historical cash
  references or currency mismatches fail closed and need explicit reconciliation;
  this change does not guess how to repair previously corrupted balances.

## Verification boundary

`convex/finance.test.ts` exercises registered mutations with real access/receipt
helpers and a synthetic database adapter, plus legacy/mobile/ledger reconciliation.
It is not a deployed Convex transaction/concurrency test. Run the relevant native
decoder/journey or authenticated dev validation when a consumer/cutover changes.
No production migration or data mutation is required for this foundation.

## Space boundary (ARS-88)

`portfolios.spaceKind` is additive personal/business metadata; existing portfolio
IDs and legacy personal/shared/family `type` values stay intact. A business owner
role grants administration, not economic ownership. Optional membership
`businessOwnershipBps` records explicitly stated equity only; it never computes
personal cash, business valuation or an attributable net-worth share.

Native totals and snapshot exports cover exactly one space. There is no combined
personal/business rollup, so cross-space transfers and a personally recorded
business investment are not summed again with entity assets. The compatibility
web personal-share helper excludes business entities for this same reason.
Consolidation, transfer matching, valuation and ownership-derived reporting are
not implemented or inferred here. Existing `/pod` accounting is unchanged.

New-space creation is receipt-backed and binds its key to the creation intent;
retrying a different name, purpose, currency or ownership using that key fails.
Native wealth upserts/deletes now scope receipts to the owning portfolio. Wealth
deletions also check result identity to reject a different record's historical
unscoped receipt. No legacy rows or stored receipt histories are rewritten.
