import Testing
@testable import Numa

@MainActor
struct NumaSpaceTests {
  @Test func contextsRejectPreviousAndMixedSnapshots() {
    let a = NumaTodayFixture.snapshot()
    let b = NumaTodayFixture.snapshot(spaceID: "business", name: "Studio", currency: "USD", business: true)
    var context = NumaSpaceContext()
    context.select(a.portfolio.id)
    let original = context
    #expect(context.accepts(a))
    #expect(!context.accepts(b))
    context.select(b.portfolio.id)
    #expect(context.accepts(b))
    context.select(a.portfolio.id)
    #expect(context != original)
    let mixed = MobilePortfolioSnapshot(portfolio: a.portfolio, dashboard: a.dashboard,
      categories: a.categories, transactions: b.transactions, assets: a.assets, liabilities: a.liabilities,
      holdings: a.holdings, goals: a.goals, recurring: a.recurring, wealthSnapshots: a.wealthSnapshots)
    #expect(!context.accepts(mixed))
  }

  @Test func switchingClearsDataDraftsAndRejectsLateResults() {
    let store = NumaAppStore(session: NumaSessionStore(deploymentURL: "http://127.0.0.1:1"))
    let a = NumaTodayFixture.snapshot()
    let b = NumaTodayFixture.snapshot(spaceID: "business", name: "Studio", currency: "USD", business: true)
    store.portfolios = [a.portfolio, b.portfolio]
    store.beginSpaceSelection(a.portfolio.id)
    let old = store.spaceContext
    store.acceptSpaceSnapshot(a, context: old)
    store.activeSheet = .transaction(TransactionDraft())
    store.beginSpaceSelection(b.portfolio.id)
    #expect(store.portfolioSnapshot == nil)
    #expect(store.activeSheet == nil)
    #expect(store.currency == "USD")
    #expect(!store.canCapture)
    store.acceptSpaceSnapshot(a, context: old)
    #expect(store.portfolioSnapshot == nil)
    store.acceptSpaceSnapshot(b, context: store.spaceContext)
    #expect(store.portfolioSnapshot?.portfolio.id == "business")
    store.failSpace(context: old, message: "Late error")
    #expect(store.portfolioSnapshot != nil)
    let failedContext = store.spaceContext
    store.saving = true
    store.failSpace(context: failedContext, message: "Revoked")
    #expect(!store.saving)
    #expect(store.spaceContext != failedContext)
    store.acceptSpaceSnapshot(b, context: failedContext)
    #expect(store.portfolioSnapshot == nil)
    #expect(!store.canCapture)
    store.reset()
    store.acceptSpaceSnapshot(b, context: old)
    #expect(store.portfolios.isEmpty)
    #expect(store.selectedPortfolioId == nil)
  }

  @Test func membershipLossAndDowngradeInvalidateBusyWork() {
    let store = NumaAppStore(session: NumaSessionStore(deploymentURL: "http://127.0.0.1:1"))
    let a = NumaTodayFixture.snapshot()
    store.portfolios = [a.portfolio]
    store.beginSpaceSelection(a.portfolio.id)
    store.acceptSpaceSnapshot(a, context: store.spaceContext)
    let old = store.spaceContext
    store.saving = true
    store.applySpaces([])
    #expect(!store.saving)
    #expect(store.spaceContext != old)
    #expect(store.portfolioSnapshot == nil)
    store.portfolios = [a.portfolio]
    store.beginSpaceSelection(a.portfolio.id)
    store.acceptSpaceSnapshot(a, context: store.spaceContext)
    let viewer = MobilePortfolio(id: a.portfolio.id, name: "Personal", type: "personal", tagline: "",
      defaultCurrency: "EUR", role: "viewer", ownershipBps: 10000, createdAt: 0)
    let editableContext = store.spaceContext
    store.saving = true
    store.applySpaces([viewer])
    #expect(!store.saving)
    #expect(store.spaceContext != editableContext)
    #expect(!store.canCapture)
  }

  @Test func draftNeverRebindsAcrossSpacesOrRoundTrips() {
    var context = NumaSpaceContext()
    context.select("a")
    var draft = TransactionDraft()
    draft.bind(to: context)
    let initial = draft.spaceContext
    context.select("b")
    draft.bind(to: context)
    #expect(draft.portfolioId == "a")
    #expect(draft.spaceContext == initial)
    context.select("a")
    #expect(draft.spaceContext != context)
    var existing = AssetDraft(asset: NumaTodayFixture.snapshot().assets[0])
    existing.bind(to: context)
    #expect(existing.portfolioId == "fixture")
  }

  @Test func ownershipIsExplicitOptionalAndBounded() throws {
    func intent(_ value: String) -> NumaSpaceCreateIntent {
      NumaSpaceCreateIntent(name: "Studio", kind: "business", currency: "USD", ownership: value)
    }
    #expect(try intent("").ownershipBps() == nil)
    #expect(try intent("0").ownershipBps() == 0)
    #expect(try intent("12,50").ownershipBps() == 1250)
    #expect(try intent("100").ownershipBps() == 10000)
    for value in ["101", "-1", "nan", "12.345"] {
      #expect(throws: NumaSpaceError.self) { try intent(value).ownershipBps() }
    }
    #expect(NumaTodayFixture.snapshot(business: true).portfolio.businessOwnershipBps == nil)
  }

  @Test func unauthenticatedPreviewCannotCreateOrWrite() async {
    let store = NumaAppStore(session: NumaSessionStore(deploymentURL: "http://127.0.0.1:1"))
    let snapshot = NumaTodayFixture.snapshot()
    store.portfolios = [snapshot.portfolio]
    store.beginSpaceSelection(snapshot.portfolio.id)
    store.acceptSpaceSnapshot(snapshot, context: store.spaceContext)
    #expect(throws: (any Error).self) { try store.beginSpaceLease() }
    let error = await store.createSpace(NumaSpaceCreateIntent(name: "Studio", kind: "business", currency: "EUR", ownership: ""), requestId: "preview")
    #expect(error != nil)
    #expect(!store.saving)
  }
}
