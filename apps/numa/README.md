# Numa Pro app (rebuild)

One codebase for iOS, Android and web: Expo SDK 57, Expo Router, Reanimated 4 and react-native-svg, styled with the Pulse design system (`docs/rebuild/DESIGN.md`).

This app is being built beside the current web app (`src/`) and SwiftUI app (`ios/Numa`). Those stay live until the new app reaches parity. It has its own package and lockfile; root lint, build and tests ignore `apps/`.

## Run

```sh
cd apps/numa
npm ci
cp .env.example .env.local   # set EXPO_PUBLIC_CONVEX_URL to a development deployment, or leave it empty for demo only. Leave the feedback variables empty to hide the web feedback button. When they are set, a picture is included only for paths the service lists
npx expo start          # press i, a or w
npm test                # domain and data unit tests (Jest, jest-expo)
npm run lint
npm run typecheck
npm run export:web      # web build in dist/ (a single-page app: hosting must serve index.html for unknown paths)
```

## Layout

| Path | What |
| --- | --- |
| `src/ask/` | Ask: the on-device parser (`parse.ts`), answers from the person's numbers, the save and undo plan (`plan.ts`), draft cards |
| `src/app/` | Routes: `sign-in`, `auth` (where Google sign-in returns on phones), `(tabs)/index` Home, `(tabs)/flow`, `(tabs)/plan`, `ask` and `movers` (modals; `movers` explains why net worth moved), `settings`, `holdings`, `holdings/[group]`, `position/[group]/[key]` (one asset across every place it sits), `item/[type]/[id]`, `day/[t]` (one saved date from the Home chart), `tx/[id]` (one transaction, edit or delete with Undo), `loan/[key]`, `person/[key]` (every debt with one person, company or protocol), `money-map` (who you owe, who owes you, where your money sits), `earnings` (DeFi earnings), `import`, `password` (set or change a password), `delete-account`, `+not-found` (the screen for an unknown address). The root layout shows `sign-in` only while signed out |
| `src/domain/` | Pure money model and rules: valuations with freshness, liquidity, summaries, flow, attention |
| `src/cloud/` | Convex client and Convex Auth (tokens in the keychain or keystore on phones), the typed list of Convex functions the app calls, session state |
| `src/data/` | `fromSnapshot.ts` maps the server's portfolio snapshot onto the domain; `useHome.ts` serves Home from Convex or from the labelled demo portfolio (`demo.ts`); `series.ts` builds chart lines; `fx.ts` converts EUR and USD |
| `src/activity/` | `useActiveDay.ts`: records an active day while the app is visible and connected, never queued offline |
| `src/agents/` | `prompt.ts`: the text a person pastes into an AI agent to connect it over MCP |
| `src/alerts/` | Push alerts: permission and the Expo push token (`push.ts`, with a web stub), and sign-out that unregisters the token first (`signOut.ts`) |
| `src/earnings/` | What DeFi strategies earned over a range (`useEarnings.ts`), with its chart and Home teaser |
| `src/flow/` | Flow tab logic: month selection, the income-to-spending Sankey layout, spend calendar, recurring items, card statement details, and transaction edit and delete plans with Undo |
| `src/loans/` | Loans: what backs them, payments, where borrowed money went, and the money map (`useLoans.ts`, `useMoneyMap.ts`) |
| `src/plan/` | `plan.ts`: runway, how long cash lasts at the last three full months' pace of spending |
| `src/privacy/` | AI sharing consent: reads and changes the account's choice and sends private context to AI only after a fresh, same-account check |
| `src/settings/` | Settings sections: account, space, wallets, alerts, AI sharing, agents, feedback, and space export |
| `src/sources/` | Import from a file, a Google Sheets link or pasted text: CSV and spreadsheet parsing into previewed transactions, balances and holdings |
| `src/state/` | Device preferences: theme, hide amounts, tips already seen, demo mode |
| `src/theme/` | Pulse tokens for dark and light, type scale, motion curves |
| `src/updates/` | `useLiveUpdates.ts`: checks for a newer published update when the app returns to the foreground and applies it only after a real break |
| `src/wallets/` | Tracked public crypto wallets: address checks and adding (`useWallets.ts`), and the wallet detail view |
| `src/widget/` | Home-screen widget: builds its payload from data already loaded and writes it to the shared app store; clears it whenever the signed-in account or its data is not ready |
| `src/ui/` | Components: Odometer, ScrubChart, CompositionBar, NeedsYou, MonthTeaser, CoachTip, Nav, ProBadge; `money.tsx` formats amounts in the portfolio currency and masks them when hidden |

## Backend

The app uses the existing Convex functions and needs no backend change. Every function it calls is listed with its types in `src/cloud/api.ts`. Each write carries a `clientMutationId`, so a retry never saves twice. Sign-in is Convex Auth: Sign in with Apple (Apple's own button on iPhone, Apple's popup on the web), Google where it is set up, or email and password. Accounts that need email verification get a code.

To try it against a throwaway local backend instead of a shared deployment (from the repository root):

```sh
CONVEX_AGENT_MODE=anonymous npx convex dev   # local backend on http://127.0.0.1:3210
node apps/numa/e2e/setup-auth.mjs            # gives it Convex Auth keys
EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 npx expo start --web   # in apps/numa
```

Use disposable test accounts only. Never point a local build at production data.

### Connected agents (MCP)

Settings, AI agents makes one secret link (`<convex site>/mcp/numa_agent_…`) for Claude, ChatGPT, Cursor or any MCP client. The endpoint in `convex/agentMcp.ts` speaks MCP over Streamable HTTP (JSON responses) and also takes the secret as `Authorization: Bearer`. Each agent has its own Convex Auth session and calls the same public functions as the app, as the user, so membership, currency and receipt checks apply unchanged. Tools are defined in `convex/lib/agentTools.ts`; a link is either read-only or read and change. Calls are rate-limited, listed for the user (kept 90 days) and stop at once when the agent is disconnected, the user signs out other devices, or the account is deleted.

Browser journeys for every main flow live in `e2e/` and run in CI. See `e2e/README.md`. Release steps (Cloudflare Pages, EAS, store text) are in `docs/rebuild/RELEASE.md`. App icons are drawn by `node scripts/make-icons.cjs`.

## Rules carried from the product

- Amounts are integer cents. An unknown value is left out of totals and listed, never counted as zero; a missing price counts at its last known value and is flagged stale.
- Locked and pledged holdings are owned but not liquid.
- Demo data is always labelled on screen.
- Every value is in the portfolio's currency. USD and EUR convert with the ECB reference rate from Frankfurter (no key, no account data sent). Without a rate, records in the other currency are left out and the totals say they are unavailable.
- Today's change comes from today's price moves; longer ranges come from saved net-worth points. With no saved history the screen says so instead of drawing one.
