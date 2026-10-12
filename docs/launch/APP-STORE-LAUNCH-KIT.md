# Numa Pro App Store launch kit

Draft inputs for App Store Connect. Everything here is a proposal for the owner
to review and paste; nothing has been submitted. Release gates and ownership
stay in `docs/NUMA-PRO-PUBLIC-RELEASE.md`.

## Identity

| Field | Value |
| --- | --- |
| App name | Numa Pro |
| Bundle ID | `com.arsiktech.numa` |
| Version / build in source | 1.2.0 / 202609090933 (bump the build for each upload) |
| Primary category | Finance |
| Secondary category | Productivity |
| Price at launch | Free, no in-app purchases (pricing and StoreKit are post-launch, ARS-107) |
| Age rating | 4+ expected: no user-generated public content, no gambling, no web browsing |
| Support URL | Needs an owner-chosen public page; current support contact is the in-app email link |
| Privacy policy URL | `https://numa-ecru.vercel.app/privacy` (or the custom domain if one is chosen) |

## Subtitle (30 characters max)

`Net worth, cash flow and MRR` (28)

## Promotional text (170 max)

`See everything you own, earn and spend in one calm place. Built for founders: track net worth, cash flow, recurring revenue and every business space side by side.`

## Description

Numa Pro is a personal capital system for founders, freelancers and anyone who
runs more than one money stream.

- Net worth that tells the truth: assets, holdings and debts in one view, with
  stale prices and estimated exchange rates called out instead of hidden.
- Cash flow without busywork: add income and expenses in a few taps, review
  batches before they save, and retry safely when you are offline.
- Recurring revenue for your business: mark subscriptions and retainers to see
  MRR and ARR by client, kept separate from cash you actually received.
- Separate personal and business spaces: switch with one tap, never mix the
  numbers.
- Budgets and goals: monthly category limits and a monthly income target.
- Your data, your call: export a space's full history, control whether AI
  features may see your data, and delete your account from Settings.

Numa Pro does not connect to your bank and never asks for bank passwords,
seed phrases or private keys.

## Keywords (100 characters, comma separated, no spaces needed)

`net worth,budget,cash flow,MRR,ARR,founder,freelancer,expenses,income,assets,portfolio,finance` (94)

## App Privacy answers (draft, reconcile with Xcode's privacy report)

From `ios/Numa/Numa/PrivacyInfo.xcprivacy` and `docs/privacy/beta-data-inventory.md`.
Tracking: **No**. No advertising or third-party analytics SDK.

| Data type | Collected | Linked to user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Name | Yes | Yes | No | App functionality |
| Email address | Yes | Yes | No | App functionality |
| User ID | Yes | Yes | No | App functionality |
| Other financial info | Yes | Yes | No | App functionality |
| Purchase history | Yes | Yes | No | App functionality |
| Photos or videos (receipt scans, only after AI consent) | Yes | Yes | No | App functionality |
| Other user content | Yes | Yes | No | App functionality |
| Crash data | Review: web crash reports are categorical only; the native app sends none found in source | | | |

## App Review notes (fill in before submission)

```
Numa Pro is a personal finance tracker. All data is entered by the user;
there is no bank connection.

Demo account (non-expiring, synthetic data only):
  Email:    <create a dedicated review account>
  Password: <set before submission>

Sign-in: email and password. Google sign-in is not shown on iOS while Sign in
with Apple is unavailable (Guideline 4.8).

Account deletion: Settings > Delete account. Deletion is scheduled with a
seven-day cancellation window, then all owned data is removed.

AI features are optional and require an explicit in-app consent before any
data is sent.
```

## Screenshots

Required: 6.9" iPhone (1320 × 2868) and 6.5" iPhone (1284 × 2778), 3 to 10 each.
Use the synthetic review account, light and dark.

1. Today: net worth and this month's cash flow.
2. Add a transaction: amount-first entry.
3. Money: recurring revenue card with MRR and ARR in a business space.
4. Wealth: assets, holdings and debts.
5. Spaces: switching between personal and business.
6. Settings: privacy controls, export and account deletion.

## Owner checklist before "Submit for Review"

- [ ] App Store Connect record exists for `com.arsiktech.numa`.
- [ ] Signed archive uploaded, processed and tested on a physical iPhone via TestFlight.
- [ ] Demo account created with synthetic data and added to the review notes.
- [ ] Privacy policy and Terms approved; support URL live.
- [ ] App Privacy answers saved and matching the build's privacy report.
- [ ] Export compliance: the app uses only standard HTTPS (answer accordingly).
- [ ] Screenshots uploaded for both required sizes.
