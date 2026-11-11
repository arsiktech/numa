# Pulse design system for the Numa Pro rebuild

Current design system for the Expo rebuild in [`apps/numa/`](../../apps/numa/README.md).
It originated with the phase-2 mockup on 2026-10-11. The interactive mockup and
its design-system page remain outside this repository; they are historical references,
not a separate implementation or evidence that a current screen has been verified.

Black or white, quiet by default. Colour carries meaning: green for gains and
what you kept, red for losses and what is due, amber for attention, and one
colour per kind of asset.

The same system is packaged for reuse in other products as the **Pulse** design system.

## Principles

- **Answer first.** Every screen opens on its one number or verdict.
- **Unknown is not zero.** Every value shows freshness. A missing price shows as
  missing, with the last known value and its date.
- **AI drafts, you confirm.** Ask turns words, receipts and screenshots into
  drafts. Nothing is saved until the user confirms, and every save has Undo.
- **Calm alerts.** At most three a day, only from limits the user sets, with
  quiet hours on by default.
- **Few taps.** Three tabs (Home, Flow, Plan) and a plus. On web the plus is
  the ask bar and ⌘K.
- **Read-only.** Public wallet addresses and read-only keys. Numa never moves
  money. No bank linking in v1.
- **Teach once.** The first visit to each screen shows one tip with a gesture
  demo (pulse, ghost finger, one sentence, "Got it").

## Colour tokens

Same names in both themes.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#000000` | `#FFFFFF` | Page |
| `--s1` | `#0E0F11` | `#F5F5F3` | Cards |
| `--s2` | `#1C1E22` | `#ECECE9` | Controls, selected pills |
| `--line` | `#2A2D32` | `#D9D9D5` | Rules and card edges |
| `--stroke` | `#767676` | `#767676` | Input border, at least 3:1 |
| `--ink` | `#F4F4F1` | `#0B0B0C` | Text, primary buttons |
| `--ink2` | `#A1A4AA` | `#55575C` | Secondary text |
| `--ink3` | `#8E9198` | `#61646A` | Hints, icons, inactive tabs |
| `--up` | `#3DDC97` | `#0B7A4B` | Gains, kept, live, switches on |
| `--down` | `#FF6B5E` | `#D23A2D` | Losses, due dates, delete |
| `--onDown` | `#0B0B0C` | `#FFFFFF` | Text on the down colour |
| `--warn` | `#FFB547` | `#8A5200` | Attention |
| `--upbg` | `rgba(61,220,151,.13)` | `rgba(11,138,85,.1)` | Live chip |
| `--glass` | `rgba(30,32,36,.72)` | `rgba(255,255,255,.82)` | Floating nav, with 22 px blur |
| `--glassb` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.07)` | Floating nav border |
| `--plus` / `--plusink` | `#F4F4F1` / `#000000` | `#0B0B0C` / `#FFFFFF` | Plus button |
| `--shadow` | `rgba(0,0,0,.45)` | `rgba(0,0,0,.12)` | Floating elements |
| `--rib` / `--rib2` | `#2A2D32` / `#3A3D42` | `#D9D9D5` / `#C4C4BF` | Neutral flow ribbons |

Block palette (composition bars, legends, holdings):

| Token | Dark | Light | Block |
| --- | --- | --- | --- |
| `--crypto` | `#E09A3A` | `#F2A23A` | Crypto |
| `--stocks` | `#5B8CFF` | `#2F5BD8` | Stocks and funds |
| `--biz` | `#9B87F5` | `#6B54E0` | Business and MRR |
| `--prop` | `#8796AE` | `#5E6F87` | Property |
| `--cash` | `#9CCBE8` | `#7FB6E0` | Cash and stablecoins |
| `--things` | `#D9C9A8` | `#CDB98F` | Watch, car, metals |
| `--debt1` / `--debt2` | `#FF6B5E` / `#D9483C` | `#D23A2D` / `#B32F24` | Debts, hatched at 135° |
| `--netbg` / `--netink` | `rgba(61,220,151,.14)` / `#3DDC97` | `#E3F4EC` / `#0B7A4B` | Net worth bar |

Text on blocks: dark ink on crypto, cash and things in both themes; on stocks,
business and property use dark ink in the dark theme and white in the light
theme.

## Pro badge

The `numa` wordmark stays plain ink (Manrope 800, −0.04em). Next to it sits a small PRO badge that is iridescent, like oil on water: a conic gradient of six film colours (`#FF5FA2 #9B6BFF #4CC9F0 #5EF2B5 #F4E46A #FF9A62`) turning once every 9 s under a soft white highlight, with `#0B0B0C` text so it reads on both themes and a faint violet and cyan glow. Sizes 16, 20 and 30 px tall. With reduced motion it holds still. The film colours are for the badge only, never for data.

## Type

Manrope for words. JetBrains Mono, tabular, for figures that change, so digits
never jump.

| Style | Spec | Example |
| --- | --- | --- |
| Display | Manrope 300, 80 | €899,538 |
| Hero | Manrope 300, 54 | €899,538 |
| Cents | Manrope 300, 32 on web, 30 on phone | .42 |
| Title | Manrope 800, 28 | Check what Numa read |
| Section | Manrope 800, 20 | Needs you |
| Body | Manrope 500, 16 | About €2,140 for IVA and IRPF. |
| Small | Manrope 500, 13 | live · 4 wallets |
| Figure | JetBrains Mono 500, 16 | ▲ €2,328.94 |
| Figure small | JetBrains Mono 500, 13 | +0.26% |
| Label | Manrope 800, 12 | LIVE |

Nothing is under 12. Card titles use the body size in a heavier weight. On the web, type is set in rem so the page follows the browser text size.

## Space and shape

- Space is 4, 8, 12, 16, 24, 32, 40.
- Radius is 10, 14, 18, and 999 for pills.
- One segment control. One primary button: 48 px tall, pill radius, 16 px type.
- Touch targets are at least 44 px. Every control has a 2 px ink focus ring.
- A disabled label is `--ink3` at full opacity. Pressed controls use opacity 0.72.

## Motion

One curve, `cubic-bezier(.22, 1, .36, 1)`, 160 to 600 ms. Motion explains what
changed. With reduced motion on, everything appears in place.

| Pattern | Timing | Where |
| --- | --- | --- |
| Odometer digits | 600 ms, 160 ms while scrubbing | Big figures, live ticks |
| Line draw | 1.3 s, `stroke-dasharray` | Charts on open and range change |
| Block reveal | 1 s, `clip-path` wipe, `backwards` fill | Composition bars |
| Width morph | 450 ms | Lens and tab changes on blocks |
| Card rise | 500 ms, 10 px, 90 ms stagger | Needs you, drafts |
| Ribbon morph | 600 ms on `d` | Flow Sankey month switch |
| First-visit tip | pulse ring 1.8 s, tip pop 450 ms | Once per screen |
| Live chip | 1.6 s blink | Only while prices stream |

## Components

- **Figure tabs** Net worth, Liquid, Cash; range pills 1D to ALL.
- **Scrubbable chart**: drag or hover moves the big figure back in time.
- **Own and owe blocks**: widths are values, debts hatched, tabs dim what is
  not liquid. Tapping a block opens it.
- **Needs you card**: dot colour is urgency (red due, amber watch, grey
  housekeeping), one primary action, resolved state with Undo.
- **Capsule nav and plus** on phone; sidebar and ask bar (⌘K) on web.
- **Draft card** from Ask: marked DRAFT until saved; Save, Edit, Discard.
- **Freshness label** on every value: live, delay, synced, your value with date,
  missing with last known value.
- **Switches** and **segmented controls** (lens, theme, currency).

## Words

Sentence case, short sentences, numbers before words. No exclamation marks, no
em dashes, no jargon. Dates as "20 Oct", money as "€2,140", change as "+0.26%".

| Say | Avoid |
| --- | --- |
| You kept €4,395 in October | Net cash flow positive variance |
| About 8 months on cash | Liquidity coverage ratio: 8.2 |
| Watch value is 7 months old | Stale asset detected! |

## Screen inventory (mockup)

Phone, dark and light: Home, Home rewind, Crypto block, Bitcoin, Needs you,
Flow, Flow follow a stream, Products and MRR, Plan, Widgets and alerts, Plus
(ask or add), Ask conversation, Setup sources, Sheet import, Settings.

Web, dark and light: Home, Holdings, Flow, Plan, Ask, Settings and sources.
