# Native Visual Polish Assets

Generated: 2026-07-06

This note records the first native iOS visual polish pass for Numa. The goal is
to make celebrations and missing popups feel quiet, tactile, and native rather
than decorative or AI-heavy.

## Generated Source Boards

Built-in image generation produced four contact sheets under:

a local image-generation folder (not in this repo)

- milestone sticker sheet: onboarding, savings, MRR, shared settlement, capture,
  card, recurring, and calm success ideas
- achievement popup sheet: compact bottom-sheet hero compositions
- money-state still life sheet: groceries, rent, transit, subscriptions, income,
  capital, savings, shared dinner, card labels
- celebration particle sheet: reference only; final confetti is SwiftUI-native
  for smaller bundle size and better motion control

## Bundled Assets

The app bundle now includes three 1024px PNGs in the asset catalog:

- `NumaMilestoneReady`: onboarding completion
- `NumaMilestoneMRR`: monthly income target set or updated
- `NumaMilestoneShared`: shared pot balanced, reserved for shared-settlement
  moments

These assets are intentionally text-free, logo-free, and palette-bound to the
Citrus language: cream, white, near-black, lime, muted gold, and small sage
accents.

## Native Integration

`NumaAchievementPopup` renders generated milestone art in a compact native
bottom popup. `NumaConfettiLayer` uses deterministic SwiftUI shapes instead of
sprites, GIFs, or Lottie. It respects Reduce Motion by falling back to static
glints.

Current triggers:

- onboarding completion shows the ready milestone
- monthly income target save shows the MRR milestone

`NumaToastBanner` replaces blocking success alerts in the authenticated shell
with a lightweight, auto-dismissing top banner.

## Next Fit Points

- shared settlement confirmation: trigger `sharedSettled` after a real settle
  action exists in the native shared-pot flow
- empty states: use selected still-life concepts for Money, Buckets, and Shared
  Pot only where they clarify an action
- goal completion: reuse the same achievement system, not a second popup style
