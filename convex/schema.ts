import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { financeClassificationValidator } from "./lib/financeValidators";
import { cardDetailsValidator } from "./lib/cardDetails";
import {
  cryptoWalletAddressTypeValidator,
  cryptoWalletSnapshotValidator
} from "./lib/cryptoValidators";

/** Accept-only fields written to dev QA data by the unmerged trustworthy-wealth
 * branch (ARS-93). Nothing in this branch reads or writes them; they exist so a
 * deployment holding those documents still passes schema validation. */
const wealthObservation = v.optional(v.object({
  availability: v.union(v.literal("available"), v.literal("encumbered"), v.literal("unknown")),
  underlyingKey: v.optional(v.string()),
  observedAt: v.number(),
  fingerprint: v.string(),
  ownershipFingerprint: v.optional(v.string()),
  underlyingFingerprint: v.optional(v.string()),
  manualValue: v.optional(v.object({ amount: v.number(), currency: v.union(v.literal("EUR"), v.literal("USD")) }))
}));
const wealthFx = v.optional(v.object({ usdPerEUR: v.number(), asOf: v.number(), source: v.literal("manual") }));

/** One position on a dated snapshot. Negative amounts outside "debt" are owed, like an overdraft. */
export const snapshotLine = v.object({
  group: v.union(v.literal("liquid"), v.literal("crypto"), v.literal("stocks"), v.literal("hard"), v.literal("debt")),
  name: v.string(),
  amount: v.number()
});

export default defineSchema({
  ...authTables,
  // Optional server-only provenance. Other SDK fields/indexes stay unchanged.
  authSessions: defineTable({
    userId: v.id("users"), expirationTime: v.number(), appleSubject: v.optional(v.string()),
  }).index("userId", ["userId"]),
  // Preserve the SDK signature index while enabling owner-session erasure.
  authVerifiers: authTables.authVerifiers.index("by_session", ["sessionId"]),
  // One short-lived "add Google to this account" attempt. Server-only: secrets are stored
  // hashed, except the PKCE verifier, which lives at most 10 minutes. See convex/googleLink.ts.
  signInLinks: defineTable({
    userId: v.id("users"), sessionId: v.id("authSessions"), provider: v.literal("google"),
    startHash: v.string(), stateHash: v.optional(v.string()), binderHash: v.optional(v.string()),
    codeVerifier: v.optional(v.string()), returnTo: v.string(), expiresAt: v.number(),
  }).index("by_start", ["startHash"]).index("by_state", ["stateHash"]).index("by_user", ["userId"]),
  profileAvatars: defineTable({
    userId: v.id("users"), image: v.bytes(), updatedAt: v.number()
  }).index("by_user", ["userId"]),
  activeDays: defineTable({
    userId: v.id("users"), utcDate: v.string(),
  }).index("by_user", ["userId"]).index("by_user_day", ["userId", "utcDate"]).index("by_day", ["utcDate"]),
  privacyChoices: defineTable({
    userId: v.id("users"), allowed: v.boolean(), version: v.string(), recordedAt: v.number()
  }).index("by_user", ["userId"]),
  // Active credentials are account-owned. Deletion detaches bounded revocation jobs.
  appleCredentials: defineTable({
    userId: v.optional(v.id("users")), subjectHash: v.optional(v.string()),
    audience: v.optional(v.string()),
    envelope: v.optional(v.object({ iv: v.string(), ciphertext: v.string() })),
    state: v.union(v.literal("active"), v.literal("pending"), v.literal("done"), v.literal("expired")),
    attempts: v.number(), leaseUntil: v.optional(v.number()),
    expiresAt: v.optional(v.number()), updatedAt: v.number()
  }).index("by_user", ["userId"]).index("by_user_audience", ["userId", "audience"]),
  // SHA256 only, no subject/email. Expire at the identity freshness boundary.
  appleDeletionGuards: defineTable({ subjectHash: v.string(), expiresAt: v.number() })
    .index("by_subject", ["subjectHash"]),
  // additive per-user profile attached by userId
  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    defaultCurrency: v.union(v.literal("USD"), v.literal("EUR")),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("auto")),
    locale: v.optional(v.union(v.literal("en"), v.literal("ru"), v.literal("es"))),
    // Optional so rows created before the feature don't fail validation. Client
    // reconciles missing → "advanced" (= current behavior for existing users).
    appMode: v.optional(v.union(v.literal("light"), v.literal("advanced"), v.literal("shared"))),
    primaryJob: v.optional(
      v.union(v.literal("net_worth"), v.literal("daily_spending"), v.literal("shared_money"))
    ),
    starterTemplate: v.optional(
      v.union(
        v.literal("personal_capital"),
        v.literal("couple_family"),
        v.literal("trip_shared_flat")
      )
    ),
    // Palette theme. Combined with `theme` (light/dark) selects one of 4 × 2
    // variants in `src/styles/themes.css`. Optional → pre-feature rows fall
    // back to "numa" (classic purple-on-cream) so nothing changes for them.
    themeKey: v.optional(
      v.union(
        v.literal("numa"),
        v.literal("citrus"),
        v.literal("pebble"),
        v.literal("coral"),
        v.literal("carbon")
      )
    ),
    avatarStorageId: v.optional(v.id("_storage")),
    onboardingCompletedAt: v.optional(v.number()),
    // 7-day account-deletion grace window (users.deleteMyAccount). When set,
    // a scheduled internal mutation erases the account at `deletionScheduledAt`
    // unless users.cancelMyDeletion clears both fields first. Disposable
    // *@example.com test accounts bypass this and delete immediately.
    deletionScheduledAt: v.optional(v.number()),
    // Set atomically by the first destructive deletion chunk. Once present,
    // recovery is no longer safe because earlier chunks may already be gone.
    deletionStartedAt: v.optional(v.number()),
    deletionJobId: v.optional(v.id("_scheduled_functions")),
    createdAt: v.number()
  }).index("by_user", ["userId"]),

  mutationReceipts: defineTable({
    clientMutationId: v.string(),
    operation: v.string(),
    userId: v.id("users"),
    resultId: v.string(),
    scopeId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number())
  })
    .index("by_client_mutation", ["clientMutationId"])
    .index("by_user", ["userId"])
    .index("by_user_operation", ["userId", "operation"]),

  portfolios: defineTable({
    name: v.string(),
    // Additive native space classification; legacy portfolio IDs/types remain.
    spaceKind: v.optional(v.union(v.literal("personal"), v.literal("business"))),
    type: v.union(v.literal("personal"), v.literal("shared"), v.literal("family")),
    tagline: v.string(),
    ownerId: v.id("users"),
    defaultCurrency: v.union(v.literal("USD"), v.literal("EUR")),
    wealthFx,
    createdAt: v.number()
  }).index("by_owner", ["ownerId"]),

  memberships: defineTable({
    portfolioId: v.id("portfolios"),
    userId: v.id("users"),
    ownershipBps: v.number(),
    // Economic stake is not inferred from administrator access. Missing = unknown.
    businessOwnershipBps: v.optional(v.number()),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    joinedAt: v.number()
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_user", ["userId"]),

  categories: defineTable({
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: v.union(v.literal("income"), v.literal("expense")),
    icon: v.string(),
    color: v.string(),
    sortOrder: v.number(),
    emoji: v.optional(v.string()),
    monthlyLimit: v.optional(v.number()),
    monthlyLimitCurrency: v.optional(v.union(v.literal("USD"), v.literal("EUR")))
  }).index("by_portfolio", ["portfolioId"]),

  transactions: defineTable({
    portfolioId: v.id("portfolios"),
    occurredAt: v.number(),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    /** Optional link to an Asset (kind=cash) — debits/credits its balance on add/update/delete. */
    accountId: v.optional(v.id("assets")),
    kind: v.union(v.literal("income"), v.literal("expense")),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    createdByUserId: v.id("users"),
    splits: v.optional(v.array(v.object({ userId: v.id("users"), bps: v.number() }))),
    notes: v.optional(v.string()),
    /** A card purchase's statement details: card, merchant, what was charged, cashback. */
    card: v.optional(cardDetailsValidator),
    // Optional GPS + reverse-geocoded label captured at create-time. Lat/lng
    // is stored alongside the label so we can re-resolve via Nominatim if the
    // human-readable string is stale or missing.
    location: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
        label: v.optional(v.string())
      })
    )
  }).index("by_portfolio_time", ["portfolioId", "occurredAt"]).index("by_portfolio_export", ["portfolioId"]),

  // Legacy cash movements, deliberately separate from income/expense and ledger.
  // Tombstones preserve source identity after correction/deletion.
  cashTransfers: defineTable({
    portfolioId: v.id("portfolios"),
    fromAccountId: v.id("assets"),
    toAccountId: v.id("assets"),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    occurredAt: v.number(),
    description: v.string(),
    notes: v.optional(v.string()),
    sourceEventId: v.string(),
    sourceFingerprint: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number())
  })
    .index("by_portfolio_time", ["portfolioId", "occurredAt"])
    .index("by_portfolio_export", ["portfolioId"])
    .index("by_portfolio_source", ["portfolioId", "sourceEventId"])
    .index("by_from_account", ["fromAccountId"])
    .index("by_to_account", ["toAccountId"]),

  holdings: defineTable({
    portfolioId: v.id("portfolios"),
    wealthObservation,
    symbol: v.string(),
    name: v.string(),
    kind: v.union(v.literal("stock"), v.literal("etf"), v.literal("crypto"), v.literal("index")),
    quantity: v.number(),
    costBasis: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    acquiredAt: v.number(),
    /** Where it is kept, like a broker, an exchange or a hardware wallet. */
    location: v.optional(v.string())
  }).index("by_portfolio", ["portfolioId"]),

  holdingEvents: defineTable({
    portfolioId: v.id("portfolios"),
    holdingId: v.id("holdings"),
    symbol: v.string(),
    kind: v.union(v.literal("buy"), v.literal("sell")),
    quantity: v.number(),
    unitPrice: v.number(),
    total: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    occurredAt: v.number(),
    notes: v.optional(v.string())
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_holding", ["holdingId"]),

  cryptoWallets: defineTable({
    portfolioId: v.id("portfolios"),
    address: v.string(),
    addressType: cryptoWalletAddressTypeValidator,
    label: v.string(),
    includeInNetWorth: v.boolean(),
    snapshot: v.optional(cryptoWalletSnapshotValidator),
    syncLeaseId: v.optional(v.string()),
    syncLeaseUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_portfolio_address", ["portfolioId", "address"]),

  /**
   * Where one loan's money went and, for a recorded debt, what backs it. A loan key is a wallet
   * borrowing ("defi:<walletId>:<positionId>") or a recorded debt ("liability:<id>"); targets name
   * places already counted in net worth, so a link never changes a total. See lib/loanLinks.ts.
   */
  loanLinks: defineTable({
    portfolioId: v.id("portfolios"),
    loanKey: v.string(),
    targets: v.array(v.object({ key: v.string(), role: v.union(v.literal("deployed"), v.literal("collateral")) })),
    updatedAt: v.number()
  }).index("by_portfolio", ["portfolioId"]),

  assets: defineTable({
    portfolioId: v.id("portfolios"),
    wealthObservation,
    name: v.string(),
    kind: v.union(
      v.literal("cash"),
      v.literal("real_estate"),
      v.literal("vehicle"),
      v.literal("collectible"),
      v.literal("business"),
      v.literal("other")
    ),
    /** Manual investment classification; only valid for kind other. */
    investmentType: v.optional(v.literal("fund")),
    balance: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    notes: v.optional(v.string()),
    /** Where it is kept, like a bank or a safe. */
    location: v.optional(v.string()),
    /** Who owes it to the person, when this asset is money lent out, like a loan to a company. */
    owedBy: v.optional(v.string()),
    /** What it cost in total, in its own currency, so its value can show a gain or loss. */
    costBasis: v.optional(v.number()),
    /** When it was bought. */
    acquiredAt: v.optional(v.number()),
    updatedAt: v.number()
  }).index("by_portfolio", ["portfolioId"]),

  liabilities: defineTable({
    portfolioId: v.id("portfolios"),
    wealthObservation,
    name: v.string(),
    kind: v.union(
      v.literal("credit_card"),
      v.literal("loan"),
      v.literal("mortgage"),
      v.literal("other")
    ),
    balance: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    interestRate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    /**
     * A debt owed in an asset rather than money, like 0.15 BTC. Its value follows that asset's
     * market price; `balance` and `currency` keep the last value written, for when no price is known.
     */
    owedSymbol: v.optional(v.string()),
    owedQuantity: v.optional(v.number()),
    /** Who the debt is owed to: a person, a company or a lender. Debts to one party group together. */
    counterparty: v.optional(v.string()),
    /**
     * Loan terms, all optional so a debt without them behaves as before. `balance` stays the
     * principal still owed; accrued interest is worked out from these terms and is not part of it.
     * `principal` is the amount first lent, in `currency`; `startedAt` is when it began.
     */
    principal: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    /** "fixed" has a repayment date in `dueDate`; "flexible" has none and is repaid when it suits. */
    dueKind: v.optional(v.union(v.literal("fixed"), v.literal("flexible"))),
    /**
     * "none" is interest-free. "simple" accrues `interestRate` percent a year, a twelfth each month
     * on the principal outstanding at the start of that month. "manual" is a term Numa does not
     * calculate (compounding, amortization); it shows as manual.
     */
    interestTerms: v.optional(v.union(v.literal("none"), v.literal("simple"), v.literal("manual"))),
    /** The day of the month (1 to 28) interest is due by, for simple interest. Accrual does not use it; it only says when to pay. */
    interestDueDay: v.optional(v.number()),
    updatedAt: v.number()
  }).index("by_portfolio", ["portfolioId"]),

  /**
   * One reading a day per wallet of what its DeFi positions hold and owe, coin by coin, with the
   * prices of ether, bitcoin and the euro. What strategies earned is worked out from how these grow.
   */
  defiReadings: defineTable({
    portfolioId: v.id("portfolios"),
    walletId: v.id("cryptoWallets"),
    /** UTC day, YYYY-MM-DD; the day's latest complete reading replaces earlier ones. */
    day: v.string(),
    takenAt: v.number(),
    refs: v.object({ ETH: v.optional(v.number()), BTC: v.optional(v.number()), EUR: v.optional(v.number()) }),
    rows: v.array(v.object({
      position: v.string(), protocol: v.string(), chainName: v.string(), label: v.string(),
      symbol: v.string(), debt: v.optional(v.boolean()), quantity: v.number(), valueUsd: v.number(),
    })),
  })
    .index("by_wallet_day", ["walletId", "day"])
    .index("by_portfolio", ["portfolioId"]),

  /**
   * A debt kept in step with a company portal: its agent link is read on a schedule and the debt
   * becomes the portal's shortfall. `key` is the portal's secret and never leaves the server.
   */
  liabilitySources: defineTable({
    portfolioId: v.id("portfolios"),
    /** What follows the portal: a debt, or money owed to the person (an asset). One of the two. */
    liabilityId: v.optional(v.id("liabilities")),
    assetId: v.optional(v.id("assets")),
    /** What is read: the company's shortfall (the default), or the total owed to some investors. */
    metric: v.optional(v.union(v.literal("shortfall"), v.literal("investors"))),
    investorIds: v.optional(v.array(v.string())),
    /** Who the investors are, as shown on the record. */
    label: v.optional(v.string()),
    url: v.string(),
    key: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ok"), v.literal("incomplete"), v.literal("failed"))),
    message: v.optional(v.string()),
    checkedAt: v.optional(v.number()),
    readingAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number()
  }).index("by_portfolio", ["portfolioId"]).index("by_liability", ["liabilityId"]).index("by_asset", ["assetId"]),

  /**
   * What happened to a debt, newest last: money taken, paid back, lent or received, or a note. A
   * payment that was applied changed the record's balance when it was saved, and removing it
   * gives that amount back. `subject` is "liability:<id>" or "asset:<id>" (money owed to you).
   */
  debtEvents: defineTable({
    portfolioId: v.id("portfolios"),
    subject: v.string(),
    /** "capitalized" is unpaid interest added to the principal: it raises what is owed and settles that interest. */
    kind: v.union(v.literal("borrowed"), v.literal("repaid"), v.literal("lent"), v.literal("received"), v.literal("note"), v.literal("capitalized")),
    /** In `unit`: the record's currency or the coin it is owed in. */
    amount: v.optional(v.number()),
    unit: v.optional(v.string()),
    /** How a payment splits, in `unit`. When any is set, the three add up to `amount` and only the principal part changes the balance. */
    principalPart: v.optional(v.number()),
    interestPart: v.optional(v.number()),
    feePart: v.optional(v.number()),
    applied: v.boolean(),
    occurredAt: v.number(),
    note: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_portfolio", ["portfolioId"]).index("by_subject", ["portfolioId", "subject"]),

  marketQuotes: defineTable({
    symbol: v.string(),
    price: v.number(),
    changePercent: v.number(),
    provider: v.union(
      v.literal("coingecko"),
      v.literal("coinbase"),
      v.literal("alpha-vantage"),
      v.literal("stooq"),
      v.literal("finnhub"),
      v.literal("mock")
    ),
    updatedAt: v.number()
  }).index("by_symbol", ["symbol"]),

  wealthSnapshots: defineTable({
    portfolioId: v.id("portfolios"),
    takenAt: v.number(),
    netWorth: v.number(),
    liquid: v.number(),
    invested: v.number(),
    hardAssets: v.number(),
    liabilities: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    label: v.optional(v.string()),
    isAuto: v.boolean(),
    // What each position was worth on that date, when the source had it (a wealth log row).
    lines: v.optional(v.array(snapshotLine)),
    wealthEvidence: v.optional(v.object({
      contractVersion: v.literal(2), coverageKey: v.string(), complete: v.boolean(),
      assets: v.number(), encumbered: v.number(), fx: wealthFx
    }))
  }).index("by_portfolio_time", ["portfolioId", "takenAt"]).index("by_portfolio_export", ["portfolioId"]),

  settlements: defineTable({
    portfolioId: v.id("portfolios"),
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    occurredAt: v.number(),
    note: v.optional(v.string())
  }).index("by_portfolio_time", ["portfolioId", "occurredAt"]).index("by_portfolio_export", ["portfolioId"]),

  goals: defineTable({
    portfolioId: v.id("portfolios"),
    scope: v.union(
      v.literal("net_worth"),
      v.literal("monthly_income"),
      v.literal("income_category"),
      v.literal("asset_value"),
      v.literal("holding_value")
    ),
    target: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    startAt: v.number(),
    deadline: v.optional(v.number()),
    label: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    assetId: v.optional(v.id("assets")),
    holdingId: v.optional(v.id("holdings")),
    createdAt: v.number()
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_portfolio_scope", ["portfolioId", "scope"]),

  moneyPods: defineTable({
    name: v.string(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    ownerUserId: v.id("users"),
    createdAt: v.number()
  }).index("by_owner", ["ownerUserId"]),

  podMembers: defineTable({
    podId: v.id("moneyPods"),
    displayName: v.string(),
    invitedEmail: v.optional(v.string()),
    linkedUserId: v.optional(v.id("users")),
    linkedPortfolioId: v.optional(v.id("portfolios")),
    groupId: v.optional(v.id("podGroups")),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    joinedAt: v.number(),
    // Free-text labels for the member's payment methods (e.g. "ZEN",
    // "Revolut", "Cash"). Used purely as a label on podExpenses.paidByCard
    // — does NOT link to any portfolio asset. The Shared-mode UI is
    // intentionally decoupled from personal portfolios so non-Numa
    // members can be tracked the same as Numa-account members.
    cards: v.optional(v.array(v.string())),
    // Tombstone flag for member exit. When a member leaves (`leaveMoneyPod`)
    // or the owner removes them (`removeMember`) we DON'T hard-delete the row:
    // doing so would orphan every expense they paid (paidByMemberId) and every
    // settlement they were party to, breaking the settlement zero-sum invariant
    // and making real money owed to/from them vanish. Instead we tombstone the
    // row (`active: false`, `removedAt: <ts>`). Settlement math keeps using the
    // tombstoned row so balances stay correct; pickers / people-list UIs filter
    // it out. Absent or `true` means active (existing rows predate this field).
    active: v.optional(v.boolean()),
    removedAt: v.optional(v.number())
  })
    .index("by_pod", ["podId"])
    .index("by_user", ["linkedUserId"])
    .index("by_email", ["invitedEmail"])
    .index("by_email_user", ["invitedEmail", "linkedUserId"]),

  podGroups: defineTable({
    podId: v.id("moneyPods"),
    name: v.string(),
    color: v.string()
  }).index("by_pod", ["podId"]),

  podExpenses: defineTable({
    podId: v.id("moneyPods"),
    paidByMemberId: v.id("podMembers"),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    occurredAt: v.number(),
    splitMode: v.union(
      v.literal("equal_people"),
      v.literal("equal_groups"),
      v.literal("custom"),
      v.literal("covered_group")
    ),
    participantMemberIds: v.array(v.id("podMembers")),
    customSplits: v.optional(v.array(v.object({ memberId: v.id("podMembers"), bps: v.number() }))),
    coveredGroupId: v.optional(v.id("podGroups")),
    sourcePortfolioId: v.optional(v.id("portfolios")),
    sourceAccountId: v.optional(v.id("assets")),
    // Free-text label of the card / payment method used (matches one of the
    // payer's `podMembers.cards` strings). Surfaced on the timeline so
    // members can answer "which card did Maya pay this with?" at a glance.
    paidByCard: v.optional(v.string()),
    notes: v.optional(v.string())
  }).index("by_pod_time", ["podId", "occurredAt"]),

  podSettlements: defineTable({
    podId: v.id("moneyPods"),
    fromMemberId: v.id("podMembers"),
    toMemberId: v.id("podMembers"),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    occurredAt: v.number(),
    note: v.optional(v.string())
  }).index("by_pod_time", ["podId", "occurredAt"]),

  // Shareable pod invite codes. Only the SHA-256 hex of the code is stored
  // (same pattern as webhookTokens) — the raw code is shown once to the owner
  // and joins are validated by hash + expiry + revocation.
  podInvites: defineTable({
    podId: v.id("moneyPods"),
    codeHash: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
    revoked: v.optional(v.boolean())
  })
    .index("by_pod", ["podId"])
    .index("by_hash", ["codeHash"]),

  // AI-generated merchant "studio shot" cache (transparent PNGs in Convex
  // file storage). Keyed by normalized merchant+kind so every render is paid
  // for exactly once, then shared by all users — the images are generic
  // product art, never personal data. Written only via the internal-secret
  // path from /api/merchant-image.
  merchantImages: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
    prompt: v.string(),
    model: v.string(),
    createdAt: v.number()
  }).index("by_key", ["key"]),

  invites: defineTable({
    portfolioId: v.id("portfolios"),
    invitedEmail: v.string(), // lowercased
    ownershipBps: v.number(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    displayName: v.string(),
    invitedByUserId: v.id("users"),
    invitedAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"))
  })
    .index("by_email", ["invitedEmail"])
    .index("by_portfolio", ["portfolioId"]),

  recurring: defineTable({
    portfolioId: v.id("portfolios"),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    accountId: v.optional(v.id("assets")),
    kind: v.union(v.literal("income"), v.literal("expense")),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    cadence: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    startAt: v.number(),
    nextRunAt: v.number(),
    endAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    // Explicit opt-in for business MRR/ARR. Unmarked income is never annualized.
    revenueType: v.optional(v.union(v.literal("subscription"), v.literal("retainer"))),
    // Client or income source used to group recurring income and MRR.
    incomeSource: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number()
  }).index("by_portfolio", ["portfolioId"]),

  ledgerAccounts: defineTable({
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: v.union(
      v.literal("asset"),
      v.literal("liability"),
      v.literal("income"),
      v.literal("expense"),
      v.literal("equity"),
      v.literal("pod")
    ),
    normalBalance: v.union(v.literal("debit"), v.literal("credit")),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    refType: v.optional(
      v.union(
        v.literal("asset"),
        v.literal("liability"),
        v.literal("holding"),
        v.literal("category"),
        v.literal("pod"),
        v.literal("member"),
        v.literal("system")
      )
    ),
    refId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_ref", ["refType", "refId"]),

  ledgerTransactions: defineTable({
    portfolioId: v.id("portfolios"),
    classification: v.optional(financeClassificationValidator),
    reversesId: v.optional(v.id("ledgerTransactions")),
    sourceType: v.union(
      v.literal("transaction"),
      v.literal("asset"),
      v.literal("liability"),
      v.literal("holding"),
      v.literal("pod_expense"),
      v.literal("settlement"),
      v.literal("manual"),
      v.literal("migration")
    ),
    sourceId: v.optional(v.string()),
    occurredAt: v.number(),
    description: v.string(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    createdByUserId: v.id("users"),
    clientMutationId: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_portfolio_time", ["portfolioId", "occurredAt"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_reversal", ["reversesId"])
    .index("by_client_mutation", ["clientMutationId"]).index("by_portfolio_export", ["portfolioId"]),

  ledgerLines: defineTable({
    portfolioId: v.id("portfolios"),
    ledgerTransactionId: v.id("ledgerTransactions"),
    ledgerAccountId: v.id("ledgerAccounts"),
    side: v.union(v.literal("debit"), v.literal("credit")),
    amount: v.number(),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    memo: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_portfolio", ["portfolioId"])
    .index("by_transaction", ["ledgerTransactionId"])
    .index("by_account", ["ledgerAccountId"]),

  rateLimitBuckets: defineTable({
    key: v.string(),
    route: v.string(),
    identityHash: v.string(),
    windowStart: v.number(),
    windowMs: v.number(),
    limit: v.number(),
    count: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number())
  })
    .index("by_key", ["key"])
    .index("by_route_identity", ["route", "identityHash"])
    .index("by_expiry", ["expiresAt"]),

  // Lightweight production error telemetry. The client reports crashes
  // (error boundary, window.onerror, unhandledrejection) via a public,
  // length-capped, deduplicating mutation; rows are viewed in the Convex
  // dashboard. Deduped by fingerprint with a count so a render-loop crash
  // is one row, not thousands. Total distinct rows are capped server-side.
  clientErrors: defineTable({
    fingerprint: v.string(),
    source: v.union(v.literal("boundary"), v.literal("window"), v.literal("promise"), v.literal("route"), v.literal("manual")),
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    release: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    count: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number()
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_last_seen", ["lastSeenAt"])
    .index("by_user", ["userId"]),

  aiActionDrafts: defineTable({
    userId: v.id("users"),
    portfolioId: v.optional(v.id("portfolios")),
    podId: v.optional(v.id("moneyPods")),
    actionType: v.union(
      v.literal("transaction.create"),
      v.literal("category.create"),
      v.literal("budget.update"),
      v.literal("podExpense.create"),
      v.literal("settlement.create"),
      v.literal("goal.upsert"),
      v.literal("recurring.create")
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("failed")
    ),
    prompt: v.string(),
    proposedPayload: v.any(),
    // Stable identity for the initial draft insert. A transport can lose the
    // mutation response after commit; retrying the same review intent must
    // recover that row instead of stranding a second pending audit.
    createRequestId: v.optional(v.string()),
    // A failed reviewed action may only be retried through an explicitly linked
    // draft. The request id makes redrafting idempotent across rapid taps,
    // multiple tabs, and a client crash after the server insert.
    retryOfDraftId: v.optional(v.id("aiActionDrafts")),
    retryRequestId: v.optional(v.string()),
    confirmedMutationId: v.optional(v.string()),
    resultId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    confirmedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number())
  })
    .index("by_user", ["userId"])
    .index("by_user_portfolio", ["userId", "portfolioId"])
    .index("by_user_create_request", ["userId", "createRequestId"])
    .index("by_user_retry_request", ["userId", "retryRequestId"])
    .index("by_portfolio", ["portfolioId"])
    .index("by_status", ["status"]),

  // Per-device Web Push subscriptions keyed by endpoint (the natural unique key).
  // Server-side /api/push-send fans out to every subscription for a userId.
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // Expo push tokens for the rebuilt phone app. One row per device; the time zone sets quiet hours.
  expoPushTokens: defineTable({
    userId: v.id("users"),
    sessionId: v.optional(v.id("authSessions")),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    timeZone: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  // Which alert keys reached a person's phones, so none repeats and the daily cap holds.
  pushAlertsSent: defineTable({
    userId: v.id("users"),
    key: v.string(),
    sentAt: v.number()
  })
    .index("by_user_key", ["userId", "key"])
    .index("by_user_sent", ["userId", "sentAt"]),

  // Personal webhook tokens that let an external service (Zapier / IFTTT /
  // Apple Shortcuts / email-to-API) POST a transaction into a portfolio on
  // behalf of the issuing user. Only the SHA-256 hash is stored — the raw
  // secret is shown to the user exactly once at creation time and never
  // again. Lookup happens via `by_hash` from the Vercel function.
  webhookTokens: defineTable({
    userId: v.id("users"),
    portfolioId: v.id("portfolios"),
    // SHA-256 hash of the secret. The secret itself is shown to the user ONCE.
    tokenHash: v.string(),
    label: v.string(),
    scope: v.union(v.literal("add-transaction")),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    uses: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["tokenHash"]),

  // AI agents the user connected to their account (Claude, ChatGPT, Cursor…)
  // through the MCP endpoint at /mcp. Each one acts as the user through its own
  // Convex Auth session, so signing out other devices or deleting the account
  // cuts it off too. Only the SHA-256 hash of the secret is stored.
  agentConnections: defineTable({
    userId: v.id("users"),
    sessionId: v.id("authSessions"),
    name: v.string(),
    access: v.union(v.literal("full"), v.literal("read")),
    tokenHash: v.string(),
    /** The first characters of the secret, so the user can tell connections apart. */
    tokenHint: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number())
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["tokenHash"]),

  // What connected agents did, for the user to review. Kept 90 days.
  agentActivity: defineTable({
    userId: v.id("users"),
    connectionId: v.id("agentConnections"),
    tool: v.string(),
    write: v.boolean(),
    ok: v.boolean(),
    error: v.optional(v.string()),
    at: v.number(),
    expiresAt: v.number()
  })
    .index("by_user_at", ["userId", "at"])
    .index("by_connection_at", ["connectionId", "at"])
    .index("by_expires", ["expiresAt"]),

  // Market price history behind the chart (public market data, no personal data), one row per
  // symbol and range, refreshed when it is older than the range needs.
  priceHistory: defineTable({
    key: v.string(),
    t: v.array(v.number()),
    p: v.array(v.number()),
    observations: v.optional(v.object({
      t: v.array(v.number()), p: v.array(v.number()),
      source: v.union(v.literal("coinbase"), v.literal("yahoo")),
      granularityMs: v.number(), fetchedAt: v.number()
    })),
    fetchedAt: v.number()
  }).index("by_key", ["key"])
});
