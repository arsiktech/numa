# Numa Pro public-release plan

**Snapshot:** 2026-07-30
**Release decision:** HOLD
**Public product name:** Numa Pro (superseding naming decision 2026-09-08)
**Repository/release-lane name:** Numa Pro
**Current local candidate identifiers (not deployed):** web `0.11.2`; native `1.2.0` (build `202609090933`)

## 2026-10-04 launch push

The owner asked to make Numa Pro ready to publish. That replaces the HOLD with
an active launch push; production deployment, promotion and App Store
submission still each need the owner's explicit go.

- Release branch: `codex/ars-89-money-capture` (resolves the P0 "choose the
  release branch" item below).
- Scope: web public first, then iOS via TestFlight. Launch is free; pricing and
  StoreKit (ARS-107) are post-launch.
- Landed for launch: ARS-97 privacy, export and retention; ARS-90/91 recurring
  income sources and business MRR/ARR.
- Deferred: the ARS-93 immutable wealth-record branch. The live branch already
  carries newer data-quality checks for net worth (stale quotes, FX, expiry);
  merging the older parallel model is post-launch work.
- iOS sign-in: Google appears only while Apple sign-in is enabled (Guideline
  4.8); Apple stays off until token revocation exists.
- Store copy, privacy answers and review notes: `docs/launch/APP-STORE-LAUNCH-KIT.md`.

This plan remains the release source of truth for gate ownership and public
release status. The dated evidence below is a historical audit snapshot, so its
older version/build references are not the current local artifact manifest.
`ROADMAP.md` remains the longer-term backlog; a green build, an upload, or an
existing production deployment does not by itself satisfy this plan.

## 1. Product boundary

| | Numa Pro | Numa Shared |
| --- | --- | --- |
| Product job | Personal spending, Capital/net worth, goals, holdings, AI, read-only public wallets | Shared-household expenses, balances, settlement, people/cards |
| Source of truth | This repository | Sibling `Numa Shared` repository |
| Release branch at audit | `codex/advanced-mrr-dashboard` (candidate); documented base `numa-v2` | `v1-ship` |
| Web | `https://numa-ecru.vercel.app` | Not the Numa Pro web deployment |
| Production Convex | `fine-quail-653` | `adept-camel-457` |
| Native bundle | `com.arsiktech.numa` | `tech.arsik.numashared` |
| Current distribution | Existing web production; Pro candidate not promoted; native not uploaded | Separate TestFlight/App Store lane, build 1 uploaded |

The explicit 2026-09-08 decision makes “Numa Pro” the UI and store-facing name.
Older release receipts below retain their historical wording. Numa Pro's existing
`/pod` route is a compatibility feature, not the standalone Numa Shared source
of truth. It stays data-safe until a migration decision exists.

The Shared prompts and generated `outputs/brand/numa-shared-2027/` files now in
this worktree are misplaced artifacts, not Pro runtime source. They must not
break Pro gates. Moving or deleting them needs an explicit history-preserving
decision and is not part of this release pass.

## 2. Current status and evidence

### Candidate and repository

- Branch: `codex/advanced-mrr-dashboard`, at `53b164da` when this audit began.
- The branch is 11 commits ahead of the local `numa-v2` merge base.
- The historical audit worktree began with a large uncommitted v0.11.0
  public-wallet lane plus docs, native, generated, and Shared-only artifacts.
  The reviewed Pro source set excludes all preserved Shared-only files and local
  build products.
- At that historical snapshot, `package.json` was v0.11.0 and native iOS was
  marketing version `0.1.0`, build `1`; later local source now identifies as
  web `0.11.2` and native `1.2.0` (build `202609090933`). Neither version is a
  deployment, upload, or public-release receipt.

### Green evidence captured on 2026-07-30

- `npm run build`: passed with Node 24, 2,737 modules.
- `npm test`: passed, 37 files / 270 tests.
- `npm run check:bundle`: passed at 223.0 KB gzip against a 240 KB cap,
  leaving 17.0 KB headroom.
- `npm run lint`: passed with 0 errors and 14 pre-existing size/fast-refresh
  warnings after excluding only the misplaced Shared output directory.
- `npm run audit:release`: passed. Its only accepted production advisory is
  `GHSA-qwww-vcr4-c8h2`, and the gate verifies that this Vite SPA does not ship
  or import React Server Components before allowing that exception.
- `git diff --check`: passed.
- `npx convex codegen`, the Convex TypeScript gate, and `convex dev --once`
  passed against DEV `rosy-mink-170`; no production schema or env was changed.
- The full disposable-account Playwright matrix passed: 43 journeys on desktop
  and mobile, with one intentional mobile skip for a desktop-only Shared rail.
- In-app browser QA covered `/welcome`, Terms, Privacy, authenticated Home,
  Settings, mode-switch dismissal, and nested Capture dismissal at desktop and
  390 x 844 mobile sizes. Checked surfaces had no horizontal overflow. Local
  authenticated Home reached its usable heading in about 1.0 seconds.
- `npm run verify:production:convex`: passed against the currently deployed
  web/Convex app. This verifies the old production state, not the local
  candidate.
- The read-only production public browser smoke passed 8 of 10 assertions and
  failed the two desktop/mobile welcome checks because production still shows
  the removed internal Coin / 3D / Orb selector. This is expected evidence that
  the corrected candidate has not been deployed, not a green launch receipt.
- Native Debug build and launch passed on existing simulator
  `Numa iOS 18.6` (`4FAD9C71-EA0A-404C-967B-56F00C75A9B9`).
- Native unit tests: 2 passed, 0 failed.
- Native Release simulator build passed. A fresh unsigned generic-device
  archive passed Xcode's store bundle validation at
  `/private/tmp/numa-pro-release-20260730.xcarchive`; it is arm64, bundle
  `com.arsiktech.numa`, version `0.1.0` build `1`, contains a valid privacy
  manifest and dSYM, and contains only the production Convex URL.
- Verification and reset email sends now consume persistent per-address and
  deployment-wide Convex quotas before calling Resend.
- When DeFi is disabled by policy, EVM/Solana wallets now save complete
  token-only snapshots instead of suppressing monthly net-worth snapshots.

### Still incomplete after local remediation

- `npm run audit:all` still reports high-severity advisories in the dev-only
  Workbox build chain. No compatible automatic fix was found for the current
  Vite 8/PWA stack; this does not enter the shipped runtime, but remains a
  maintenance item rather than being hidden by the production audit.
- The v0.11.0 wallet schema/API is local only. Production has not been migrated,
  configured with Moralis, contract-smoked, or deployed.
- The deployed web still has the old internal selector/legal copy until an
  explicitly approved deployment promotes this corrected candidate.
- The archive was intentionally unsigned: signing, export/upload validation,
  App Store Connect, TestFlight, and physical-device evidence remain owner gates.

### Dirty-tree classification

The audit found three distinct sets. This classification prevents a release
commit from accidentally absorbing the standalone Shared lane:

| Set | Current contents | Release treatment |
| --- | --- | --- |
| Pro v0.11 + release candidate | Wallet provider/model/UI/tests; release docs and audit; shared Xcode scheme; native privacy manifest; browser/accessibility fixes; auth email limits | Commit as one reviewed Pro candidate on the current candidate branch |
| Standalone Numa Shared work | `GOAL_CONTRACT.md`, the three `Numa Shared` prompts (committed to the Numa Shared repo at `design/prompts/`), and `outputs/brand/numa-shared-2027/` | Preserve, do not include in the Pro release commit; the prompts' destination is resolved; the remaining items await an owner-chosen destination |
| Generated Shared preview files | `tmp/pdfs/numa-shared-brand-book-*.png` | Preserve for now; exclude from Pro source and gates |

No file in the latter two sets was deleted, moved, staged, or rewritten during
this pass. (2026-09-18 update: the retired `Numa Claude Design/` prototype
folder was removed from the repo; the three Shared prompts were moved to the
Numa Shared repo at `design/prompts/` (commit bed59bc), resolving their
destination decision.)

## 3. Definition of public release

The release has two checkpoints. Web may launch before iOS only if the release
decision names that scope explicitly.

### Web public release

All P0 code and documentation items are green; the intended candidate is
committed and reproducible; a preview deployment passes public and dedicated
authenticated smoke; production configuration is verified; an owner explicitly
approves promotion; and post-promotion production smoke is green.

### iOS App Store public release

The same backend/web contract is green, the native Release archive validates,
privacy/sign-in/metadata requirements are complete, a TestFlight build passes
physical-device dogfood, App Review has a durable demo account and notes, and a
human submits the selected build. TestFlight upload or processing alone is not
public release.

## 4. Remaining release work

Status legend: **DONE** is evidenced; **LOCAL** is safe work in this pass;
**OWNER** needs credentials, account authority, spending, production mutation,
or a product/legal decision.

### P0 — candidate integrity and separation

- [x] **DONE:** record Numa Pro vs Numa Shared ownership, bundle IDs, backends,
  and distribution lanes in `AGENTS.md`, `DECISIONS.md`, and this plan.
- [x] **DONE:** classify the dirty tree into Pro candidate, standalone Shared,
  and generated Shared-preview sets without discarding any existing work.
- [x] **DONE:** review the final Pro diff and freeze the intended
  source-controlled set on the current candidate branch. The preserved Shared
  sets and local build outputs are excluded.
- [ ] **OWNER:** choose the release branch/merge target. `AGENTS.md` still names
  `numa-v2`, while the candidate lives on `codex/advanced-mrr-dashboard`.
- [ ] **OWNER:** decide whether to move Shared-only prompts/output to the Shared
  repository or archive them elsewhere. Until then they stay preserved and
  excluded from Pro gates.

### P0 — security and dependency gate

- [x] **DONE:** update `@auth/core` from 0.41.2 to the patched 0.41.3 and rerun
  auth/build/unit gates.
- [x] **DONE:** replace the raw production audit with an app-aware, fail-closed
  gate. It may acknowledge only `GHSA-qwww-vcr4-c8h2` while the repo remains a
  Vite SPA with no React Server Components; every other production advisory
  must fail.
- [x] **DONE:** keep a separate all-dependency maintenance audit for build-tool
  advisories; do not confuse dev-only tool findings with shipped runtime risk.

### P0 — public entry, trust, and legal truth

- [x] **DONE:** remove the internal Coin / 3D / Orb chooser from `/welcome`
  and lock the approved canonical coin hero.
- [x] **DONE:** update Privacy and Terms to match the real seven-day deletion
  grace/cancellation behavior, Apple + Google auth, current AI provider, and
  partial CSV export scope. Remove “beta” from the public-release framing.
- [x] **DONE:** repeat mobile/desktop, light/dark visual QA at the same
  viewports and capture the corrected frames.
- [ ] **OWNER:** review/approve Privacy, Terms, controller/contact identity,
  retention language, subprocessors, GDPR request flow, and EU consumer terms.
  Code can make product facts accurate; it cannot replace legal approval.

### P0 — web and Convex release candidate

- [x] **DONE:** regenerate Convex types and run schema/build tests for the
  wallet lane (`npx convex codegen` against DEV only, then build/unit).
- [x] **DONE:** run focused wallet/provider tests, manually smoke the public
  routes in the in-app browser, and capture cold/warm page-open timing on the
  built candidate.
- [x] **DONE:** run the public and authenticated Playwright matrix with
  disposable DEV accounts. Result: 43 passed, 1 intentional mobile skip.
- [ ] **OWNER:** decide v0.11 wallet launch scope. Token tracking needs a
  server-only `MORALIS_API_KEY`; DeFi stays off unless a paid-plan limit is
  explicitly accepted. Review per-user and deployment-wide budgets.
- [ ] **OWNER:** inspect production configuration for Convex Auth, Resend,
  Google/Apple OAuth, AI Gateway credits, push/VAPID, internal push secret,
  and Moralis. This is a credential/configuration action and is not inferred
  from docs.
- [ ] **OWNER:** approve a preview deployment. After preview smoke, separately
  approve production Convex/Vercel deployment and promotion.
- [ ] **LOCAL after deployment:** run `verify:production:convex`, public UI
  smoke, authenticated production smoke with a disposable approved account,
  wallet contract smoke, and cold/warm timings. Stop/rollback on any mismatch.

### P0 — native iOS and App Store

- [x] **DONE:** prove the shared `Numa.xcscheme` can produce a generic-device
  archive and keep iOS-only CI path filters.
- [x] **DONE:** fix current Swift actor-isolation warnings, rerun native unit
  tests, and produce a clean Release build.
- [x] **DONE:** add and bundle an app privacy manifest based on actual native
  data collection and the UserDefaults required-reason API. Validate the plist
  in both the Release app and generic-device archive.
- [ ] **LOCAL/OWNER:** generate and review Xcode's aggregate privacy report,
  including Swift packages, then reconcile it with App Store privacy answers.
- [x] **DONE:** keep associated domains out of v0.11. The app has no universal
  link implementation, `Numa.entitlements` is not wired through
  `CODE_SIGN_ENTITLEMENTS`, and the validated archive ships no such capability.
- [ ] **OWNER:** choose iOS public version/build numbering and create/confirm the
  App Store Connect record for `com.arsiktech.numa`.
- [ ] **OWNER:** configure and physically test Apple sign-in. Because Google is
  a primary social login, App Review Guideline 4.8 requires an equivalent
  privacy-preserving login option unless an exception applies.
- [ ] **LOCAL/OWNER:** verify email/password, Google, Apple, account deletion,
  capture, read/write sync, offline/error states, and accessibility on a
  physical iPhone using non-human disposable data.
- [ ] **OWNER:** complete App Privacy answers and URLs, age rating, category,
  export-compliance answers, support URL/contact, description/keywords,
  screenshots, review notes, and a non-expiring demo account.
- [x] **DONE:** produce an unsigned arm64 generic-device archive and pass local
  Xcode bundle validation without touching App Store Connect.
- [ ] **OWNER:** create a signed archive, validate/export/upload it, assign the
  processed build to TestFlight, complete physical dogfood, select the build,
  and submit it for App Review.

Apple references used to define these gates:

- <https://developer.apple.com/app-store/review/guidelines/>
- <https://developer.apple.com/app-store/app-privacy-details/>
- <https://developer.apple.com/documentation/bundleresources/privacy-manifest-files>
- <https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app>

### P1 — launch quality (finish before broad promotion unless waived)

- [x] Narrow public/legal copy to the exact CSV export set; a broader
  GDPR-grade export remains an owner/product follow-up rather than a false claim.
- [x] Add persistent per-address and deployment-wide server throttling for
  verification/reset email sends before provider spend.
- [ ] Finish or explicitly keep Russian/Spanish marked beta; verify legal and
  onboarding language behavior.
- [ ] Add production observability for auth failures, AI/OCR budgets, wallet
  sync failures, and client errors, with a rollback owner.
- [x] Preserve at least 10 KB gzip headroom. The current initial payload is
  223.0 KB against 240 KB, leaving 17.0 KB.
- [ ] Reconcile the integrated Pro `/pod` roadmap with the standalone Shared
  product without deleting data or silently duplicating new features.

### Post-launch backlog — not automatic blockers

Ledger completion, true multi-currency expansion, IndexedDB queue migration,
advanced share cards, broad landing redesign, and general god-file splitting
remain valuable roadmap work. They are not P0 unless release testing exposes a
specific correctness or data-loss failure.

## 5. Release command gates

Run on the intended committed candidate with Node 24.x:

```bash
npm ci
npx convex codegen                  # DEV target only until prod approval
npm run lint
npm run build
npm run check:bundle
npm test
npm run audit:release
npm run test:ui
npm run test:ui:auth                # dedicated DEV credentials required
git diff --check
```

Native gate uses the pinned existing simulator and incremental DerivedData:

```text
Build Release → unit tests → archive validation → physical-device flows →
TestFlight upload/processing → tester assignment → dogfood → App Review
```

After explicit production approval and deployment:

```bash
npm run verify:production:convex
npm run test:ui:production
npm run test:ui:production:auth:required
```

Record the exact deployment URL, git commit, Convex deployment, build number,
test account policy, timings, screenshots, and final App Store/TestFlight state.

## 6. Stop conditions

Stop the release on data loss, auth regression, wrong Convex target, inaccurate
legal/privacy behavior, unexpected production audit finding, failed account
deletion/cancel flow, provider spend without a cap, missing App Review login,
or a deployment whose commit cannot be reproduced. Never treat an upload start,
archive success, or existing production smoke as proof of public release.
