# Numa rebuild, phase 1: concept directions

Date: 2026-10-11. Status: the owner picked B with parts of A, C and D. See [phase 2 decisions](2026-10-11-phase-2-decisions.md).

The owner wants to rebuild Numa from the ground up as an all-in-one money
dashboard for founders, self-employed people, entrepreneurs and developers,
starting with design. The plan has three steps:

1. Explore concepts (this document and the canvas).
2. After a pick, mock up the whole product for web, iOS and Android.
3. After the mockup is approved, build it.

Every concept uses the same fictional founder portfolio, so the screens can be
compared side by side. It mixes the kinds of money a founder tends to hold: EUR
and USD cash, stablecoins, BTC, ETH and other tokens, US stocks, a property
share, a watch, a car, gold, business equity, three products with MRR, and four
debts. Net worth is €899,538. All of it is made up.

## What the product must do

The home screen answers five questions in this order:

1. **What am I worth right now?** Net worth, liquid and cash, updated live
   where a live price exists.
2. **What moved it?** Markets, saving, currency and revaluations, kept apart.
3. **Where does money come from and go?** Income sources (products, clients,
   yield) against spending, taxes and debt payments.
4. **What needs me today?** At most three items: due taxes, a stablecoin off its
   peg, a stale valuation, an expiring exchange key, a concentration limit.
5. **Am I on track?** Runway, tax pot, MRR and goals.

## Principles every direction keeps

- **Answer first, controls second.** The number comes before any tabs, filters
  or buttons. The 2026-10-11 diagnosis found the current Money screens did the
  opposite.
- **One scale, one truth.** Unknown is never shown as zero. Every number shows
  how fresh it is: live, synced, manual with a date, or estimate. Pledged
  collateral and locked shares count as owned but not liquid.
- **One way in.** A single add-or-ask entry takes typing, voice, a receipt or
  screenshot, a CSV or the Google Sheet. AI drafts and the user confirms; there
  are no silent writes. This is already a product invariant.
- **Few, ranked interruptions.** Alerts trigger on bands the user sets ("crypto
  over 25%", "stablecoin more than 50 bp off peg"), not on any movement.
- **Teach in place, once.** The first visit to each screen shows one short tip
  with a gesture demo, for example tap a block, drag the line or follow a
  stream. It can always be dismissed and never blocks the screen.
- **Motion explains.** Numbers roll to their new value. Bars and rivers morph
  between views and do not cut. Reduced motion turns all of it off.
- **Fast.** The app opens on a cached snapshot and then updates. Animations are
  interruptible and frame-cheap. Telegram is the reference for responsiveness.
- **Private.** Amounts can be hidden in one tap. Wallets are tracked by public
  address only, exchanges with read-only keys. No bank passwords are stored.

## The four directions

| | A · Balance | B · Pulse | C · Flow | D · Brief |
|---|---|---|---|---|
| Idea | One honest scale. Everything you own and owe as proportional blocks. | Net worth as a live instrument. | Where money comes from and where it goes. | Your money, explained. Ask or add anything. |
| Signature mechanic | Tap a block to open it; switch "by asset" and "by place" | Drag the line to travel back in time and see what changed | Tap a stream to follow it into categories | Plain-language composer that drafts entries and answers |
| Home answers first | Net worth composition | Net worth movement | This month's cash flow | Today's summary and what needs you |
| Look | Warm paper, condensed numerals (Big Shoulders), Geist | True black, light Manrope figure, JetBrains Mono ticks | Midnight blue, luminous Sankey, Bricolage Grotesque | White, Onest, conversation with live cards |
| Feels like | Things 3, Wise | Trade Republic, Robinhood | A founder P&L you want to look at | ChatGPT, Grok |
| Navigation | Tab bar and Magic Plus | Floating capsule and plus | Tab bar with centre plus | Composer always present |
| Strength | Calm and trustworthy; grows from the screen the owner liked | Most "real time" and most premium | Strongest founder and self-employed story | Fewest clicks; fastest capture |
| Risk | Can feel static between visits | Invites compulsive checking; weaker on cash flow | Monthly view is weaker on net worth | Depends on dependable AI; weaker for scanning |

Each row on the canvas has a phone home, a phone screen with the signature
mechanic (with its first-visit tip) and a web dashboard. All twelve boards are
interactive: tabs, checkboxes, scrubbing, month switching, stream focus and a
composer that parses messages like "spent 18.50 on uber, bbva", "sold 0.1 BTC
at 96k" and "my rolex is worth 13k" into drafts.

### Recommendation

Use A as the base look, because it grew out of the Balance home the owner
liked and it is the calmest and most honest. Then add mechanics from the other
three, since mechanics combine across directions even when looks do not:

- B's time scrub as the history view of net worth and of each block.
- C's Flow as the cash-flow tab.
- D's composer as the single add-or-ask entry.

Picking a look and listing the mechanics to keep is enough to start phase 2.

## Research highlights

The full brief with sources is in [the market research](2026-10-11-market-research.md). These points change the
design:

- **The gap is real.** No product combines EU multi-currency net worth, crypto
  wallets and exchanges, brokers, hard assets and a founder layer (MRR, ARR,
  runway, business value) with a premium experience.
  - Kubera has the breadth but no founder layer and a dated interface.
  - Monarch shows every currency as dollars.
  - Copilot has no Android app.
  - The new "AI CFO" tools cover only the business.
- **Sync breaks everywhere** (Finary through Powens, Kubera, Empower, Monarch).
  People keep spreadsheets for control, privacy and flexible categories. Numa
  should automate where it is reliable, make manual updates take 5 seconds,
  show freshness, and offer a sheet-like escape hatch: import, export and
  custom fields.
- **Setup ladder, easiest first:**
  1. Import the Google Sheet with AI column mapping and a review step.
  2. Paste public wallet addresses.
  3. Add read-only exchange keys.
  4. Connect Stripe, Paddle, RevenueCat, Polar or App Store Connect for MRR.
  5. Connect banks through open banking.
  6. Drop a screenshot or PDF for anything else.
- **EU bank data.** GoCardless Bank Account Data no longer accepts new
  sign-ups. Enable Banking is the practical replacement: free for your own
  accounts, contract and KYB for production. Trade Republic now has an official
  CSV export.
- **SpaceX listed on Nasdaq on 2026-06-12 as SPCX.** It is now a quoted holding
  and no longer a manual private mark. Model the lock-up end date: priced, but
  not liquid until then.
- **Spain, autónomo.** The founder layer needs a tax pot:
  - IVA (modelo 303) and IRPF instalments (modelo 130).
  - Quarterly deadlines: 20 Apr, 20 Jul, 20 Oct, 30 Jan.
  - A year-end check for modelo 721 (crypto with foreign custodians above €50k).
- **Platform.**
  - iOS 27 toned Liquid Glass down. Use glass for navigation chrome only and
    keep figures on opaque surfaces.
  - Material 3 Expressive on Android uses springs, so define one set of spring
    tokens for SwiftUI, Compose and web.
- **Pricing signal.** Users pay $95 to $249 a year for trackers, but leave when
  sync is broken.

## Changes to the current data model these concepts need

- Liquidity tiers on every holding: spendable now, sellable within 7 days,
  illiquid. Add a lock-up date and an encumbered or pledged flag.
- Stablecoins classified as cash or as crypto, chosen by the user and shown on
  screen.
- Attribution of each period's change into markets, saving, currency and
  revaluations. This needs ledger-backed snapshots.
- Location ("place") as a dimension next to asset class: bank, exchange,
  wallet, broker.
- Policy bands for alerts, such as a concentration limit or peg tolerance,
  stored per user.
- Currencies beyond USD and EUR on the server. Today the schema stores USD|EUR
  only.

## Phase 2 scope after a pick

A full mockup in the chosen language for web, iPhone and Android:

1. **Getting started:** first run, Google Sheet import with AI mapping, and
   connections for wallet, exchange, Stripe and bank.
2. **Home:** net worth, liquid and cash, today's items, and privacy mode.
3. **Group and asset detail:** history, lots and cost, place, freshness and
   editing.
4. **Flow:** month view, streams, categories, recurring items and
   subscriptions.
5. **Business:** products, MRR and ARR, churn, business value range and tax
   pot.
6. **Plan:** runway, goals, freedom number and what-if sliders.
7. **Add or ask:** text, voice, receipt, screenshot and drafts.
8. **Search and transactions.**
9. **Settings:** currencies, connections, alert bands, export and deletion.
10. **Outside the app:** widgets, notifications and Live Activities for
    deadlines.
11. **States:** empty, loading, stale, error and offline for each screen.
