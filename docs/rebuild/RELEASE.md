# Numa Pro rebuild: release guide

How the Expo app in `apps/numa` gets to the web, TestFlight and Google Play internal testing.

Pre-approved by the owner, once the accounts below are connected:
- web preview deploys;
- TestFlight builds;
- Play internal-testing builds.

Production web deploys and public store releases need an explicit go-ahead each time.

## What the owner connects (one time)

| Account | What to do | Why it needs the owner |
|---|---|---|
| Cloudflare | Create a Pages project from the `arsiktech/numa` GitHub repo with the settings below, and set the two environment variables. | Account and Git connection |
| Expo (EAS) | Create or sign in to an Expo account, run `npx eas-cli init` in `apps/numa` (it adds `extra.eas.projectId` to `app.json`), and set `EXPO_PUBLIC_CONVEX_URL` in the Expo dashboard for the `preview` and `production` environments. | Account and billing plan |
| App Store Connect | Let EAS use the existing Numa Pro app record (`com.arsiktech.numa`), via an App Store Connect API key or by signing in when `eas submit` asks. | Credentials |
| Google Play Console | Create the app (package `com.arsiktech.numa`). Upload the first build by hand, as Play requires, then add a service-account key for `eas submit`. | Account, fee and credentials |

### Connection status (2026-10-12)

| Account | State |
|---|---|
| Cloudflare Pages | Connected. Project `numa-pro` (`numa-pro.pages.dev`), GitHub app limited to this repo. Previews build for every branch and PR. **Automatic production deploys from `main` are off**, so a merge never publishes; production is a manual promotion. |
| Expo (EAS) | Connected. Project `@arsiktech/numa-pro-app` (ID in `app.json`). `EXPO_PUBLIC_CONVEX_URL` is set for `development`, `preview` (DEV) and `production` (production). |
| App Store Connect | EAS builds the IPA; the upload to TestFlight runs from the owner's Mac with its existing API key (the key is not stored on EAS). |
| Google Play Console | Developer account created. The app record and the first hand-uploaded build are still to do. |

## Web: Cloudflare Pages

Settings for the Pages project:
- **Root directory:** `apps/numa`
- **Build command:** `npm ci && npx expo export --platform web`
- **Output directory:** `dist`

Environment variables:
- `NODE_VERSION` = `24`.
- `EXPO_PUBLIC_CONVEX_URL`:
  - preview: the DEV Convex deployment;
  - production: the production deployment.

Notes:
- **Single-page app.** The build is one `index.html`. Pages serves it for every path because the build has no `404.html`.
- **Headers.** `public/_headers` sets security headers and long caching for hashed bundles.
- **Search engines.** `public/index.html` sets `noindex` while v1 is owner-only.
- **Previews.** Every PR gets its own preview URL. These are the pre-approved preview deploys. Promoting to the production branch is a production deploy and needs a go-ahead.

Before the first production deploy, check that the production Convex deployment has every function the app calls. The full list is in `apps/numa/src/cloud/api.ts`. A missing function shows as a load error, not wrong numbers.

## Phones: EAS

Profiles live in `apps/numa/eas.json`:
- **`preview`:** internal distribution. The iOS build installs on registered devices; Android builds an APK. It reads the `preview` environment.
- **`production`:** store builds, with build numbers incremented remotely. It reads the `production` environment.

Commands, run in `apps/numa`:

```sh
npx eas-cli build --profile preview --platform all      # internal builds
npx eas-cli build --profile production --platform ios   # then:
npx eas-cli submit --profile production --platform ios  # TestFlight
npx eas-cli build --profile production --platform android
npx eas-cli submit --profile production --platform android   # Play internal track, as a draft
```

### Bundle ID (owner decision, 2026-10-12)

The rebuild ships as `com.arsiktech.numa`, the existing Numa Pro identity on iOS and Android. A TestFlight build of the rebuild replaces the SwiftUI app for testers.

The app version is `2.0.0`, above the SwiftUI app's 1.2.0 builds. EAS keeps the build number. If the existing record's highest build number is above EAS's counter, run `npx eas-cli build:version:set` once before the first upload.

## Store text (draft)

**Name:** Numa Pro
**Subtitle (30):** Your net worth, live

**Promotional text (170):** See what you own, what you owe and how it moves, in one live number. Add money by typing a sentence. Nothing moves without you.

**Description:**

Numa Pro shows your net worth as it moves: cash, stocks, crypto, property and the debts against them, in one live number.

- **Live net worth.** Prices update through the day. Every figure says how fresh it is.
- **Ask or add.** Type "Coffee 4.50" or "Bought 10 VOO at $500". Numa drafts it, and nothing is saved until you press Save. Undo is always there.
- **Flow.** See where each month's money came from and where it went, and what you kept.
- **Plan.** Runway at your real pace, goals, and spending limits that warn you at 80%.
- **Needs you.** At most three things a day that deserve a look, like a bill due soon or a price that's gone stale.
- **Import.** Paste a sheet or a bank CSV. You see a preview before anything is saved.
- **Your data.** Download a full copy any time. Delete your account from Settings.

Numa never moves money and doesn't link to your bank. Unknown values are shown as unknown, never as zero.

**Keywords (100):** net worth,portfolio,wealth,budget,cash flow,crypto,stocks,founder,runway,money

**What to Test (TestFlight):** Sign in, add a few things with the plus, and check that Home, Flow and Plan agree with what you entered. Try hide amounts, dark and light, and Import from Settings.

**App privacy (App Store):**
- **Data collected:**
  - Contact info: email address, for the account.
  - Financial info: what you enter. It is linked to you and used only for app functionality.
- **Tracking:** none.
- **Third parties:** none, apart from the hosting providers (Convex for data, Cloudflare for the web app).
- **Exchange rates:** fetched from the ECB via Frankfurter without any user data.
