# Numa v2 — Architecture

Historical v1-to-v2 proposal. Library versions, proposed schemas, and sequencing
below describe that transition, not current requirements. Use
[the runtime map](../agent-memory/architecture.md) and
the [README](../../README.md) for
current work.

Branch: `numa-v2`. Baseline `v0.1.0-mvp` kept intact on `codex/numa-mvp`.

## North Star

> Numa is your personal capital system. It tells you what you're worth, where the money flows, and what every person you share with owes — without making you do spreadsheet work.

## What v1 got wrong (and v2 fixes)

| v1 problem | v2 answer |
| --- | --- |
| `App.tsx` is 1820 lines, one component | Route per page, feature-scoped folders |
| Glass-soup styling, flat depth | Explicit 4-step elevation, tinted highlights, iOS Tahoe glass recipe |
| Recharts with default style | Custom-themed charts: gradient area fills, soft grid, brand cursors |
| `categories` mixes income/expense/asset/liability in one table | Separate concerns: `categories` (tx tags), `holdings` (market), `assets` (manual non-market), `liabilities` |
| Sharing = read-only collaborator chip | Real ownership %, settlement matrix, history |
| Period filter exists in v1 types but not enforced | One global `period` in URL, every query honors it |
| Sample-only start | Account-first onboarding + start-empty + auto-snapshot on every write |

## Tech stack additions

Keep: React 18, Vite, TS, Convex, Recharts, Playwright, Vitest, Remotion, Lucide React.

Add:
- **react-router-dom v7** — file-based routing, layout routes
- **framer-motion v11** — page transitions, KPI count-up, card hover springs
- **tailwindcss v4** — utility CSS with `@theme` directive for design tokens
- **clsx + tailwind-merge** — class composition
- **date-fns** — period math (start/end of month, etc.)
- **convex-helpers** — better TS ergonomics for Convex queries

Skip: shadcn (overkill, fights iOS Tahoe vibe), zustand (Convex reactive queries are the store), tanstack-query (Convex covers it).

## Routes

```
/                  Overview (default landing)
/money             Money — tabs: Cashflow | Earnings | Expenses | Transactions
/money/tx/:id      Transaction detail drawer
/wealth            Wealth — tabs: Net Worth | Holdings | Assets | Liabilities | Log
/wealth/holding/:id  Holding detail drawer
/shared            Shared — collaborators, ownership, settlements
/settings          Profile, currency, theme, integrations
/p/:portfolioId    Same routes, scoped to non-default portfolio
```

Period is URL search-param: `?period=month|30d|year`. Portfolio is path param `/p/:id` or default to user's primary.

## Layout shell

```
┌──────────┬──────────────────────────────────────────┐
│          │ [Period Pill] [Currency] [Search] [+ Add]│
│ Numa     │──────────────────────────────────────────│
│          │                                          │
│ <Portfolio                                          │
│  Switcher>                                          │
│          │              <Outlet />                  │
│ Overview │                                          │
│ Money    │                                          │
│ Wealth   │                                          │
│ Shared   │                                          │
│          │                                          │
│ ─────────│                                          │
│ Avatar   │                                          │
│ Settings │                                          │
└──────────┴──────────────────────────────────────────┘
```

Sidebar collapses to icon rail under 1024px, becomes bottom-tab on phones.

## Data model (Convex schema v2)

```ts
users: {
  externalId: string;          // auth identity (Convex Auth subject)
  email: string;
  displayName: string;
  avatarUrl?: string;
  defaultCurrency: "USD" | "EUR";
  theme: "light" | "dark" | "auto";
  createdAt: number;
}.index("by_externalId", ["externalId"])

portfolios: {
  name: string;
  type: "personal" | "shared" | "family";
  tagline: string;
  ownerId: Id<"users">;
  defaultCurrency: "USD" | "EUR";
  createdAt: number;
}.index("by_owner", ["ownerId"])

memberships: {
  portfolioId: Id<"portfolios">;
  userId: Id<"users">;
  ownershipBps: number;        // basis points (10000 = 100%)
  role: "owner" | "editor" | "viewer";
  displayName: string;         // denormalized for shared portfolios where user is external
  avatarUrl?: string;
  joinedAt: number;
}.index("by_portfolio", ["portfolioId"]).index("by_user", ["userId"])

categories: {
  portfolioId: Id<"portfolios">;
  name: string;
  kind: "income" | "expense";  // assets/liabilities live in their own tables
  icon: string;                // lucide icon name
  color: string;               // token name, e.g. "lavender"
  sortOrder: number;
}.index("by_portfolio", ["portfolioId"])

transactions: {
  portfolioId: Id<"portfolios">;
  occurredAt: number;          // unix ms
  description: string;
  categoryId?: Id<"categories">;
  kind: "income" | "expense";
  amount: number;              // always positive; sign comes from kind
  currency: "USD" | "EUR";
  createdByUserId: Id<"users">;
  splits?: Array<{ userId: Id<"users">; bps: number }>;  // null = follow ownershipBps
  notes?: string;
}.index("by_portfolio_time", ["portfolioId", "occurredAt"])

holdings: {
  portfolioId: Id<"portfolios">;
  symbol: string;              // "AAPL", "BTC", "VOO"
  name: string;
  kind: "stock" | "etf" | "crypto" | "index";
  quantity: number;
  costBasis: number;           // total paid in `currency`
  currency: "USD" | "EUR";
  acquiredAt: number;
}.index("by_portfolio", ["portfolioId"])

assets: {                      // non-market, manually tracked
  portfolioId: Id<"portfolios">;
  name: string;
  kind: "cash" | "real_estate" | "vehicle" | "collectible" | "other";
  balance: number;
  currency: "USD" | "EUR";
  notes?: string;
  updatedAt: number;
}.index("by_portfolio", ["portfolioId"])

liabilities: {
  portfolioId: Id<"portfolios">;
  name: string;
  kind: "credit_card" | "loan" | "mortgage" | "other";
  balance: number;             // amount owed (positive)
  currency: "USD" | "EUR";
  interestRate?: number;       // APR percent
  dueDate?: number;
  notes?: string;
  updatedAt: number;
}.index("by_portfolio", ["portfolioId"])

marketQuotes: {                // shared cache, not per-portfolio
  symbol: string;
  price: number;               // in USD
  changePercent: number;       // 24h
  provider: "coingecko" | "alpha-vantage" | "stooq" | "mock";
  updatedAt: number;
}.index("by_symbol", ["symbol"])

wealthSnapshots: {
  portfolioId: Id<"portfolios">;
  takenAt: number;
  netWorth: number;
  liquid: number;              // cash assets
  invested: number;            // holdings at market
  hardAssets: number;          // non-cash, non-market assets
  liabilities: number;
  currency: "USD" | "EUR";
  label?: string;              // "Year-end 2025"
  isAuto: boolean;             // auto-captured vs manual snapshot
}.index("by_portfolio_time", ["portfolioId", "takenAt"])

settlements: {                 // who paid whom, ledger entry
  portfolioId: Id<"portfolios">;
  fromUserId: Id<"users">;
  toUserId: Id<"users">;
  amount: number;
  currency: "USD" | "EUR";
  occurredAt: number;
  note?: string;
}.index("by_portfolio_time", ["portfolioId", "occurredAt"])
```

## Computation rules

- **Net worth** = sum(holdings.value @ market) + sum(assets.balance) − sum(liabilities.balance)
- **Holding value** = quantity × marketQuotes[symbol].price (fallback: cost basis)
- **Cashflow @ period** = Σ(income tx in period) − Σ(expense tx in period)
- **Owed @ period** (per user, for shared portfolio):
  - For each tx with `splits`, attribute amount × bps/10000 to each user
  - For each tx without splits, attribute by `ownershipBps`
  - Net = paid − share. Positive means owed to user.
  - Settlements zero out balances.
- **Period boundaries**:
  - `month` = first day of current calendar month → today
  - `30d` = today − 30 days → today
  - `year` = first day of current calendar year → today

## Frontend file structure

```
src/
  main.tsx
  App.tsx                   # router root
  routes/
    layout.tsx              # shell (sidebar + topbar)
    overview/page.tsx
    money/
      page.tsx              # tabs container
      cashflow.tsx
      earnings.tsx
      expenses.tsx
      transactions.tsx
    wealth/
      page.tsx
      net-worth.tsx
      holdings.tsx
      assets.tsx
      liabilities.tsx
      log.tsx
    shared/page.tsx
    settings/page.tsx
  components/
    ui/                     # primitives
      Button.tsx
      Card.tsx
      Pill.tsx
      Segmented.tsx
      Dialog.tsx
      Drawer.tsx
      Avatar.tsx
      Sparkline.tsx
      Stat.tsx              # KPI block
    layout/
      Sidebar.tsx
      TopBar.tsx
      PortfolioSwitcher.tsx
      PeriodSwitcher.tsx
      CurrencyToggle.tsx
    charts/
      AreaChart.tsx         # net worth
      DonutChart.tsx        # allocation
      BarChart.tsx          # cashflow streams
    features/
      portfolios/
      transactions/
      holdings/
      collaborators/
      settlements/
  lib/
    period.ts               # period math, named getRange()
    money.ts                # format, convert
    settle.ts               # owed-matrix algorithm
    ids.ts                  # nanoid helpers
    cn.ts                   # clsx + tw-merge
  services/
    convexClient.ts         # singleton
    marketData.ts           # /api/market-quotes wrapper
  hooks/
    usePeriod.ts            # reads ?period= from URL
    usePortfolio.ts         # current portfolio
    useCurrency.ts          # user preference
  styles/
    tokens.css              # @theme definitions
    global.css              # base + Tailwind layers
```

## Pages — content above the fold

### Overview (`/`)
Row 1: **Net Worth KPI** (huge) + delta vs prior period • **Cashflow KPI** (income / expenses / net) • **Liquid** sparkline KPI
Row 2: **Net Worth chart** (full-width area chart for period) + **Allocation donut** (assets breakdown)
Row 3: **Recent transactions** (last 8) | **Top holdings** (top 5) | **Settlement summary** (if shared)

### Money (`/money`)
Tabs at top under page heading. Default tab is **Cashflow**.
- Cashflow: stacked income vs expense bar by month, big net margin number, stream list (top sources & sinks).
- Earnings: category cards grid (each = icon + name + period total + sparkline + delta chip).
- Expenses: same shape, expense categories.
- Transactions: full filterable ledger (date range, category, amount range, who).

### Wealth (`/wealth`)
- Net Worth: hero chart, snapshot timeline, current net worth breakdown.
- Holdings: table with live prices, sortable by value/change. Add holding modal.
- Assets: cards for cash / real estate / vehicle / etc., editable inline.
- Liabilities: cards for debts, interest rate badges.
- Log: list of snapshots, manual snapshot CTA, auto-snapshot toggle.

### Shared (`/shared`)
- Collaborator list with avatars, ownership %, paid this period, owed delta.
- Settlement matrix: who pays whom and how much to zero out.
- Settlement history.
- Invite / role management.

### Settings (`/settings`)
Profile, default currency, default portfolio, theme, danger zone (delete portfolio).

## Component contract (subset)

```ts
<Stat
  label="Net Worth"
  value={netWorth}
  currency="USD"
  delta={{ amount: 2840, percent: 4.1 }}
  trend={sparklineData}
  emphasis="primary"          // primary | success | warning | danger
/>
```

```ts
<Segmented
  value={period}
  onChange={setPeriod}
  options={[
    { value: "month", label: "Month" },
    { value: "30d", label: "30 Days" },
    { value: "year", label: "Year" }
  ]}
/>
```

```ts
<PortfolioSwitcher
  current={currentPortfolio}
  options={portfolios}
  onSelect={(id) => navigate(`/p/${id}`)}
  onCreate={() => openCreateModal()}
/>
```

## Verification gates

Each phase ships only after:
1. `npm run lint` clean
2. `npm run test` green (Vitest)
3. `npm run test:ui` green (Playwright) for the feature surface
4. `npm run build` clean
5. Smoke screenshot via preview tools

Final v2 release adds:
- `npm run verify:production:convex` against the production Vercel + Convex.

## Out of scope for v2 launch (parking lot)

- Multi-currency conversion (track in original currency, no FX yet — show with currency badge)
- Recurring transactions / subscriptions
- Budgets / goals
- Receipts / OCR
- CSV / bank import
- Email magic-link auth (account-first local state, schema supports richer auth on day-N)
