# Numa welcome glass — local v0.11.2

Scope: `/welcome` in the React/Vite app, on the existing dirty
`codex/advanced-mrr-dashboard` working tree based on `b060005`. Earlier
v0.11.1 simplification work is preserved. No SwiftUI, backend, deployment,
credentials, or production data changes belong to this adaptation.

## Reference and implementation

Reviewed [Liquid Glass Screens](https://github.com/Appllama/liquid-glass-screens),
its [motion specification](https://github.com/Appllama/liquid-glass-screens/blob/main/docs/MOTION_SPEC.md),
and [notice](https://github.com/Appllama/liquid-glass-screens/blob/main/NOTICE.md)
on 2026-09-05. The reference uses Expo/React Native/Skia. Numa implements an
independent CSS composition using its existing coin image, Lucide icons,
color tokens, and Framer Motion; no upstream source or assets were imported.
This provides layered highlights and depth, not the reference's optical shader
refraction or Apple's native Liquid Glass material.

The illustration follows hover and bounded pointer/touch drag. Spring return
keeps velocity continuity; the highlight moves oppositely inside the shell.
There is no idle loop, particle engine, video download, extra dependency, or
per-move layout read. Three decorative spending/saving/capital icons replace
unlabeled invented financial figures. Login never depends on manipulating the
artwork. All financial forms and text remain on their existing clear surfaces.

Reduced motion is subscribed live and immediately resets travel. Vertical touch
gestures scroll; cancellation, capture loss, window blur, and visibility changes
reset the sphere. The decorative scene is excluded from accessibility and has
no keyboard stop. A scrollable welcome viewport keeps signup and legal links
reachable on a 375×480 screen with enlarged text.

## Changed files

- `src/routes/welcome/WelcomeProductPanel.tsx`: glass composition and optional interaction.
- `src/routes/welcome/welcome-glass.css`: isolated, token-based materials and responsive geometry.
- `src/routes/welcome/page.tsx`: integrate the scene and allow short-viewport scrolling.
- `src/lib/motion.ts`: central spring configuration.
- `tests/welcome-glass.spec.ts`: pointer return, touch cancellation/scroll, live reduced-motion change, keyboard entry, themes, enlarged text.
- `package.json` / `package-lock.json`: version only; the sidebar reads it automatically.
- `VERSION_LOG.md`, `DECISIONS.md`, and the session handoff: behavior and local evidence.

## Validation

Focused Playwright: 7 passed, 1 intentionally skipped. Touch input was injected
through Chromium CDP, including cancellation and vertical scroll. The WebKit
project covers pointer behavior, mobile layout, both themes, reduced motion,
and keyboard/form reachability; its CDP-only touch case is skipped.

An initial test caught that Framer Motion's reduced-motion hook did not update
this scene when the media preference changed live. The scene now uses a
subscribed media query; the regression passes in Chromium and WebKit.

Rendered screenshots and local page-open timings live in
`outputs/welcome-glass-2026-09-05/`. Chromium desktop at 1280×800 reached the
email entry button in 188 ms cold / 65 ms warm; WebKit at 390×844 in 223 ms /
81 ms. These are single local Vite observations with a fresh browser context
then a repeat navigation, not production/network benchmarks. No console or
page errors were recorded. Screenshots were inspected in light and dark.

Final `npm run verify` passed: lint (0 errors, 15 existing warnings), build,
227.4 KB initial gzip under 240 KB, 372 unit tests, 19 UI tests, and production
dependency audit (with the existing documented React Router RSC exception).
41 UI skips comprise 40 existing opt-in account/onboarding cases and the single
WebKit CDP-only touch case. `git diff --check` passed.

## Boundaries

Authenticated account journeys were not opted into for this presentation-only
change. Physical iOS/Android devices, native SwiftUI, production deployment,
TestFlight, and App Store release were not validated or changed. Existing lint
warnings and unrelated pending files are preserved.
