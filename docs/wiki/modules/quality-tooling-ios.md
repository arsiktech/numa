# Module: Quality, Tooling, And iOS

This module covers tests, CI, build/deploy scripts, bundle budgets, production smokes, design sweeps, and the native SwiftUI companion app.

## Responsibilities

- Keep fast unit tests close to pure logic and services.
- Run browser smoke across public and authenticated routes.
- Enforce lint, build, initial JS bundle budget, and dependency audit.
- Support production public smoke and production Convex bundle checks.
- Provide iOS native parity for shared pod and broader Numa surfaces.

## Key Files

- [`tests/numa.spec.ts`](../../../tests/numa.spec.ts) - public and cloud-first Playwright smoke suite.
- [`src/**/*.test.ts(x)`](../../../src) - Vitest unit coverage for logic, i18n, queue, asset recovery, settlement math, Numa engine, etc.
- [`playwright.config.ts`](../../../playwright.config.ts) - Chromium desktop and iPhone 14 projects plus dev server.
- [`scripts/check-bundle-size.mjs`](../../../scripts/check-bundle-size.mjs) - initial JS gzip budget gate.
- [`scripts/verify-production.mjs`](../../../scripts/verify-production.mjs) - production HTML/bundle/API smoke.
- [`scripts/vercel-build.mjs`](../../../scripts/vercel-build.mjs) - Convex deploy plus Vite build when `CONVEX_DEPLOY_KEY` exists.
- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), [`nightly-auth-e2e.yml`](../../../.github/workflows/nightly-auth-e2e.yml), [`production-smoke.yml`](../../../.github/workflows/production-smoke.yml) - CI and smoke automation.
- [`ios/Numa/Numa/NumaApp.swift`](../../../ios/Numa/Numa/NumaApp.swift), [`NumaAuth.swift`](../../../ios/Numa/Numa/NumaAuth.swift), [`NumaSessionStore.swift`](../../../ios/Numa/Numa/NumaSessionStore.swift), [`NumaAppStore.swift`](../../../ios/Numa/Numa/NumaAppStore.swift), [`Services/PodStore.swift`](../../../ios/Numa/Numa/Services/PodStore.swift) - SwiftUI app root, auth/session/app store, pod store.
- [`convex/mobile.ts`](../../../convex/mobile.ts) - native/mobile backend surface.

## Public API

- npm scripts in [`package.json`](../../../package.json).
- Playwright test groups: `Numa public smoke`, `Numa cloud-first smoke`.
- Mobile Convex functions: `mobile:bootstrap`, `mobile:portfolioSnapshot`, `mobile:listPods`, `mobile:podSnapshot`, `mobile:createExpense`, `mobile:updateExpense`, `mobile:updateMemberCards`, and related mutations.

## Internal Structure

Vitest covers pure modules and services. Playwright starts Vite automatically for local base URLs and skips authenticated specs without credentials or explicit disposable QA flag. CI uses Node 24, Convex dev URL variables, and the same command chain as local verification. iOS is a separate Xcode project with Convex Swift client and Keychain-backed native session handling in current source.

## Dependencies

- Vitest, jsdom, Testing Library, Playwright, ESLint, TypeScript, Vite, Remotion, Sharp.
- SwiftUI, ConvexMobile, and Keychain APIs; current setup is in
  [ios/Numa/README.md](../../../ios/Numa/README.md).

## Notable Patterns / Gotchas

- `npm run test:ui` public smoke always runs; cloud-first authenticated suite skips without env.
- Run `npx convex codegen` after Convex changes.
- Live verification inspects the target currently deployed; reconcile it with
  the candidate before drawing release conclusions.
