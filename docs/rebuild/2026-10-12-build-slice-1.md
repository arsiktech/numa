# Numa rebuild, build slice 1: app foundation and Home

Date: 2026-10-12. Status: built and verified locally; not deployed.

The owner approved the phase 2 mockup ("let's move on"), so the build has started. This first slice sets up the one-codebase app and ships the Home screen on demo data. The current web app and SwiftUI app are untouched and stay live until the new app reaches parity.

## What exists now

- `apps/numa`: an Expo SDK 57 app (Expo Router, Reanimated 4, react-native-svg, Gesture Handler) that builds for iOS, Android and web from one codebase. See its README.
- **Pulse theme** in code: dark and light palettes, type scale, motion curves, Manrope and JetBrains Mono through `@expo-google-fonts`.
- **Money domain** (`src/domain`), pure TypeScript with tests:
  - Holdings with a valuation that says where the value came from (live, delayed, synced, manual, missing).
  - Liquidity: liquid, cash, locked until a date, pledged against a loan, illiquid.
  - `summarize`: own, owe, net, liquid, cash and per-category totals. Unknown values are left out and listed, missing prices count at their last known value and are flagged, and overdue manual values are flagged stale.
  - `summarizeFlow` for in, out and kept; `pickAttention` for the at-most-three Needs you items.
- **Home**, phone and wide web layouts:
  - Net worth, Liquid and Cash tabs, with an odometer hero that rolls on a live tick and a LIVE chip.
  - A scrubbable chart (drag on phone, hover on web) that draws on open, with range pills.
  - Own and owe composition blocks that dim when a tab excludes them, the October teaser, and Needs you (moved to the bottom per the owner's comment) with resolve and Undo.
  - A first-visit coach tip and a hide-amounts toggle.
- **Navigation:** a floating glass capsule with Home, Flow and Plan plus the round plus on phone; on screens 1024 px and wider, a sidebar with the numa wordmark and the PRO badge. Flow, Plan and Ask are placeholders that say which slice brings them.
- **Demo data:** the mockup's fictional portfolio, labelled "Demo data" on screen.

## Decisions made while building

- **Pledged collateral is not liquid.** The mockup's Liquid figure (€494,328) counted pledged BTC; the build excludes it, because it backs a loan. With the demo data Liquid is €470,590.
- **Parallel app, not a rewrite in place.** The new app lives in `apps/numa` with its own lockfile, so `npm ci`, lint, build and the Vercel preview of the current app are unaffected (`apps/**` is ignored by the root ESLint config and is not a Vercel deploy path).
- **No Convex changes yet.** Convex stays the backend. The next slice maps the existing tables (holdings, assets, liabilities, marketQuotes, wealthSnapshots) onto the domain model behind the same `useHome` hook, with Convex Auth.

## Verified

Three verification cycles out of a budget of ten. A cycle is the type check plus unit tests plus web export and rendered screenshots plus native bundles.

- `npm run typecheck`: clean.
- `npm test`: 10 of 10 domain tests pass.
- `expo export --platform web`: rendered with Playwright at 390×844 and 1440×1000, in light and dark.
  - Checked: the Liquid tab dimming, chart scrubbing, the coach tip, hide amounts and the floating nav.
  - The first two cycles found a router error (the tab list must be a direct child of `Tabs`), the nav hidden behind content, and a truncated label. All three are fixed.
- `expo export --platform ios --platform android`: Hermes bundles compile (1,736 and 1,820 modules).
- `expo-doctor`: 19 of 21 checks pass. The other two need the Expo API, which this environment cannot reach.

## Not verified or not done

- Not run on a real iPhone or Android device or simulator. This environment has neither.
- Hide amounts masks the hero and the change line only, not the block amounts.
- The coach tip is not remembered between launches yet.
- The PRO badge is a static iridescent gradient; the slow turn from the mockup is not animated yet.
- No Convex, auth or real data.

## Next slices

1. Convex and Convex Auth on all three platforms, the read model behind `useHome`, the Settings theme switch, persisted tips, and hide amounts everywhere.
2. Flow: the monochrome Sankey, following a stream, products and MRR.
3. Ask: the composer, the parser, draft cards with Save, Edit, Discard and Undo, writing through the existing `aiActionDrafts` and `clientMutationId` receipts.
4. Plan, Holdings, Settings and Sources, the Google Sheet import, and widgets.
5. Release gates: parity with the current apps, then retire them with the owner's approval.
