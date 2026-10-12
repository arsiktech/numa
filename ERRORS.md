# Errors And Gotchas

Recurring failures and sharp edges. Search the relevant symptom rather than
reading every entry. Examples describe the environment when diagnosed; confirm
current source and use the verification/authorization rules in `AGENTS.md`.

## 2026-09-06 - Asset recovery must tolerate unavailable session storage

Symptom:
A stale bundle error can trigger a second `SecurityError` or leave the app
loading when browser session storage cannot be read or written.

Cause:
The recovery path read the cooldown without a guard and marked recovery active
before an unguarded timestamp write. A failed write left recovery marked active
without scheduling a reload.

Fix / safe approach:
Treat cooldown persistence as best-effort. Catch both storage access/read and
write failures; check the in-memory guard before accessing storage again.
Preserve the existing delayed reload when the timestamp is readable. Without
working storage, deduplication is per page; a cross-navigation cooldown cannot
be guaranteed. This does not make other app storage consumers failure-safe.

Concurrent lazy imports and preload handlers share `reloadOnceForAssetError()`.
Keep Suspense pending only when a reload is active or scheduled, including the
remaining 15-second cooldown. Otherwise propagate the error; never hide it in
an infinite loader. Start recovery effects outside render.

Verification:
`npm test -- src/lib/assetReload.test.ts` covers denied reads, writes, the
storage getter, and the normal cooldown. `npm run test:ui --
tests/asset-recovery.spec.ts --workers=1` injects cooldown storage failures,
dispatches concurrent preload errors, and verifies one real reload followed
by usable email login on desktop Chromium and mobile WebKit.

Related files:
`src/lib/assetReload.ts`, `src/lib/assetReload.test.ts`,
`tests/asset-recovery.spec.ts`.

## 2026-07-09 - Vercel Preview must ship a real Convex URL, not just READY

Symptom:
A Vercel preview deployment reaches `READY`, but opening the preview shows
`Cloud auth required` / `Configure Convex to run Numa` instead of `/welcome`
or the authenticated app.

Cause:
Branch previews usually do not have `CONVEX_DEPLOY_KEY`. If
`scripts/vercel-build.mjs` builds without injecting `VITE_NUMA_CLOUD_AUTH=1`
and `VITE_CONVEX_URL`, the Vite bundle is valid but the runtime auth provider
refuses to mount the app.

Fix / safe approach:
Preview builds must inject the dev Convex deployment URL
`https://rosy-mink-170.eu-west-1.convex.cloud` and site URL
`https://rosy-mink-170.eu-west-1.convex.site` unless explicit preview env vars
override them. Keep the post-build cloud-config assertion in
`scripts/assert-build-cloud-config.mjs`; do not treat Vercel `READY` as product
verification.

Verification:
Run `VERCEL_ENV=preview npm run build:vercel`, then open the actual protected
preview URL with access/share credentials and confirm the page does not contain
`Cloud auth required` or `Configure Convex`.

Related files:
`scripts/vercel-build.mjs`, `scripts/assert-build-cloud-config.mjs`,
`DEPLOYMENT.md`, `src/services/auth.tsx`.

## 2026-07-06 - Google OAuth callback must match the regional Convex site URL

Symptom:
Google sign-in opens `accounts.google.com` and shows
`Error 400: redirect_uri_mismatch`, including from the native iOS
`ASWebAuthenticationSession` flow.

Cause:
Convex Auth sends Google
`(CUSTOM_AUTH_SITE_URL ?? CONVEX_SITE_URL)/api/auth/callback/google`. The dev
deployment's real site URL is regional:
`https://rosy-mink-170.eu-west-1.convex.site`. Older docs listed
`https://rosy-mink-170.convex.site`, which 404s for this deployment and does
not match the OAuth request.

Fix / safe approach:
Add the exact Convex callback URI to the Google OAuth client's Authorized
redirect URIs. For current deployments:

- dev: `https://rosy-mink-170.eu-west-1.convex.site/api/auth/callback/google`
- prod: `https://fine-quail-653.convex.site/api/auth/callback/google`

Do not add `numa://auth` to Google Cloud; native iOS uses that only as the
final redirect after Convex finishes the OAuth callback.

Verification:
Run `npx convex run auth:signIn '{"provider":"google","params":{"redirectTo":"numa://auth"}}'`,
then `curl -I` the returned Convex redirect URL. The Google `Location:` header
contains the exact `redirect_uri` that must be allowlisted.

Related files:
`convex/auth.ts`, `DEPLOYMENT.md`, `ios/Numa/README.md`,
`ios/Numa/Numa/NumaAuth.swift`, `ios/Numa/Numa/NumaSessionStore.swift`.

## 2026-06-04 - Dialog initialization must not wipe typed fields

Symptom:
An authenticated desktop smoke can leave `GoalDialog` open after clicking
`Set goal`, with no visible app error, because the native required target field
was silently cleared just before submit.

Cause:
The dialog reset all fields whenever async category/asset defaults changed.
Cloud data can settle while the dialog is open, so user-entered values may be
replaced by initial empty state.

Fix / safe approach:
Treat each dialog open/edit target as a session. Reset form fields only when a
new session starts, and fill late-arriving default selectors without touching
typed text/number/date fields.

Verification:
Run `npm run lint`, `npm run build`, and the authenticated desktop navigation
smoke that creates a bucket goal.

Related files:
`src/components/features/GoalDialog.tsx`, `tests/numa.spec.ts`.

## 2026-05-28 - App shows "Cloud auth required" instead of mounting

Symptom:
The app renders a centered cloud configuration screen and does not load the
normal route tree.

Cause:
`src/services/auth.tsx` only creates a Convex client when both
`VITE_NUMA_CLOUD_AUTH=1` and `VITE_CONVEX_URL` are present.

Fix / safe approach:
Set the env vars for the intended dev or production Convex target. Do not add a
local product auth fallback.

Verification:
Run `npm run dev` with the vars set and load `http://127.0.0.1:5173/welcome`.

Related files:
`src/services/auth.tsx`, `README.md`, `DEPLOYMENT.md`.

## 2026-05-31 - Returning no-profile users must not get fresh-user defaults

Symptom:
A returning cloud account that has a user row but no `profiles` row can briefly
surface legacy-safe fallback prefs (`advanced` mode, classic `numa` theme) and
then be silently rewritten to fresh-user defaults (`light`, `citrus`) after
`ensureProfile` creates the missing profile row.

Cause:
`profiles.me` intentionally reports missing-profile users with legacy-safe
fallbacks, but `ensureProfile({ onboardingCompletedAt })` creates a new row
using the default fresh-signup values when no profile exists. Returning users
without a pending sign-up/provider onboarding marker need a separate bootstrap
path from first-run accounts.

Fix / safe approach:
When `pendingOnboarding` is `null` and `profile.hasProfile === false`, pass
`appMode: "advanced"` and `themeKey: "numa"` while marking onboarding complete.
Do not pass those defaults while a fresh provider/sign-up onboarding marker is
pending.

Verification:
Run `npm test -- src/lib/profileBootstrap.test.ts` and the authenticated
sign-in smoke.

Related files:
`src/services/auth.tsx`, `src/lib/profileBootstrap.ts`,
`src/lib/profileBootstrap.test.ts`, `convex/profiles.ts`.

## 2026-05-31 - Shared-pod settlements must not be self-transfers

Symptom:
A settlement row where `fromMemberId` equals `toMemberId` can appear in
history/totals while leaving balances unchanged. That makes the pod look like
money was paid back even though no debt moved.

Cause:
The settlement mutations validated member existence, pod ownership, and
positive amount, but did not reject payer and recipient being the same member.

Fix / safe approach:
Reject self-transfers at the Convex mutation boundary for both create and
update paths. Validate the next effective `fromMemberId` / `toMemberId` during
partial updates, not only the fields present in the patch.

Verification:
Run `npm run build`, `npm run lint`, and the focused settlement tests after
touching settlement write logic.

Related files:
`convex/moneyPods.ts`, `src/lib/podSettlement.ts`,
`src/lib/podSettlementView.ts`.

## 2026-05-31 - Mobile pod snapshots need matching write mutations

Symptom:
The mobile API can return `settlements`, `settlementSummary`, and a
`recommendedSettlementDraft`, but a mobile/native client cannot record,
partially edit, or delete the settlement through the same `mobile` surface.

Cause:
`convex/mobile.ts` exposed shared-pod read snapshots and expense/card writes,
but settlement writes existed only on `convex/moneyPods.ts` for the web app.

Fix / safe approach:
Keep mobile shared-pod read and write surfaces symmetrical. Settlement create,
update, and delete mutations must use the same safety checks as web: editor
role, members belong to the pod, payer and recipient are different, amount is
positive, and replay uses `clientMutationId` receipts.

Verification:
Run `npx convex codegen`, `npm run lint`, and `npm run build` after adding or
renaming mobile mutations.

Related files:
`convex/mobile.ts`, `convex/moneyPods.ts`, `convex/lib/mutationReceipts.ts`.

## 2026-05-31 - Cloud detail caches must prune inaccessible records

Symptom:
A cloud portfolio or money pod can disappear from the current lightweight
Convex list after sign-out/sign-in, access removal, or deletion, while its
previous detail bundle remains in `cloud.byPortfolio` or `cloud.byPod`.
Surfaces that iterate detail caches directly, such as friend/member pickers,
can then include stale people or entities.

Cause:
`CloudDataProvider` cached detail bundles by id for speed, but did not clear
them on profile-loading/sign-out or prune them against the current accessible
portfolio/pod lists.

Fix / safe approach:
Clear cloud detail caches when auth is not usable yet, and prune
`byPortfolio` / `byPod` to the currently accessible ids whenever Convex list
queries resolve. Keep route-level detail caching only for ids the current user
can still access.

Verification:
Run `npm run lint` and `npm run build`; browser-smoke member pickers after
deleting or switching pods when practical.

Related files:
`src/services/cloudStore.tsx`, `src/services/store.tsx`, `src/routes/pod/page.tsx`.

## 2026-05-31 - Lazy portfolio details can hide Settings automations

Symptom:
The Settings automation/webhook card disappears for cloud users even though
they have editable portfolios.

Cause:
Startup optimization made `CloudDataProvider` fetch portfolio detail bundles
only on routes that need them. `WebhooksCard` uses `cloud.byPortfolio[p.id]`
membership rows to decide whether the user can generate tokens, but `/settings`
was not included in the portfolio-detail fetch routes.

Fix / safe approach:
Keep startup lazy, but include `/settings` in `fetchPortfolioDetails` because
settings needs membership detail for automation token visibility and account
data surfaces. Do not globally refetch all portfolio details on every route.

Verification:
Run `npm run lint` and `npm run build`; browser-smoke `/settings` for cloud
accounts with editable portfolios when practical.

Related files:
`src/services/cloudStore.tsx`, `src/routes/settings/page.tsx`.

## 2026-05-31 - Webhook UI permissions must match current membership

Symptom:
A viewer on a shared portfolio can see the generate-token automation UI
because another member of that portfolio is an owner/editor. The server rejects
token creation with `requireEditor`, but the UI presents an impossible action.

Cause:
`WebhooksCard` filtered editable portfolios with “any membership row has
owner/editor role” instead of finding the current user's membership row.

Fix / safe approach:
Filter by `membership.userId === currentAccount.id` and require that row's
role to be `owner` or `editor`. Keep the server-side `requireEditor` guard as
the source of truth.

Verification:
Run `npm run lint` and `npm run build`; browser-smoke Settings as viewer and
editor when practical.

Related files:
`src/routes/settings/page.tsx`, `convex/webhookTokens.ts`.

## 2026-06-04 - New portfolio routes need cloud detail hydration

Symptom:
A route can render correctly but show empty goals, transactions, assets, or
insights after a successful cloud write. Example: `/buckets` saved a goal, then
still showed `0 buckets` because the route was not included in the cloud detail
fetch list.

Cause:
`CloudDataProvider` fetches portfolio detail bundles only for selected route
paths. New routes that call detail hooks such as `useGoals`, `useTransactions`,
`useAssets`, or `useLiabilities` must be added to `fetchPortfolioDetails`.

Fix / safe approach:
When adding a new authenticated portfolio route, inspect its store hooks and
update `src/services/cloudStore.tsx` if it reads portfolio detail. Verify by
saving real cloud data on that route and confirming the UI reflects it.

Verification:
Run `npm run lint`, `npm run build`, and a focused authenticated Playwright
smoke for the route. For UI routes, also do a visual/page-open smoke.

Related files:
`src/services/cloudStore.tsx`, `src/routes/buckets/page.tsx`,
`src/routes/advanced/GoalsPage.tsx`, `src/routes/advanced/NumaPage.tsx`,
`src/routes/advanced/InsightsPage.tsx`.

## 2026-05-31 - Shared pods are single-currency unless FX is server-side

Symptom:
A direct Convex caller can create a USD expense or settlement inside an EUR
money pod. Web rollups convert with client FX, but the mobile backend snapshot
adds row amounts directly, so mixed-currency rows make mobile pod balances and
settlement drafts wrong.

Cause:
`podExpenses` and `podSettlements` store a per-row currency, while the current
mobile backend settlement rollup has no trusted FX conversion layer. UI usually
passes `pod.currency`, but backend mutations did not enforce that invariant.

Fix / safe approach:
Until shared pods have server-side FX conversion, require expense and
settlement currencies to equal the owning pod currency at every Convex write
boundary, including updates that keep an existing row currency.

Verification:
Run `npx convex codegen`, `npm run lint`, `npm run build`, and focused
shared-pod settlement tests.

Related files:
`convex/moneyPods.ts`, `convex/mobile.ts`, `src/lib/podSettlement.ts`.

## 2026-05-28 - Convex generated files are tracked but generated

Symptom:
Type bindings under `convex/_generated/` are stale or tempting to hand-edit.

Cause:
Convex generated API/data model files are committed artifacts derived from
server functions and schema.

Fix / safe approach:
Regenerate with `npx convex codegen` after server/schema changes. Never patch
`convex/_generated/` manually.

Verification:
Run `npx convex codegen`, then `npm run build` for schema/API type changes.

Related files:
`convex/_generated/`, `convex/schema.ts`, `AGENTS.md`.

## 2026-05-28 - Playwright auth suites skip without dedicated credentials

Symptom:
Authenticated browser tests are skipped, or production auth QA is blocked.

Cause:
The cloud-first Playwright tests require `NUMA_E2E_EMAIL` and
`NUMA_E2E_PASSWORD`, or explicit disposable account creation flags. Production
mutating QA is intentionally gated.

Fix / safe approach:
Use a dedicated dev test account for normal auth E2E. For production QA, do not
use a human account unless explicitly approved; disposable production QA needs
both `NUMA_E2E_CREATE_QA_ACCOUNT=1` and `NUMA_E2E_PRODUCTION_MUTATION_OK=1`.

Verification:
Run `npm run test:ui:auth` for dev auth QA or
`npm run test:ui:production:auth:required` only with the correct production QA
env.

Related files:
`tests/numa.spec.ts`, `scripts/require-e2e-env.mjs`, `AGENTS.md`.

## 2026-05-28 - Offline queued child writes can lose parent identity

Symptom:
Retrying queued writes creates orphaned or duplicated child records.

Cause:
Child writes that need a server-generated parent ID cannot safely replay unless
the server mutation creates the parent and children atomically.

Fix / safe approach:
Avoid queuing dependent child writes. Prefer one Convex mutation that accepts a
client mutation ID and writes the full aggregate.

Verification:
Add focused unit tests around queue behavior and idempotency receipts; run
`npm test`.

Related files:
`src/services/writeQueue.tsx`, `src/services/writeQueue.test.ts`,
`convex/lib/mutationReceipts.ts`.

## 2026-05-28 - API routes can spend money or expose data before safeguards

Symptom:
AI/OCR/market/push/webhook routes make provider calls or expose behavior before
auth/rate checks.

Cause:
Serverless routes are easy to edit in isolation; expensive provider work must
remain behind rate limits and auth/token checks.

Fix / safe approach:
Keep auth, token validation, CORS policy, input validation, and Convex-backed
rate limits before provider calls.

Verification:
Review route order and run focused tests/build. For release confidence, run
`npm run verify:production` after a confirmed deployment.

Related files:
`api/_utils/rate-limit.ts`, `api/chat.ts`, `api/parse-receipt.ts`,
`api/market-quotes.ts`, `api/fx-rates.ts`, `api/push-send.ts`,
`api/webhooks/transaction.ts`.

## 2026-05-28 - Vite dev server can hit listen EPERM in Codex sandbox

Symptom:
`npm run dev` exits with `Error: listen EPERM: operation not permitted
127.0.0.1:5173`.

Cause:
The default sandbox can block opening a local listening socket even though the
command is otherwise correct.

Fix / safe approach:
Inspect the active environment's socket permissions and any existing server
on the intended port. Use the allowed local runtime; escalation availability
depends on the current host. Do not change product code to hide a tool-level
permission error.

Verification:
`curl -I http://127.0.0.1:5173` with the same local-network permission returns
`HTTP/1.1 200 OK`, and the in-app browser loads `/welcome`.

Related files:
`package.json`, `vite.config.ts`.

## 2026-05-31 - Vite dev serves `api/*.ts` as modules, not serverless JSON

Symptom:
Authenticated Playwright smoke fails with a browser console error around
`/api/fx-rates` or `/api/market-quotes`, or `curl` against those local paths
returns `Content-Type: text/javascript` and the transformed source of the
serverless `api/*.ts` file instead of JSON.

Cause:
Local `npm run dev` starts Vite, not Vercel dev. Vite treats files under
`api/` as source modules unless a dev middleware handles the path, while
production Vercel serves them as serverless functions.

Fix / safe approach:
For passive browser-time API reads that must stay quiet in local dev, add a
small Vite `configureServer` middleware fallback. Keep the real production
serverless route under `api/` unchanged.

Verification:
Run `curl -i http://127.0.0.1:5174/api/fx-rates` and
`curl -i 'http://127.0.0.1:5174/api/market-quotes?symbols=BTC,AAPL'` against a
fresh Vite server and confirm JSON. Then run the focused Playwright smoke that
previously failed.

Related files:
`vite.config.ts`, `api/fx-rates.ts`, `api/market-quotes.ts`,
`src/services/fxSync.ts`, `src/services/marketData.ts`, `tests/numa.spec.ts`.

## 2026-05-28 - Shared pod renders false zeroes while child queries load

Symptom:
Opening the app in shared mode briefly shows `All settled`, `EUR0`, empty
members, or empty categories even though the cloud pot has real expenses.

Cause:
`moneyPods.listMine` can arrive before `listMembers`, `listGroups`,
`listExpenses`, and `listSettlements`. Store hooks then fall back to empty local
arrays, so the UI renders an empty-but-real-looking balance.

Fix / safe approach:
Treat a cloud pod as loading until `cloud.byPod[pod.id]` exists. Do not compute
or render settlement totals from fallback empty arrays for known cloud pods.
Prioritize pod child fetchers over heavy portfolio detail fetchers in shared
mode.

Verification:
Reload `/` in shared mode and confirm the first state is loading/skeleton, not
`EUR0`; after data arrives, the real pod balance and entries render.

Related files:
`src/services/cloudStore.tsx`, `src/services/store.tsx`,
`src/routes/pod/page.tsx`.

## 2026-05-28 - Existing cloud users can be sent through onboarding again

Symptom:
A returning user signs into an existing account and is redirected to the
post-signup onboarding flow as if the account were new.

Cause:
Onboarding completion was tracked only in per-device `localStorage`, so a
known cloud account looked fresh on a new browser or after local storage was
cleared.

Fix / safe approach:
Persist onboarding completion on the Convex profile (`onboardingCompletedAt`)
and keep the local marker as a fast cache only. Only run the onboarding flow
for an explicit current-session signup/provider-new-account marker; otherwise
remember the existing cloud account as already onboarded. Do not let
`/welcome` decide fresh-vs-returning while the profile is still in the
`cloud-loading` placeholder; route returning users into `/` and let the
protected onboarding gate decide. For fresh email sign-up, route directly to
`/onboarding/mode` once auth lands, and when onboarding completes,
await the profile write before navigating away so the server source of truth
survives localStorage clears, reloads, and immediate next sessions.

Verification:
Clear local onboarding markers for an existing account, reload `/`, and confirm
the app opens the account directly instead of `/onboarding/mode`.

Related files:
`convex/profiles.ts`, `convex/schema.ts`, `src/App.tsx`,
`src/lib/onboardingFlow.ts`, `src/lib/profileSync.ts`,
`src/routes/welcome/page.tsx`, `src/routes/onboarding/ReadyScreen.tsx`,
`src/services/auth.tsx`.

## 2026-05-31 - Auth Playwright navigation can race post-login redirects

Symptom:
Authenticated Playwright smoke fails with `page.goto` interrupted by another
navigation to `/`, usually right after sign-in/onboarding when opening
`/settings`.

Cause:
The app may still be finishing a legitimate post-auth redirect when the test
starts the next navigation. Bare `page.goto(..., waitUntil: "load")` treats
that overlap as a hard failure even if the product state is healthy.

Fix / safe approach:
Use the shared `gotoAndSettle` / `openSettings` helpers in auth tests so
interrupted post-auth navigation is retried/settled before assertions.

Verification:
Run `NUMA_E2E_CREATE_QA_ACCOUNT=1 npm run test:ui:auth`; mobile and desktop
cloud-first smoke should pass.

Related files:
`tests/numa.spec.ts`, `src/routes/welcome/page.tsx`, `src/App.tsx`.

## 2026-05-31 - Disposable E2E accounts must be isolated per browser project

Symptom:
Full Playwright smoke can fail only in one project with a generic Convex
access-control console error or a non-reproducible browser load error, while
the same test passes when rerun alone.

Cause:
`chromium` and `mobile` projects run in parallel. If disposable QA mode uses
the same generated email for both, the two projects mutate one cloud account at
the same time: mode, locale, portfolios, pods, and sign-out/delete paths can
race each other.

Fix / safe approach:
When `NUMA_E2E_CREATE_QA_ACCOUNT=1` and no explicit
`NUMA_E2E_EMAIL`/`NUMA_E2E_PASSWORD` are supplied, derive the QA email from the
Playwright project name. Keep explicit credentials shared only when the caller
intentionally provides a dedicated account.

Verification:
Run `NUMA_E2E_CREATE_QA_ACCOUNT=1 npm run test:ui`; the two projects should
create/sign into independent disposable accounts.

Related files:
`tests/numa.spec.ts`, `playwright.config.ts`.

## 2026-05-31 - WebKit can report benign `TypeError: Load failed` during route smoke

Symptom:
Mobile/WebKit Playwright route smoke occasionally records a page error with
the exact text `TypeError: Load failed`, even though the final route is visible,
healthy, and the same test passes when rerun alone.

Cause:
WebKit can surface aborted in-flight resource loads as a generic page error
when the test navigates quickly across SPA routes. This is different from the
real stale-chunk errors (`Importing a module script failed`, lazy `_result`
default errors) and different from Convex/action console errors.

Fix / safe approach:
Keep strict route-health assertions, but filter only the exact
`TypeError: Load failed` pageerror in the Playwright collector. Do not filter
lazy import, Router boundary, Convex, or console errors.

Verification:
Run the mobile `desktop mode navigation exposes the right product surface`
smoke and then the full UI smoke.

Related files:
`tests/numa.spec.ts`.

## 2026-05-28 - Client calls a new Convex function before dev backend is synced

Symptom:
The browser shows `Unexpected Application Error` with
`Could not find public function for '<module>:<function>'. Did you forget to run
npx convex dev?`.

Cause:
The Vite client was updated to call a newly added Convex query/mutation, but
the active DEV Convex deployment had not loaded the new server function yet.

Fix / safe approach:
Run `npx convex dev --once` against the DEV deployment after adding or renaming
Convex functions. Do not deploy production for local-browser fixes unless the
user explicitly confirms production deployment.

Verification:
`npx convex function-spec --deployment dev | rg '<module>.js:<function>'`
shows the function, then reload the local app.

Related files:
`convex/`, `convex/_generated/api.d.ts`, `src/services/cloudStore.tsx`.

## 2026-05-31 - Family settlement labels must net opposite member transfers

Symptom:
The shared-pod hero can say another family owes the user family the full
largest member-level transfer even when there is an opposite transfer between
the same two families. Example: `Sam + Kim -> Arseny + Maya €100` and
`Arseny + Maya -> Sam + Kim €80` should display a net €20 owed to the user
family, not €100.

Cause:
`buildMyPodSettlementView` grouped transfers by both direction and counterparty,
then picked the largest direction. That works for individual transfers but not
for family/party labels where member-level transfers can point both ways.

Fix / safe approach:
Aggregate by counterparty party first with signed amounts: incoming to my party
is positive, outgoing from my party is negative. Pick the largest absolute net
after opposite directions cancel. Only keep the one-click settlement draft when
exactly one underlying transfer contributed.

Verification:
Run `npm test -- src/lib/podSettlementView.test.ts`; keep a regression test for
opposite transfers between the same two family labels.

Related files:
`src/lib/podSettlementView.ts`, `src/lib/podSettlementView.test.ts`.

## 2026-05-31 - Production UI smoke can lag current branch features

Symptom:
`npm run verify:production` passes, but `npm run test:ui:production` fails on
a public UI assertion that passes locally, for example weak-password helper text
or legal routes. The failure page looks like an older production bundle.

Cause:
Production does not auto-update from local branch changes. Public production
smoke tests run against the deployed Vercel app, while local `npm run test:ui`
runs against the current worktree.

Fix / safe approach:
Do not weaken local tests just to make the old production bundle pass. Treat
the failure as a release/promote blocker: either keep it documented until a
confirmed deploy/promote, or run production smoke after the confirmed
deployment. Never deploy or promote production only to make a test green
without explicit current-thread approval.

Verification:
Run local `npm run verify`, then `npm run verify:production` and
`npm run test:ui:production`. If only production UI smoke fails on behavior
that the local bundle already verifies, compare the rendered production page
or test error context before changing tests.

Related files:
`tests/numa.spec.ts`, `scripts/verify-production.mjs`, `DEPLOYMENT.md`.

## 2026-05-30 - Body-wide MutationObserver can freeze heavy app screens

Symptom:
The browser shows "Page Unresponsive" while the shared pod is loading, often
over the skeleton state before expenses/categories finish rendering.

Cause:
A UI helper that observes `document.body` with `subtree: true` can turn large
React updates into repeated whole-document scans. On pod screens with hundreds
of rows, this blocks the main thread and makes the tab feel hung.

Fix / safe approach:
Avoid body-wide MutationObserver for decorative UI effects. For proximity
interactions, query `.nm-proximity-dock > .nm-proximity-item` only inside the
throttled `pointermove` frame and reset styles on pointer leave/blur.

Verification:
Reload `/` in shared mode and confirm the pod skeleton remains responsive and
settles into real data without a browser unresponsive dialog.

Related files:
`src/components/layout/ProximityDocks.tsx`, `src/routes/pod/page.tsx`.

## 2026-05-31 - PWA registration should not run in Vite dev

Symptom:
Mobile browser smoke intermittently records generic `TypeError: Load failed` or
`Importing a module script failed` during local `npm run dev`, even though the
visible route renders correctly.

Cause:
The production PWA service worker is generated for built/Vercel assets. In
Vite dev, `vite-plugin-pwa` has `devOptions.enabled=false`, so registration can
race against missing or stale dev worker/module resources.

Fix / safe approach:
Guard `registerPwa()` and `schedulePwaRegistration()` with `import.meta.env.DEV`
so local dev never tries to register the production worker. Keep production
registration enabled.

Verification:
Run the mobile Playwright smoke after a fresh dev-server restart and confirm no
page errors; `npm run build` should still generate `dist/sw.js`.

Related files:
`src/lib/pwa.ts`, `src/main.tsx`, `vite.config.ts`.

## 2026-05-30 - Cloud detail fetch can desync from the visible app mode

Symptom:
Returning users land on the correct shared screen, but the app still fetches
personal portfolio details, delays pod hydration, or briefly shows fallback
state after sign-in.

Cause:
The authenticated account object can lag behind local UI preferences during
the profile-loading window. Using `currentAccount.appMode` as the fetch gate
can therefore disagree with the mode that the router is actually rendering.

Fix / safe approach:
Use `useAppMode()` plus the current route as the source for client fetch gates.
While `currentAccount.id === "cloud-loading"`, avoid treating `/` as a final
personal or shared detail route.

Verification:
Reload `/` after signing into an existing shared-mode account. The route should
load pod details only after the mode/profile gate resolves and should not fetch
heavy personal portfolio children on the shared dashboard.

Related files:
`src/services/cloudStore.tsx`, `src/App.tsx`, `src/services/auth.tsx`.

## 2026-05-31 - Shared pod hero must aggregate by party, not member

Symptom:
The pod hero can show that one person owes another person inside the same
family group, or show only one member-level transfer even though the visible
business rule is two parties, for example `Arseny + Maya` vs `Sam + Kim`.
The same mismatch can also keep the `Settle` action enabled for a transfer
that the user should never see as actionable. The same bug can appear in the
iOS/mobile snapshot because `convex/mobile.ts` computes its own
`settlementSummary` instead of using the web view-model.

Cause:
`computePodSettlement` minimizes debts at the member level, but the shared pod
UI labels transfers with group names. A view-model that only checks
`fromMemberId` / `toMemberId` for the signed-in user can miss same-party
transfers, split a family-level balance into individual rows, or produce a
false self-debt when `fromName === toName`.

Fix / safe approach:
Build the signed-in settlement view by the user's party name
(`row.groupName ?? row.displayName`), aggregate same-counterparty transfers,
and ignore transfers where both sides have the same party label. Reuse the same
actionable-transfer predicate for the `Settle` button and sheet. Only offer a
one-click settlement draft when the aggregated display transfer maps to exactly
one underlying member-level transfer.
Keep the mobile snapshot summary in sync: label transfers by party, ignore
same-party transfers, net opposite transfers against the same counterparty, and
only return a recommended draft for a single underlying transfer.

Verification:
Run `npm test -- src/lib/podSettlementView.test.ts src/lib/podSettlement.test.ts`.

Related files:
`src/lib/podSettlement.ts`, `src/lib/podSettlementView.ts`,
`src/lib/podSettlementView.test.ts`, `src/routes/pod/page.tsx`,
`convex/mobile.ts`.

## 2026-05-31 - Custom shared-pod splits must be valid 10000 bps at the server boundary

Symptom:
Web, mobile, and historical exports can disagree on a custom-split expense
when `customSplits` does not exactly describe the selected participants, for
example duplicate split members, a split member outside
`participantMemberIds`, or basis points that do not total `10000`.

Cause:
The web settlement helper normalizes custom split totals, while the mobile
helper reads them as literal basis points (`bps / 10000`). Convex accepted
non-negative custom split rows without enforcing uniqueness, participant
membership, or a `10000` total.

Fix / safe approach:
Validate custom split inputs in every Convex write surface. For
`splitMode: "custom"`, require unique participants, unique split members,
split members drawn from `participantMemberIds`, integer non-negative bps, at
least one split, and total bps exactly `10000`.

Verification:
Run `npm run build`, `npm run lint`, and focused pod settlement tests after
changing shared-pod write validation.

Related files:
`convex/moneyPods.ts`, `convex/mobile.ts`, `src/lib/podSettlement.ts`.

## 2026-05-31 - Covered-group expenses must not fall back to self-paid splits

Symptom:
A covered-group expense can look paid and fully settled even though the chosen
covered group should owe the payer's group. For example, if an expense is
marked `covered_group` for `Sam + Kim` but its stored
`participantMemberIds` drift to `Arseny`, the settlement helper can charge
Arseny himself and produce no debt.

Cause:
`splitExpense` filtered covered-group shares only within
`participantMemberIds`, then fell back to equal people when no selected
participant currently belonged to `coveredGroupId`. Convex also validated that
the group existed, but did not require covered-group participants to belong to
that group.

Fix / safe approach:
For existing data, compute covered-group shares from the current covered group
when participant ids are out of sync. For new writes, reject
`covered_group` expenses unless every participant belongs to the covered group
and at least one covered participant is present.

Verification:
Run `npm test -- --run src/lib/podSettlement.test.ts`,
`npm run build`, and the full local `NUMA_E2E_CREATE_QA_ACCOUNT=1 npm run verify`.

Related files:
`src/lib/podSettlement.ts`, `src/lib/podSettlement.test.ts`,
`convex/moneyPods.ts`, `convex/mobile.ts`.

## 2026-05-31 - Viewport assertions must match the page shape

Symptom:
A shared dashboard smoke test fails because a button in a lower card is below
the mobile viewport, even though the primary hero actions are visible and the
page is intentionally scrollable.

Cause:
`expectMainControlsInViewport` checks every visible `input` and `button` in the
document. That is useful for first-screen forms and dialogs, but too broad for
scrollable dashboard pages with lower cards.

Fix / safe approach:
For dashboards, assert the specific primary control or panel that must be in
the first viewport, for example the balance card's main CTA. Keep the broad
helper for compact first-viewport surfaces only.

Verification:
Run the focused shared smoke in both Playwright projects:
`NUMA_E2E_CREATE_QA_ACCOUNT=1 npm run test:ui:auth -- --grep "mobile shared mode keeps the pod primary"`.

Related files:
`tests/numa.spec.ts`, `src/routes/pod/page.tsx`.

## 2026-05-31 - Import/export must not read local fallback for cloud data

Symptom:
A cloud user can open Import / export from a route that has not loaded full
portfolio details, such as the shared-pod surface. CSV export can then appear
successful while reading empty or stale local reducer arrays instead of the
current Convex portfolio/pod data.

Cause:
The dialog used generic store hooks. Those hooks intentionally fall back to
local reducer data when a Convex detail bundle is not present, which is useful
for legacy/local paths but unsafe for cloud account backups.

Fix / safe approach:
Import/export surfaces must fetch the specific Convex portfolio or pod bundle
they need while open, and block import/export until that source-of-truth bundle
has loaded. Do not treat local reducer fallback as a cloud backup.

Verification:
Run `npm run lint` and `npm run build`; smoke opening Import / export from
both `/settings` and the shared-pod surface when practical.

Related files:
`src/components/features/ImportExportDialog.tsx`,
`src/services/cloudStore.tsx`, `src/services/store.tsx`.

## 2026-05-31 - Failed queued writes must not trigger immediate flush loops

Symptom:
When a cloud write fails with a transient network/WebSocket/fetch error, the
write queue can immediately try the same failed operation again and again while
the app is still online. That can add network pressure and make the UI feel
sluggish exactly when connectivity is unstable.

Cause:
The auto-flush effect depended on the whole queue state, and `flushPending`
treated both `pending` and `failed` items as retryable. A failed attempt changed
queue state, recreated the flush callback, reran the effect, and picked the
same failed item again without a backoff boundary.

Fix / safe approach:
Use pending-only auto-flush signatures. A write that transitions to `failed`
should stay failed until an explicit retry path, such as the browser `online`
event, marks it pending again.

Verification:
Run `npm test -- --run src/services/writeQueue.test.ts`, `npm run lint`, and
`npm run build` after touching queue replay logic.

Related files:
`src/services/writeQueue.tsx`, `src/services/writeQueue.test.ts`.

## 2026-05-31 - Write-queue executors must cover every queued mutation kind

Symptom:
A queued operation can stay permanently failed with
`No executor registered for moneyPods.updateSettlement` even though the
matching Convex mutation exists and online direct updates work.

Cause:
The write queue's replay map had shared-pod settlement create/delete executors
but missed the update executor. Idempotency receipts only help if the queued
operation can be dispatched to the correct mutation.

Fix / safe approach:
When adding a queued mutation operation string, add the matching executor and a
focused test that invokes that executor key.

Verification:
Run `npm test -- --run src/services/writeQueue.test.ts`, `npm run lint`, and
`npm run build`.

Related files:
`src/services/writeQueue.tsx`, `src/services/writeQueue.test.ts`,
`src/services/podActions.ts`.

## 2026-05-31 - Existing shared-pod edits must use the write queue

Symptom:
Editing or deleting existing shared-pod records can look successful in the UI
flow but be lost when Convex has a transient network, WebSocket, or offline
failure. The queue contains money-pod replay executors, yet direct action calls
bypass them.

Cause:
`usePodActions` called Convex mutations directly for cloud shared-pod updates
and deletes. That made retry behavior inconsistent with portfolio, money, and
wealth writes that already use the durable write queue.

Fix / safe approach:
Route existing-id shared-pod update/delete actions through
`writeQueue.runOrQueue` using the same operation keys as the executor map.
Keep create/add operations synchronous until they have an explicit optimistic
id design, because callers may need the server-generated id immediately.

Verification:
Run `npm run lint`, `npm run build`, and
`npm test -- --run src/services/writeQueue.test.ts`.

Related files:
`src/services/podActions.ts`, `src/services/writeQueue.tsx`.

## 2026-05-31 - Clearing optional cloud fields needs an explicit sentinel

Symptom:
Editing a cloud transaction, recurring rule, category, asset, or liability to
remove optional fields can appear to save but leave the old value in Convex.
Examples include transaction category/account/notes/location, recurring
category/account/end date/notes, category emoji/monthly budget, asset notes,
and liability interest/due date/notes. The local fallback reducer updates
because it can merge `undefined`, but the cloud mutation treats `undefined` as
"field not provided".

Cause:
The client sent cleared optional fields as `undefined`, and the Convex
transaction update mutation filtered `undefined` out of the patch. That made
it impossible to distinguish "do not change this field" from "clear this
field".

Fix / safe approach:
Use `null` as the wire-level clear sentinel for optional cloud mutation fields,
then translate `null` to `undefined` inside the Convex patch so the optional
schema field is removed. Keep `undefined` reserved for untouched fields.

Verification:
Run `npm test -- --run src/services/domainActions.test.ts`, `npm test`,
`npx convex codegen`, `npm run lint`, and `npm run build`.

Related files:
`src/services/domainActions.ts`, `src/services/domainActions.test.ts`,
`convex/transactions.ts`, `convex/recurring.ts`, `convex/categories.ts`,
`convex/assets.ts`, `convex/liabilities.ts`.

## 2026-06-01 - Shared startup must not wait on unrelated cloud lists

Symptom:
After signing into an existing shared account, the shared pot can sit on a
generic loading state even though the browser has a recent local snapshot of
the same pot. Users perceive this as "all data loads from zero every time".

Cause:
`CloudDataProvider` used one global `cloud.loading` flag based on both
portfolio and pod list readiness, and the onboarding gate kept returning users
behind `cloud-loading` until the profile query resolved. The snapshot cache
was also keyed only after profile hydration, so password sign-in could not use
the email the user had already typed.

Fix / safe approach:
Scope snapshots by normalized sign-in email during `cloud-loading`, allow
returning non-onboarding sessions to render the shell immediately, and make the
shared surface's loading decision depend on pod readiness plus cached pod data
instead of portfolio readiness. When the cloud user id is not hydrated yet,
match the current pod member by email.

Verification:
Run `npm test -- src/lib/cloudStartup.test.ts src/lib/cloudSnapshotCache.test.ts`,
`npm test`, `npm run lint`, `npm run build`, and a targeted authenticated
Playwright smoke for shared startup/drag.

Related files:
`src/services/auth.tsx`, `src/services/cloudStore.tsx`,
`src/routes/pod/page.tsx`, `src/services/store.tsx`,
`src/lib/cloudStartup.ts`.
