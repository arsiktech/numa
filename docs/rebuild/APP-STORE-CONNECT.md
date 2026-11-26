# App Store Connect listing (draft)

Draft for the Expo app in `apps/numa`, version **2.0.0**, bundle `com.arsiktech.numa`. Paste these answers later. Nothing here has been entered in App Store Connect, submitted for Beta App Review, or submitted for App Review.

The binary sets `ITSAppUsesNonExemptEncryption` to false. `eas submit` uploads a build to TestFlight. It does not release the app and it does not start App Review.

## Identity

| Field | Value |
| --- | --- |
| Name | Numa Pro |
| Subtitle | Your net worth, live |
| Bundle ID | `com.arsiktech.numa` |
| Apple ID | `6788344832` (already in `eas.json`) |
| SKU | Leave the existing App Store Connect record unchanged |
| Primary category | Finance |
| Secondary category | Productivity |
| Version | 2.0.0 |
| Price | Free. No in-app purchases. |
| Marketing URL | https://numaworth.com |
| Privacy policy URL | https://numaworth.com/privacy |
| Support URL | https://numaworth.com/privacy |
| Copyright | 2026 Arseny Ovsyannikov |

Character counts: name 8, subtitle 20 (limit 30). The support URL is the public privacy page, which includes support@numaworth.com. There is no separate support page. Add one before any future App Review if you want a dedicated URL.

## Promotional text (170)

See what you own, what you owe and how it moves, in one live number. Add money by typing a sentence. Nothing moves without you.

127 characters.

## Description

Numa Pro shows your net worth as it moves: cash, stocks, crypto, property and the debts against them, in one number.

- Live net worth. Prices update through the day. Every figure says how fresh it is. An unknown value stays unknown. It is never counted as zero.
- Add or ask. Type "Coffee 4.50" or "Bought 10 VOO at $500", or ask about your money. Numa drafts the change. Nothing is saved until you press Save, and you can undo.
- Wallets. Track a Bitcoin or Ethereum address. Public balances only. Numa never asks for keys or seed phrases.
- Alerts and widget. Bills due and spending limits on your iPhone, at most three a day and never at night. Net worth on your Home Screen. Hide amounts hides the figures there too.
- Flow. See where each month's money came from, where it went, and what you kept.
- Plan. Runway at your real pace, goals, and spending limits that warn you before you pass them.
- Needs you. At most three things a day that deserve a look, such as a bill due soon or a price that has gone stale.
- Import. Paste a sheet or a bank CSV. You see a preview before anything is saved. Numa does not connect to your bank.
- Optional AI. On-device answers stay on the iPhone. A question that needs Claude is sent only after you allow it, and you can turn that off in Settings.
- Your data. Download a copy any time. Delete your account from Settings. Deletion waits seven days so you can cancel, then removes the account.

Numa never moves money.

## Keywords (100)

`net worth,portfolio,wealth,budget,cash flow,crypto,stocks,founder,runway,money`

78 characters. The app name is not repeated.

## What to Test (TestFlight)

Sign in, add a few records with the plus, or type a sentence such as "Coffee 4.50", and check that Home, Flow and Plan agree. Try Hide amounts, dark and light, the Home Screen widget, and Import from Settings. Alerts are optional.

Do not use a bank password, seed phrase or private key. Numa never asks for those and never moves money. Sample figures are labelled on screen.

## Age rating

Expected 4+. The app has no unrestricted web browser, no public user-generated content, no gambling and no mature themes.

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Sexual content or nudity | None |
| Profanity or crude humor | None |
| Alcohol, tobacco or drugs | None |
| Mature or suggestive themes | None |
| Horror or fear | None |
| Gambling or contests | None |
| Unrestricted web access | No |
| Made for Kids | No |

## Export compliance

Answer **No** to non-exempt encryption. The app uses HTTPS, the iOS keychain, and SHA-256 for the Sign in with Apple nonce. It does not implement its own encryption. The Info.plist flag is `ITSAppUsesNonExemptEncryption` = false, so App Store Connect should skip the question on upload. If it still asks, answer No.

## App Privacy

Tracking: **No**. The app does not use the advertising identifier, App Tracking Transparency, advertising SDKs or a third-party analytics SDK.

Data is linked to the account. None of it is used to track the user across other companies' apps.

| App Store type | Collected | Linked | Tracking | Purpose | What it actually is |
| --- | --- | --- | --- | --- | --- |
| Name | Yes | Yes | No | App functionality | Display name, and the name Apple shares the first time someone uses Sign in with Apple |
| Email address | Yes | Yes | No | App functionality | Account email. Resend delivers verification and password-reset mail |
| User ID | Yes | Yes | No | App functionality, Analytics | The account id. First-party active-day measurement stores that id with the UTC date the signed-in app was opened |
| Device ID | Yes | Yes | No | App functionality | The Expo push token, only after the person turns on alerts. Not an advertising identifier |
| Other financial info | Yes | Yes | No | App functionality | Assets, holdings, debts, balances, goals, public wallet addresses and net-worth history the person enters |
| Purchase history | Yes | Yes | No | App functionality | Spending and income the person enters or imports. No card data and no App Store purchases |
| Product interaction | Yes | Yes | No | Analytics | The UTC dates above. No financial content, device id or session content |
| Other user content | Yes | Yes | No | App functionality | Ask questions and the recent conversation, and only after the person allows AI sharing |

Not collected by this iOS app: photos or videos, precise or coarse location, contacts, browsing history, crash logs, payment info, health, advertising data. The older web client can send a receipt image. This Expo app cannot. Import uses the document picker for a spreadsheet or CSV.

The same answers are in the app privacy manifest (`ios.privacyManifests` in `apps/numa/app.json`), so a later Xcode privacy report matches this table. The Home Screen widget only reads what the app already stored in the app group. Its own manifest declares that access and lists no collected data.

### Purposes to leave unchecked

Third-party advertising, developer's advertising or marketing, and product personalization. Analytics is only the two rows marked Analytics above.

### Service providers, for the privacy policy and review notes

These are not extra nutrition-label rows. They explain where the data goes.

- Convex stores the account and the records.
- Apple provides Sign in with Apple and, when alerts are on, notification delivery.
- Google provides Google sign-in when the person uses it.
- Resend sends account email.
- Anthropic receives an Ask question, the recent conversation and a summary of the selected space only after an in-app choice. The summary can include financial names and amounts. It leaves out the email and record ids. Turning AI sharing off stops new requests.
- Expo's push service receives the push token and the alert text when alerts are on. An alert can name a debt or a category.
- Frankfurter is asked for the ECB euro-dollar rate. The request does not include the account or a balance.
- Market prices are requested by ticker and date from Coinbase, Yahoo Finance, CoinGecko, Finnhub and the other providers named in the privacy policy. Those requests do not include the account.
- A public wallet address the person chooses to track is sent to the chain's public data source (mempool.space, Blockscout, and the DeFi sources named in the privacy policy). Numa never asks for a private key.

Privacy policy: https://numaworth.com/privacy (updated 21 October 2026).

## App Review notes (do not submit)

Fill this only if you later choose App Review. Do not submit this build for review as part of the TestFlight upload.

```
Numa Pro is a personal finance tracker. The person enters the records.
There is no bank connection, and the app never moves money.

Sign-in: Sign in with Apple, Google, or email and password.
Account deletion: Settings, Delete account. Deletion waits seven days,
then the account and its records are removed.

AI is optional. The app asks before sending anything to the provider.

Demo account: create one with synthetic data before review.
Email:
Password:
```

A review account has to be created in the production Convex deployment. That is a separate, explicit step. This draft does not create one.

## Screenshots still required before App Review

Not required for an internal TestFlight upload. Before any later submission, capture 6.9-inch (1320 × 2868) and 6.5-inch (1284 × 2778) iPhone screenshots, three to ten each, from synthetic data:

1. Home, net worth, with freshness visible.
2. Adding a record from a sentence.
3. Flow for a month.
4. Plan, with a goal or a spending limit.
5. A public wallet, showing that no key is requested.
6. Settings, with export, AI sharing and delete account.

## What this build does not do

- It does not submit for App Review.
- It does not release on the App Store.
- It does not add external TestFlight testers. External testing needs Beta App Review. Leave the build on internal testing until you decide otherwise.
