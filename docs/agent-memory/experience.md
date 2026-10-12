# Experience change map

Current code owns behavior; the [README](../../README.md) owns task boundaries.
The web capture work relates to ARS-89, valuations to ARS-93 and native
accessibility to ARS-99. This page is a source map, not release acceptance.

## Follow a change

| User journey | Presentation | Logic and write boundary | Regression coverage |
| --- | --- | --- | --- |
| Add income/expense or a reviewed batch | `src/components/features/UniversalCaptureDialog.tsx` | `src/lib/transactionEntry.ts` → `domainMoneyActions.ts` / `podActions.ts` → existing authorized mutations | `transactionEntry.test.ts`, `UniversalCaptureDialog.test.tsx`, `tests/transaction-entry.spec.ts`; read-only authenticated opening in `tests/brand-auth.spec.ts` |
| Add income/expense in the Simple capture sheet | `src/components/features/LightAddExpenseDialog.tsx` | Frozen submission/receipt → `domainMoneyActions.ts` → existing authorized mutations | `LightAddExpenseDialog.test.tsx`, `tests/light-capture.spec.ts` |
| Add/edit an investment | `src/components/features/AddHoldingDialog.tsx` | `src/lib/holdingDraft.ts` → `domainWealthActions.ts` → `convex/holdings.ts` | `holdingDraft.test.ts`, `AddHoldingDialog.test.tsx`, `tests/experience.spec.ts` |
| Capture a wealth snapshot | `src/routes/wealth/SnapshotButton.tsx`, `pages/WealthPage.tsx`, `DesktopSurface.tsx` | `src/lib/autoSnapshot.ts` → `useManualSnapshot.ts` → `domainPlanActions.ts` → `convex/wealthSnapshots.ts` | `autoSnapshot.test.ts`, `useManualSnapshot.test.tsx`, `tests/experience.spec.ts` |
| Understand native Today | `ios/Numa/Numa/NumaTodayView.swift` | `NumaTodaySummary` reads `MobileDashboardQuality`; refresh uses `NumaAppStore.retrySpace()` | `NumaTodayTests.swift`, simulator-only `NumaTodayPreview.swift` |

The complete snapshot and holding APIs retain server authorization and receipt
checks. UI validation is help for the user, never a replacement for those checks.

## Interaction contracts

- Ordinary capture commands open one amount-first form. Batch entry is secondary
  and every valid item is shown before confirmation; invalid items block the whole
  batch. Do not add confidence claims to this deterministic parser. Saved, queued
  and remaining counts stay distinct. Retries freeze each payload/receipt and the
  displayed destination/split, then resume at the first unfinished entry.
- The Simple capture sheet keeps its keypad. A submitted entry stays locked for
  an exact retry; account/space changes block submission. Pending saves prevent
  dismissal, and queued entries require no second submission. The separate
  desktop `SimpleDesktopAddPanel` does not yet share this retry state.
- Investment quantity accepts fractions; total paid accepts dot or comma decimals,
  without guessing grouping or rounding away extra cents. EUR/USD match server
  writes. Purchase cost and current market value mean different things.
- A holding submission freezes its payload and receipt through retries. Do not
  make the form editable after an uncertain response without designing a safe
  cancellation/reconciliation path. Portfolio switches cannot retarget a draft.
- Manual snapshots report saving, queued, saved and error separately. Only a
  resolved write may report success. A retry uses the original snapshot/receipt;
  a late result must not update a different portfolio's feedback.
- Today keeps asset/debt context beside net worth. Missing prices suppress the
  affected valuation, not valid income/debt. Goal errors distinguish an invalid
  target, different currency and unavailable income. Refresh does not invent a
  missing source or promise that estimates become verified.
  Cash-flow FX checks use the server's `periodStart`, `periodEndExclusive` and
  `recordedThrough`; missing or invalid period metadata stays conservative.
- Shared `Dialog` owns focus, scrolling and dismissal. Long forms may supply a
  persistent `footer`; submit buttons outside a form use its `form` ID. Set
  `dismissible={false}` only while a write is pending. Disabled fieldsets must
  stay out of the focus trap's Tab targets.

## Reproduce before changing

Run `node scripts/preview-experience.mjs` and open `http://127.0.0.1:5174`.
This dedicated server renders production components with explicit service stubs
from `tests/fixtures/experience/`. Those substitutions are absent from the app
entrypoint and Vercel build. Never turn this into a production auth bypass.

The Playwright configuration starts this server for local `npm run test:ui` and
`npm run verify`. Focused run: `npm run test:ui -- tests/experience.spec.ts tests/transaction-entry.spec.ts`.
Cover fine fractions, keyboard retries, inline errors, visible footer actions,
mobile/desktop, light/dark and enlarged text. Screenshots go to ignored
`test-results/`; inspect them, not only assertions. Native setup and synthetic
states are listed in the [iOS README](../../ios/Numa/README.md#isolated-simulator-preview).

For a shared primitive or UI/write-boundary change, finish with `npm run verify`
and affected native checks. Use the locked Node 24 toolchain. Record the candidate,
results, skips, review and remaining gates in the existing Notion work items.
Local fixture success cannot establish authenticated cloud or physical-device
acceptance. A PR merge cannot establish deployment or release.
