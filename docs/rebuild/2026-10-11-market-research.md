# Numa rebuild: market and user research

Date: 2026-10-11. This research supports
[the concept directions](2026-10-11-concept-directions.md). It used web search
only: the fetch tool and Reddit were unavailable, so complaint themes come from
search summaries of forums, review sites and press. Prices marked "secondhand"
were not confirmed with the vendor.

## Competitive landscape

| App | Position | Standout | Praised for | Complaints and limits |
|---|---|---|---|---|
| Kubera | Balance sheet for complex wealth | Several aggregators with failover; AI import of PDFs and screenshots with review; dead man's switch | Breadth of assets and currencies | $249 a year; no budgeting or cash flow; frequent reconnects |
| Monarch | US household budgeting and net worth | AI assistant (Dec 2025); forecasting in the Plus plan | Polish; works for couples | USD and CAD only, no conversion; connection instability |
| Copilot Money | Apple-native, design-led budgeting | Categorisation; web app since Dec 2025 | Design | No Android; sync failures |
| Empower | Free dashboard that feeds advisory sales | Net worth, retirement | Free | Unreliable sync; upsell |
| Rocket Money | Subscriptions and bills | SMS agent that flags trials and price rises | Proactive flags | Paying to cancel subscriptions |
| getquin, Parqet | DACH investment trackers | AI import; analytics | Good with EU brokers | Investment-only |
| Finary | French wealth app | Over 600k users; bank sync through Powens | Interface | About 19% of one bank's connections failing at one point; people paid for months of broken sync |
| Delta (eToro) | Crypto and stocks | Shake to show percentages | Exchange coverage | Paid tiers with faulty exchange connections |
| CoinStats, Zerion, DeBank | Crypto-first | Wallet and DeFi coverage | On-chain breadth | Fiat and real-world assets are an afterthought |
| Wealthfolio, Ghostfolio | Open source, local-first | Local storage; self-hosting | Privacy | Setup effort; little automation |
| Exirio, Fina | Indie multi-asset | 40+ currencies; block dashboards | All assets in one place | Overwhelming interface; Plaid dependence |
| AI-native (ChatGPT Finances, Revolut AIR, cfo.ai) | Chat over your data | Low-friction questions | Convenience | Mostly US; no hard assets; no founder view of personal and business together |

Patterns across the market:

1. Trackers are moving from aggregation to proactive AI: insights, an
   assistant and AI import.
2. The successful ones keep AI to proposals that the user reviews.
3. Nobody serves personal and business money together for solo founders.
4. EU users get regional apps; the US leaders mishandle EUR.

## Why people keep spreadsheets

- **Control and ownership.** Mint shutting down made this worse.
- **Flexibility.** Custom categories and formulas.
- **Privacy.** No bank logins needed.
- **Calm.** A monthly check-in of about five minutes.

Product response:

- Automate only where the connection is reliable.
- Make a manual update take seconds.
- Show how fresh every number is.
- Support import, export and custom fields.
- Build a monthly-close ritual instead of constant pings.

## Pain points to design against

1. **Sync breaks**, and users pay through the outage.
2. **Manual entry is a form** for anything without an API: property, watches,
   cars, private shares, loans.
3. **Currency is mishandled.** Nobody separates foreign-exchange moves from
   asset moves.
4. **Crypto connections are fragile.** Unrestricted exchange keys expire after
   14 to 90 days, depending on the exchange. Bitcoin is often missing from
   wallet APIs built for EVM chains.
5. **Fear of bank linking.** A 2025 to 2026 wave of apps sells "no bank
   logins" as a feature.
6. **Clutter and redesign whiplash.** Trade Republic's 2.0 redesign drew
   "bigger, less clear" complaints.

## Data sources for an EU user (October 2026)

| Data | Best route | Cost and limits | Notes |
|---|---|---|---|
| EU banks | Enable Banking (2,500+ banks, 29 countries) | Free "restricted production" for your own accounts; a contract and KYB for users | Consent lasts up to 180 days. GoCardless Bank Account Data closed to new sign-ups. Salt Edge, Tink, TrueLayer, Yapily, Plaid EU and Powens need a sales contract |
| Wise | Open banking | n/a | EU and UK personal tokens can't read statements |
| Trade Republic | Official CSV transaction export | Free | The unofficial pytr login is fragile |
| Interactive Brokers | Flex Web Service, read-only XML | Free | |
| Other brokers | SnapTrade | Personal tier free; commercial about $1 per user a month (secondhand) | Mostly North American brokers |
| Wallets | Zerion API (EVM, Solana) | Free tier 2k requests a day | |
| | Moralis | $49 to $199 a month | Used today |
| | GoldRush | from $10 a month | Claims Bitcoin support |
| Exchanges | Read-only API keys | Free | Plan reminders for key expiry and IP whitelisting |
| Prices | CoinGecko; Finnhub (used today); Massive, formerly Polygon; Twelve Data; ECB rates for currencies | Free tiers are often delayed | Check commercial-use terms. Finnhub free is personal use only |
| MRR | Stripe: compute from subscriptions | Free | |
| | Paddle: metrics endpoint | Free | |
| | RevenueCat: API v2 | Free | |
| | Polar: metrics API | Free | |
| | App Store Connect: sales and finance reports | Free | Sales figures are estimates; finance reports are final |
| Business value | ARR times an editable multiple, shown as a range | n/a | Small bootstrapped SaaS lists at about 2.5 to 4 times revenue (one source) |
| SPCX | Market quote | n/a | IPO on 2026-06-12. Model the lock-up |
| Property (Spain) | Manual value plus an optional regional €/m² index | n/a | Idealista has no public valuation API; remark every 6 to 12 months |
| Watches, cars | Manual reference with a reminder | n/a | No watch-price API found; Chrono24's index has no API |
| Metals | Daily spot price API | Free tiers exist | |
| Everything else | AI import from screenshot, PDF, CSV, Sheet or forwarded email, with a diff to confirm | Model cost | |

## Design references

- **Trade Republic.** One hero number. The chart morphs between ranges, a dashed
  baseline marks where the range starts, and colour is kept for data.
- **Robinhood and Coinbase.** Scrub the line to see the value at any time.
  Coinbase's chart component has a resting beacon and labels for each point.
- **Things 3.** The Magic Plus drops where you need it, and Today is kept
  separate from deadlines.
- **Telegram.** Speed comes from rendering architecture: layout and text are
  prepared off the main thread, and animation is cheap. Use 120 Hz on iOS.
- **Wise.** Outcome and cost shown before you commit, with currency codes and
  flags beside every amount.
- **Revolut.**
  - Customisable home.
  - Balances hidden with a shake.
  - Biometric approval for sensitive assistant actions.
- **ChatGPT and Grok.** Chat is the shell, and structured views appear inside
  the conversation.
- **iOS 27.** Liquid Glass is toned down. Use glass for chrome only.
- **Material 3 Expressive.** Spring motion and shape morphing.

## Feature ideas ranked by value

1. Live net worth with freshness badges and a "since your last visit" change.
2. A currency-aware total that splits each change into the assets themselves
   and the currency move.
3. Liquidity tiers: spendable now, sellable within 7 days, illiquid, total.
4. Founder panel:
   - MRR and ARR per product.
   - Churn alerts.
   - Business value as a range.
   - A verified-MRR share card.
5. Personal runway, with a "what if MRR goes to zero" variant and a freedom
   number.
6. Spain autónomo tax pot:
   - Modelo 303 and 130 estimates.
   - Reminders before each deadline.
   - A modelo 720 and 721 year-end check.
7. An attention feed of at most three cards a day, triggered by bands the user
   sets.
8. AI import everywhere, with a diff to confirm.
9. Privacy mode, a percentages-only view and anonymised share cards.
10. What-if sliders for net worth, runway and tax.
11. A wealth timeline with milestones and a monthly close.
12. Ask Numa, plus a personal MCP server so developers can query their own data
    from their AI tools.

## Selected sources

- GoCardless sign-ups closed: <https://bankaccountdata.gocardless.com/new-signups-disabled>
- Enable Banking in Actual Budget: <https://actualbudget.org/docs/advanced/bank-sync/enable-banking>
- SnapTrade personal and commercial tiers: <https://docs.snaptrade.com/docs/personal-vs-commercial>
- Paddle MRR metrics: <https://developer.paddle.com/api-reference/metrics/get-metrics-monthly-recurring-revenue.md>
- App Store Connect sales and finance: <https://developer.apple.com/documentation/appstoreconnectapi/sales-and-finance.md>
- SpaceX Nasdaq debut: <https://www.euronews.com/business/2026/06/12/spacex-makes-its-nasdaq-debut-after-the-largest-public-offering-in-history>
- Trade Republic chart teardown: <https://anerma.de/blog/tear-down-trade-republic-charts>
- Coinbase LineChart: <https://cds.coinbase.com/components/charts/LineChart/>
- Telegram rendering internals: <https://telegram-internals.hidandelion.com/posts/14-async-display-kit/>
- Monarch currency limits: <https://help.monarch.com/hc/en-us/articles/360048393552-International-Accounts-and-Currency>
- Kubera AI import: <https://help.kubera.com/article/142-ai-import-files-and-screenshots>
- Finary sync survey: <https://community.finary.com/t/sondage-problemes-de-synchronisation-et-d-utilisation/33519?page=3>
- Modelo 303 and 130: <https://invoo.es/es/blog/guias/modelo-303-vs-modelo-130-guia-autonomos/>
- Modelo 721: <https://www.waltio.com/es/blog/que-es-modelo-721/>
- Stablecoin peg monitoring: <https://www.coingecko.com/learn/stablecoin-depeg-risk-detection>
- iOS 27 Liquid Glass changes: <https://www.tomsguide.com/phones/iphones/ios-27-has-a-bunch-of-changes-including-a-refined-liquid-glass-design-but-how-much-has-changed-from-ios-26>
