# Numa v1 — feature inventory (reference for v2 design)

Historical inventory only; the old APIs and sample bootstrap below are not
current implementation instructions. See [the runtime map](../agent-memory/architecture.md).

Generated from a deep read of v1 code on 2026-05-12. Used to make sure v2 covers everything v1 promised and to flag what was stubbed.

## 1. Portfolios
- Create new portfolio (name, type, tagline, initial cash, liabilities).
- Switch active portfolio from dropdown.
- Types: `personal | shared | family`. Auto-upgrades `personal → shared` when first collaborator added.
- Sample bootstrap: three pre-populated portfolios (Personal, Shared Loft, Family) loaded on first Convex connection.

Convex:
- `portfolios:list(ownerId)`, `portfolios:detail(portfolioId)`, `portfolios:create(...)`, historical bootstrap mutation.

## 2. Collaborators & sharing
- Add by name (initials → avatar).
- Track `ownership %` and `netContribution`.
- Compute `owesLabel`: "Balanced" / "X owes you $Y" / "You owe X $Y".
- "Settle" button clears `netContribution` (no audit trail, no transaction). **v2: must persist settlement events.**
- Ownership shown as horizontal bar chart.

Convex:
- `portfolios:addCollaborator(...)`, `portfolios:settleCollaborator(collaboratorId)`.

## 3. Categories
- 4 kinds: `earning | expense | asset | liability`.
- Auto-created from transactions/holdings/portfolio init.
- Upsert by name+kind. Adding a tx in "Freelance/income" updates existing "Freelance".
- Default colors per kind: earning `#2fbf9b`, expense `#ef6f7b`, asset `#8177f2`, liability `#fb6b6b`.

Convex:
- `portfolios:addCategory(...)`.

## 4. Transactions
- Add: date (auto `"May 10"` format), description, category, kind, amount, owner.
- Income/asset stored positive; expense/liability stored negative.
- No edit / delete UI.
- Adding a tx auto-updates `portfolio.cash` and `portfolio.liabilities` and the matching category.

Convex:
- `portfolios:addTransaction(...)`.

## 5. Holdings
- Add: symbol, name, quantity, price (fetched live if possible).
- Kinds: `stock | etf | crypto | index`.
- Provider tracked: `mock | coingecko | stooq | finnhub | alpha-vantage`.
- Auto-detect crypto for `BTC`/`ETH`.
- Cost basis stored separately, can drift from history. **v2: compute or reconcile from transactions.**

Convex:
- `portfolios:addHolding(...)`.

Quote flow (v1):
1. `/api/market-quotes?symbols=...`.
2. Fallback to CoinGecko for `BTC`, `ETH`.
3. If nothing: seed price + provider `mock`.

## 6. Wealth log
- Manual "Log snapshot" button writes a `WealthPoint`.
- On new portfolio: 6 auto-seeded snapshots Jan–Jun.
- Chart: Area chart over snapshots.

Convex:
- `portfolios:addWealthSnapshot(...)` upserts by label.

## 7. Cashflow analytics
- KPI = `categoryTotal(earning) − categoryTotal(expense)`.
- Period delta = `((last − first) / first) * 100`.
- Bar chart of earnings vs expenses by period.

## 8. Period selector
- 3 modes: `Monthly | Last 30 days | Yearly`.
- v1 quirk: **"Monthly"** = raw snapshots (assumes Jan–Jun labels); **"Last 30 days"** = last 4 snapshots relabeled "Week 1"–"Week 4", cashflow divided by 4; **"Yearly"** = snapshots grouped in pairs (Q1–Q3), cashflow summed.
- **v2: real period math via date-fns**, not relabeling.

## 9. Currency
- USD only. No multi-currency, no conversion. `Intl.NumberFormat("en-US", { currency: "USD" })`.

## 10. Storage & Convex bridge
- localStorage key `"numa:portfolio-state:v1"` is always source of truth on first paint.
- If `VITE_CONVEX_URL` set: ConvexHttpClient loads portfolios async; if empty, runs the sample bootstrap.
- Writes: local-first, then async Convex mutation. Convex failures swallowed (console only).
- ownerId came from an env override or a fixed sample id.
- Convex returns `_id`/`lastPrice`; client maps to `id`/`price`.

## 11. Market data flow
- Crypto whitelist: `BTC → bitcoin`, `ETH → ethereum`.
- Equity whitelist (needs backend): `AAPL`, `VOO`, `SPY`.
- Chain: `/api/market-quotes` → CoinGecko direct → seeded mock.
- Symbols uppercased before any DB write or fetch.

## Lucide icons used in v1
`ArrowDownRight, ArrowUpRight, Bell, CircleDollarSign, Coins, CreditCard, Handshake, Home, Landmark, LineChart, LockKeyhole, Menu, Plus, Search, Settings, Sparkles, TrendingUp, UserPlus, WalletCards`.

## CSS reusable patterns in v1
- Layout: `app-shell, sidebar, workspace, topbar, hero-grid, detail-grid`
- Cards: `glass-panel, category-card, wealth-panel, share-panel, assets-panel, cashflow-panel, transactions-panel`
- Buttons: `primary-button, ghost-button, icon-button, settle-button`
- Forms: `asset-dialog, form-grid, form-status`
- Charts: `wealth-chart, cashflow-chart, category-chart`
- Lists: `holding-list, transaction-list, collaborators`
- UI: `trend-pill, market-status, modal-backdrop, section-heading, metric-grid, ownership-track, avatar`

## What was stubbed / partial in v1
- `Insights`, `Settings`, `Assets`, `Liabilities` had nav entries but no real pages.
- Transactions: no edit/delete UI.
- Mobile: media queries present but stubs make experience incomplete.
- Search box: shown in topbar, non-functional.
- Wealth snapshots: manual only, no auto-record.

## Gotchas v2 must keep in mind
1. Symbol case-sensitivity → uppercase canonical.
2. Categories upsert by `(name, kind)`.
3. Period semantics in v1 are nonsense for non-default seeds.
4. Collaborator settlement instant + no audit. v2 needs a `settlements` table.
5. Convex is optional in v1; v2 keeps that fallback for offline preview.
6. Manual market data fallback when live fetch fails.
7. Cost basis isn't recomputed from history.
8. Wealth log `sortOrder` persisted but unused in UI.
9. Avatar = initials of name (no real photo support).
