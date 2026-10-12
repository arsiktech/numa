import SwiftUI

/// Presentation only. In particular, the legacy `monthDelta` is not a
/// comparable-snapshot wealth change and must not appear as one on Today.
struct NumaTodaySummary: Equatable {
  let currency: CurrencyCode
  let netWorth: Double?
  let income: Double?
  let expenses: Double?
  let cashFlow: Double?
  let assets: Double?
  let debt: Double?
  let goal: MobileGoal?
  let goalProgress: Double?
  let goalPercent: Int?
  let qualityMessage: String?

  var goalProgressMessage: LocalizedStringResource? {
    guard let goal, goalProgress == nil else { return nil }
    if !goal.target.isFinite || goal.target <= 0 { return "Set a positive target to see your progress." }
    if goal.currency != currency { return "Your goal uses a different currency. Edit it to match this space." }
    return "Progress will return when recorded income is available. Your target is kept."
  }

  init(snapshot: MobilePortfolioSnapshot, now: Date = .now) {
    let dashboard = snapshot.dashboard
    let currency = dashboard.currency
    self.currency = currency
    let quality = dashboard.dataQuality
    let current = quality?.isCurrent(at: now) == true
    let fxAvailable = quality?.fxEstimated == false
    let assetFX = snapshot.assets.contains { $0.currency != currency }
    let debtFX = snapshot.liabilities.contains { $0.currency != currency }
    let holdingFX = snapshot.holdings.contains { ($0.quoteProvider == nil ? $0.currency : "USD") != currency }
    // Use the server's recorded interval, not the device calendar or all-time
    // history. Missing/invalid provenance retains the conservative FX guard.
    let cashflowFX = snapshot.transactions.contains {
      $0.currency != currency && quality?.containsRecordedTransaction(at: $0.occurredAt) != false
    }
    let pricesAvailable = quality?.missingQuoteCount == 0 && quality?.staleQuoteCount == 0 && snapshot.holdings.allSatisfy {
      guard let quotedAt = $0.quoteUpdatedAt, quotedAt.isFinite, $0.quoteProvider != "mock" else { return false }
      let age = now.timeIntervalSince1970 * 1000 - quotedAt
      return age >= 0 && age < 36 * 60 * 60 * 1000
    }
    let wealthAvailable = current && pricesAvailable && (fxAvailable || !(assetFX || debtFX || holdingFX))
    netWorth = wealthAvailable ? Self.finite(dashboard.netWorth) : nil
    income = current && (fxAvailable || !cashflowFX) ? Self.finite(dashboard.monthIncome) : nil
    expenses = current && (fxAvailable || !cashflowFX) ? Self.finite(dashboard.monthExpenses) : nil
    cashFlow = current && (fxAvailable || !cashflowFX) ? Self.finite(dashboard.monthCashflow) : nil
    let components = [dashboard.liquid, dashboard.invested, dashboard.hardAssets]
    assets = current && pricesAvailable && (fxAvailable || !(assetFX || holdingFX)) && components.allSatisfy(\.isFinite)
      ? Self.finite(components.reduce(0, +)) : nil
    debt = current && (fxAvailable || !debtFX) ? Self.finite(dashboard.liabilities) : nil
    if !current { qualityMessage = "Valuation details are unavailable or expired. Refresh this space to check current values." }
    else if !pricesAvailable { qualityMessage = "Net worth is incomplete because investment prices are missing or stale." }
    else if !fxAvailable && (assetFX || debtFX || holdingFX || cashflowFX) {
      qualityMessage = "Currency conversion is estimated. Affected totals are unavailable until a verified rate is provided."
    } else { qualityMessage = nil }
    goal = snapshot.goals.last { $0.scope == "monthly_income" }
    if let goal, goal.currency == currency, goal.target.isFinite, goal.target > 0,
       let income, (income / goal.target).isFinite {
      // Recurring rules are plans, not recorded income. Never use the legacy
      // income-pace total (received + scheduled) as achieved goal progress.
      let progress = min(max(income / goal.target, 0), 1)
      goalProgress = progress
      goalPercent = income >= goal.target ? 100 : min(99, Int((progress * 100).rounded()))
    } else {
      goalProgress = nil
      goalPercent = nil
    }
  }

  static func finite(_ value: Double?) -> Double? {
    guard let value, value.isFinite else { return nil }
    return value
  }
}

struct OverviewNativePage: View {
  @Environment(NumaAppStore.self) private var appStore

  var body: some View {
    NumaScreen {
      if let snapshot = appStore.portfolioSnapshot {
        NumaTodayContent(snapshot: snapshot, refresh: { appStore.retrySpace() }) { destination in
          appStore.activeSheet = destination
        }
      } else {
        NumaTodayUnavailableView()
      }
    }
  }
}

struct NumaTodayContent: View {
  let snapshot: MobilePortfolioSnapshot
  var refresh: (() -> Void)? = nil
  let open: (NumaSheet) -> Void

  var body: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      let summary = NumaTodaySummary(snapshot: snapshot, now: context.date)
      VStack(alignment: .leading, spacing: 24) {
        NumaTodayWorth(summary: summary, portfolioName: snapshot.portfolio.name, refresh: refresh)
        NumaTodayCashFlow(summary: summary)
        NumaTodayIncomeGoal(summary: summary) {
          open(.monthlyIncomeTarget(summary.goal))
        }
        NumaTodayLatest(transaction: snapshot.transactions.first) { transaction in
          open(.transaction(TransactionDraft(transaction: transaction)))
        }
      }
      .padding(.top, 8)
    }
  }
}

private struct NumaTodayWorth: View {
  let summary: NumaTodaySummary
  let portfolioName: String
  let refresh: (() -> Void)?

  var body: some View {
    NumaTodayWorthContent(summary: summary, portfolioName: portfolioName, refresh: refresh)
      // A stable ink surface keeps the brand and semantic text readable in every theme.
      .environment(\.numa, NumaPalette.palette(.citrus, scheme: .dark, appearance: .dark))
  }
}

private struct NumaTodayWorthContent: View {
  @Environment(\.numa) private var numa
  let summary: NumaTodaySummary
  let portfolioName: String
  let refresh: (() -> Void)?

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline) {
        Text(portfolioName)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(numa.ink2)
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 12)
        Text(summary.currency)
          .font(.caption.weight(.semibold))
          .foregroundStyle(numa.ink2)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(numa.paper, in: Capsule())
          .accessibilityLabel("Display currency: \(summary.currency)")
      }
      VStack(alignment: .leading, spacing: 8) {
        Label("Net worth", systemImage: "square.stack.3d.up")
          .font(.title3.weight(.semibold))
        NumaTodayAmount(value: summary.netWorth, currency: summary.currency, size: 58, style: .largeTitle)
          .accessibilityIdentifier("today.netWorth")
      }
      Text("Tracked assets minus debt. Not cash available to spend.")
        .font(.footnote)
        .foregroundStyle(numa.ink2)
        .fixedSize(horizontal: false, vertical: true)
      Divider().overlay(numa.line)
      NumaTodayBalanceBreakdown(summary: summary)
      if let message = summary.qualityMessage {
        VStack(alignment: .leading, spacing: 10) {
          Label("Valuation needs attention", systemImage: "info.circle")
            .font(.subheadline.weight(.semibold))
          Text(message)
            .font(.footnote)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("today.valuationQuality")
          if let refresh {
            Button(action: refresh) { Label("Refresh values", systemImage: "arrow.clockwise").frame(minHeight: 44) }
              .font(.subheadline.weight(.semibold))
              .buttonStyle(.plain)
              .accessibilityIdentifier("today.refreshValues")
          }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(numa.brandMist, in: RoundedRectangle(cornerRadius: 18))
      }
    }
    .foregroundStyle(numa.ink)
    .padding(22)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(alignment: .topTrailing) {
      NumaBrandOrbit()
        .foregroundStyle(numa.brand.opacity(0.12))
        .offset(x: 100, y: -100)
    }
    .background(numa.bg, in: RoundedRectangle(cornerRadius: 28))
    .clipShape(RoundedRectangle(cornerRadius: 28))
    .overlay(RoundedRectangle(cornerRadius: 28).strokeBorder(numa.line))
  }
}

private struct NumaTodayCashFlow: View {
  @Environment(\.numa) private var numa
  @Environment(\.dynamicTypeSize) private var typeSize
  let summary: NumaTodaySummary

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .firstTextBaseline) {
        Text("Net cash flow")
          .font(.headline)
        Spacer(minLength: 12)
        Text("This month")
          .font(.footnote)
      }
      NumaTodayAmount(value: summary.cashFlow, currency: summary.currency, size: 34, style: .title)
        .foregroundStyle((summary.cashFlow ?? 0) < 0 ? numa.negative : numa.ink)
        .accessibilityIdentifier("today.cashFlow")
      Text("Recorded income minus expenses")
        .font(.footnote)
        .foregroundStyle(numa.ink2)
      Divider().overlay(numa.line)
      let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 16)) : AnyLayout(HStackLayout(alignment: .top, spacing: 16))
      layout {
        NumaTodaySmallMetric(title: "Income", value: summary.income, currency: summary.currency, symbol: "arrow.down.left")
        NumaTodaySmallMetric(title: "Expenses", value: summary.expenses, currency: summary.currency, symbol: "arrow.up.right")
      }
    }
    .foregroundStyle(numa.ink)
    .padding(20)
    .background(numa.brandSoft, in: RoundedRectangle(cornerRadius: 24))
  }
}

private struct NumaTodayIncomeGoal: View {
  @Environment(\.numa) private var numa
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let summary: NumaTodaySummary
  let edit: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .firstTextBaseline) {
        Text("Your income goal")
          .font(.title3.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 8)
        Button(action: edit) {
          Text(summary.goal == nil ? "Set goal" : "Edit")
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .background(numa.bg, in: Capsule())
        .accessibilityLabel(summary.goal == nil ? "Set monthly income goal" : "Edit monthly income goal")
        .accessibilityIdentifier("today.editGoal")
      }
      if let goal = summary.goal {
        NumaTodayAmount(value: NumaTodaySummary.finite(goal.target), currency: goal.currency, size: 30, style: .title2)
        Text("Monthly target")
          .font(.footnote)
          .foregroundStyle(numa.ink2)
        if let progress = summary.goalProgress, let percent = summary.goalPercent {
          ProgressView(value: progress)
            .tint(numa.brand)
            .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: progress)
            .accessibilityLabel("Monthly income goal, recorded progress")
            .accessibilityValue(Text("\(percent) percent"))
          Text("\(percent)% of target recorded")
            .font(.subheadline.weight(.semibold))
            .accessibilityIdentifier("today.goalProgress")
          Text("Scheduled income is not included.")
            .font(.footnote)
            .foregroundStyle(numa.ink2)
        } else {
          Text(summary.goalProgressMessage ?? "Progress is unavailable.")
            .font(.footnote)
            .foregroundStyle(numa.ink2)
        }
      } else {
        Text("Give your next month a direction.")
          .font(.body)
        Text("Set a monthly income target. Progress follows recorded income, not forecasts.")
          .font(.footnote)
          .foregroundStyle(numa.ink2)
      }
    }
    .foregroundStyle(numa.ink)
    .padding(20)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(numa.paper, in: RoundedRectangle(cornerRadius: 24))
    .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(numa.line))
  }
}

private struct NumaTodayBalanceBreakdown: View {
  @Environment(\.numa) private var numa
  @Environment(\.dynamicTypeSize) private var typeSize
  let summary: NumaTodaySummary

  var body: some View {
    Group {
      if typeSize.isAccessibilitySize {
        stackedMetrics
      } else {
        ViewThatFits(in: .horizontal) {
          HStack(alignment: .top, spacing: 20) {
            assets.fixedSize(horizontal: true, vertical: false)
            Spacer(minLength: 0)
            debt.fixedSize(horizontal: true, vertical: false)
          }
          stackedMetrics
        }
      }
    }
    .padding(.horizontal, 4)
    .foregroundStyle(numa.ink)
  }

  private var stackedMetrics: some View {
    VStack(alignment: .leading, spacing: 20) {
      assets
      debt
    }
  }

  private var assets: some View {
    NumaTodaySmallMetric(title: "Assets", value: summary.assets, currency: summary.currency, symbol: "square.stack.3d.up")
  }

  private var debt: some View {
    NumaTodaySmallMetric(title: "Debt", value: summary.debt, currency: summary.currency, symbol: "arrow.uturn.backward")
  }
}

private struct NumaTodaySmallMetric: View {
  @Environment(\.numa) private var numa
  let title: LocalizedStringResource
  let value: Double?
  let currency: CurrencyCode
  let symbol: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label { Text(title) } icon: { Image(systemName: symbol) }
        .font(.subheadline)
        .foregroundStyle(numa.ink2)
      NumaTodayAmount(value: value, currency: currency, size: 23, style: .title3)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

private struct NumaTodayLatest: View {
  @Environment(\.numa) private var numa
  let transaction: MobileTransaction?
  let edit: (MobileTransaction) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Latest entry")
        .font(.title3.weight(.semibold))
      if let transaction {
        Button { edit(transaction) } label: {
          HStack(alignment: .top, spacing: 12) {
            Image(systemName: transaction.kind == "income" ? "arrow.down.left" : "arrow.up.right")
              .font(.body.weight(.semibold))
              .frame(width: 44, height: 44)
              .background(numa.brandSoft, in: RoundedRectangle(cornerRadius: 14))
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
              Text(transaction.description)
                .font(.body.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
              Text(transaction.kind == "income" ? "Income" : "Expense")
                .font(.footnote)
                .foregroundStyle(numa.ink2)
              NumaTodayAmount(value: NumaTodaySummary.finite(transaction.amount), currency: transaction.currency, size: 21, style: .title3)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
              .font(.caption.weight(.semibold))
              .padding(.top, 14)
              .accessibilityHidden(true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Edit this transaction")
        .accessibilityIdentifier("today.latestEntry")
      } else {
        Text("A clear picture starts with one entry.")
          .font(.body)
        Text("Use Add below to record income or an expense.")
          .font(.footnote)
          .foregroundStyle(numa.ink2)
      }
    }
    .foregroundStyle(numa.ink)
    .padding(.horizontal, 4)
  }
}

struct NumaTodayAmount: View {
  @Environment(\.locale) private var locale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let value: Double?
  let currency: CurrencyCode
  let size: CGFloat
  let style: Font.TextStyle

  var body: some View {
    if let value = NumaTodaySummary.finite(value) {
      ViewThatFits(in: .horizontal) {
        Text(value, format: .currency(code: currency).precision(.fractionLength(0...2)).locale(locale))
          .font(.custom("DM Sans", size: size, relativeTo: style).weight(.bold))
          .fixedSize()
        Text(value, format: .currency(code: currency).precision(.fractionLength(0...2)).locale(locale))
          .font(.custom("DM Sans", size: min(size, 26), relativeTo: .title3).weight(.bold))
          .fixedSize(horizontal: false, vertical: true)
      }
      .monospacedDigit()
      .contentTransition(reduceMotion ? .identity : .numericText(value: value))
      .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: value)
      .accessibilityLabel(Text(value, format: .currency(code: currency).locale(locale)))
    } else {
      Text("Unavailable")
        .font(.title3.weight(.semibold))
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct NumaTodayUnavailableView: View {
  @Environment(\.numa) private var numa

  var body: some View {
    ContentUnavailableView {
      Label("Your money picture is not available yet", systemImage: "rectangle.stack")
    } description: {
      Text("Waiting for your portfolio snapshot. No balances are shown until it arrives.")
    }
    .foregroundStyle(numa.ink)
    .padding(.vertical, 28)
  }
}
