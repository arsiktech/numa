# Numa rebuild, build slice 2: sign-in and real data on Home

Date: 2026-10-12. Status: built and verified locally against a throwaway local backend; not deployed.

From this slice on, the rebuild is developed in this public repository.

## What exists now

- **Sign-in on iOS, Android and web** with Convex Auth (email and password). Tokens live in the keychain or keystore on phones and in local storage on the web. Accounts that need email verification get a code step. Errors are one plain sentence and never echo server internals.
- **Real data on Home.** Home reads the signed-in person's first portfolio live from Convex through the same functions the SwiftUI app uses (`mobile:bootstrap`, `mobile:portfolioSnapshot`), so no backend change was needed. `fromSnapshot` maps it onto the money domain:
  - Cash accounts are cash. Property, vehicles, collectibles and other assets are owned but not liquid. Manual values carry a reminder (30 days for cash, 180 for the rest) and are flagged when older.
  - Holdings with a current quote are valued from the quote (stored in USD). Without a quote they count at cost and Needs you says so. A stale quote counts at its last price, flagged. A mock quote counts as no quote.
  - An overdrawn account is money owed, not a negative block.
  - Debts due within 14 days are raised in Needs you.
  - This month's in, out and kept come from the transactions, grouped by category.
- **Currency.** Totals are in the portfolio's currency. EUR and USD convert with the ECB reference rate from Frankfurter, cached on the device. Without a rate, records in the other currency are left out and the hero says totals need today's rate.
- **Honest chart.** 1D is today's market move on priced holdings. Longer ranges use saved net-worth points, starting from the last value saved before the range when it is recent enough. With no history the screen says "History starts today" instead of drawing a line.
- **Settings:** theme (Auto, Dark, Light), hide amounts, account and sign out. Theme, hide amounts and the coach tip are remembered on the device.
- **Hide amounts everywhere:** hero, change line, blocks, month teaser and Needs you.
- **Demo mode:** signed-out people can explore the labelled demo portfolio and sign in from its chip.
- **CI:** a new `app` job type-checks, lints, tests and builds the app on every pull request.

## Decisions made while building

- **New accounts skip the currency question.** The backend creates a EUR portfolio on first sign-in. The "Set up your money" step stays for accounts with no portfolio.
- **Liquid and Cash history is not drawn for real data.** Saved points hold net worth only, so on those tabs the figure shows today's value and the chart stays on net worth, labelled as such.
- **One portfolio for now:** Home shows the first portfolio, like the iOS app's default. Switching spaces comes later.
- **Frankfurter moved** from `api.frankfurter.app` to `api.frankfurter.dev/v1`; the app uses the new address.

## Verified

Six verification cycles out of ten. A cycle is one run of a scripted browser journey against the web build, using a throwaway local Convex backend (anonymous local mode) and a disposable test account.

- The final cycle passed 20 of 20 checks at 390 and 1440 px, in dark and light:
  - signed out lands on sign-in, and a weak password keeps Create account disabled;
  - a new account shows the empty state once;
  - Home updates live when test records arrive;
  - own €134,733, owe €20,420 and net €114,313 match the records to the euro, including the USD holdings at the day's ECB rate;
  - the due debt and the unpriced holding are raised;
  - the month shows kept €3,800 (76%);
  - the Live chip shows with fresh quotes;
  - 1D shows today's market move and 1Y the change from saved history;
  - hide amounts masks blocks and shares;
  - the session and theme survive a reload;
  - sign out works, a wrong password gets a plain message, and the demo path works;
  - signing in works at desktop width;
  - there are no page or console errors apart from the deliberate wrong-password attempt.
- Earlier cycles failed on test setup, except one real find: the exchange-rate address had moved. One rendered issue was fixed between cycles: 1D compared against a value saved days earlier.
- `npm run typecheck`, `npm run lint` and `npm test` (32 tests) pass.
- iOS and Android bundles compile.

## Not verified or not done

- Not run on a phone or simulator; this environment has neither. Secure token storage on phones is untested on a device.
- Not run against the shared development or production Convex deployments. Nothing was deployed.
- Email verification codes and password reset are wired to the backend's existing flows but untested here, because the local backend has no email provider.
- Adding and editing money from the app (the plus) is next; the empty state says so.

## Next slices

1. Ask and the plus: the composer, drafts with Save, Edit, Discard and Undo, writing through the existing functions with `clientMutationId` receipts.
2. Flow: the monochrome Sankey, following a stream, products and MRR.
3. Plan, Holdings, sources and the Google Sheet import, then widgets.
4. Release: a web deploy and TestFlight and Play builds, each with the owner's go-ahead.
