# Numa first-principles simplification review

Local candidate: web v0.11.1, branch `codex/advanced-mrr-dashboard`, based on
`b060005`. This report describes the working-tree changes, not a deployed release.

## Purpose and inspected scope

Numa helps a person record money, understand spending, save toward a goal, and
see assets alongside debts. The first session should reach a useful action
quickly; the interface must distinguish real user data from examples and goals.

Reviewed the canonical product/release instructions, public landing and metadata,
authentication entry, onboarding/profile completion, personal Home, income-goal
helpers, and corresponding native income-target code. Exercised the existing
desktop/mobile DEV journeys for transactions, Capital, goals, settings, capture,
and the integrated Shared pot compatibility surface. This is a completed bounded
simplification pass, not a new exhaustive backend/security or native release audit.

## Decisions and changes

| Weak assumption or unnecessary work | Result |
| --- | --- |
| More marketing sections prove more value | Replaced the long landing page with one proposition, a labeled example portfolio, three concrete uses, and working signup/legal links. Removed inert mock controls and unsupported automatic/live/free claims. |
| Appearance must be chosen before using money tools | Deleted the palette onboarding screen; appearance stays in Settings. Legacy style links redirect to mode selection. |
| Readiness needs a timed celebration | Deleted the 2.6-second countdown and animation CSS. The existing account-scoped profile completion/retry contract leads directly into the app. |
| Short onboarding must lock the viewport | Removed body scroll locking and fixed-height clipping. Controls remain reachable with enlarged text in a 390×568 viewport. |
| Everyone wants a EUR 50,000 income target | Removed the fallback in web and native. Empty accounts omit the income panel; real income can appear without an invented goal. Saved goals retain their amount. |
| A current balance and monthly delta justify a history chart | Deleted the interpolated Home curve. Show the actual balance and measured delta. |
| Quotes and general “live” badges improve trust | Removed personal Home typing quotations and the unconditional holdings “live” badge. Retained saved/partial valuation context. |
| Delayed focus always helps typing | Removed the email focus timer that could interrupt rapid form entry. |
| Editing native targets can round away cents | Preserve two decimal places when opening an existing income target. |

Native retains a compact "Set income goal" action for an empty account, because
the deleted empty card was its only entry point to that editor. Web already
offers monthly income goals through Goals.

The visual result keeps the existing Citrus tokens and brand, gives the main
action a clear position, and reduces empty dashboard height. The landing module
no longer imports its animation layer. No dependencies, backend schema, provider
integration, or new automation were added.

Kept the real transaction, Capital, goal, and pod workflows. Their user data and
authorization contracts are a reason to preserve them, not delete them because
they are more complex. Weekly setup suggestions remain explicit choices on the
confirmation button; they are not presented as an inferred financial goal.

## Validation

- Node 24 production build passed. Initial JavaScript is **226.4 KB gzip**, below
  the existing 240 KB budget. This is a current size receipt, not a claimed speedup.
- Vitest: **58 files, 372 tests passed**.
- ESLint: **0 errors, 15 existing warnings**.
- Complete one-worker Playwright desktop/mobile run: **49 passed, 3 intentional
  skips, no failures (5.5 minutes)**. Final log: `ui-complete.log`.
- Release dependency audit passed with the repository's existing
  application-unreachable React Router RSC advisory exception
  `GHSA-qwww-vcr4-c8h2`; dependencies were unchanged.
- Swift syntax parsing passed. An isolated harness compiled the actual edited
  native model definitions and checked blank new targets, currency, preserved
  cents, and absent-target progress. The repository also has a new XCTest for
  target draft behavior.
- `git diff --check` passed. Unrelated pre-existing `AGENTS.md`, goal/prompt files,
  and output directories were preserved.

The initial aggregate `npm run verify` attempts failed in UI execution. A direct
navigation race was corrected in the test helper, a new assertion was narrowed
to the visible responsive copy, and the delayed email focus action was removed.
Lint, unit, build, bundle, audit, and the complete UI suite were then checked as
separate commands; this report does not describe the initial aggregate command
as green. A later DEV run finished with 43 passing, one settings pointer-event
timeout, three intentional skips, and five cases not run after that failure.
A static-preview experiment passed the public pages but was stopped when the
authenticated flow reported `/api/fx-rates` 404s: Vite preview does not host that
API. Final full-journey QA therefore uses a freshly started Node 24 development
server with source frozen and failure traces retained. That exposed an immediate
navigation-link snapshot taken during loading; the test now uses its existing
polling navigation readiness helper. The final complete run passed, including
the earlier settings case. Live-reload interference was suspected for that
earlier pointer timeout but was not established as its cause.

Rendered review covered the public page at desktop and mobile widths in light
and dark themes, reduced-motion operation, onboarding enlarged-text scrolling,
and authenticated Home with a real disposable DEV goal. Signup, legal links,
mode selection, profile persistence after reload, and saved goal editing are
included in the browser assertions.

Local browser timing of the built landing, from navigation to its visible main
heading, was 429 ms with browser cache disabled and 529 ms on the next warm
navigation. Returning DEV Home reached its visible income heading in 1,428 ms.
These single local observations include automation overhead; they are not field
Core Web Vitals or a before/after performance benchmark.

Accepted screenshots, inspected after capture, are in the gitignored directory
`artifacts/screenshots/simplification-20260905/`:

- `landing-desktop.png`
- `landing-mobile-light.png` and `landing-mobile-dark.png`
- `onboarding-mode.png` and `onboarding-enlarged-text.png`
- `home-income-goal.png`

Detailed command logs are local at `/private/tmp/numa-review-20260905/` and may
be removed by normal temporary-file cleanup.

## Readiness and remaining external checks

This candidate improves the entry and everyday experience for manual personal
money tracking. Production readiness is not established by DEV QA alone.

- Full native build, XCTest, Simulator, and device accessibility checks were
  unavailable: this host currently has Command Line Tools, with no Xcode app or
  `simctl`. Native source changes are not a validated distributable artifact.
- AI attach tests remain disabled by the existing feature flag; paid provider
  behavior was not exercised. Desktop-only Shared layout is intentionally
  skipped by the mobile project.
- No fresh production/provider/offline-long-duration audit, deployment, migration,
  credential/env change, upload, App Review, or public release was performed.
  The existing release ledger governs any later authorized delivery.
- Existing lint warnings and the accepted dependency exception remain; this
  work does not claim their removal.
- The separately owned Numa Shared product was not changed.
