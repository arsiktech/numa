import Foundation
import Testing
@testable import Numa

#if DEBUG && targetEnvironment(simulator)
struct NumaTodayTests {
  @Test(arguments: [999.0, 2001.0, 3000.0])
  func foreignTransactionsOutsideRecordedPeriodKeepMonthlyTotalsAvailable(occurredAt: Double) {
    let summary = periodSummary(foreignTransactionAt: occurredAt)
    #expect(summary.income == 2840)
    #expect(summary.expenses == 1240)
    #expect(summary.cashFlow == 1600)
    #expect(summary.goalProgress == 2840.0 / 5000)
  }

  @Test(arguments: [1000.0, 1500.0, 2000.0])
  func foreignTransactionsWithinRecordedPeriodKeepMonthlyTotalsUnavailable(occurredAt: Double) {
    let summary = periodSummary(foreignTransactionAt: occurredAt)
    #expect(summary.income == nil)
    #expect(summary.expenses == nil)
    #expect(summary.cashFlow == nil)
    #expect(summary.goalProgress == nil)
  }

  @Test func missingOrInvalidPeriodProvenanceRetainsConservativeFXGuard() {
    let invalidPeriods: [(Double?, Double?, Double?)] = [
      (nil, nil, nil), (nil, 3000, 2000), (1000, nil, 2000), (1000, 3000, nil),
      (.nan, 3000, 2000), (1000, .infinity, 2000), (1000, 3000, .nan),
      (2100, 3000, 2000), (1000, 2000, 2000), (1000, 3000, 2001)
    ]
    for (start, end, through) in invalidPeriods {
      let summary = periodSummary(foreignTransactionAt: 999, start: start, end: end, through: through)
      #expect(summary.income == nil)
      #expect(summary.cashFlow == nil)
      #expect(summary.goalProgress == nil)
    }
    #expect(periodSummary(foreignTransactionAt: .nan).income == nil)
  }

  @Test func periodProvenanceDecodesAndLegacyQualityRemainsCompatible() throws {
    let data = Data("""
      {"generatedAt":2000,"validUntil":2300,"fxEstimated":true,"fxAsOf":null,
       "missingQuoteCount":0,"staleQuoteCount":0,"periodStart":1000,
       "periodEndExclusive":3000,"recordedThrough":2000}
      """.utf8)
    let quality = try JSONDecoder().decode(MobileDashboardQuality.self, from: data)
    #expect(quality.periodStart == 1000)
    #expect(quality.periodEndExclusive == 3000)
    #expect(quality.recordedThrough == 2000)
    #expect(try JSONDecoder().decode(MobileDashboardQuality.self, from: JSONEncoder().encode(quality)) == quality)
    var legacy = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    for key in ["periodStart", "periodEndExclusive", "recordedThrough"] { legacy.removeValue(forKey: key) }
    let decoded = try JSONDecoder().decode(MobileDashboardQuality.self,
      from: JSONSerialization.data(withJSONObject: legacy))
    #expect(decoded.periodStart == nil)
    #expect(decoded.periodEndExclusive == nil)
    #expect(decoded.recordedThrough == nil)
    #expect(decoded.containsRecordedTransaction(at: 999) == nil)
  }

  private func periodSummary(
    foreignTransactionAt occurredAt: Double,
    start: Double? = 1000, end: Double? = 3000, through: Double? = 2000
  ) -> NumaTodaySummary {
    let base = NumaTodayFixture.snapshot()
    var dashboard = base.dashboard
    dashboard.dataQuality = MobileDashboardQuality(
      generatedAt: 2000, validUntil: 2300, fxEstimated: true, fxAsOf: nil,
      missingQuoteCount: 0, staleQuoteCount: 0,
      periodStart: start, periodEndExclusive: end, recordedThrough: through)
    let foreign = MobileTransaction(id: "foreign", portfolioId: base.portfolio.id,
      occurredAt: occurredAt, description: "Foreign expense", categoryId: nil, accountId: nil,
      kind: "expense", amount: 10, currency: "USD", createdByUserId: "fixture-only", notes: nil)
    let snapshot = MobilePortfolioSnapshot(portfolio: base.portfolio, dashboard: dashboard,
      categories: base.categories, transactions: base.transactions + [foreign], assets: base.assets,
      liabilities: base.liabilities, holdings: base.holdings, goals: base.goals,
      recurring: base.recurring, wealthSnapshots: base.wealthSnapshots)
    return NumaTodaySummary(snapshot: snapshot, now: Date(timeIntervalSince1970: 2))
  }

  @Test func unavailableGoalProgressExplainsTheActualCause() {
    let expired = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: "expired"))
    #expect(expired.goalProgressMessage == "Progress will return when recorded income is available. Your target is kept.")
    let invalid = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(target: 0))
    #expect(invalid.goalProgressMessage == "Set a positive target to see your progress.")
    let differentCurrency = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(goalCurrency: "USD"))
    #expect(differentCurrency.goalProgressMessage == "Your goal uses a different currency. Edit it to match this space.")
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot()).goalProgressMessage == nil)
  }
  @Test(arguments: ["expired", "missingQuality"])
  func absentOrExpiredValuationDoesNotShowTotals(mode: String) {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: mode))
    #expect(summary.netWorth == nil)
    #expect(summary.cashFlow == nil)
    #expect(summary.goalProgress == nil)
    #expect(summary.qualityMessage != nil)
  }

  @Test(arguments: ["missingPrices", "stalePrices"])
  func missingPricesOnlySuppressAffectedTotals(mode: String) {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: mode))
    #expect(summary.netWorth == nil)
    #expect(summary.assets == nil)
    #expect(summary.income == 2840)
    #expect(summary.debt == 12000)
    #expect(summary.qualityMessage != nil)
  }

  @Test func estimatedFXDoesNotMasqueradeAsVerifiedWealth() {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: "estimated"))
    #expect(summary.netWorth == nil)
    #expect(summary.assets == nil)
    #expect(summary.income == 2840)
    #expect(summary.qualityMessage?.contains("estimated") == true)
  }

  @Test func cachedValuationExpiresAsTimePasses() {
    let snapshot = NumaTodayFixture.snapshot()
    let now = Date(timeIntervalSince1970: snapshot.dashboard.dataQuality!.generatedAt / 1000)
    #expect(NumaTodaySummary(snapshot: snapshot, now: now).netWorth == 86450)
    #expect(NumaTodaySummary(snapshot: snapshot, now: now.addingTimeInterval(301)).netWorth == nil)
  }

  @Test func agingInvestmentQuoteDoesNotExpireUnrelatedCashFlow() {
    let snapshot = NumaTodayFixture.snapshot(mode: "agingPrice")
    let now = Date(timeIntervalSince1970: snapshot.dashboard.dataQuality!.generatedAt / 1000)
    let later = NumaTodaySummary(snapshot: snapshot, now: now.addingTimeInterval(120))
    #expect(later.netWorth == nil)
    #expect(later.income == 2840)
    #expect(later.debt == 12000)
  }

  @Test func dashboardDecoderPreservesQualityAndAcceptsLegacyAbsence() throws {
    let original = NumaTodayFixture.snapshot().dashboard
    let encoded = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(MobileDashboard.self, from: encoded)
    #expect(decoded.dataQuality == original.dataQuality)
    var legacy = original
    legacy.dataQuality = nil
    let oldData = try JSONEncoder().encode(legacy)
    #expect(try JSONDecoder().decode(MobileDashboard.self, from: oldData).dataQuality == nil)
  }

  @Test func dashboardMetricsKeepTheirOwnMeaning() {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(monthDelta: 99999))
    #expect(summary.netWorth == 86450)
    #expect(summary.cashFlow == 1600)
    #expect(summary.income == 2840)
    #expect(summary.expenses == 1240)
    #expect(summary.assets == 98450)
    #expect(summary.debt == 12000)
    #expect(summary.currency == "EUR")
  }

  @Test func legacyMovementNeverChangesTodayMetrics() {
    let noComparison = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot())
    let unrelatedMovement = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(monthDelta: -98765))
    #expect(noComparison == unrelatedMovement)
  }

  @Test func scheduledIncomeDoesNotAdvanceAchievedProgress() {
    let snapshot = NumaTodayFixture.snapshot(income: 1000, target: 5000)
    #expect(snapshot.recurring.first?.amount == 9000)
    #expect(NumaTodaySummary(snapshot: snapshot).goalProgress == 0.2)
  }

  @Test(arguments: [0.0, -1.0, Double.nan, Double.infinity])
  func invalidGoalTargetsDoNotProduceProgress(target: Double) {
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(target: target)).goalProgress == nil)
  }

  @Test func incompleteGoalsNeverRoundUpToCompleted() {
    let below = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(income: 4999, target: 5000))
    #expect(below.goalPercent == 99)
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(income: 1450)).goalPercent == 29)
    #expect(below.goalProgress! < 1)
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(income: 5000)).goalPercent == 100)
  }

  @Test func mismatchedGoalCurrencyDoesNotInventConversion() {
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(goalCurrency: "USD")).goalProgress == nil)
  }

  @Test func unknownValuesStayUnavailable() {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: "invalid", income: .nan))
    #expect(summary.netWorth == nil)
    #expect(summary.assets == nil)
    #expect(summary.income == nil)
    #expect(summary.cashFlow == nil)
    #expect(summary.goalProgress == nil)
    #expect(summary.debt == 12000)
  }

  @Test func negativeValuesRemainNegativeAndProgressIsBounded() {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: "negative", income: -300))
    #expect(summary.netWorth == -12000)
    #expect(summary.cashFlow == -4080)
    #expect(summary.income == -300)
    #expect(summary.goalProgress == 0)
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(income: 9000)).goalProgress == 1)
  }

  @Test func emptySnapshotIsDifferentFromMissingData() {
    let summary = NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(mode: "empty"))
    #expect(summary.netWorth == 0)
    #expect(summary.cashFlow == 0)
    #expect(summary.assets == 0)
    #expect(summary.debt == 0)
    #expect(summary.goal == nil)
    #expect(summary.goalProgress == nil)
  }

  @Test(arguments: ["normal", "empty", "negative", "largeValues"])
  func syntheticFixturesReconcile(mode: String) {
    let snapshot = NumaTodayFixture.snapshot(mode: mode)
    let dashboard = snapshot.dashboard
    #expect(dashboard.netWorth == dashboard.liquid + dashboard.invested + dashboard.hardAssets - dashboard.liabilities)
    #expect(dashboard.monthCashflow == dashboard.monthIncome - dashboard.monthExpenses)
    #expect(dashboard.monthIncome == snapshot.transactions.filter { $0.kind == "income" }.reduce(0) { $0 + $1.amount })
    #expect(dashboard.monthExpenses == snapshot.transactions.filter { $0.kind == "expense" }.reduce(0) { $0 + $1.amount })
    #expect(dashboard.liquid == snapshot.assets.reduce(0) { $0 + $1.balance })
    #expect(dashboard.invested == snapshot.holdings.reduce(0) { $0 + $1.marketValue })
    #expect(dashboard.liabilities == snapshot.liabilities.reduce(0) { $0 + $1.balance })
  }

  @Test func nonFiniteValuesAndOverflowStayUnavailable() {
    #expect(NumaTodaySummary.finite(nil) == nil)
    #expect(NumaTodaySummary.finite(.nan) == nil)
    #expect(NumaTodaySummary.finite(.infinity) == nil)
    #expect(NumaTodaySummary.finite(-.infinity) == nil)
    #expect(NumaTodaySummary.finite(0) == 0)
    #expect(NumaTodaySummary(snapshot: NumaTodayFixture.snapshot(income: .greatestFiniteMagnitude, target: .leastNonzeroMagnitude)).goalProgress == nil)
  }
}
#endif
