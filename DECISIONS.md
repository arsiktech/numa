# Decisions

Durable decision log for Numa Pro. Add entries only when a decision constrains
future work.

## 2026-09-10 - Autonomous work with proportional verification

Status: accepted. Source: user requested a repo cleanup for GPT-6 Astra to
finish work faster without unnecessary prompts.

`AGENTS.md` is the canonical operating guide. Agents choose implementation and
sequence within the requested outcome, infer routine reversible decisions,
and reuse authorization already given in the task. Read relevant context on
demand. Plans, archived handoffs, external-vault notes, and design prompts do
not create new approval gates or expand the current task.

Run checks that exercise the changed behavior; do not repeat green gates or
require app builds for prose-only edits. Material UI work still needs rendered
verification. Startup timings apply when loading/performance changes. Update
durable docs when they change, without an automatic version bump or multiple
status reports for every edit. Production, credentials, paid-provider, Apple,
data-integrity, and product-separation boundaries remain in force.

This supersedes the broad operating loop in the removed `PLAYBOOK.md`, the
every-feature speed-smoke requirement below, and stale task-owner directions
in historical handoffs. The root and design-folder `CLAUDE.md` files import
the same canonical guide.

## 2026-09-08 - Use Numa Pro everywhere customers see the product

Status: accepted. Source: explicit user clarification “Use Numa Pro everywhere”;
Linear ARS-19. This supersedes only the customer-facing naming clause of the
2026-07-26 release-lane decision below. Web, installation metadata, native UI,
display name, and Apple listing copy use Numa Pro, not Numa or Numa CRM.
Preserve the existing coin/icon, palette and design language. This is not an
identifier migration: bundle `com.arsiktech.numa`, Apple ID `6788344832`, URLs,
schemas, auth/keychain/storage keys, internal symbols and compatibility `/pod`
remain unchanged. Numa Shared and historical release receipts stay untouched.
Local source changes do not rename deployed web or already-installed binaries;
deployment/upload and Apple metadata are separate authority and evidence gates.

## 2026-09-05 - Welcome glass is optional artwork, not an authentication gate

The web welcome screen interprets the layered glass and direct-manipulation
ideas from https://github.com/Appllama/liquid-glass-screens using Numa's own CSS,
coin artwork, existing icons, and motion tokens. No upstream code, shader,
artwork, Expo runtime, or package is incorporated. This is a CSS interpretation,
not optical shader refraction or Apple's native Liquid Glass material.

Keep the art decorative and outside keyboard/accessibility navigation. Login
and legal links are immediately available; never require a swipe, timer, or
animation completion. Pointer travel is bounded to the illustration, vertical
touch gestures retain scrolling, and reduced motion disables travel, including
when the OS preference changes while mounted. No perpetual animation loop.
Financial amounts and auth forms stay on clear, readable surfaces.

## 2026-09-05 - Personal entry prioritizes real money over presentation setup

Status: accepted

Decision:
New web accounts choose a mode and starting preferences, then enter the app.
Palette choice belongs in Settings; `/onboarding/style` redirects to mode and
`/onboarding/ready` only completes the existing profile/local marker contract.
Setup must remain scrollable when text grows or the viewport is short.

Personal Home must not invent an income target or interpolate a history curve
from current net worth and one monthly delta. Show income progress only against
an explicitly saved goal. With neither income nor a goal, omit the income panel.
Keep received and scheduled income distinguishable. Decorative quotations do
not precede personal balances.

The public landing page describes spending, goals, and capital using labeled
example figures. Optional AI, provider availability, automatic writes, and
always-live valuations are not unconditional marketing promises. Existing pod
data and the separate Numa Shared release lane remain governed by their existing
boundaries.

Source: first-principles simplification review, 2026-09-05.

## 2026-07-26 - Numa Pro and Numa Shared are separate release lanes

Status: accepted

Context:
The Numa repository contains the personal-capital web/backend product, a native
iOS client, a legacy integrated shared-pot surface, and some Shared design
artifacts. A separate `Numa Shared` repository now owns the standalone shared
household product. Treating these as one app confuses release evidence,
identifiers, deployment targets, and App Store work.

Decision:
Call this repository and release lane **Numa Pro** while retaining **Numa** as
the customer-facing name unless product naming changes explicitly. Numa Pro
owns `numa-ecru.vercel.app`, the `fine-quail-653` production Convex deployment,
and native bundle `com.arsiktech.numa`. The sibling Numa Shared repository owns
standalone Shared behavior, its `tech.arsik.numashared` bundle, its own backend,
and its TestFlight/App Store release. The Numa Pro `/pod` route remains a
compatibility capability; it does not make this repository the source of truth
for Numa Shared.

Consequences:
Keep release plans, QA evidence, credentials, schemas, App Store records, and
deployment actions product-specific. Do not copy new Numa Shared work into this
repository. Do not remove the integrated pod or its data without a migration
decision. Move or archive misplaced Shared-only artifacts only with explicit
approval so history is not lost.

Source:
`AGENTS.md`, `docs/NUMA-PRO-PUBLIC-RELEASE.md`, and the two repositories' bundle,
deployment, and release records.

## 2026-07-09 - Crypto wallets are watch-only, first-class capital sources

Status: accepted

Context:
Advanced mode needs current public-chain balances and DeFi exposure without
turning Numa into a wallet signer or mixing provider snapshots into manual
holdings.

Decision:
Store tracked public addresses in the dedicated `cryptoWallets` Convex table.
Never ask for or persist a seed phrase/private key; reject secret-looking input
before a write. Bitcoin MVP input is checksum-validated mainnet `bc1` only;
Solana keys must decode to exactly 32 bytes. Fetch Moralis only from the
authenticated server route using
owned wallet ids, preserve a normalized last-good snapshot, refresh token data
after 10 minutes and DeFi data after 6 hours, and gate both token and expensive
DeFi refreshes with deployment-wide daily budgets. Manual refresh can bypass
the token TTL only after a one-minute cooldown; it never bypasses the DeFi TTL.
DeFi is opt-in (`NUMA_CRYPTO_DEFI_ENABLED=1`) because Moralis gates it behind
paid plans; each budget unit is capped to one 100-position provider page.
Per-user rolling-24-hour quotas sit below the deployment-wide ceilings so one
editor cannot consume the shared provider allowance. DeFi authorization occurs
only after a token result is accepted. An atomic 90-second Convex lease prevents
two app surfaces from paying to refresh the same wallet concurrently.
`includeInNetWorth` is an explicit
per-wallet control. Capital adds on-chain token/DeFi assets and DeFi debt as
separate gross sides; it never creates synthetic manual `Holding` rows and
never replaces a successful snapshot with a failed zero.

Consequences:
Provider/API keys remain server-only. New crypto providers must adapt into the
same normalized snapshot instead of leaking provider shapes into UI or Convex.
DeFi coverage is provider/protocol dependent and must remain visibly
estimated/partial. Public quantities remain bounded decimal strings, source
totals are independent of bounded display rows, and partial-chain responses
retain the prior source snapshot. Portfolio/account deletion must cascade wallet snapshots,
and data export must include public addresses and saved snapshot contents.

Source:
`convex/cryptoWallets.ts`, `api/crypto-wallet-sync.ts`,
`api/_utils/crypto-provider.ts`, `src/lib/cryptoWallets.ts`,
`src/components/features/CryptoWalletSection.tsx`.

## 2026-05-28 - Convex Auth is required at runtime

Status: accepted

Context:
Numa v2 is a cloud-first money app. The old product local-auth fallback has
been removed.

Decision:
Runtime auth requires `VITE_NUMA_CLOUD_AUTH=1` and `VITE_CONVEX_URL`. If either
is missing, the app renders the cloud configuration required screen instead of
mounting a local account fallback.

Consequences:
Future agents must not reintroduce product local-auth behavior. Local storage
may hold UI prefs, caches, and retry state, but not the cloud account product
database.

Source:
`AGENTS.md`, `src/services/auth.tsx`.

## 2026-05-28 - Product writes go through typed action layers

Status: accepted

Context:
Numa mirrors Convex data into client state and keeps a compatibility reducer
for local prefs and fallback surfaces.

Decision:
Reads go through hooks exported from `src/services/store.tsx`. Product writes
go through `src/services/domainActions.ts`, `src/services/podActions.ts`, or
the queued write path in `src/services/writeQueue.tsx`.

Consequences:
Do not add new cloud product writes through raw reducer dispatch. New mutable
cloud fields must be wired through types, Convex schema/functions, mappers,
typed actions, UI, and focused tests.

Source:
`AGENTS.md`, `src/services/cloudStore.tsx`, `src/services/domainActions.ts`,
`src/services/podActions.ts`, `src/services/writeQueue.tsx`.

## 2026-05-28 - Mutations that can replay use clientMutationId receipts

Status: accepted

Context:
Offline retry and repeated client submissions can otherwise duplicate finance
records.

Decision:
New domain mutations should accept `clientMutationId?: string` and use
`convex/lib/mutationReceipts.ts` when replay would duplicate data.

Consequences:
Future offline or retryable writes need idempotency at the Convex boundary.
Avoid queuing child writes that depend on server-generated parent IDs unless a
single server mutation handles the whole operation atomically.

Source:
`AGENTS.md`, `convex/lib/mutationReceipts.ts`, `src/services/writeQueue.tsx`.

## 2026-05-28 - AI actions are draft-first and audited

Status: accepted

Context:
AI features can propose financial changes grounded in portfolio data.

Decision:
AI-created changes are drafts first. Mutations require explicit user
confirmation and write audit rows in `aiActionDrafts`.

Consequences:
Do not let chat, OCR, or voice flows apply financial mutations silently. Keep
auth and rate limits before expensive provider calls.

Source:
`AGENTS.md`, `convex/aiActions.ts`, `api/chat.ts`, `api/parse-receipt.ts`.

## 2026-05-28 - Shared pod is the mobile-first priority surface

Status: superseded as the repository-wide priority by the 2026-07-26 Pro/Shared
release-lane decision. Preserve the existing Pro shared-mode behavior below;
standalone Shared development belongs in its own repository.

Context:
Numa supports personal money, wealth, and shared mobile money pods, but `/pod`
is the product-priority surface.

Decision:
Keep `/pod` primary and mobile-first. Shared mode routes home to the pod and
hides personal finance surfaces that do not apply to pot-only workflow.

Consequences:
Preserve create/edit/delete expenses, card labels, splits, settlements,
invite/member/group flows, and one-thumb ergonomics when changing navigation or
capture.

Source:
`AGENTS.md`, `src/App.tsx`, `src/routes/pod/page.tsx`.

## 2026-05-28 - Production actions require exact current-thread confirmation

Status: accepted; clarified 2026-09-10. Explicit authorization already given
for the action in the current task satisfies this rule. Do not ask twice.

Context:
Production Convex and Vercel actions can mutate data, change auth, or spend
money.

Decision:
Do not run production deploys, production env changes, production migrations,
production wipes, or destructive Convex operations without explicit
confirmation for that exact action in the current conversation.

Consequences:
Name the target before any deploy/env/migration command. Prefer dev Convex and
dedicated test accounts for QA.

Source:
`AGENTS.md`, `DEPLOYMENT.md`.

## 2026-05-28 - OAuth linking is explicit and current-session safe

Status: accepted

Context:
Password accounts in Numa are cloud accounts but are not email-verified by a
separate email flow. Plain OAuth sign-in cannot safely assume that a matching
email should claim an existing password account.

Decision:
Account linking from Settings uses the current authenticated session as the
source of truth. OAuth providers may attach to the signed-in user, but a
provider account already linked to another Numa user is rejected. Google
linking also requires the OAuth email to match the current Numa account email.
Password changes require the current password and invalidate other sessions.

Consequences:
Do not add provider-link buttons that just perform a blind OAuth sign-in.
Keep password and provider management behind authenticated settings, and keep
production auth/env changes gated by explicit confirmation.

Source:
`convex/auth.ts`, `convex/authManagement.ts`, `src/routes/settings/page.tsx`.

## 2026-05-28 - UI uses design tokens instead of literal component colors

Status: accepted

Context:
Numa supports multiple themes and dark mode through CSS tokens.

Decision:
Use tokens from `src/styles/tokens.css` and `src/styles/themes.css`. Avoid
literal component colors such as `bg-white`, `text-black`, and hard-coded hex
borders, except for the intentional light-only landing page.

Consequences:
Verify important UI in light, dark, desktop, and sub-640px mobile widths.

Source:
`AGENTS.md`, `src/styles/tokens.css`, `src/styles/themes.css`,
`src/routes/landing/page.tsx`.

## 2026-05-28 - Treat likely global UI bugs as global checks

Status: accepted

Context:
A layout issue found on one screen can reveal a repeated component or design
pattern problem, especially across responsive desktop/mobile variants.

Decision:
When a bug may be global, inspect and fix the shared component or neighboring
screens instead of patching only the visible instance. For UI work, verify the
affected flow on desktop/web and mobile dimensions when practical.

Consequences:
Future agents should widen investigation from the reported screen to the route
family, shared layout, and reused components before handoff.

Source:
User instruction in Codex thread on 2026-05-28.

## 2026-06-01 - Every app change needs a physical speed smoke

Status: superseded by the 2026-09-10 proportional-verification decision.
Keep rendered QA for material UI changes; measure startup when a change affects
loading or performance. The original rationale is retained below as history.

Context:
Numa's product quality depends on feeling instant in the user's hands. Build,
unit, and lint checks can pass while the actual app still opens slowly or
feels stuck after sign-in.

Decision:
For every feature or fix that touches app UX, auth, routing, data loading,
shared pods, or performance, physically test page-open speed before handoff.
Use Playwright or the in-app browser on the real route, measure cold/warm
startup where practical, and report the route, environment, timing evidence,
and any console/runtime errors.

Consequences:
Do not hand off app changes with only static verification. When a production
deploy happens, include a production smoke and use authenticated speed smoke
when dedicated QA credentials are available. Human accounts are not test data
unless the user explicitly approves that run.

Source:
User instruction in Codex thread on 2026-06-01.

## 2026-06-01 - Shared startup may use stale cloud snapshots before profile hydration

Status: accepted

Context:
Returning users can have a valid Convex session while the profile query is
still hydrating. Blocking the whole authenticated app on that profile keeps
the shared-pot screen blank even when the browser already has a recent
per-account cloud snapshot.

Decision:
Shared mode should use a stale-while-revalidate startup path. If the app can
derive a safe account key from the email used for sign-in or from cached
account metadata, it may read the local shared-pot cloud snapshot during the
`cloud-loading` window, render that immediately, and let Convex refresh it in
the background. Fresh signups/OAuth onboarding still stay behind the loader.

Consequences:
Do not make the `/` shared surface wait for portfolio-list readiness or profile
hydration when pod snapshot data is available. Keep the cache scoped by Convex
deployment plus normalized account identity, and match the current pod member
by email while the real cloud user id is still loading.

Source:
Performance investigation in Codex thread on 2026-06-01.

## 2026-05-30 - Dock-like controls respond to pointer proximity

Status: accepted

Context:
Hover is too binary for controls that behave like a dock. The user wants
nearby elements to react before direct hover so the interface feels more
responsive and alive.

Decision:
Use proximity interaction for compact dock-like controls where it helps
orientation: sidebar navigation, bottom navigation, and floating action
clusters. Scale and subtly darken/saturate nearby items by pointer distance,
with reduced-motion and coarse-pointer safeguards. Run the proximity scan only
on pointer intent; do not watch the whole document for mutations. Do not apply
this globally to dense content cards, forms, or financial rows unless the
interaction itself is meant to feel dock-like.

Consequences:
Future compact control clusters can opt into `.nm-proximity-dock` and
`.nm-proximity-item` instead of adding one-off hover scripts. Keep the effect
subtle enough that layout does not jump and the user's reading flow stays
stable.

Source:
User instruction in Codex thread on 2026-05-30.

## 2026-05-30 - Keep startup work focused on the current interaction

Status: accepted

Context:
Numa should feel snappy in hand. Startup code that loads rare dialogs,
registers background workers immediately, or fetches unrelated personal data
can make the first useful screen feel slower even when the app is technically
working.

Decision:
Defer non-critical work until intent or idle time. Lazy-load rarely used
dialogs and command surfaces, warm them on pointer/focus intent where useful,
schedule PWA registration after first paint, and avoid fetching personal
portfolio detail payloads on pod-only routes.

Consequences:
Future feature work should preserve fast first meaningful paint. New modal,
AI, import/export, tour, or admin surfaces should be lazy unless they are
required to render the first screen. Background sync should be scoped to the
route/app mode that actually needs it, and cloud detail queries should prefer
the profile-backed app mode over still-stale local mode during boot.

Source:
User performance request in Codex thread on 2026-05-30.

## 2026-06-01 - Cloud snapshots may cache read-only first paint

Status: accepted

Context:
Large shared pods can take too long to hydrate from Convex on repeat visits,
leaving returning users staring at empty or loading states even though the
last successful cloud snapshot is already known on that device.

Decision:
Use a scoped, TTL-bounded local snapshot cache for read-only first paint. The
cache is keyed by Convex deployment and account identity, is replaced by fresh
Convex data in the background, and must never become the product write source
of truth.

Consequences:
Future performance work may add similar read-through caches for heavy cloud
reads, but writes must continue through typed Convex actions and mutation
receipts. Cache snapshots must be size-bounded, versioned, scoped per account,
and allowed to disappear without data loss.

Source:
User performance request in Codex thread on 2026-06-01,
`src/lib/cloudSnapshotCache.ts`, `src/services/cloudStore.tsx`.

## 2026-05-31 - Password creation enforces a baseline strength policy

Status: accepted

Context:
Email/password accounts should not allow obviously weak passwords at account
creation or password-change time.

Decision:
Use one baseline policy for password sign-up, reset/provider validation, and
authenticated password changes: at least 10 characters, sufficient character
variety, and rejection of common, repeated, sequential, or account-derived
passwords.

Consequences:
Future password entry surfaces must reuse `convex/lib/passwordPolicy.ts` (or an
intentional server/client replacement) instead of adding one-off length checks.
Keep enforcement at the Convex Auth/server boundary, with client validation
only as early user feedback.

Source:
User instruction in Codex thread on 2026-05-31,
`convex/lib/passwordPolicy.ts`, `convex/auth.ts`, `convex/authManagement.ts`.

## 2026-05-28 - Shared pod startup uses a bundled child query

Status: accepted

Context:
The shared-pot home screen needs members, groups, expenses, and settlements
together before it can show a trustworthy balance. Fetching those as separate
startup queries increases round-trips and makes the UI wait on the slowest
independent response.

Decision:
Use a Convex bundled read for the primary shared-pot startup payload. The
client should hydrate `cloud.byPod[pod.id]` from that bundle and avoid showing
fallback empty arrays as real data while the bundle is loading.

Consequences:
Future shared-pot startup work should keep first meaningful paint focused on
the selected pot. Add separate queries only for secondary/detail surfaces or
pagination, not for the required initial balance.

Source:
`convex/moneyPods.ts`, `src/services/cloudStore.tsx`.

## 2026-05-28 - Prefer continuity transitions where they preserve context

Status: accepted

Context:
Numa should feel super simple and spatially understandable. Abrupt jumps
between related UI states make users re-orient, especially in shared money
flows where the same object moves from a list/card into editing or detail.

Decision:
Use continuity transitions where appropriate: cards can smoothly expand into
detail views, selected elements can visually carry into the next state, and
modals/sheets should preserve an obvious visual relationship to the thing that
opened them when the interaction benefits from it.

Consequences:
Future UI work should prefer connected state changes over unrelated hard cuts,
while keeping motion restrained, fast, accessible, and respectful of reduced
motion settings. Do not add decorative motion when it does not clarify the
user flow.

Source:
User instruction in Codex thread on 2026-05-28.

## 2026-05-28 - Shared pod dashboard blocks are user-arrangeable

Status: accepted

Implementation note (2026-09-10): current `src/routes/pod/page.tsx` has fixed
dashboard blocks; the old drag helper and rearrangement test are absent. This
entry preserves the earlier design direction, not proof of current behavior or
an instruction to restore it during unrelated work.

Context:
The shared-pot page must stay compact and keep the most important blocks in
view, but different users may prefer balance, settlements, categories, history,
or people first.

Decision:
Render the shared-pot home as rearrangeable dashboard blocks with smooth
continuity animation. Use predetermined grid slots/drop cells that catch a
dragged block and preview the resulting layout immediately; do not use
freeform dragging or Framer `Reorder` directly on a CSS grid. The dragged card
should behave like an iOS-style widget: lift into a floating layer, leave a
soft placeholder in its original cell, and let neighboring blocks glide into
the previewed slot. Store the block order per pot as a UI preference so each
shared budget can keep its own layout.

Consequences:
Future shared-pot blocks should be added through the dashboard block order
model, include a drag handle, preserve inner click/edit interactions, and keep
the default layout compact before any user customization.

Source:
`src/routes/pod/page.tsx`.

## 2026-05-28 - Shared pod balance is all-history and settlements can be partial

Status: accepted

Context:
Shared pots are used as ongoing balances between groups/families. A month
picker on the shared-pot surface made the debt look period-scoped, and a
single "mark paid" action did not support real partial repayments.

Decision:
The primary shared-pot balance should be treated and presented as all-history
unless a future flow explicitly asks for a period report. Settlement actions
must let the user enter the amount paid, including partial payments, and then
recompute the remaining balance from the settlement ledger.

Consequences:
Do not show global period selection on the shared-pot surface. Keep a full
activity/history view for shared pods, and avoid destructive or one-click full
settlement flows when the real-world payment may be partial.

Source:
User instruction in Codex thread on 2026-05-28.

## 2026-05-29 - App version is visible and logged

Status: accepted

Context:
The app needs a small visible version marker and a durable place to track
changes by application version.

Decision:
Show the current `package.json` version in the lower-left sidebar and maintain
`VERSION_LOG.md` as the app-version change log.

Consequences:
When bumping `package.json` version or shipping notable product changes, update
`VERSION_LOG.md` in the same pass. Keep the UI marker sourced from the shared
version helper instead of duplicating a literal version string in components.

Source:
`src/lib/version.ts`, `src/components/layout/Sidebar.tsx`,
`VERSION_LOG.md`.

## 2026-05-28 - Shared pod balances speak in groups when groups exist

Status: accepted

Context:
Some shared pods represent families or pairs, not four independent people.
Showing "Sam owes Arseny" is misleading when the real parties are "Sam +
Kim" and "Arseny + Maya".

Decision:
When a pod member belongs to a `podGroup`, settlement transfer labels should
use the group name as the visible counterparty. The member id may still be used
as the technical representative for writes, but UI wording should not imply
debt inside a family/group.

Consequences:
Grouped pod imports and UI should avoid individual debt language unless the
flow is explicitly about a person outside a group. Tests should cover transfer
labels for grouped pods.

Source:
User correction in Codex thread on 2026-05-28.

## 2026-05-28 - UI prioritizes real user flow and simplicity

Status: accepted

Context:
Numa should feel super simple to use. Every screen competes with the user's
attention, and money workflows must stay obvious under real use.

Decision:
Design each page around the next real user action. Show only the information
needed for that workflow, in the order the person will naturally read, move,
click, type, review, and confirm. Prioritize the user's path through the
screen over decorative density, feature showcasing, or implementation
structure.

Consequences:
Future UI work should start from the user's immediate goal and interaction
sequence. Remove or defer information that does not help the current decision,
make primary actions visually and spatially obvious, and validate screens by
asking where the user looks and clicks first.

Source:
User instruction in Codex thread on 2026-05-28.

## 2026-05-28 - Web dialogs should avoid internal scroll for quick flows

Status: accepted

Context:
Quick money actions become harder when a desktop modal behaves like a tall
mobile sheet and hides the primary action behind an internal scroll area.

Decision:
On web/desktop, quick-entry dialogs should fit the normal viewport without
internal scrolling whenever practical. Prefer wider layouts, compact vertical
rhythm, visible review state, and an always-visible primary action. Keep
scrolling only as a fallback for genuinely long content or inherently
scrollable surfaces like chat, search results, import previews, and OCR result
lists.

Consequences:
When fixing one scrolled modal, inspect shared dialog primitives and sibling
quick-entry flows. Do not solve desktop density by hiding essential fields;
reorder and group them by user flow instead.

Source:
User instruction in Codex thread on 2026-05-28.
