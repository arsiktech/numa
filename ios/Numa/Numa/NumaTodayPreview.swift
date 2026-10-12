#if DEBUG && targetEnvironment(simulator)
import SwiftUI

/// Explicit simulator-only fixture surface. It never restores a Keychain
/// session, and its local, unauthenticated client cannot write cloud records.
struct NumaTodayPreview: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var session: NumaSessionStore
  @State private var store: NumaAppStore
  @State private var pods: PodStore
  private let mode: String
  private let largeText = ProcessInfo.processInfo.environment["NUMA_TODAY_LARGE_TEXT"] == "1"
  private let dark = ProcessInfo.processInfo.environment["NUMA_TODAY_DARK"] == "1"

  init(mode: String) {
    self.mode = mode
    let session = NumaSessionStore(deploymentURL: "http://127.0.0.1:1")
    let store = NumaAppStore(session: session)
    let personal = mode == "money" ? NumaTodayFixture.moneySnapshot() : NumaTodayFixture.snapshot(mode: mode)
    let business = NumaTodayFixture.snapshot(income: 6200, goalCurrency: "USD", spaceID: "business", name: "Studio", currency: "USD", business: true)
    store.portfolios = [personal.portfolio, business.portfolio]
    store.previewSnapshots = [personal.portfolio.id: personal, business.portfolio.id: business]
    store.beginSpaceSelection(personal.portfolio.id)
    if mode == "unavailable" { store.failSpace(context: store.spaceContext, message: "Could not load this space. Retry or choose another.") }
    else { store.acceptSpaceSnapshot(personal, context: store.spaceContext) }
    _session = State(initialValue: session)
    _store = State(initialValue: store)
    _pods = State(initialValue: PodStore(session: session))
  }

  var body: some View {
    let scheme: ColorScheme = dark ? .dark : colorScheme
    VStack(spacing: 0) {
      Text("Preview · Fictional data · Cloud saving unavailable")
        .font(.caption2)
        .padding(6)
        .frame(maxWidth: .infinity)
        .background(.bar)
      MainNativeShell(previewOnly: true)
    }
    .environment(session)
    .environment(store)
    .environment(pods)
    .environment(\.numa, NumaPalette.palette(.citrus, scheme: scheme, appearance: .auto))
    .tint(NumaPalette.palette(.citrus, scheme: scheme, appearance: .auto).brand)
    .preferredColorScheme(dark ? .dark : nil)
    .dynamicTypeSize(largeText ? .accessibility5 : typeSize)
  }
}

/// Synthetic values only; never derived from a user's spreadsheet or account.
enum NumaTodayFixture {
  static func moneySnapshot() -> MobilePortfolioSnapshot {
    let base = snapshot()
    let category = MobileCategory(id: "demo-expenses", portfolioId: "fixture", name: "Studio costs", kind: "expense",
      icon: "tag", color: "mint", sortOrder: 0, emoji: nil, monthlyLimit: 1000, budgetCurrency: "EUR")
    let rows = base.transactions.map { row in
      MobileTransaction(id: row.id, portfolioId: row.portfolioId, occurredAt: row.occurredAt,
        description: row.description, categoryId: row.kind == "expense" ? category.id : nil,
        accountId: nil, kind: row.kind, amount: row.amount, currency: row.currency, createdByUserId: row.createdByUserId, notes: row.notes)
    }
    var result = MobilePortfolioSnapshot(portfolio: base.portfolio, dashboard: base.dashboard,
      categories: [category], transactions: rows,
      assets: base.assets + [MobileAsset(id: "demo-reserve", portfolioId: "fixture", name: "Reserve", kind: "cash", balance: 500,
        currency: "EUR", notes: nil, updatedAt: 1789200000000)],
      liabilities: base.liabilities, holdings: base.holdings, goals: base.goals, recurring: base.recurring, wealthSnapshots: base.wealthSnapshots)
    result.transfers = [MobileCashTransfer(id: "demo-transfer", portfolioId: "fixture", fromAccountId: "fixture-cash", toAccountId: "demo-reserve",
      amount: 500, amountMinor: 50000, currency: "EUR", occurredAt: 1789200000000, description: "Reserve top-up", notes: nil,
      sourceEventId: "demo-source", createdByUserId: "fixture-only", createdAt: 1789200000000, updatedAt: 1789200000000)]
    return result
  }

  static func snapshot(mode: String = "normal", income: Double = 2840, target: Double = 5000, goalCurrency: String = "EUR", monthDelta: Double? = nil, spaceID: String = "fixture", name: String = "Personal", currency: String = "EUR", business: Bool = false) -> MobilePortfolioSnapshot {
    let empty = mode == "empty"
    let negative = mode == "negative"
    let invalid = mode == "invalid"
    let huge = mode == "largeValues"
    let recordedIncome = empty ? 0 : income
    let expenses: Double = empty ? 0 : (negative ? 3780 : 1240)
    let liquid: Double = invalid ? .infinity : (empty ? 0 : 22450)
    let invested: Double = empty ? 0 : 76000
    let debt: Double = empty ? 0 : (huge ? 1234666340.12 : (negative ? 110450 : 12000))
    let dashboard = MobileDashboard(
      currency: currency, monthIncome: recordedIncome, monthExpenses: expenses,
      monthCashflow: recordedIncome - expenses, monthDelta: monthDelta,
      liquid: liquid, invested: invested, hardAssets: 0, liabilities: debt,
      netWorth: invalid ? .nan : liquid + invested - debt,
      transactionCount: empty ? 0 : 2, goalCount: empty ? 0 : 1,
      dataQuality: mode == "missingQuality" ? nil : MobileDashboardQuality(generatedAt: Date.now.timeIntervalSince1970 * 1000,
        validUntil: Date.now.addingTimeInterval(mode == "expired" ? -1 : 300).timeIntervalSince1970 * 1000,
        fxEstimated: mode == "estimated", fxAsOf: nil,
        missingQuoteCount: mode == "missingPrices" ? 1 : 0, staleQuoteCount: mode == "stalePrices" ? 1 : 0)
    )
    return MobilePortfolioSnapshot(
      portfolio: MobilePortfolio(id: spaceID, name: name, type: "personal", tagline: "", defaultCurrency: currency, role: "owner", ownershipBps: 10000, createdAt: 0, spaceKind: business ? "business" : "personal"),
      dashboard: dashboard, categories: [],
      transactions: empty ? [] : [
        MobileTransaction(id: "\(spaceID)-entry", portfolioId: spaceID, occurredAt: 1789200000000, description: "Design project", categoryId: nil, accountId: nil, kind: "income", amount: recordedIncome, currency: currency, createdByUserId: "fixture-only", notes: nil),
        MobileTransaction(id: "\(spaceID)-expense", portfolioId: spaceID, occurredAt: 1789113600000, description: "Studio expenses", categoryId: nil, accountId: nil, kind: "expense", amount: expenses, currency: currency, createdByUserId: "fixture-only", notes: nil)
      ],
      assets: empty ? [] : [MobileAsset(id: "\(spaceID)-cash", portfolioId: spaceID, name: "Cash account", kind: "cash", balance: liquid, currency: mode == "estimated" ? (currency == "EUR" ? "USD" : "EUR") : currency, notes: nil, updatedAt: 1789200000000)],
      liabilities: empty ? [] : [MobileLiability(id: "\(spaceID)-debt", portfolioId: spaceID, name: "Example loan", kind: "loan", balance: debt, currency: currency, interestRate: nil, dueDate: nil, notes: nil, updatedAt: 1789200000000)],
      holdings: empty ? [] : [MobileHolding(id: "\(spaceID)-holding", portfolioId: spaceID, symbol: "DEMO", name: "Example fund", kind: "stock", quantity: 1, costBasis: invested, currency: currency, acquiredAt: 0, marketPrice: invested, marketValue: invested, changePercent: 0, quoteProvider: "stooq", quoteUpdatedAt: Date.now.addingTimeInterval(mode == "agingPrice" ? -(36 * 3600 - 60) : -60).timeIntervalSince1970 * 1000)],
      goals: empty ? [] : [MobileGoal(id: "\(spaceID)-goal", portfolioId: spaceID, scope: "monthly_income", target: target, currency: goalCurrency, startAt: 0, deadline: nil, label: nil, categoryId: nil, assetId: nil, holdingId: nil, createdAt: 0)],
      recurring: [MobileRecurring(id: "\(spaceID)-rule", portfolioId: spaceID, description: "Scheduled retainer", kind: "income", amount: 9000, currency: currency, categoryId: nil, accountId: nil, cadence: "monthly", startAt: 0, nextRunAt: 1790000000000, endAt: nil, notes: nil, active: true, createdAt: 0)],
      wealthSnapshots: []
    )
  }
}
#endif
