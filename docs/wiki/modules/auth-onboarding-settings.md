# Module: Auth, Onboarding, Settings

This module handles Convex Auth, account/profile bootstrap, welcome/sign-up/sign-in flows, onboarding completion, app mode/theme/locale preferences, security, push, webhooks, and account controls.

## Product Thesis: Onboarding Conversion Grammar

Source studied on 2026-07-07: `Agentic/outputs/2026-07-07-cristian-rus-onboarding-conversion-routing.md`.
Treat it as a design reference, not verified analytics; the `4x` conversion
claim is a creator claim unless Numa has its own data.

Numa applies the sequence as:

- **Wow / product magic:** `/welcome` opens with the Numa brand object and a
  compact product-proof collage.
- **Proof / examples:** pre-auth examples show the weekly count, a bucket, and
  a shared split before asking for account lock-in.
- **Account / save state:** cloud auth stays required before product data
  writes; OAuth/email happen after the value cue, not before the first frame.
- **Purpose / goal:** onboarding asks the user to pick the job: daily money,
  capital, or shared pot.
- **How it helps:** setup narrows that job into a weekly signal or first pot.
- **Ready-to-start actions:** the final screen names the first three actions
  before launching into the app.

Every onboarding screen should pass this test: it has one conversion job that
can be named in five words or less.

## Responsibilities

- Refuse product runtime without cloud auth env.
- Support password auth, Google OAuth when configured, Apple OAuth when configured, password reset, and email verification via Convex Auth.
- Persist profile preferences to Convex and mirror safe metadata locally for account switching.
- Decide fresh onboarding vs returning-account app entry.
- Expose settings for profile, appearance, language, app mode, push, webhooks, portfolio controls, password/provider management, sign-out, and account deletion.

## Key Files

- [`src/services/auth.tsx`](../../../src/services/auth.tsx) - browser auth context, Convex Auth provider wrapper, cloud-required screen, profile bootstrap.
- [`src/routes/welcome/page.tsx`](../../../src/routes/welcome/page.tsx) - pre-auth welcome, email/password, OAuth, reset, email verification.
- [`src/routes/onboarding/*.tsx`](../../../src/routes/onboarding) - first-run style/mode/setup/ready flow.
- [`src/routes/settings/page.tsx`](../../../src/routes/settings/page.tsx) - account, appearance, push, webhook, portfolio, import/export, deletion controls.
- [`convex/auth.ts`](../../../convex/auth.ts) - Convex Auth providers, password policy, OAuth linking rules, native callback redirect.
- [`convex/profiles.ts`](../../../convex/profiles.ts) - user profile, preferences, starter portfolio/profile seeding.
- [`convex/authManagement.ts`](../../../convex/authManagement.ts) - security/account management mutations.
- [`convex/authConfig.ts`](../../../convex/authConfig.ts) - public capability flags for auth surfaces.

## Public API

- `useAuth()` from `src/services/auth.tsx`.
- `usePushProfile()` from `src/lib/profileSync.ts`.
- Convex queries/mutations: `profiles.me`, `profiles.updateProfile`, `authConfig.flags`, auth management functions.

## Internal Structure

`AuthProvider` creates a Convex client only when the cloud flag and URL are configured. `CloudAuthProvider` uses Convex Auth hooks, profile queries, local account metadata, and `ensureProfile` to keep browser and Convex state aligned. Welcome handles current-session auth intent; `App.tsx` owns the final onboarding decision.

## Dependencies

- Uses `@convex-dev/auth`, Convex React hooks, local auth metadata helpers, profile bootstrap helpers, theme/mode/i18n utilities.
- Settings uses direct Convex hooks plus store hooks for portfolio-facing controls.

## Notable Patterns / Gotchas

- Do not add product local-auth fallback.
- Provider linking is authenticated-session based and rejects mismatched Google email.
- Email/password account creation enforces server password policy.
- Existing cloud users without a local onboarding marker should not be forced through first-run onboarding.
- Account deletion has a grace-window path except disposable QA accounts.
