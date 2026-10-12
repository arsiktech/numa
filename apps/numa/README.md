# Numa Pro app (rebuild)

One codebase for iOS, Android and web: Expo SDK 57, Expo Router, Reanimated 4 and react-native-svg, styled with the Pulse design system (`docs/rebuild/DESIGN.md`).

This app is being built beside the current web app (`src/`) and SwiftUI app (`ios/Numa`). Those stay live until the new app reaches parity. It has its own package and lockfile; root lint, build and tests ignore `apps/`.

## Run

```sh
cd apps/numa
npm ci
cp .env.example .env.local   # set EXPO_PUBLIC_CONVEX_URL to a development deployment, or leave it empty for demo only
npx expo start          # press i, a or w
npm test                # domain and data unit tests (Jest, jest-expo)
npm run lint
npm run typecheck
npm run export:web      # static web build in dist/
```

## Layout

| Path | What |
| --- | --- |
| `src/ask/` | Ask: the on-device parser (`parse.ts`), answers from the person's numbers, the save and undo plan (`plan.ts`), draft cards |
| `src/app/` | Routes: `sign-in`, `(tabs)/index` Home, `(tabs)/flow`, `(tabs)/plan`, `ask` (modal), `settings`. The root layout shows `sign-in` only while signed out |
| `src/domain/` | Pure money model and rules: valuations with freshness, liquidity, summaries, flow, attention |
| `src/cloud/` | Convex client and Convex Auth (tokens in the keychain or keystore on phones), the typed list of Convex functions the app calls, session state |
| `src/data/` | `fromSnapshot.ts` maps the server's portfolio snapshot onto the domain; `useHome.ts` serves Home from Convex or from the labelled demo portfolio (`demo.ts`); `series.ts` builds chart lines; `fx.ts` converts EUR and USD |
| `src/state/` | Device preferences: theme, hide amounts, tips already seen, demo mode |
| `src/theme/` | Pulse tokens for dark and light, type scale, motion curves |
| `src/ui/` | Components: Odometer, ScrubChart, CompositionBar, NeedsYou, MonthTeaser, CoachTip, Nav, ProBadge; `money.tsx` formats amounts in the portfolio currency and masks them when hidden |

## Backend

The app uses the existing Convex functions, the same ones the SwiftUI app calls: `mobile:bootstrap`, `mobile:portfolioSnapshot` and `portfolios:create`. Ask writes through `mobile:createTransaction`, `upsertAsset`, `upsertLiability` and `upsertHolding` (and their deletes for Undo), each with a `clientMutationId`. It needs no backend change. Sign-in is Convex Auth with email and password; accounts that need email verification get a code.

To try it against a throwaway local backend instead of a shared deployment (from the repository root):

```sh
CONVEX_AGENT_MODE=anonymous npx convex dev   # local backend on http://127.0.0.1:3210
# then set JWT_PRIVATE_KEY, JWKS and SITE_URL on it with `npx convex env set` (keys from the Convex Auth manual setup)
EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 npx expo start --web   # in apps/numa
```

Use disposable test accounts only. Never point a local build at production data.

## Rules carried from the product

- Amounts are integer cents. An unknown value is left out of totals and listed, never counted as zero; a missing price counts at its last known value and is flagged stale.
- Locked and pledged holdings are owned but not liquid.
- Demo data is always labelled on screen.
- Every value is in the portfolio's currency. USD and EUR convert with the ECB reference rate from Frankfurter (no key, no account data sent). Without a rate, records in the other currency are left out and the totals say they are unavailable.
- Today's change comes from today's price moves; longer ranges come from saved net-worth points. With no saved history the screen says so instead of drawing one.
