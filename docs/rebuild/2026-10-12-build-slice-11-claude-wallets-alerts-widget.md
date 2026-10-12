# Numa rebuild, build slice 11: Claude Ask, wallets, phone alerts, widget

Date: 2026-10-12. Status: built and verified locally; not deployed. These close the gaps between the mockup and the build, following the owner's decisions in `2026-10-12-v1-completion-decisions.md`.

## Claude in Ask

- **The device answers first.** Amounts like "Coffee 4.50" and questions like "What's my net worth?" are still handled on the phone, instantly and privately.
- **Claude gets only the rest:** open questions ("Can I afford a €2,000 trip?"), sentences without a clear amount, and several entries in one sentence.
- **What Claude receives.** The question, the last few turns, and a short summary of the person's own numbers: totals, accounts, debts, investments, this month's flow and category names. No email and no record ids.
- **Claude only proposes.** Its `propose_entry` tool is strict, so every proposal matches the schema. The server checks each proposal again; anything that doesn't fit is dropped, and unknown amounts stay unknown. Proposals become the usual draft cards, and nothing is saved until the person presses Save.
- **Model and limits.**
  - Model: `claude-opus-5-5` with low effort. `NUMA_ASK_MODEL` on Convex can name another model.
  - Server-side fallbacks: `fallbacks: "default"`, so a declined request can be re-run on Anthropic's recommended model.
  - Limits: 30 a hour and 150 a day per account, counted before Claude is called.
  - Plain replies when the key is missing, the service is busy, the limit is reached or the request is declined.
- **Code:**
  - backend: `convex/ask.ts` and `convex/lib/askProposals.ts`;
  - app: `apps/numa/src/ask/aiContext.ts`, `proposal.ts` and `app/ask.tsx`.

## Wallets

- **Settings → Wallets → Track a wallet.** Paste a public Bitcoin (`bc1…`) or Ethereum-style (`0x…`) address. Recovery phrases are refused on the phone and again on the server.
- **Sources.** Balances come from mempool.space (Bitcoin) and Blockscout (Ethereum, Base, Arbitrum, Optimism, Polygon). They need no key and cost nothing.
- **Each network is checked on its own.** One that can't be reached is named in Needs you, never counted as zero. Tokens without a market price are left out; a coin without a price makes the wallet's value unknown.
- **Refresh.** Wallets refresh every 30 minutes, and by hand from the wallet page at most once a minute. A wallet counts as crypto on Home and in Holdings, with its source and age.
- **Code:**
  - backend: `convex/walletSync.ts` and `convex/lib/publicWallets.ts`;
  - app: `apps/numa/src/data/wallets.ts`, `src/wallets/` and `src/settings/WalletSection.tsx`.

## Phone alerts

- **Settings → Alerts on this phone** (iOS and Android). The phone registers an Expo push token with its time zone.
- **What is sent.** Each hour, Convex works out what Needs you would raise: debts due within three days, and spending limits at 80% and past 100%.
- **The rules.** At most three a day, never between 22:00 and 8:00 local time, and never the same alert twice. Tapping an alert opens the debt or Plan.
- **Data.** Tokens and sent-alert keys are erased with the account.
- **Code:**
  - backend: `convex/pushAlerts.ts` and `convex/lib/pushAlerts.ts`;
  - app: `apps/numa/src/alerts/` and `src/settings/AlertsSection.tsx`.

## Home-screen widget (iOS)

- **Sizes.** Small and medium. They show net worth and today's market move; the medium one adds the last 30 days as a line.
- **Hide amounts.** With it on, the widget shows dots and no line. Signing out clears it.
- **How it gets data.** The app writes the formatted figures to the `group.com.arsiktech.numa` app group and reloads the widget.
- **Code:** `apps/numa/targets/widget/` (SwiftUI, through `@bacons/apple-targets`) and `apps/numa/src/widget/`.

## Verified locally

- **Unit tests:** backend 589 and app 130, all passing. They include proposal checks, the wallet fetcher with canned explorer replies, the alert rules, and wallet, widget and proposal mapping.
- **Browser journeys:** all 12 pass against a local Convex backend with disposable `@example.com` accounts. The new and changed ones:
  - `ask-claude`: 13 of 13, against a stand-in for the Anthropic API, so no key or money is used;
  - `wallets`: 11 of 11, including one live mempool.space read;
  - `push-alerts`: 5 of 5;
  - `ask`: 19 of 19.
- **Typecheck and lint** pass for the app and the backend.
- **The iOS project generates with the widget target.**

## Not verified yet

- **Real Claude answers.** They need `ANTHROPIC_API_KEY` on the Convex deployments, which the owner sets.
- **Push delivery to a real phone.** It needs a phone build with push enabled.
- **The widget.** It needs the iOS simulator build in CI, and then a phone.
- **Blockscout from the Convex servers.** From this session, Base, Arbitrum and Polygon sat behind a bot check. If that happens in production, those networks show as not checked.

## Owner setup

- **`ANTHROPIC_API_KEY`** on both Convex deployments (paid per use). Optional: `NUMA_ASK_MODEL`.
- **On the next iOS build,** let EAS add the Push Notifications and App Groups capabilities to `com.arsiktech.numa`, and create the widget's bundle id (`com.arsiktech.numa.NumaWidget`) with the same app group. EAS does this when the build signs in to Apple.
