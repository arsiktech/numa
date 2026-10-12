import Foundation
import Testing
@testable import Numa

@MainActor
struct NumaMoneyTests {
  let now = Date(timeIntervalSince1970: 1789214400)

  @Test func localizedAmountsAreStrictAndRoundTrip() {
    for (locale, input) in [("en_US", "1,234.56"), ("de_DE", "1.234,56"),
                            ("fr_FR", "1\u{202f}234,56"), ("ar_EG", "١٢٣٤٫٥٦")] {
      #expect(NumaMoneyAmount.minor(input, locale: Locale(identifier: locale)) == 123456)
      let formatted = NumaMoneyAmount.editString(1234.56, locale: Locale(identifier: locale))
      #expect(NumaMoneyAmount.minor(formatted, locale: Locale(identifier: locale)) == 123456)
    }
    #expect(NumaMoneyAmount.minor("0.01", locale: Locale(identifier: "en_US")) == 1)
    #expect(NumaMoneyAmount.minor("90000000000.00", locale: Locale(identifier: "en_US")) == NumaMoneyAmount.maximumMinor)
  }

  @Test func googleSignInNeedsAppleSignInOnIOS() {
    let googleOnly = AuthCapabilityFlags(passwordReset: true, emailVerification: true, googleOAuth: true, appleOAuth: false)
    #expect(!googleOnly.canUseGoogle)
    #expect(!googleOnly.hasOAuthProvider)
    let both = AuthCapabilityFlags(passwordReset: true, emailVerification: true, googleOAuth: true, appleOAuth: true)
    #expect(both.canUseGoogle && both.canUseApple)
    #expect(!AuthCapabilityFlags.fallback.canUseGoogle)
  }

  @Test func decodesBusinessRevenueAndToleratesItsAbsence() throws {
    let revenue = """
    {"currency":"USD","valuedAt":1,"mrr":900,"arr":10800,"qualifyingRules":2,
     "revenueSources":[{"source":"Acme","monthly":500,"rules":1}],
     "scheduledMonthlyIncome":1200,"incomeSources":[{"source":"Acme","monthly":500,"rules":1}],
     "excluded":[{"id":"r1","description":"Old plan","reason":"ended"}]}
    """
    let decoded = try JSONDecoder().decode(NumaRecurringRevenue.self, from: Data(revenue.utf8))
    #expect(decoded.arr == decoded.mrr * 12)
    #expect(decoded.revenueSources.first?.id == "Acme")
    let rule = """
    {"id":"r","portfolioId":"p","description":"Plan","kind":"income","amount":99,"currency":"USD","categoryId":null,
     "accountId":null,"cadence":"monthly","startAt":0,"nextRunAt":1,"endAt":null,"notes":null,"active":true,"createdAt":0}
    """
    let legacy = try JSONDecoder().decode(MobileRecurring.self, from: Data(rule.utf8))
    #expect(legacy.revenueType == nil)
    #expect(legacy.incomeSource == nil)
  }

  @Test func rejectsSignsNonfinitePartialAndExcessPrecision() {
    for value in ["", "0", "-1", "+1", "NaN", "Infinity", "1e3", "12.345", "12.", "12,34.56", "1.2x", "90000000000.01", "99999999999999999999"] {
      #expect(NumaMoneyAmount.minor(value, locale: Locale(identifier: "en_US")) == nil, "Unexpected acceptance: \(value)")
    }
  }

  @Test func periodUsesHalfOpenUTCMonthAndExcludesFuture() throws {
    let interval = try #require(NumaMoneyPeriod.thisMonth.interval(now: now))
    #expect(NumaMoneyPeriod.thisMonth.contains(interval.start.timeIntervalSince1970 * 1000, now: now))
    #expect(!NumaMoneyPeriod.thisMonth.contains(interval.end.timeIntervalSince1970 * 1000, now: now))
    #expect(!NumaMoneyPeriod.allTime.contains(now.addingTimeInterval(1).timeIntervalSince1970 * 1000, now: now))
    #expect(!NumaMoneyPeriod.allTime.contains(.nan, now: now))
    #expect(NumaMoneyPeriod.lastMonth.interval(now: now)?.end == interval.start)
  }

  @Test func actualSegmentsSearchAndStableSort() {
    let snapshot = fixture(rows: [row("b", kind: "expense", amount: 30), row("a", kind: "income", amount: 100),
      row("old", kind: "expense", amount: 50, time: 0), row("future", kind: "expense", amount: 99, time: now.addingTimeInterval(10).timeIntervalSince1970 * 1000)])
    let expense = NumaMoneyPolicy.transactions(snapshot, segment: .expenses, period: .thisMonth, query: "", now: now)
    #expect(expense.map(\.id) == ["b"])
    let cashflow = NumaMoneyPolicy.transactions(snapshot, segment: .cashflow, period: .thisMonth, query: "", now: now)
    #expect(cashflow.map(\.id) == ["a", "b"])
    #expect(NumaMoneyPolicy.totalMinor(cashflow, currency: "EUR", net: true) == 7000)
    #expect(NumaMoneyPolicy.transactions(snapshot, segment: .all, period: .allTime, query: "FOOD", now: now).count == 3)
  }

  @Test func budgetsArePeriodBoundAndForeignAmountsRemainUnavailable() {
    #expect(NumaMoneyAmount.recordedMinor(1.005) == 101)
    #expect(NumaMoneyAmount.recordedMinor(2.675) == 268)
    #expect(NumaMoneyAmount.recordedMinor(0.0000001) == 0)
    let category = category(limit: 20)
    let snapshot = fixture(rows: [row("current", kind: "expense", amount: 30), row("old", kind: "expense", amount: 50, time: 0)], categories: [category])
    let actual = NumaBudgetActual(category: category, snapshot: snapshot, period: .thisMonth, now: now)
    #expect(actual.spentMinor == 3000)
    #expect(actual.remainingMinor == -1000)
    let foreign = fixture(rows: [row("usd", kind: "expense", amount: 10, currency: "USD")], categories: [category])
    #expect(NumaBudgetActual(category: category, snapshot: foreign, period: .thisMonth, now: now).remainingMinor == nil)
    #expect(NumaMoneyPolicy.totalMinor([row("invalid", kind: "expense", amount: .nan)], currency: "EUR", net: false) == nil)
  }

  @Test func nativePayloadPreservesCurrencyAndRejectsInvalidKind() throws {
    var draft = TransactionDraft(transaction: row("usd", kind: "expense", amount: 12.34, currency: "USD"))
    let payload = try #require(NativeTransactionAuditPayload(draft: draft, portfolioId: "fixture", currency: "EUR", createdByUserId: "qa", defaultAccountId: nil))
    #expect(payload.currency == "USD")
    #expect(payload.accountId == nil)
    #expect(payload.amount == 12.34)
    draft.kind = "transfer"
    #expect(NativeTransactionAuditPayload(draft: draft, portfolioId: "fixture", currency: "EUR", createdByUserId: "qa", defaultAccountId: nil) == nil)
    draft.kind = "expense"
    draft.occurredAt = Date(timeIntervalSince1970: 1789214400.123456)
    #expect(NativeTransactionAuditPayload(draft: draft, portfolioId: "fixture", currency: "EUR", createdByUserId: "qa", defaultAccountId: nil)?.occurredAt == 1789214400123)
  }

  @Test func transferRequiresDistinctOwnedMatchingCashAccounts() throws {
    let snapshot = fixture(rows: [])
    var draft = NumaTransferDraft()
    draft.portfolioId = "fixture"; draft.currency = "EUR"; draft.amount = NumaMoneyAmount.editString(12.34)
    draft.occurredAt = now; draft.fromAccountId = "cash-a"; draft.toAccountId = "cash-b"
    let originalKey = draft.clientMutationId
    #expect(draft.arguments(snapshot: snapshot, now: now) != nil)
    draft.occurredAt = Date(timeIntervalSince1970: 1789214399.123456)
    #expect(try draft.arguments(snapshot: snapshot, now: now)?["occurredAt"]??.convexEncode() == "1789214399123")
    #expect(draft.clientMutationId == originalKey)
    draft.toAccountId = "cash-a"
    #expect(draft.arguments(snapshot: snapshot, now: now) == nil)
    draft.toAccountId = "cash-b"; draft.currency = "USD"
    #expect(draft.arguments(snapshot: snapshot, now: now) == nil)
    draft.currency = "EUR"; draft.portfolioId = "other"
    #expect(draft.arguments(snapshot: snapshot, now: now) == nil)
  }

  @Test func snapshotExportIncludesTransfersAndRejectsMixedOwnership() throws {
    var snapshot = fixture(rows: [])
    snapshot.transfers = [MobileCashTransfer(id: "transfer", portfolioId: "other", fromAccountId: "cash-a", toAccountId: "cash-b",
      amount: 1, amountMinor: 100, currency: "EUR", occurredAt: 0, description: "Transfer", notes: nil,
      sourceEventId: "source", createdByUserId: "qa", createdAt: 0, updatedAt: 0)]
    var context = NumaSpaceContext(); context.select("fixture")
    #expect(!context.accepts(snapshot))
    let data = try JSONEncoder().encode(snapshot)
    #expect(try JSONDecoder().decode(MobilePortfolioSnapshot.self, from: data).transfers?.count == 1)
    snapshot.transfers = nil
    #expect(try JSONDecoder().decode(MobilePortfolioSnapshot.self, from: JSONEncoder().encode(snapshot)).transfers == nil)
  }

  @Test func transferSearchIncludesLinkedAccountsAndTotalsRespectServerBounds() {
    let snapshot = NumaTodayFixture.moneySnapshot()
    #expect(NumaMoneyPolicy.transfers(snapshot, period: .allTime, query: "CASH ACCOUNT", now: now).count == 1)
    #expect(NumaMoneyPolicy.transfers(snapshot, period: .allTime, query: "  ", now: now).count == 1)
    #expect(NumaMoneyPolicy.transfers(snapshot, period: .allTime, query: "no matching account", now: now).isEmpty)
    #expect(NumaMoneyPolicy.totalMinor([row("a", kind: "income", amount: 90_000_000_000),
      row("b", kind: "income", amount: 0.01)], currency: "EUR", net: true) == nil)
  }

  private func category(limit: Double = 20) -> MobileCategory {
    MobileCategory(id: "food", portfolioId: "fixture", name: "Food", kind: "expense", icon: "tag", color: "mint",
      sortOrder: 0, emoji: nil, monthlyLimit: limit, budgetCurrency: "EUR")
  }
  private func row(_ id: String, kind: String, amount: Double, currency: String = "EUR", time: Double? = nil) -> MobileTransaction {
    MobileTransaction(id: id, portfolioId: "fixture", occurredAt: time ?? now.timeIntervalSince1970 * 1000,
      description: id, categoryId: "food", accountId: nil, kind: kind, amount: amount, currency: currency, createdByUserId: "qa", notes: nil)
  }
  private func fixture(rows: [MobileTransaction], categories: [MobileCategory]? = nil) -> MobilePortfolioSnapshot {
    let base = NumaTodayFixture.snapshot()
    return MobilePortfolioSnapshot(portfolio: base.portfolio, dashboard: base.dashboard, categories: categories ?? [category()], transactions: rows,
      assets: ["cash-a", "cash-b"].map { MobileAsset(id: $0, portfolioId: "fixture", name: $0, kind: "cash", balance: 100, currency: "EUR", notes: nil, updatedAt: 0) },
      liabilities: [], holdings: [], goals: [], recurring: [], wealthSnapshots: [])
  }
}
