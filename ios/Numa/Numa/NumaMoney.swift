import Foundation
import SwiftUI
@preconcurrency import ConvexMobile

/// Manual money has at most two fractional digits. Parsing is strict rather
/// than NumberFormatter's partial, lossy acceptance of malformed input.
enum NumaMoneyAmount {
  static let maximumMinor: Int64 = 9_000_000_000_000

  static func minor(_ input: String, locale: Locale = .current) -> Int64? {
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    let decimal = formatter.decimalSeparator ?? "."
    let grouping = formatter.groupingSeparator ?? ","
    var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return nil }
    // Normalize Unicode decimal digits, not arbitrary numeral characters.
    text = text.unicodeScalars.map { scalar in
      if CharacterSet.decimalDigits.contains(scalar), let digit = Character(String(scalar)).wholeNumberValue {
        return String(digit)
      }
      return String(scalar)
    }.joined()
    let parts = text.components(separatedBy: decimal)
    guard parts.count <= 2 else { return nil }
    let fractional = parts.count == 2 ? parts[1] : ""
    guard fractional.count <= 2, parts.count == 1 || !fractional.isEmpty else { return nil }
    var integer = parts[0]
    if integer.contains(grouping) {
      let groups = integer.components(separatedBy: grouping)
      let primary = max(formatter.groupingSize, 1)
      let secondary = formatter.secondaryGroupingSize > 0 ? formatter.secondaryGroupingSize : primary
      guard let first = groups.first, (1...secondary).contains(first.count),
            groups.last?.count == primary,
            groups.dropFirst().dropLast().allSatisfy({ $0.count == secondary }) else { return nil }
      integer = groups.joined()
    }
    func digits(_ value: String) -> Bool { value.utf8.allSatisfy { (48...57).contains($0) } }
    guard !integer.isEmpty, digits(integer), digits(fractional),
          let whole = Int64(integer), whole <= maximumMinor / 100,
          let fraction = Int64(fractional.padding(toLength: 2, withPad: "0", startingAt: 0)) else { return nil }
    let result = whole * 100 + fraction
    return result > 0 && result <= maximumMinor ? result : nil
  }

  static func editString(_ amount: Double, locale: Locale = .current) -> String {
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    formatter.usesGroupingSeparator = false
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    return amount.isFinite ? (formatter.string(from: NSNumber(value: amount)) ?? "") : ""
  }

  /// Legacy records are rounded individually to minor units; invalid data is
  /// unavailable, never silently replaced by zero in a financial summary.
  static func recordedMinor(_ amount: Double) -> Int64? {
    guard amount.isFinite, amount >= 0, amount <= Double(maximumMinor) / 100 else { return nil }
    guard var decimal = Decimal(string: String(amount), locale: Locale(identifier: "en_US_POSIX")) else { return nil }
    decimal *= 100
    var rounded = Decimal()
    NSDecimalRound(&rounded, &decimal, 0, .plain)
    let minor = NSDecimalNumber(decimal: rounded).int64Value
    return minor <= maximumMinor ? minor : nil
  }
}

struct MobileCashTransfer: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let fromAccountId: String
  let toAccountId: String
  let amount: Double
  let amountMinor: Double
  let currency: CurrencyCode
  let occurredAt: Double
  let description: String
  let notes: String?
  let sourceEventId: String
  let createdByUserId: String
  let createdAt: Double
  let updatedAt: Double
}

enum NumaMoneyPeriod: String, CaseIterable, Identifiable {
  case thisMonth = "This month", lastMonth = "Last month", allTime = "All time"
  var id: String { rawValue }
  static var calendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return calendar
  }
  func interval(now: Date) -> DateInterval? {
    guard self != .allTime else { return nil }
    let anchor = self == .lastMonth ? Self.calendar.date(byAdding: .month, value: -1, to: now)! : now
    return Self.calendar.dateInterval(of: .month, for: anchor)
  }
  func contains(_ milliseconds: Double, now: Date) -> Bool {
    guard milliseconds.isFinite else { return false }
    let date = Date(timeIntervalSince1970: milliseconds / 1000)
    guard date <= now else { return false }
    guard let interval = interval(now: now) else { return true }
    return date >= interval.start && date < interval.end
  }
  func label(now: Date) -> String {
    guard let interval = interval(now: now) else { return "All recorded dates · through today" }
    let formatter = DateFormatter()
    formatter.dateFormat = "MMMM yyyy"
    formatter.timeZone = Self.calendar.timeZone
    return "\(formatter.string(from: interval.start)) · UTC"
  }
}

enum NumaMoneySegment: String, CaseIterable, Identifiable {
  case cashflow = "Cashflow", expenses = "Expenses", budgets = "Budgets", all = "All"
  var id: String { rawValue }
}

enum NumaMoneyPolicy {
  static func transfers(_ snapshot: MobilePortfolioSnapshot, period: NumaMoneyPeriod,
                        query: String, now: Date) -> [MobileCashTransfer] {
    let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return (snapshot.transfers ?? []).filter { row in
      row.portfolioId == snapshot.portfolio.id && period.contains(row.occurredAt, now: now)
        && (search.isEmpty || [row.description, row.notes ?? "",
          snapshot.assets.first(where: { $0.id == row.fromAccountId })?.name ?? "",
          snapshot.assets.first(where: { $0.id == row.toAccountId })?.name ?? ""]
          .contains(where: { $0.localizedCaseInsensitiveContains(search) }))
    }.sorted { $0.occurredAt == $1.occurredAt ? $0.id < $1.id : $0.occurredAt > $1.occurredAt }
  }

  static func transactions(_ snapshot: MobilePortfolioSnapshot, segment: NumaMoneySegment,
                           period: NumaMoneyPeriod, query: String, now: Date) -> [MobileTransaction] {
    let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return snapshot.transactions.filter { row in
      row.portfolioId == snapshot.portfolio.id && period.contains(row.occurredAt, now: now)
        && (segment != .expenses || row.kind == "expense")
        && (search.isEmpty || [row.description, row.notes ?? "",
          snapshot.categories.first(where: { $0.id == row.categoryId })?.name ?? "",
          snapshot.assets.first(where: { $0.id == row.accountId })?.name ?? ""]
          .contains(where: { $0.localizedCaseInsensitiveContains(search) }))
    }.sorted { $0.occurredAt == $1.occurredAt ? $0.id < $1.id : $0.occurredAt > $1.occurredAt }
  }

  static func totalMinor(_ rows: [MobileTransaction], currency: CurrencyCode, net: Bool) -> Int64? {
    var total: Int64 = 0
    for row in rows {
      guard row.currency == currency, ["income", "expense"].contains(row.kind),
            let minor = NumaMoneyAmount.recordedMinor(row.amount) else { return nil }
      let (next, overflow) = total.addingReportingOverflow(net && row.kind == "expense" ? -minor : minor)
      guard !overflow, (-NumaMoneyAmount.maximumMinor...NumaMoneyAmount.maximumMinor).contains(next) else { return nil }
      total = next
    }
    return total
  }
}

struct NumaBudgetActual {
  let limitMinor: Int64?
  let spentMinor: Int64?
  var remainingMinor: Int64? {
    guard let limitMinor, let spentMinor else { return nil }
    return limitMinor.subtractingReportingOverflow(spentMinor).overflow ? nil : limitMinor - spentMinor
  }
  init(category: MobileCategory, snapshot: MobilePortfolioSnapshot, period: NumaMoneyPeriod, now: Date) {
    limitMinor = category.monthlyLimit.flatMap(NumaMoneyAmount.recordedMinor)
    let rows = NumaMoneyPolicy.transactions(snapshot, segment: .expenses, period: period, query: "", now: now)
      .filter { $0.categoryId == category.id }
    spentMinor = NumaMoneyPolicy.totalMinor(rows, currency: category.budgetCurrency ?? snapshot.portfolio.defaultCurrency, net: false)
  }
}

struct NumaRecurringRevenueCard: View {
  @Environment(\.numa) private var numa
  let revenue: NumaRecurringRevenue

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Recurring revenue")
          .font(.headline)
        Text("Contracted run-rate from subscriptions and retainers you marked. Not cash received.")
          .font(.caption)
          .foregroundStyle(numa.ink3)
        HStack(spacing: 12) {
          MetricTile(title: "MRR", value: formatNumaMoney(revenue.mrr, revenue.currency), tint: numa.positive)
          MetricTile(title: "ARR", value: formatNumaMoney(revenue.arr, revenue.currency), tint: numa.brand)
        }
        Text("MRR converts each subscription and retainer to a monthly amount. ARR is MRR × 12.")
          .font(.caption)
          .foregroundStyle(numa.ink3)
        if revenue.revenueSources.isEmpty {
          Text("Mark recurring income as a subscription or retainer on the web to count it.")
            .font(.footnote)
            .foregroundStyle(numa.ink3)
        } else {
          ForEach(revenue.revenueSources) { source in
            HStack {
              Text(source.source)
                .lineLimit(1)
              Spacer()
              Text("\(formatNumaMoney(source.monthly, revenue.currency))/mo")
                .font(NumaType.mono(14, .semibold))
            }
            .font(.subheadline)
            .accessibilityElement(children: .combine)
          }
        }
        if !revenue.excluded.isEmpty {
          Text("Not counted: \(revenue.excluded.map(\.description).joined(separator: ", "))")
            .font(.caption)
            .foregroundStyle(numa.ink3)
        }
      }
      .foregroundStyle(numa.ink)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityIdentifier("recurring-revenue")
  }
}

struct MoneyNativePage: View {
  @Environment(NumaAppStore.self) private var store
  @Environment(\.numa) private var numa
  @State private var segment: NumaMoneySegment = .cashflow
  @State private var period: NumaMoneyPeriod = .thisMonth
  @State private var query = ""

  var body: some View {
    NumaScreen {
      Picker("Money view", selection: $segment) {
        ForEach(NumaMoneySegment.allCases) { Text($0.rawValue).tag($0) }
      }.pickerStyle(.menu)
      Picker("Period", selection: $period) {
        ForEach(NumaMoneyPeriod.allCases.filter { segment != .budgets || $0 != .allTime }) { Text($0.rawValue).tag($0) }
      }.pickerStyle(.menu)
      Text(period.label(now: Date())).font(.caption).foregroundStyle(numa.ink3)
      if let snapshot = store.portfolioSnapshot {
        if let revenue = snapshot.revenue, segment != .budgets {
          NumaRecurringRevenueCard(revenue: revenue)
        }
        if segment == .budgets {
          NumaMoneyBudgets(snapshot: snapshot, period: period)
        } else {
          NumaTextField(title: "Search records", text: $query, placeholder: "Description, category or account")
          records(snapshot)
        }
        if store.canCapture {
          NumaPrimaryButton(title: "Add money record", systemImage: "plus") {
            store.activeSheet = .transaction(TransactionDraft())
          }
          Button("Transfer between accounts", systemImage: "arrow.left.arrow.right") {
            store.activeSheet = .transfer(NumaTransferDraft())
          }.buttonStyle(NumaSecondaryButtonStyle())
        }
      } else {
        EmptyStateCard(title: "Choose a space", message: "Load your space to see its money records.")
      }
    }
    .onChange(of: segment) { _, next in if next == .budgets && period == .allTime { period = .thisMonth } }
  }

  @ViewBuilder private func records(_ snapshot: MobilePortfolioSnapshot) -> some View {
    let now = Date()
    let rows = NumaMoneyPolicy.transactions(snapshot, segment: segment, period: period, query: query, now: now)
    let currencies = Set(rows.map(\.currency)).sorted()
    ForEach(currencies, id: \.self) { currency in
      let scoped = rows.filter { $0.currency == currency }
      let minor = NumaMoneyPolicy.totalMinor(scoped, currency: currency, net: segment != .expenses)
      MetricTile(title: segment == .expenses ? "Recorded spending · \(currency)" : "Recorded net cash flow · \(currency)",
        value: minor.map { formatNumaMoney(Double($0) / 100, currency) } ?? "Unavailable", tint: numa.ink)
    }
    if segment == .all {
      Text("Income, expenses and transfers. Transfers do not change profit or net cash flow.")
        .font(.caption).foregroundStyle(numa.ink3)
      let transfers = NumaMoneyPolicy.transfers(snapshot, period: period, query: query, now: now)
      ForEach(transfers) { transfer in
        Button { store.activeSheet = .transfer(NumaTransferDraft(transfer: transfer)) } label: {
          NumaCard {
            VStack(alignment: .leading, spacing: 6) {
              Label(transfer.description, systemImage: "arrow.left.arrow.right")
              Text(formatNumaMoney(transfer.amount, transfer.currency)).font(.headline)
              Text("Transfer · \(Date(timeIntervalSince1970: transfer.occurredAt / 1000).formatted(date: .abbreviated, time: .omitted))")
                .font(.caption)
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
        }.buttonStyle(.plain)
      }
    }
    RecentTransactionsList(transactions: rows)
  }
}

struct NumaMoneyBudgets: View {
  let snapshot: MobilePortfolioSnapshot
  let period: NumaMoneyPeriod
  @Environment(NumaAppStore.self) private var store
  @Environment(\.numa) private var numa
  var body: some View {
    Text("Monthly category limits. Each limit keeps its own currency; no conversion is assumed.")
      .font(.caption).foregroundStyle(numa.ink3)
    let categories = snapshot.categories.filter { $0.kind == "expense" }
    if categories.isEmpty {
      EmptyStateCard(title: "No expense categories", message: "This space needs expense categories before you can set budgets.")
    }
    ForEach(categories) { category in
      let actual = NumaBudgetActual(category: category, snapshot: snapshot, period: period, now: Date())
      let currency = category.budgetCurrency ?? snapshot.portfolio.defaultCurrency
      NumaCard {
        VStack(alignment: .leading, spacing: 10) {
          Text(category.name).font(.headline)
          if let limit = actual.limitMinor {
            Text("Limit \(formatNumaMoney(Double(limit) / 100, currency))")
            if let remaining = actual.remainingMinor, let spent = actual.spentMinor {
              Text(formatNumaMoney(Double(abs(remaining)) / 100, currency)).font(.largeTitle.bold())
              Text(remaining < 0 ? "Over budget" : "Remaining").foregroundStyle(remaining < 0 ? numa.negative : numa.positive)
              Text("Spent \(formatNumaMoney(Double(spent) / 100, currency))").font(.caption)
            } else {
              Text("Remaining unavailable: this category includes another currency or invalid money data.")
            }
          } else { Text("No monthly limit") }
          if snapshot.portfolio.canEdit {
            Button(category.monthlyLimit == nil ? "Set limit" : "Edit limit") {
              store.activeSheet = .budget(NumaBudgetDraft(category: category))
            }
          }
        }.frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}
