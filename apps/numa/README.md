# Numa Pro app (rebuild)

One codebase for iOS, Android and web: Expo SDK 57, Expo Router, Reanimated 4 and react-native-svg, styled with the Pulse design system (`docs/rebuild/DESIGN.md`).

This app is being built beside the current web app (`src/`) and SwiftUI app (`ios/Numa`). Those stay live until the new app reaches parity. It has its own package and lockfile; root lint, build and tests ignore `apps/`.

## Run

```sh
cd apps/numa
npm ci
npx expo start          # press i, a or w
npm test                # domain unit tests (Jest, jest-expo)
npm run typecheck
npm run export:web      # static web build in dist/
```

## Layout

| Path | What |
| --- | --- |
| `src/app/` | Routes: `(tabs)/index` Home, `(tabs)/flow`, `(tabs)/plan`, `ask` (modal) |
| `src/domain/` | Pure money model and rules: valuations with freshness, liquidity, summaries, flow, attention |
| `src/data/` | Data sources. `demo.ts` is the labelled fictional portfolio from the mockup; Convex comes next |
| `src/theme/` | Pulse tokens for dark and light, type scale, motion curves |
| `src/ui/` | Components: Odometer, ScrubChart, CompositionBar, NeedsYou, MonthTeaser, CoachTip, Nav, ProBadge |

## Rules carried from the product

- Amounts are integer cents. An unknown value is left out of totals and listed, never counted as zero; a missing price counts at its last known value and is flagged stale.
- Locked and pledged holdings are owned but not liquid.
- Demo data is always labelled on screen.
