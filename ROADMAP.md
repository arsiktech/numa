# Numa Roadmap

> Public-release work moved to
> [`docs/NUMA-PRO-PUBLIC-RELEASE.md`](docs/NUMA-PRO-PUBLIC-RELEASE.md) on
> 2026-07-26. This roadmap remains the product backlog; it is not the release
> gate and its older owner-unlock status must be reverified before use.

Historical product backlog, written 2026-06-11 at v0.6.0. Items below are ideas
and dated implementation claims, not an automatic execution order or current
blocker list. Reconcile a relevant item with source and `DECISIONS.md` before
starting it. The active user task sets scope; the public-release plan owns
launch gates. Standalone Numa Shared work belongs in its separate repository.

## North star & moat thesis

Numa wins by feeling like **calm money**: the only tracker where motion is a
language, not decoration. The moat is the accumulation of consistent detail —
hard to copy because it's a system, not a feature:

- **Motion identity**: lens-refocus route morphs, numbers that *arrive*
  (in-view count-ups), charts that draw themselves, one body language for
  every sheet and dialog, macOS-dock proximity nav, the Siri ring on voice.
  All reduced-motion safe. (Shipped v0.6.0.)
- **Structural moats**: the shared-pot settlement engine (single
  parity-tested implementation client+server), AI that drafts-but-never-
  writes-without-confirmation, EU-region data posture with honest legal
  pages, sub-100 ms first paint, account deletion + CSV export built in.
- **Complexity stance**: as complex as necessary, as simple as possible —
  three modes (Simple / Advanced / Shared Pot) so each user sees only their
  app.

## Phase 0 — Owner unlocks (no code, blocks features)

| Action | Unlocks | Where |
| --- | --- | --- |
| Add AI Gateway credits (or BYOK Anthropic key) | Numa AI chat + receipt/voice scan (everything else is built and verified) | Vercel dashboard → AI Gateway |
| Create Resend account, set `AUTH_RESEND_KEY` (+ `AUTH_EMAIL_FROM`) on prod Convex | Password-reset emails AND email verification at signup (both shipped, auto-light-up) | `npx convex env set … --prod` |
| Copy `NUMA_PUSH_INTERNAL_SECRET` from Vercel env to prod Convex | Weekly recap push notifications (cron shipped v0.7.0, skips quietly until set) | `npx convex env set … --prod` |
| Apple Developer account (when ready) | Apple sign-in (provider wiring already in `convex/auth.ts`) | developer.apple.com |

## Phase 1 — Trust & account lifecycle — ✅ SHIPPED v0.7.0

1. ~~Email verification at signup~~ — `verify: ResendOTPVerify` on the
   Password provider, env-gated on `AUTH_RESEND_KEY`, full code-entry UI on
   /welcome (en/ru/es). Dark until the owner sets the key.
2. ~~Session management surface~~ — Settings → Security lists active
   sessions ("This device", signed-in/expires dates) + "Sign out other
   devices" (current session survives).
3. ~~Soft account-deletion grace~~ — deleteMyAccount now schedules a 7-day
   purge (ctx.scheduler), cancellable via a banner after signing back in;
   `*@example.com` QA accounts still delete immediately.

## Phase 2 — Daily-use depth (the retention loop)

4. ~~Weekly recap push~~ — SHIPPED v0.7.0: Sunday 17:00 UTC Convex cron →
   /api/push-send (skips zero-activity users + unset-secret deployments),
   deep-links /?recap=week to the new in-app Week-in-review card (hidden
   until first activity).
5. ~~Recurring in Simple mode~~ — SHIPPED v0.7.0: "rent lands in 3 days"
   quiet line under the weekly hero (mobile + desktop). Budgets were already
   surfaced via the weekly target line — no second line added.
6. ~~Bank CSV import presets~~ — SHIPPED v0.7.0: Revolut + N26 (two layout
   generations) auto-detected with preview step, generic column mapper
   fallback, "Into account" picker, per-portfolio memory. NOTE: header
   signatures modeled from training data — verify against a real export and
   extend (Sparkasse, Tinkoff) when the owner has samples.
7. **Historical onboarding demo idea** — the ready presentation screen was
   removed by the 2026-09-05 onboarding decision. Reassess the user need before
   adding any sample-data workflow.

## QA backlog — from the 2026-06-11 full sweep (8-agent audit)

P2s and quick P3s from that sweep were fixed in v0.8.0. Deferred, by theme:

**Daily-use gaps**
- ~~Income capture in Simple mode~~ — SHIPPED v0.10.0: Expense/Income toggle
  in the Light add sheet; income categories, kind-aware copy.
- ~~Category filter chips in Simple History~~ — SHIPPED v0.10.0:
  period-scoped, frequency-ordered chips.
- ~~Edit/delete directly from home Recent rows~~ — SHIPPED v0.9.4.
- ~~Holdings edit/delete~~ — SHIPPED (detail-panel edit + two-step delete).
- ~~Goal "add contribution" action~~ — SHIPPED v0.9.5 (+ v0.10.0 made it an
  atomic server-side increment).
- Budget threshold alert — push when a category crosses its monthly limit;
  plumbing exists end-to-end. (M)
- Offline read snapshot for personal data (cloudSnapshotCache covers pod
  only). (M)
- ~~Week-start preference Mon/Sun~~ — SHIPPED v0.9.4.

**Pod**
- ~~Delete/leave pod UI~~ — SHIPPED v0.9.5 (+ v0.10.0 queued-offline UX).
- ~~Invite link/code to share~~ — SHIPPED v0.10.0: hashed 7-day codes,
  owner copy/share/revoke, /pod?join=CODE redemption.
- ~~Unequal/percentage splits UI~~ — SHIPPED v0.10.0: Custom % scenario.
- ~~Owner self-assign to a group~~ — SHIPPED v0.9.4; pod leave/delete i18n
  landed v0.10.0.

**Trust & account**
- Email change flow (none exists). (L)
- ~~Server-side throttle on verification/reset email sends~~ — implemented in
  `convex/authEmailRateLimits.ts` with per-address and deployment-wide quotas;
  see the 2026-07-30 release evidence.
- Session rows device metadata (today rows are indistinguishable). (M)
- Co-member warning/export window before grace deletion erases shared
  portfolios and pod history. (M)
- Verification hardening: account is created before the OTP email sends — a
  Resend misconfig strands sign-ups in unverified limbo. Owner setup docs
  emphasize AUTH_EMAIL_FROM + verified domain; revisit ordering later. (M)

**Import/export**
- CSV import dedupe (hash date+amount+description) + batched bulk import
  with progress (10k rows = 10k sequential round-trips today). (M each)
- GDPR-complete one-click export (goals, recurring, pod people, profile —
  privacy page promises it). (M)

**Polish / i18n**
- ru/es completion — labeled "(beta)" in the picker as of v0.8.0; buckets,
  goals, insights, onboarding, money-page strings, Simple surfaces, legal
  pages still EN. Finish or keep the beta label. (L)
- Locale-aware number formatting (money.ts hardcodes en-US — EU users see
  1,234.56 €). (S–M, touches many tests)
- Pre-auth language picker on /welcome; onboarding screens localization;
  onboarding style cards show $214 in an otherwise-EUR funnel. (S/M/S)
- Auto-theme tracking on shared surfaces (OS flips only re-resolve where
  useTheme mounts; pod misses it). (S)
- Mobile welcome orb clipped at right edge; disabled-CTA contrast; voice
  "Try again" prominence; goal index-based emoji. (nits)

## Phase 3 — The money engine (architecture, from AGENTS.md)

8. **Ledger completion** — every asset/liability/holding/transaction/pod
   movement writes ledger accounts/transactions/lines; net worth & cashflow
   read ledger rollups. Foundation tables already exist (`convex/ledger.ts`). (XL)
9. **True multi-currency** — widen the server currency union beyond USD|EUR
   on top of the ledger (client types are already wide; AGENTS flags the
   narrow boundary). (L, depends on 8)
10. **Durable offline queue** — move the localStorage writeQueue to IndexedDB
    with the same clientMutationId dedupe. (M)

## Phase 4 — Growth & reach

11. **Share-card images** — `paintShareCard` exists on wealth; extend to
    pod settlements ("we're square ✨") and weekly recaps; this is organic
    distribution. (M)
12. **Landing refresh** — align the marketing page to the in-app motion
    language (same DUR/EASE scale, real product shots), then a Remotion
    launch video (tooling already in `remotion/`). (M)
13. ~~PWA install moment~~ — SHIPPED v0.7.0: beforeinstallprompt captured,
    glass banner after the 3rd session (Chromium native prompt; iOS
    Add-to-Home-Screen hint), dismiss persists. iOS splash/icon audit still
    open. (S)
14. **App-store wrapper** — Capacitor/PWABuilder evaluation once retention
    proves out. (L, later)

## Phase 5 — Operability at scale

15. **Usage observability** — small admin-only Convex queries + dashboard
    cards: AI/OCR spend by day (rate-limit buckets already store counts),
    webhook ingest log, sync-health. (M)
16. **Error-monitor triage flow** — clientErrors table is live; add a weekly
    digest (reuse the recap cron) and an "affected release" rollup. (S)
17. **E2E stability** — per-spec disposable accounts so the auth suite can run
    parallel workers without locale/account pollution; keep nightly job. (M)

## Design-language backlog (post-v0.6.0 polish, from the prototype spec)

- Receipt-scan "laser line": the prototype's blinking lime scan line with a
  12 px glow sweeping the receipt while OCR runs (ScanDialog scanning state).
- Goal progress ring: the r=86 draw-on ring from the design kit for bucket
  detail / goal cards (`nm-draw` is already in global.css).
- Shared-element continuity: View-Transition names on hero amounts so the
  number morphs from list → detail instead of crossfading.
- `nmFloat` ambient bob for empty-state illustrations and the welcome orb.
- Per-surface skeletons: LoadingSurface variants shaped like the page they
  replace (list rows / hero + cards) instead of one generic chip.
- Coral theme's italic-serif accent word in display headlines.

## Continuous code health

- God-file splits (settings/wealth/home-light/money/pod) — growth is capped
  by the eslint `max-lines` ratchet; split opportunistically when touching.
- Keep the JS budget gate honest (215 KB gz; raise only deliberately).
- Per-locale split for `podExpenseCopy` if the pod chunk ever matters.
