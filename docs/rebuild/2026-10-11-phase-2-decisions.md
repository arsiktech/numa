# Numa rebuild, phase 2: decisions and mockup

Date: 2026-10-11. Status: product mockup drawn, waiting for the owner's approval
before the build starts.

The interactive mockup canvas is kept outside this repository.
Design tokens and rules: [DESIGN.md](DESIGN.md). Phase 1 options:
[concept directions](2026-10-11-concept-directions.md).

## What the owner picked

After reviewing the four phase 1 directions, the owner chose a hybrid:

| From | Kept | Dropped |
| --- | --- | --- |
| B · Pulse | Main direction and home: the live figure, the scrubbable chart, its type, the floating capsule nav with the big plus | "Moving today" list |
| A · Balance | Own and owe composition blocks on the home, replacing "Moving today" | The rest of A's layout |
| C · Flow | The idea of splits that show where money comes from and goes, redrawn in B's style as a monochrome Sankey with "follow a stream" | C's implementation |
| D · Brief | Chat to ask, add expenses and talk to the portfolio, built into B's plus button and the web ask bar | D as a separate home |

Other decisions:

- **Themes:** dark and light both ship, plus Auto.
- **No bank linking in v1.** Statements and screenshots go through Ask and become
  drafts. Sources are the Google Sheet import, public wallet addresses,
  read-only exchange and broker keys or CSVs, and Stripe and App Store Connect
  for MRR.
- **v1 is for the owner only.** No onboarding for other users, sharing or
  billing yet.
- **One codebase for iOS, Android and web.** The owner accepted the proposed
  direction: Expo (React Native) for the phone apps with the web built from the
  same code, and Convex kept as the backend. The exact libraries for charts and
  motion are chosen at the start of the build.

## What the mockup covers

Every board is interactive and uses the same fictional portfolio (net worth
€899,538). None of it is real owner data.

- **Phone, dark:**
  - Worth: Home, Home rewind (time machine), Crypto block, Bitcoin, Needs you.
  - Flow and plan: Flow, Follow a stream, Products and MRR, Plan, Widgets and
    alerts.
  - The plus: Ask or add, Ask conversation, Setup sources, Sheet import,
    Settings.
- **Phone, light:** Home, Flow, Crypto, Ask.
- **Web, dark:** Home, Holdings, Flow, Plan, Ask, Settings and sources. Web Home
  is also shown in light.
- **System:** tokens in both themes, type, space, live motion demos,
  components and copy rules.

## Next step

The owner reviews the canvas and comments on boards. After approval the build
starts with the data model (assets, valuations with freshness, flows, limits,
drafts), the shared design tokens, and the Home screen on all three platforms.
