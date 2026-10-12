# Version Log

Durable app-version log for Numa. Keep web versions aligned with `package.json`
and the visible sidebar marker. Native iOS entries record their Xcode marketing
version and build independently.

## v0.11.2 - 2026-09-05 (local candidate)

The web welcome illustration uses original layered glass around Numa's coin,
with bounded pointer/touch movement, a moving highlight, and a spring return.
It replaces decorative example amounts with three product icons. Login remains
immediately available; no gesture is required. Reduced motion also updates live,
and short viewports or enlarged text can scroll to signup and legal links.
No new dependencies, backend changes, native changes, or deployment.

## v0.11.1 - 2026-09-05 (local candidate)

Simplifies the public page around spending, goals, and capital. Removes repeated
marketing sections, unsupported automatic/live claims, inert mock controls,
mandatory palette setup, and the 2.6-second ready countdown. Setup keeps two
steps and scrolls for enlarged text and short viewports. Personal Home removes
the typing quotation, invented history curve, and default EUR 50,000 income
target; income goals still use the user's saved amount. Native income targets
follow the same rule, and editing preserves saved cents. Email entry no longer
uses delayed autofocus that can interrupt typing. No production deployment or
native release is implied by this local web version.

## iOS v1.2.0 (build 202608232152) - 2026-08-23

The first production-ready native Numa Pro candidate brings the personal money
workspace to `com.arsiktech.numa`: native sign-in and onboarding, weekly money,
transactions, Capital, goals, Shared Pot compatibility, and reviewed Ask Numa,
voice, and receipt capture flows against the production-wired Convex/API pair.

Release hardening adds account-scoped local caches, bounded AI inputs, one-shot
bearer refresh, generation-safe account switching, offline-safe session refresh,
idempotent writes, and atomic AI draft confirmation so reviewed capture results
cannot be duplicated, silently drift, or bypass audit. The matching Convex and
Vercel production contracts must be deployed and smoke-tested before this build
is assigned to TestFlight testers.

## v0.11.0 - 2026-07-09

Advanced Capital can now track up to eight read-only public EVM, Solana, and
Bitcoin mainnet `bc1` addresses. A first-class Convex wallet model stores only the public
address, settings, and last successful normalized snapshot; Moralis access is
server-side behind authenticated wallet ids, atomic per-wallet refresh leases,
cache windows, rate limits, and per-user plus deployment-wide token/DeFi budgets.
DeFi is explicitly enabled only for a paid provider plan and is called only
after an acceptable token result. Tokens, supported DeFi positions, and borrowing
roll into Capital as separate gross assets and debts, with an explicit
per-wallet switch to prevent double-counting manual holdings. Exact receipt/LP
token address matches are reconciled into DeFi once, and large token quantities
remain bounded decimal strings instead of losing precision in JavaScript.

The Citrus UI adds Track wallet entry points, responsive wallet summaries and
token/DeFi detail, partial/stale states, spam-token hiding, secret-phrase
rejection before any write, two-step removal, and CSV data export. Snapshot
values feed Capital, goals, insights, home movement, and automatic wealth
snapshots; a provider failure retains the last good values instead of showing
a false zero. No production deployment or environment change is part of this
version update.

## v0.10.0 - 2026-07-02

The "realize everything pending" release — three waves in one version.

**Wave 1 — money-correctness sprint (7 QA fixes):** per-account profile stash
(cross-account preference leak closed); transient online write failures
re-queue as pending with capped backoff instead of being silently dropped; the
four pod `add*` mutations now run through the idempotent write queue and batch
quick-add uses stable content-derived `clientMutationId`s (a retried batch
can't duplicate or lose entries); live market quotes are treated as
USD-denominated everywhere (`QUOTE_CURRENCY` + `holdingValueCurrency` —
invested rollups, holding rows/detail, capital movement, goals, home surfaces),
fractional no-quote holdings price at cost instead of half of it; goal
contributions use a new atomic `assets.adjustBalance` server increment (races
converge, receipts dedupe) with a visible 13-digit cap instead of silent
truncation; buckets/goals totals no longer double-count net-worth goals;
settlement parties are keyed by stable party id, so same-name members can't
merge balances.

**Wave 2 — pending features:** Simple mode can finally record **income**
(Expense/Income toggle in the add sheet — buckets fill through normal use);
History gains **category filter chips** (period-scoped, frequency-ordered);
Shared Pot gains **custom % splits** (per-member integer shares with a live
100% meter — exact 10000 bps at the server) and **shareable invite links**
(`podInvites`: SHA-256-hashed one-per-pod codes with a 7-day TTL, owner
copy/share/revoke UI, `/pod?join=CODE` redemption that re-activates tombstoned
members instead of duplicating them).

**Wave 3 — polish + i18n:** European decimal handling in CSV import and text
capture; hero amounts scale with `clamp()` instead of clipping; switch-mode
sheet scrolls; Classic palette migrates to Citrus on hydrate; password card
stops flashing "unavailable" while loading; MoneyPage rollups memoized;
buckets recent-adds sorted/scoped and the dead-end holding CTA hidden;
single-event sparkline draws a baseline; shared-mode onboarding asks the pot
name (prefills first-run) instead of a weekly-spend picker; ReadyScreen enters
local-first; pod leave/delete surface queued-offline state and clear the
stored active-pod pointer; `useFocusTrap` extracted from Dialog and applied to
the three hand-rolled sheets; pod leave/delete flow, AddMoneyDialog, and the
Buckets page fully localized (en/ru/es, proper Russian plurals).

## v0.9.13 - 2026-06-24

Shared Pot → Add expense: the "Paid by" picker now lists members under their
**group headers** (the group's colour dot + name) when the pod has groups, so
it's clear who belongs to which side — e.g. the two couples. Flat list when
there are no groups; any ungrouped members fall under a "No group" header.

## v0.9.12 - 2026-06-24

Welcome hero gains a third A/B option — **"3D"**: the CSS `NumaCoin3D` rotating
through depth (a real 3D spin + the "n" mark), alongside "Coin" (the photoreal
render, floating) and "Orb". Lets us compare the photoreal-still look vs the 3D
spin for the hero. Default stays "Coin". (The 3D spin/flip is also already live
in the loading spinner, goal-reached flip, and contribution celebration.)

## v0.9.11 - 2026-06-24

The brand pipeline is now fully coin-based.

- Social og:image (the shared-link preview) regenerated from the coin render +
  a "Numa" / "Track money." wordmark lockup (was the old pot+coin master).
- Rewrote scripts/generate-icons.mjs to isolate the coin from the render sheet
  and produce every asset (in-app logo sources, PWA/favicon/apple-touch icons,
  og:image) from it — re-runnable + consistent, so it no longer reverts to the
  pot+coin master.
- Removed unreferenced legacy assets (brand-mark.png, hero-icon.png,
  marketing-render.png).

## v0.9.10 - 2026-06-24

The photorealistic coin render is now the logo (by request — the actual 3D coin
picture, not the CSS approximation):

- New `public/numa-coin.png` (3/4 tilt) + `numa-coin-front.png` (face), isolated
  onto transparency from the coin-render sheet (flood-filled the light tile, kept
  the soft contact shadow). New `NumaCoinLogo` component renders them.
- Every static brand mark now uses the render: welcome hero (gentle float),
  sidebar, landing (header/hero/footer), pod headers, home cards, the pot, and
  the card watermarks. Favicon + apple-touch + PWA icons regenerated from the coin.
- The CSS `NumaCoin3D` stays only where motion needs true 3D rotation — the
  loading spinner, the goal-reached flip, and the contribution celebration.

## v0.9.9 - 2026-06-24

Delight: the signature coin celebration. The motion-delight lens of the design
diagnostic scored highest but noted the app's best moments had no payoff.

- New `CoinCelebration` (src/components/brand/CoinCelebration.tsx): a brief,
  tasteful brand beat on a positive money milestone — a flipping NumaCoin3D over
  a lime burst + expanding ring + a "+ €X" pill, auto-dismissing after ~1.45s,
  portalled above any dialog, pointer-transparent, reduced-motion safe.
- Wired to a successful goal/bucket contribution (AddMoneyDialog gained an
  `onCelebrate` hook; GoalsPage + Buckets render the flourish). Adding to your
  savings now feels like a win — the on-theme "growing your money" moment.

## v0.9.8 - 2026-06-24

The 3D coin is now the ONLY brand mark, app-wide — every flat coin + raster PNG
retired.

- Replaced every flat `NumaCoin` + `/brand-mark.png` with `NumaCoin3D`: the pod
  header + pod sidebar, the Simple/Advanced home CTA watermarks, the landing page
  (header logo, a big floating hero coin, the in-card + footer marks), the gated
  NumaPage header, and the `NumaPot` cauldron now cradles the 3D coin.
- Added an `idle` (static) mode for logo/watermark placements; deleted the dead
  flat `NumaCoin` component.

Design note: the diagnostic's "reclaim lime as a fill accent" is a deliberate
direction — the current progress fills are already contrast-correct (lime on dark
surfaces, ink on light-lime tracks), so a blind lime-everywhere would *reduce*
legibility. Held for a guided pass.

Verified: build, 193 unit tests, eslint clean, 39 E2E green; coins checked live
on landing + home + sidebar (light/dark, mobile/desktop).

## v0.9.7 - 2026-06-24

Brand glow-up + welcome A/B, informed by a 6-lens design diagnostic
(`docs/design/2026-06-24-diagnostic.md`).

- **3D Numa coin** (`NumaCoin3D`): a real CSS `preserve-3d` coin — engraved "n" +
  lime bead, reverse rings, ridged edge — with spin / float / flip / idle modes,
  tokenised so it tracks palette + dark mode. Now the persistent Sidebar logo
  (was a flat PNG), the route loader (spins), and the "Goal reached" moment
  (flips a coin — was a flat gray pill).
- **Welcome A/B**: variant A = the bright, large 3D coin (default); variant B =
  the original neon aurora orb. A persisted "Coin / Orb" toggle compares them.
- **Tagline**: dropped "Quietly" everywhere → "Track money." (en/ru/es, `<title>`,
  OG/Twitter, icon generator).
- **Language**: confirmed Numa auto-follows the browser/device locale unless the
  user manually picked one (already correct — no change).
- **A11y**: dark-mode `--color-ink-4` raised #857f72 → #989183 (3.95:1 → ~4.9:1).

The diagnostic scored the app ~5.7/10 — a strong, well-engineered foundation
that under-spends its brand. Top deferred bets: reclaim the lime as a real fill
accent (it only survives as button-text today), unify the typography scale (the
`--text-*` tokens are unused; 38 ad-hoc sizes), wire gold-lime into the data viz,
and add capture/settlement reward beats.

## v0.9.6 - 2026-06-24

Close-QA pass before the friends launch — PC + mobile sweep plus a multi-agent
audit (49 confirmed findings). Fixed the launch-critical set:

- **Onboarding mode now persists.** Accepting the pre-selected "Advanced" via
  Continue (without tapping a card) never committed the choice — the cloud kept
  the signup default `light`, so users silently reverted to Simple on the next
  session once the 60s local grace expired. Continue now commits the highlighted
  selection to the cloud profile (verified: fresh signup → cloud holds advanced).
- **AI fully hidden — no leaks.** "Numa AI" still showed in the desktop sidebar
  and the mobile bottom nav (dead links → bounce home), and Scan/Voice/AI-chat
  affordances leaked through the Light add sheet, Universal Capture tabs, the ⌘J
  shortcut, and the search palette. All gated behind `VITE_NUMA_AI_ENABLED`;
  onboarding copy no longer promises AI/receipt-scan.
- **Mobile add-expense fix.** The Light "Add expense" sheet had no scroll region,
  so the keypad + Save could hide behind the keyboard on short viewports — added
  a scrollable body with a pinned Save.
- **Money correctness.** Transaction dates stored at UTC midnight showed a day
  early for users west of UTC (now anchored at local noon — `occurredAtFromIsoDate`,
  add + edit); the Advanced Recent panel and holding rows / Top-holdings showed
  un-converted foreign amounts under the wrong currency symbol (now FX-converted).
- **Onboarding polish.** "$214" theme preview → "€214".

Deferred to a focused follow-up (`docs/qa/2026-06-24-findings.md`, 39 items):
pod member-exit settlement correctness (needs a tombstone-member model + tests),
the profile-pref cross-account replay edge case, write-queue retry semantics,
goal add-money lost-update, i18n of newer English-only screens, and polish.

## v0.9.5 - 2026-06-24

Last C-queue items: leave a pot, fund a goal.

- **Leave a pot (non-owner)** — members who don't own a pot can now leave it
  from Pot settings (inline two-step confirm), beside the owner's Delete. A
  self-authorized `leaveMoneyPod` mutation soft-unlinks the caller from the
  pot's expenses/settlements and removes their membership; the owner is rejected
  (delete instead). Mirrors the existing `removeMember` cleanup.
- **Add a contribution to a goal** — the Buckets "add money" flow is now a
  shared `AddMoneyDialog`, surfaced on every Advanced Goals card (mobile +
  desktop) via an "Add" control. Funds by scope (raise the linked asset, log
  money-in, or top up a Savings cash account) — never as an expense.
  Holding-value goals stay read-only.

## v0.9.4 - 2026-06-24

More C-queue: edit from Home Recent, owner self-assign, week-start.

- **Edit from Home Recent** — the Home "Recent" rows now deep-link to
  `/money?tx=<id>`, opening that transaction's edit dialog directly instead of a
  detour through History (all three surfaces; the Advanced Recent rows are now
  links).
- **Owner self-assign to a group** — the Pot-settings group dropdown was hidden
  on the owner's own row; the owner can now put themselves in a group (Remove
  stays non-owner-only).
- **Week-start preference (Mon/Sun)** — the weekly period was hard-coded to
  Monday; added a `WeekStartsOn` preference + a Settings "Week starts" toggle.
  period.ts's "week" preset reads it; unit-tested.

## v0.9.3 - 2026-06-24

Owner can delete a pot.

- **Delete pot** — `deleteMoneyPod` was wired in podActions but had no UI caller,
  so a pot could never be removed. Added an owner-only "Delete pot" control
  (inline two-step confirm) at the foot of the Pot settings sheet. It soft-unlinks
  members/expenses/history (never cascades); the pod page already re-resolves the
  active pot to another (or the create screen), so deleting the active pot is safe.
  Non-owner "Leave pot" is a follow-up (needs a leaveMoneyPod mutation).

## v0.9.2 - 2026-06-24

Backlog close-out: a pod fix, holdings editing, and AI hidden until funded.

- **Pod "People & cards" reachable on mobile** — the loaded mobile pod only
  opened People via per-member avatars; added a general People button in the
  header (the previously-failing E2E now passes; full authed suite green).
- **Holdings edit + delete** — `AddHoldingDialog` is now dual-mode (edit
  prefilled), and the detail panel gained Edit + an inline two-step Delete, so a
  typo'd quantity/cost is no longer permanent. New E2E covers create→edit→delete.
- **AI gated off** (`VITE_NUMA_AI_ENABLED`, off by default) — the AI Gateway has
  no credits, so the "Ask Numa" assistant + Numa AI tab/route are hidden, a
  central kill-switch stops any `ask-numa` trigger from opening the chat, and the
  woven Advanced affordances (nudge cards, explain links, goal helper, search
  action) are hidden rather than left dead. Re-enable with the flag + credits.

## v0.9.1 - 2026-06-24

Wisdom quotes returned to every mode's Home, typed on each visit.

- `QuoteTypewriter` is wired back onto every mode's home header — Simple
  (mobile + desktop), Advanced (mobile + desktop), and the Shared Pot — as a
  quiet italic line under the greeting. It was orphaned (rendered nowhere).
- Behaviour changed from one-quote-per-session to a **fresh quote on every
  mount**: a new line types in on each page transition (Home → History →
  Home), never repeating the immediately-previous quote. Still instant +
  static under `prefers-reduced-motion`, `aria-live` for screen readers, and a
  fixed min-height so quote swaps never shift layout.
- The quote database was rebuilt and rigorously curated (multi-agent pass with
  WebSearch attribution checks): 95 vetted lines — **en 38, ru 32, es 25** —
  drawn only from genuinely great minds (Seneca, Marcus Aurelius, Epictetus,
  Epicurus, Lao Tzu, Confucius, Franklin, Jefferson, Bacon, Emerson, Thoreau,
  Buffett, Graham, Templeton; Достоевский, Толстой, Пушкин, Чехов, Суворов,
  Козьма Прутков; Cervantes, Gracián, Quevedo, Machado, Aristóteles). Apocrypha
  and misattributions were dropped, the Franklin happiness line corrected to
  its canonical wording, weak folk-proverb filler removed, authors capped ~3.

## v0.9.0 - 2026-06-23

Brand identity + front-end design pass (multi-agent audit → fix wave).

- Brand reconciliation: the app had FIVE competing marks shipping at once
  (3D pot+coin app icons, a legacy lime-orbit on social/og, the older
  purple-"N", a welcome orb, and a stray landing "n+" sticker). Unified on
  the **pot+coin** mark. `assets/brand/numa-app-icon-source.png` is now the
  single master; the orbit + purple-"N" masters moved to
  `assets/brand/_legacy/`.
- `scripts/generate-icons.mjs` repointed to the pot master (it sourced the
  *orbit*, so any re-run silently reverted every app icon) and now emits a
  coin-forward, legible favicon at 16/32px. Regenerated og-image +
  marketing-render so social shares finally match the installed app.
- One canonical tagline everywhere — **"Track money. Quietly."** — across
  the sidebar wordmark (en/ru/es), `<title>`/og/twitter meta, and the baked
  social card. Landing's orphan "n+" lockups replaced with the pot+coin mark.
- Coin **and** pot as brand objects: `NumaCoin` palette tokenized
  (`--color-coin-*`) and its float-flip bug fixed (the reward coin spun over
  mid-animation); new **`NumaPot`** CSS-3D companion (cauldron + coin),
  reduced-motion-safe, now the onboarding "ready" moment.
- Locale default fix: English-primary browsers no longer get a Russian UI
  (`detectAppLocale`/`detectLocale` now honor the primary language).
- VoiceDialog pulse respects `prefers-reduced-motion`; capture/voice dialogs
  gained Escape + focus-restore; AIChat/NumaPage inputs got aria-labels +
  focus rings; Segmented conveys selection via `aria-pressed`; AnimatedAmount
  is tabular by default.
- New design tokens (scrim, peach/sand/amber/olive ink, on-negative,
  surface-inverse, member accents, coin palette) replace hard-coded
  hex/`bg-black`/`bg-white`/`text-white` across ScanDialog, home-light, pod,
  wealth, money, advanced, and dialog backdrops — light-mode identical, dark
  mode correct. Primary CTAs moved off `bg-ink` (dark-mode-unreadable) to
  `--color-cta`. `--font-mono` now points at an actually-loaded face.
- Mobile Search re-exposed (was unreachable dead code); desktop work surfaces
  scroll on short laptops instead of clipping.
- Verified: build, lint (0 errors), bundle 210/215 KB, 188 unit tests, and
  the authenticated Playwright smoke (the one red pod card-label test is
  pre-existing, confirmed identical on baseline — the in-flight mobile
  pod-nav refactor, not this release).

## v0.8.0 - 2026-06-12

Full-QA release: an 8-agent hands-on sweep (auth/Simple/Advanced/pod/
settings/AI surfaces + code audit + product gaps) found and this release
fixes every P2 plus the quick P3s. Highlights:

- Date picking works EVERYWHERE now (user-reported): desktop Simple add
  panel's "Pick date" stub is a real native picker; the mobile keypad
  sheet gained a date pill (Today/Yesterday/any date) AND an optional
  note field (no more "Groceries / Groceries" rows); the Advanced dialog
  pill is a transparent-overlay native input (showPicker-on-clipped-input
  no longer relied on).
- Money correctness: "12,50" no longer saves as €1,250 (comma decimals
  normalized in Simple panel + CSV generic mapper auto-detect); bucket
  "Add money" no longer logs an EXPENSE (real add-to-bucket flow); pod
  displays show cents ($42.50, not $43); creating a second goal no longer
  silently deletes the first (server-side multi-goal fix + Done state).
- Phantom duplicate "Personal" portfolio in Settings fixed (local seed was
  concatenated with cloud rows; cloud truth was always one).
- Simple History now respects the period picker; "at this rate"
  projection hides for past months; Recurring tab now reachable in
  Simple mode (and Budgets tab actually reachable at all).
- Dark-mode contrast: Simple desktop hero, wealth Capital band, pod hero
  detail — all switched from hardcoded white to cta-ink color-mix.
- Desktop wealth got asset/liability edit/delete + Snapshot now; flat
  series no longer draws glued to the chart floor; axis reads "Jun '26".
- Pod: action dock portaled to body (contain:layout no longer unpins it),
  history counts pluralized via Intl.PluralRules (en/ru/es), honest
  "All history" caption, owner email shown.
- Trust/robustness: CSV exports neutralize formula injection (OWASP '
  prefix); import failures now report partial counts instead of
  vanishing; account deletion cascade is chunked + self-rescheduling
  (big accounts can't brick the 7-day purge); cancel-deletion is honest
  when the purge already ran; recap push targets Light-mode users only,
  counts calendar-week expenses only, and times out hung sends.
- AI failures are human now ("Numa AI couldn't answer just now…", 429 →
  daily-limit message), failed chat prompts restore into the composer,
  voice listening times out gracefully.
- Honesty pass: auto-snapshot copy matches the new monthly-on-open
  client snapshot; fake "3 insights waiting" badge removed; notifications
  copy describes only what exists; ru/es labeled "(beta)"; /welcome
  redirects signed-in visitors home; dialogs got a real focus trap.
- Verified: 184 unit tests (+17), 16/16 E2E, tsc -b clean, bundle 5.5 KB
  under budget, every headline fix re-verified hands-on in the browser.

## v0.7.0 - 2026-06-11

Road-to-1.0 release: Phase 1 trust complete + the retention loop.

- Email verification at signup: `verify` OTP provider on Convex Auth
  Password (8-digit code, 15 min), full code-entry UI on /welcome with
  resend countdown, en/ru/es. Env-gated on AUTH_RESEND_KEY — dark until
  the owner sets the key; then BOTH reset and verification light up.
  Existing unverified accounts get the code form on next sign-in.
- Active sessions in Settings → Security: signed-in/expires dates, "This
  device" badge, "Sign out other devices" (action-side invalidateSessions,
  current session survives).
- Account-deletion grace: deleteMyAccount now schedules the cascade purge
  7 days out (Convex scheduler, stale-job guard); signing back in shows a
  cancel banner; `*@example.com` QA accounts still delete immediately so
  E2E stays clean. Delete-dialog copy now explains the recovery window.
- Weekly recap: Sunday 17:00 UTC Convex cron → existing /api/push-send
  (zero-activity users skipped; deployments without the push secret skip
  quietly), deep link /?recap=week lands on a new Week-in-review card
  (spent vs last week, top category, expense count, target progress;
  hidden until first activity).
- Recurring in Simple mode: "X lands in N days · amount" quiet line under
  the weekly hero, mobile + desktop, fed by the already-mounted recurring
  subscription.
- Bank CSV import presets: Revolut + N26 (both layout generations)
  auto-detected, preview-before-commit, generic column mapper for unknown
  headers, "Into account" picker, per-portfolio preset memory, ";"
  delimiter + decimal-comma support. 17 new unit tests.
- PWA install moment: beforeinstallprompt captured at boot, contextual
  glass banner from the 3rd session (Chromium native prompt / iOS
  Add-to-Home-Screen hint), permanent dismiss.
- Verified: 16/16 Playwright E2E (incl. new immediate-delete QA path),
  full grace-window loop (schedule → banner → cancel) on dev Convex,
  Revolut preview + Week-in-review card + sessions block + iOS install
  banner screenshot-verified, 167 unit tests, tsc -b clean (real check —
  root `tsc --noEmit` is vacuous in this repo).

## v0.6.0 - 2026-06-11

Motion language release: one vocabulary, everywhere.

- New `src/lib/motion.ts` is the single source of motion truth (4 eases,
  6 duration tiers, shared pageEnter/cardEnter/sheetMotion/backdropMotion/
  toastMotion/SPRING_PILL variants, revealDelay() for CSS staggers),
  mirrored by tokens.css. Before: 11 durations and 7 easings hand-copied
  across 30+ transition props, 5 backdrop and 3 sheet variants.
- Every routed page, dialog, sheet, toast and popover now shares the same
  body language; list rows stagger in (home recents, buckets, pod
  activity/history, onboarding cards, legal articles).
- Charts perform: net-worth line + wealth sparkline draw on (1.15s,
  --ease-draw), area fills fade in late, allocation donut slices pop in
  sequence. AnimatedAmount now tweens from the currently displayed value
  on changes instead of recounting from zero.
- Welcome hero carries the prototype's orb glow + spark pack; landing
  retimed to tokens; internal links use the View Transitions blur-morph.
- Removed 12 orphaned keyframes/classes from global.css; un-gated popover
  animation moved behind a proper reduced-motion-aware class.
- Verified: chart draw/settle harness, reduced-motion audit (all reveal/
  draw elements fully visible with animations off), 5-screen visual tour,
  150 unit tests, bundle 11.1 KB under the 215 KB budget.
- ROADMAP.md added: the full remaining plan to 1.0 (trust, daily-use,
  ledger completion, growth, observability + design-language backlog).

## v0.5.0 - 2026-06-11

Release-readiness pass: the four pre-launch gaps closed.

- Password reset: full email-OTP flow (8-digit code, 15-min expiry) via
  Resend, env-gated on AUTH_RESEND_KEY with a capability-flags query so the
  "Forgot password?" entry point only appears when the deployment can
  actually send email. Localized en/ru/es. (v0.4.2 and earlier had NO
  account recovery.)
- Error monitoring: client crashes (error boundary, window errors,
  unhandled rejections, route errors) self-report to a capped, deduplicating
  clientErrors table in Convex — message, stack, sanitized URL, app release.
  No third-party vendor; viewed in the Convex dashboard.
- AI spend cap: deployment-wide daily budgets on top of per-user limits
  (chat 400/day, scan 200/day; NUMA_AI_DAILY_LIMIT_* to tune) so total
  provider cost is bounded no matter how many accounts exist.
- Legal pages rewritten to match the real architecture: named processors
  (Convex eu-west-1, Vercel, Google OAuth, AI Gateway → Anthropic, Resend,
  Nominatim), GDPR rights mapped to in-app export/delete, retention,
  contact, last-updated dates.
- /numa composer is now a real input that opens the chat dialog prefilled
  (was a non-interactive mockup).

## v0.4.1 - 2026-06-11

Production walkthrough QA (every surface on a disposable account) found and
fixed two issues:

- Receipt scan failed with a 502 for signed-in users: /api/parse-receipt
  sent the system prompt as a system-role message to generateObject (which
  the AI gateway rejects); it now uses the top-level `system` param like
  /api/chat. Both AI routes now log the real error instead of swallowing it.
- Home (light) showed whole-euro amounts in the Recent list, the
  Biggest-this-week card, and the vs-last-week delta, contradicting the
  cents shown in the weekly hero and the History page. These now show cents.

Confirmed healthy in production: all three onboarding modes, money,
buckets, wealth with live market quotes, holdings, goals, insights, Numa AI
chat (200, grounded in real data), the full shared-pot flow, settings,
language switching, and the public pages.

## v0.4.0 - 2026-06-11

Audit-driven hardening and correctness pass.

- Security: /api/chat and /api/parse-receipt now require a signed-in user
  (Authorization: Bearer) and meter per user id; the spoofable User-Agent is
  gone from anonymous rate-limit identity. convex/auth.ts account-linking
  helpers are fully typed (no more `any`).
- Correctness: shared-pot settlement math lives once in
  convex/lib/settlementMath.ts; the client preview and the server record
  import the same code, so they can't drift. New parity/coverage tests pin it.
- Durability: profile-preference writes survive navigation/reload via a
  localStorage stash replayed on next mount (was fire-and-forget).
- Routing: /shared retired to a redirect to /pod (single shared-money route).
- Performance/guardrails: a 215 KB gzip initial-JS budget is enforced in CI
  and `npm run verify`; eslint max-lines ratchet flags god files; nightly
  authenticated E2E workflow.
- Polish: settings "current mode" card deduped into one palette-tokenized
  component (was duplicated and hardcoded to Citrus).

## v0.3.0 - 2026-06-10

- Landed the in-flight Citrus redesign across home, money, wealth, settings,
  pod, onboarding, and navigation, plus the new Buckets and advanced
  Goals/Insights/Numa surfaces.
- Removed recharts/d3 (415 kB chunk) in favor of hand-rolled SVG charts:
  monotone area chart with hover tooltip and a two-handle zoom/pan brush,
  padded allocation donut whose center shows the hovered category. PWA
  precache dropped ~400 KiB.
- Made both external font stylesheets non-blocking and injected build-time
  preconnect hints for the Convex data/auth origins; first contentful paint
  on the production bundle measures under 100 ms locally.
- Split ru/es dictionaries into lazily loaded chunks (~53 kB off the entry
  path for English sessions) with compile-time completeness checking; the
  pod expense copy and pod page pure helpers moved into tested lib modules.
- Hardened serving: immutable caching for hashed assets, nosniff/frame/
  referrer/permissions headers everywhere, and an enforced Content-Security-
  Policy on the production host (script-src 'self'; connect limited to
  Convex, the app itself, and the geocoding provider).
- Light-mode settings became fully functional: inline name editing, privacy
  link, import/export, sign out, and account deletion (previously
  unreachable in light mode); removed dead rows and fake notification state.
- Honest empty states on the light home (no more "€0 Groceries" placeholder,
  category emoji now reflects the real top category) and the quick-add sheet
  no longer pre-fills a demo expense.
- New-signup onboarding no longer flashes the legacy purple palette: missing
  profile themeKey now resolves to Citrus everywhere; accounts that chose
  Classic keep it.

## v0.2.0 - 2026-05-29

- Added a small in-app version marker in the lower-left sidebar.
- Started this version log so app changes can be tracked by release version.
- Added proximity-based dock interactions for sidebar, bottom nav, and mobile
  floating action clusters.
- Deferred rare dialogs, search/chat command surfaces, PWA registration, and
  pod-route personal data fetches to improve perceived startup speed.
- Memoized shared store selectors so large histories and pod lists do less
  sorting/filtering work during ordinary rerenders.
- Rebuilt shared dashboard rearranging around pointer-based fixed drop slots
  so dragged blocks snap into predetermined cells and the rest of the layout
  reflows on desktop and touch screens, with saved order reflected in the real
  DOM/tab order.
- Fixed mobile shared dashboard rearranging by auto-scrolling during long
  drags and keeping the mobile Playwright smoke enabled instead of skipped.
- Fixed family-level shared-pod settlement labels so opposite member transfers
  between the same two groups are netted before showing who owes whom.
- Fixed returning-account sign-in so existing users enter the app before the
  first-run onboarding gate, and route cloud detail fetches by the current
  page/profile mode to reduce slow startup work.
- Preserved legacy-safe `advanced`/classic theme defaults when a returning
  cloud user is missing a profile row, without changing fresh onboarding
  defaults.
- Limited shared-pot bundle hydration to the active pod instead of every pod
  in the account, and kept the selected pod preference across sessions.
- Added a shared, minimal Numa loading surface, shimmer skeletons, and dialog
  loading fallback for route/auth/shared-pot waits and cold-loaded modals.
- Added baseline password-strength enforcement for email sign-up, password
  changes, and the Convex Auth password provider.
- Hardened lazy route asset recovery so stale or failed chunks trigger one
  controlled reload and then surface a real error instead of hanging forever.
- Moved route-level asset recovery out of render and into an effect, removing a
  mobile smoke flake where React Router logged recoverable lazy-import errors.
- Rejected shared-pod settlement self-transfers at the Convex write boundary
  so history cannot record a meaningless payback from a member to themselves.
- Hardened web and mobile covered-group shared expenses so stale participant
  ids cannot turn another group's personal spend into a self-paid zero-balance
  entry.
- Aligned the mobile shared-pod settlement snapshot with the web party-level
  settlement view so iOS sees grouped counterparties and netted family debt.
- Added mobile shared-pod settlement create/update/delete mutations so native
  clients can record partial paybacks through the same safe backend surface
  that powers web settlements.
- Pruned cloud portfolio/pod detail caches on auth/profile changes and against
  the current accessible Convex lists so stale deleted or previous-account pod
  data cannot leak into UI pickers.
- Enforced single-currency shared-pod expense and settlement writes at the
  Convex boundary so mobile backend balances cannot silently add mixed EUR/USD
  rows without FX conversion.
- Restored Settings automation/webhook visibility after lazy portfolio-detail
  fetching by loading portfolio membership details on `/settings` only.
- Aligned Settings webhook-token UI permissions with server authorization by
  checking the current user's membership role instead of any editor in the
  portfolio.
- Hardened Import / export so cloud CSV exports and imports fetch their own
  Convex portfolio/pod bundle instead of silently reading local fallback data
  when opened from routes that have not hydrated those details.
- Prevented transient failed queued writes from immediately retriggering the
  write-queue auto-flush loop without an explicit retry/online recovery step.
- Added the missing queued replay executor for shared-pod settlement updates
  and covered it with a focused write-queue test.
- Routed existing shared-pod edits/deletes through the durable write queue so
  transient cloud failures do not silently drop expense, settlement, member,
  group, or pot updates.
- Fixed cloud transaction edits so clearing category, linked account, notes,
  or location actually removes the optional field in Convex instead of leaving
  stale values behind.
- Applied the same explicit-clear behavior to recurring rules so optional
  category, account, end date, and notes can be removed reliably.
- Extended explicit-clear behavior to category, asset, and liability edits so
  optional emoji, monthly budget, notes, interest rate, and due date fields do
  not leave stale cloud values behind.
