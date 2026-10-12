# Numa Pro iOS

Native SwiftUI client for Numa Pro, including its compatibility shared money pods.
The display name is Numa Pro (2026-09-08 decision). Keep the Numa scheme,
bundle `com.arsiktech.numa`, Apple ID `6788344832`, URL scheme and all keychain
and storage identifiers unchanged. This is not Numa Shared.

## Stack

- SwiftUI, iOS 18+
- Convex Swift (`ConvexMobile`)
- Convex Auth for email/password and provider sign-in
- `ASWebAuthenticationSession` for Google/Apple OAuth browser handoff

## Local Setup

1. Install Xcode from Apple.
2. Select the full Xcode toolchain:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -runFirstLaunch
   ```

3. Keep `Numa/Config/NumaConfig.dev.swift` and
   `Numa/Config/NumaConfig.prod.swift` pointed at the intended Convex
   deployment.
   Debug builds deliberately use `http://127.0.0.1:3000` for AI/receipt APIs
   so their DEV bearer is never sent to the production Vercel host. Start the
   matching local API runtime from the repository root with:

   ```bash
   npx vercel dev --listen 3000
   ```

   It reads the repo's `.env.local`, which must remain paired with
   `rosy-mink-170`. To use a DEV preview instead, set the Xcode scheme variable
   `NUMA_DEV_WEB_APP_URL` to that preview only after verifying it uses the same
   DEV Convex deployment.
4. Configure Convex Auth env vars on that deployment. Google sign-in needs
   `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`; Apple sign-in needs
   `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET`.
   The native app shows Google only while Apple sign-in is also enabled
   (App Review Guideline 4.8). With Apple off, iOS offers email and password.
5. In Google Cloud Console, add the exact Convex Auth callback URI for the
   deployment to the OAuth client's Authorized redirect URIs:

   ```text
   https://rosy-mink-170.eu-west-1.convex.site/api/auth/callback/google
   https://fine-quail-653.convex.site/api/auth/callback/google
   ```

   Native iOS passes `redirectTo: numa://auth` to Convex Auth, but Google never
   redirects directly to that custom scheme. The Google allowlist must contain
   the Convex callback above; Convex then performs the final `numa://auth` hop
   back into `ASWebAuthenticationSession`.
6. For Apple Developer Sign in with Apple, add these Services ID Return URLs:

   ```text
   https://rosy-mink-170.eu-west-1.convex.site/api/auth/callback/apple
   https://fine-quail-653.convex.site/api/auth/callback/apple
   ```

   Apple also lands on Convex first. Keep `numa://auth` only in the native app
   URL scheme; do not add it as an Apple Return URL.

## Verification

Open `Numa.xcodeproj`, select the `Numa` scheme, and run on an iOS simulator.

Expected first pass:

- sign-in screen offers email/password and any configured providers
- signed-in user calls `mobile:me`
- `/pod` data streams through `mobile:listPods` and `mobile:podSnapshot`
- expense create/edit/delete and card label changes return mutation receipts with `clientMutationId`

If Google shows `Error 400: redirect_uri_mismatch`, inspect the first redirect
from the Convex sign-in URL and add that decoded `redirect_uri` to the Google
OAuth client.

## Today screen

Today presents tracked net worth, recorded monthly net cash flow, and the
existing monthly income goal separately. Net worth is not spendable cash.
The legacy `monthDelta` mixes cash flow with cost-basis investment gains, so
Today deliberately does not display it as a period-over-period wealth change.
Goal progress uses recorded dashboard income, not scheduled recurring rules;
an incomplete goal never rounds up to 100%. Missing/non-finite values remain
unavailable, and a goal in a different currency has no invented conversion.
These presentation safeguards do not replace the backend valuation or financing
classification work tracked separately in the existing Notion project.

### Isolated simulator preview

For native UI checks, launch a **Debug simulator** build through XcodeBuildMCP
with `NUMA_TODAY_PREVIEW` set to `normal`, `empty`, `negative`, `largeValues`,
`invalid`, `unavailable`, `missingPrices`, `stalePrices`, `estimated`, `expired`,
`missingQuality`, or `agingPrice`. Pass the variables explicitly to
`launch_app_sim({ env: { NUMA_TODAY_PREVIEW: "normal" } })` after building;
build-time environment alone does not select a runtime fixture.
Optional `NUMA_TODAY_DARK=1` and
`NUMA_TODAY_LARGE_TEXT=1` exercise dark appearance and maximum Dynamic Type
without changing the simulator's global preferences. Reduce Motion uses the
actual system accessibility setting.

This explicitly labelled, fictional-data surface uses an unauthenticated local
client. It does not restore a Keychain session, hides account/Settings controls,
and cannot save cloud records. The real capture, transaction and goal editors
remain available for navigation checks; successful cloud writes require a
separate authorized QA identity. All preview code is excluded from Release and
physical-device builds. Launch without these variables for the normal app.

The focused presentation tests live in `NumaTodayTests`; the existing
`PodStoreTests` cover the unchanged auth/capture/receipt boundaries. Use the
same simulator and DerivedData, not a clean rebuild for every iteration.

## Personal and business spaces (ARS-88)

The title opens the native Spaces picker. A new account starts with one personal
space; additional personal/business spaces are optional, start empty and select
an explicit EUR or USD currency. Business economic ownership is optional and
separate from the compatibility admin membership share. Leaving it blank does
not imply 100% ownership or set a valuation.

The app displays one authorized portfolio at a time, never consolidated totals.
Switching clears the snapshot, sheets and transient feedback before subscribing;
account and space generations reject late reads, writes and A→B→A drafts.
Unavailable reads and revoked/downgraded access invalidate pending space work.
Editors/capture show the active name and currency; JSON export in Spaces and
Settings includes only the loaded space. A share sheet is user-triggered.

`spaces:listMine`, `spaces:create` and `spaces:migrationPreview` are additive
Convex APIs. Existing portfolio IDs, legacy `type` values and `/pod` records are
unchanged. Unclassified personal portfolios read as personal; shared/family
portfolios remain labelled shared rather than being guessed into businesses.
The read-only migration preview reports zero moved records and no automatic
reassignment. No migration execution is needed. Deploy the paired backend before
shipping a native build that uses these APIs; local verification does not deploy it.

The isolated simulator preview now includes Personal (EUR) and Studio (USD),
with distinct income/goal records, plus the Wealth tab. It still cannot perform
cloud writes, restore an account, or expose Settings/Keychain controls.
`NumaSpaceTests` covers context invalidation, draft origin, ownership validation,
access loss and preview write rejection. `convex/spaces.test.ts` exercises actual
registered handlers with synthetic auth/DB fixtures, not a live Convex service.

Capture keeps two action columns at standard Dynamic Type sizes and one at
accessibility sizes. Labels wrap without shrinking; buttons grow with content
and retain a 46-point minimum height. Its focused UI regression check is all four
full labels and destinations at accessibility5/dark, plus two-column layout at
standard-size/light. Use the isolated fixture without starting capture providers.
