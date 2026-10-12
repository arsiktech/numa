import XCTest
import UIKit
@testable import Numa

final class PodStoreTests: XCTestCase {
  func testMonthlyIncomeTargetStartsEmptyAndPreservesSavedCents() {
    XCTAssertEqual(MonthlyIncomeTargetDraft(goal: nil, defaultCurrency: "USD").target, "")
    let goal = MobileGoal(
      id: "goal", portfolioId: "portfolio", scope: "monthly_income", target: 1500.75,
      currency: "EUR", startAt: 0, deadline: nil, label: nil, categoryId: nil,
      assetId: nil, holdingId: nil, createdAt: 0
    )
    let draft = MonthlyIncomeTargetDraft(goal: goal, defaultCurrency: "USD")
    XCTAssertEqual(draft.target, "1500.75")
    XCTAssertEqual(draft.currency, "EUR")
  }

  func testNativeEnvironmentKeepsAPIAndConvexIdentityPaired() {
    XCTAssertEqual(
      NumaConfigDev.current.apiConvexDeploymentURL,
      NumaConfigDev.current.convexDeploymentURL
    )
    XCTAssertEqual(
      NumaConfigProd.current.apiConvexDeploymentURL,
      NumaConfigProd.current.convexDeploymentURL
    )
    XCTAssertNotEqual(NumaConfigDev.current.webAppURL, NumaConfigProd.current.webAppURL)
  }

  func testAuthCapabilityLoadRetriesAfterTransientFailure() {
    var state = NumaAuthFlagsLoadState()
    XCTAssertTrue(state.begin())
    XCTAssertFalse(state.begin())
    state.finish(success: false)
    XCTAssertTrue(state.begin())
    state.finish(success: true)
    XCTAssertFalse(state.begin())
  }

  func testClientMutationIdCarriesOperationName() {
    let id = ClientMutationID.make("mobile.createExpense")
    XCTAssertTrue(id.hasPrefix("mobile.createExpense:ios:"))
  }

  func testMoneyFormatterUsesCurrencyCode() {
    let formatted = formatNumaMoney(12.5, "EUR")
    XCTAssertTrue(formatted.contains("12") || formatted.contains("€"))
  }

  func testNativePasswordPolicyMatchesAcceptedWebVector() {
    let result = NumaPasswordPolicy.validate("River!42Market")
    XCTAssertTrue(result.isValid)
    XCTAssertEqual(result.issues, [])
  }

  func testNativePasswordPolicyUsesJavaScriptUTF16Length() {
    XCTAssertTrue(NumaPasswordPolicy.validate("Aa1😀😀😀😀").isValid)
  }

  func testNativePasswordPolicyMatchesServerForDecomposedUnicode() {
    let decomposedRepeat = "Aa1" + String(repeating: "e\u{301}", count: 5)
    XCTAssertTrue(NumaPasswordPolicy.validate(decomposedRepeat).isValid)

    let personal = NumaPasswordPolicy.validate(
      "Safe!42e\u{301}ric",
      email: "e\u{301}ric@example.com"
    )
    XCTAssertTrue(personal.issues.contains(.personalInfo))
    XCTAssertTrue(
      NumaPasswordPolicy.validate("Safe!42abco", email: "a@b.co").isValid
    )
  }

  func testNativePasswordPolicyRejectsCommonSubstitutionsAndSequences() {
    XCTAssertTrue(
      NumaPasswordPolicy.validate("P@ssw0rd123!").issues.contains(.commonPassword)
    )
    let testSequence = NumaPasswordPolicy.validate("Test1234!!!")
    XCTAssertTrue(testSequence.issues.contains(.commonPassword))
    XCTAssertTrue(testSequence.issues.contains(.sequentialCharacters))
    XCTAssertTrue(
      NumaPasswordPolicy.validate("Abcdef!2026").issues.contains(.sequentialCharacters)
    )
  }

  func testNativePasswordPolicyRejectsRepeatedCharactersAndIdentity() {
    XCTAssertTrue(
      NumaPasswordPolicy.validate("Aaaaaa!2026").issues.contains(.repeatedCharacters)
    )
    let personal = NumaPasswordPolicy.validate(
      "Arseny!2026",
      email: "owner@example.com",
      displayName: "Arseny"
    )
    XCTAssertTrue(personal.issues.contains(.personalInfo))
    XCTAssertTrue(
      NumaPasswordPolicy.validate(
        "Sunny2121!Safe",
        email: "sunny2121@example.com"
      ).issues.contains(.personalInfo)
    )
  }

  @MainActor
  func testPasswordAuthTransitionAppliesTokenResponse() async {
    let tokens = AuthTokens(token: "signed-in-token", refreshToken: "refresh-token")
    var appliedTokens: AuthTokens?

    let result = await NumaPasswordAuthTransition.resolve(tokens: tokens) { received in
      appliedTokens = received
      return true
    }

    XCTAssertEqual(result, .signedIn)
    XCTAssertEqual(appliedTokens, tokens)
  }

  @MainActor
  func testPasswordAuthTransitionOpensVerificationWithoutApplyingTokens() async {
    var applyCount = 0

    let result = await NumaPasswordAuthTransition.resolve(tokens: nil) { _ in
      applyCount += 1
      return true
    }

    XCTAssertEqual(result, .verificationPending)
    XCTAssertEqual(applyCount, 0)
  }

  func testNativeDeletionRecoveryClearsDeadlineOnlyAfterServerCancellation() throws {
    let data = Data(#"""
      {
        "id": "profile-1",
        "userId": "user-1",
        "email": "user@numa.app",
        "displayName": "Numa User",
        "defaultCurrency": "EUR",
        "theme": "auto",
        "locale": "en",
        "appMode": "advanced",
        "themeKey": "citrus",
        "primaryJob": null,
        "starterTemplate": null,
        "onboardingCompletedAt": 1,
        "deletionScheduledAt": 1800000000000,
        "createdAt": 1700000000000
      }
      """#.utf8)
    let scheduled = try JSONDecoder().decode(MobileProfile.self, from: data)
    XCTAssertEqual(scheduled.deletionScheduledAt, 1_800_000_000_000)

    var failedCancellation = scheduled
    XCTAssertEqual(
      NumaDeletionRecoveryTransition.resolve(
        profile: &failedCancellation,
        response: MobileDeletionCancellationResponse(ok: false, reason: "already-deleted"),
        now: 1_800_000_000_001
      ),
      .alreadyDeleted
    )
    XCTAssertEqual(failedCancellation.deletionScheduledAt, 1_800_000_000_000)
    XCTAssertEqual(failedCancellation.deletionStartedAt, 1_800_000_000_001)

    var startedCancellation = scheduled
    XCTAssertEqual(
      NumaDeletionRecoveryTransition.resolve(
        profile: &startedCancellation,
        response: MobileDeletionCancellationResponse(ok: false, reason: "already-started"),
        now: 1_800_000_000_002
      ),
      .alreadyStarted
    )
    XCTAssertEqual(startedCancellation.deletionStartedAt, 1_800_000_000_002)

    var canceled = scheduled
    XCTAssertEqual(
      NumaDeletionRecoveryTransition.resolve(
        profile: &canceled,
        response: MobileDeletionCancellationResponse(ok: true, reason: nil)
      ),
      .canceled
    )
    XCTAssertNil(canceled.deletionScheduledAt)
    XCTAssertNil(canceled.deletionStartedAt)

    var schedulerUpdate = canceled
    NumaDeletionRecoveryTransition.applyLifecycle(
      profile: &schedulerUpdate,
      scheduledAt: 1_800_000_000_000,
      startedAt: 1_800_000_000_010
    )
    XCTAssertEqual(schedulerUpdate.deletionScheduledAt, 1_800_000_000_000)
    XCTAssertEqual(schedulerUpdate.deletionStartedAt, 1_800_000_000_010)
  }

  func testNativeCreateDraftsReuseOneMutationIdentityAcrossTransportRetry() {
    var asset = AssetDraft()
    var liability = LiabilityDraft()
    var holding = HoldingDraft()
    var goal = MonthlyIncomeTargetDraft(goal: nil, defaultCurrency: "EUR")
    let originalIds = [
      asset.clientMutationId,
      liability.clientMutationId,
      holding.clientMutationId,
      goal.clientMutationId
    ]

    // A response-loss retry edits and resubmits the same sheet state. These
    // operation IDs must survive so Convex mutation receipts replay the first
    // committed row instead of inserting a duplicate.
    asset.balance = "100"
    liability.balance = "200"
    holding.quantity = "3"
    goal.target = "50000"

    XCTAssertEqual(
      [
        asset.clientMutationId,
        liability.clientMutationId,
        holding.clientMutationId,
        goal.clientMutationId
      ],
      originalIds
    )
    XCTAssertEqual(Set(originalIds).count, 4)
  }

  func testReviewedTransactionRetainsAuditCreateIdentityAcrossResponseLoss() {
    var draft = TransactionDraft()
    let createRequestId = draft.auditCreateRequestId
    draft.description = "Coffee"
    draft.amount = "4.50"

    XCTAssertEqual(draft.auditCreateRequestId, createRequestId)
  }

  func testDuplicateCaptureLinesUseDistinctStableIntentKeys() {
    let transaction = CaptureTransaction(
      kind: "expense",
      amount: 4.5,
      currency: "EUR",
      description: "Coffee",
      merchantOrCounterparty: nil,
      occurredAt: "2026-08-23",
      suggestedCategoryId: nil,
      suggestedCategoryName: nil,
      notes: nil,
      confidence: CaptureConfidence(
        amount: 1,
        currency: 1,
        description: 1,
        category: 1,
        date: 1
      )
    )
    let source = TransactionCaptureSource.receipt(summary: "Two coffees")

    let first = nativeCaptureRowIntentKey(index: 0, transaction: transaction, source: source)
    let second = nativeCaptureRowIntentKey(index: 1, transaction: transaction, source: source)
    XCTAssertNotEqual(first, second)
    XCTAssertEqual(
      first,
      nativeCaptureRowIntentKey(index: 0, transaction: transaction, source: source)
    )
  }

  func testCaptureCreateIntentRotatesOnlyAfterDraftOpens() {
    let current = "aiActions.createDraft:ios:stable"
    XCTAssertEqual(
      nextNativeCaptureCreateRequestId(current: current, draftOpened: false),
      current
    )
    XCTAssertNotEqual(
      nextNativeCaptureCreateRequestId(current: current, draftOpened: true),
      current
    )
  }

  func testOnboardingPolicyUsesCloudCompletionAsSourceOfTruth() {
    XCTAssertEqual(
      NumaOnboardingPolicy.decision(
        localCompleted: false,
        cloudCompletedAt: 123,
        hasRealData: false
      ),
      .ready
    )
    XCTAssertEqual(
      NumaOnboardingPolicy.decision(
        localCompleted: true,
        cloudCompletedAt: nil,
        hasRealData: false
      ),
      .persistThenReady
    )
    XCTAssertEqual(
      NumaOnboardingPolicy.decision(
        localCompleted: false,
        cloudCompletedAt: nil,
        hasRealData: true
      ),
      .persistThenReady
    )
    XCTAssertEqual(
      NumaOnboardingPolicy.decision(
        localCompleted: false,
        cloudCompletedAt: nil,
        hasRealData: false
      ),
      .show
    )
  }

  @MainActor
  func testNativeAIRequestBuilderBoundsPromptAndPortfolioSnapshot() throws {
    let body = try NumaCaptureClient.makeChatBody(
      prompt: String(repeating: "😀", count: 4_100),
      snapshot: makeOversizedPortfolioSnapshot(),
      locale: String(repeating: "e", count: 30)
    )

    let messages = try XCTUnwrap(body["messages"] as? [[String: Any]])
    let content = try XCTUnwrap(messages.first?["content"] as? String)
    XCTAssertLessThanOrEqual(content.utf16.count, 4_000)
    XCTAssertLessThanOrEqual(try XCTUnwrap(body["locale"] as? String).utf16.count, 16)

    let context = try XCTUnwrap(body["context"] as? [String: Any])
    let portfolio = try XCTUnwrap(context["portfolio"] as? [String: Any])
    XCTAssertLessThanOrEqual(try XCTUnwrap(portfolio["name"] as? String).utf16.count, 100)

    let categories = try XCTUnwrap(context["categories"] as? [[String: Any]])
    let transactions = try XCTUnwrap(context["recentTransactions"] as? [[String: Any]])
    let assets = try XCTUnwrap(context["assets"] as? [[String: Any]])
    let liabilities = try XCTUnwrap(context["liabilitiesDetail"] as? [[String: Any]])
    XCTAssertEqual(categories.count, 100)
    XCTAssertEqual(transactions.count, 80)
    XCTAssertEqual(assets.count, 100)
    XCTAssertEqual(liabilities.count, 100)
    XCTAssertTrue(categories.allSatisfy {
      (($0["id"] as? String)?.utf16.count ?? .max) <= 128
        && (($0["name"] as? String)?.utf16.count ?? .max) <= 100
    })
    XCTAssertTrue(transactions.allSatisfy {
      (($0["description"] as? String)?.utf16.count ?? .max) <= 200
    })
  }

  @MainActor
  func testNativeReceiptBuilderBoundsTextAndContext() throws {
    let body = try NumaCaptureClient.makeReceiptTextBody(
      text: "  \(String(repeating: "voice entry ", count: 500))  ",
      snapshot: makeOversizedPortfolioSnapshot(),
      locale: String(repeating: "l", count: 30)
    )

    let text = try XCTUnwrap(body["text"] as? String)
    XCTAssertLessThanOrEqual(text.utf16.count, 4_000)
    XCTAssertEqual(text, text.trimmingCharacters(in: .whitespacesAndNewlines))
    let context = try XCTUnwrap(body["portfolioContext"] as? [String: Any])
    let categories = try XCTUnwrap(context["categories"] as? [[String: Any]])
    XCTAssertEqual(categories.count, 100)
    XCTAssertLessThanOrEqual(try XCTUnwrap(context["portfolioName"] as? String).utf16.count, 100)
  }

  @MainActor
  func testNativeReceiptBuilderDownsamplesLargePhotoBelowAPILimit() throws {
    let oversizedPhoto = try makeLargePhotoData()
    XCTAssertGreaterThan(oversizedPhoto.count, 4_500_000)

    let body = try NumaCaptureClient.makeReceiptImageBody(
      imageData: oversizedPhoto,
      snapshot: makeOversizedPortfolioSnapshot(),
      locale: "en"
    )
    let dataURL = try XCTUnwrap(body["image"] as? String)
    XCTAssertTrue(dataURL.hasPrefix("data:image/jpeg;base64,"))
    XCTAssertLessThanOrEqual(dataURL.utf16.count, 6_000_000)

    let base64 = String(dataURL.dropFirst("data:image/jpeg;base64,".count))
    let encoded = try XCTUnwrap(Data(base64Encoded: base64))
    let image = try XCTUnwrap(UIImage(data: encoded))
    XCTAssertLessThanOrEqual(max(image.size.width, image.size.height), 1_280)
  }

  @MainActor
  func testNativeCaptureRequestCapturesOneBearerIdentity() throws {
    let provider = NumaConvexAuthProvider()
    provider.setToken("account-a-token")
    var providerCalls = 0
    let request = try NumaCaptureClient.makeRequest(
      url: try XCTUnwrap(URL(string: "https://numa.example/api/chat")),
      body: ["messages": []],
      tokenProvider: {
        providerCalls += 1
        return provider.currentToken()
      }
    )

    provider.setToken("account-b-token")
    XCTAssertEqual(providerCalls, 1)
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer account-a-token")
    XCTAssertEqual(
      request.value(forHTTPHeaderField: "X-Numa-Convex-Deployment"),
      NumaConfig.current.apiConvexDeploymentURL
    )
  }

  func testCachedAuthRefreshReplacesExpiredTokenWithoutDeferredSDKCallback() async throws {
    let callbackToken = LockedStringBox()
    let generation = NumaSessionGeneration()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in
        AuthTokens(token: "fresh-account-token", refreshToken: "fresh-refresh-token")
      }
    )
    provider.setToken("expired-account-token")

    let token = try await provider.loginFromCache { next in
      callbackToken.set(next)
    }

    XCTAssertEqual(token, "fresh-account-token")
    XCTAssertEqual(provider.currentToken(), "fresh-account-token")
    XCTAssertNil(callbackToken.value)
  }

  func testDelayedRefreshCannotOverwriteSignedOutOrReplacementAccount() async throws {
    let generation = NumaSessionGeneration()
    let started = expectation(description: "refresh started")
    let release = AsyncLatch()
    let persistedToken = LockedStringBox()
    let callbackToken = LockedStringBox()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in
        started.fulfill()
        await release.wait()
        return AuthTokens(token: "account-a-token", refreshToken: "account-a-refresh")
      },
      persistTokens: { tokens in persistedToken.set(tokens.token) }
    )
    provider.setToken("expired-account-a-token")

    let refreshTask = Task { () -> Error? in
      do {
        _ = try await provider.loginFromCache { next in callbackToken.set(next) }
        return nil
      } catch {
        return error
      }
    }
    await fulfillment(of: [started], timeout: 2)
    generation.advance { provider.setToken("account-b-token") }
    await release.open()

    let error = await refreshTask.value
    guard let authError = error as? NumaAuthError,
          case .staleSession = authError
    else {
      return XCTFail("Expected stale-session rejection, got \(String(describing: error))")
    }
    XCTAssertEqual(provider.currentToken(), "account-b-token")
    XCTAssertNil(persistedToken.value)
    XCTAssertNil(callbackToken.value)
  }

  func testDelayedRefreshFailureCannotClearReplacementAccount() async throws {
    let generation = NumaSessionGeneration()
    let started = expectation(description: "refresh started")
    let release = AsyncLatch()
    let callbackToken = LockedStringBox()
    let callbackCount = LockedIntBox()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in
        started.fulfill()
        await release.wait()
        throw NumaAuthError.invalidResponse
      }
    )
    provider.setToken("expired-account-a-token")

    let refreshTask = Task { () -> Error? in
      do {
        _ = try await provider.loginFromCache { next in
          callbackToken.set(next)
          callbackCount.increment()
        }
        return nil
      } catch {
        return error
      }
    }
    await fulfillment(of: [started], timeout: 2)
    generation.advance { provider.setToken("account-b-token") }
    await release.open()

    let error = await refreshTask.value
    guard let authError = error as? NumaAuthError,
          case .staleSession = authError
    else {
      return XCTFail("Expected stale-session rejection, got \(String(describing: error))")
    }
    XCTAssertEqual(provider.currentToken(), "account-b-token")
    XCTAssertNil(callbackToken.value)
    XCTAssertEqual(callbackCount.value, 0)
  }

  func testStaleRefreshPreflightCannotReadReplacementCredential() async throws {
    let generation = NumaSessionGeneration()
    let staleGeneration = generation.snapshot()
    let credentialReads = LockedIntBox()
    let exchanges = LockedIntBox()
    generation.advance()

    do {
      _ = try await NumaGenerationBoundRefresh.perform(
        generation: generation,
        expectedGeneration: staleGeneration,
        readRefreshToken: {
          credentialReads.increment()
          return "account-b-refresh-token"
        },
        exchange: { _ in
          exchanges.increment()
          return AuthTokens(token: "unexpected", refreshToken: "unexpected")
        }
      )
      XCTFail("Expected the stale refresh to be rejected before reading credentials")
    } catch let error as NumaAuthError {
      guard case .staleSession = error else {
        return XCTFail("Expected stale-session rejection, got \(error)")
      }
    }

    XCTAssertEqual(credentialReads.value, 0)
    XCTAssertEqual(exchanges.value, 0)
  }

  func testCurrentGenerationTransportFailurePreservesSavedSession() async throws {
    let generation = NumaSessionGeneration()
    let callbackCount = LockedIntBox()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in throw URLError(.notConnectedToInternet) }
    )
    provider.setToken("cached-account-token")

    do {
      _ = try await provider.loginFromCache { _ in callbackCount.increment() }
      XCTFail("Expected the offline refresh to fail")
    } catch let error as URLError {
      XCTAssertEqual(error.code, .notConnectedToInternet)
    }

    XCTAssertEqual(provider.currentToken(), "cached-account-token")
    XCTAssertEqual(callbackCount.value, 0)
  }

  func testRejectedRefreshClearsProviderWithoutDeferredSDKCallback() async throws {
    let generation = NumaSessionGeneration()
    let callbackCount = LockedIntBox()
    let callbackToken = LockedStringBox()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in throw NumaAuthError.refreshTokenRejected }
    )
    provider.setToken("revoked-account-token")

    do {
      _ = try await provider.loginFromCache { next in
        callbackToken.set(next)
        callbackCount.increment()
      }
      XCTFail("Expected the rejected refresh to fail")
    } catch let error as NumaAuthError {
      guard case .refreshTokenRejected = error else {
        return XCTFail("Expected refresh-token rejection, got \(error)")
      }
    }

    XCTAssertNil(provider.currentToken())
    XCTAssertNil(callbackToken.value)
    XCTAssertEqual(callbackCount.value, 0)
    XCTAssertTrue(
      NumaRefreshFailurePolicy.invalidatesSavedSession(NumaAuthError.refreshTokenRejected)
    )
    XCTAssertFalse(
      NumaRefreshFailurePolicy.invalidatesSavedSession(URLError(.timedOut))
    )
  }

  func testAuthProviderNeverSchedulesDeferredSDKCallbackAcrossAccounts() async throws {
    let generation = NumaSessionGeneration()
    let callbackScheduled = LockedIntBox()
    let callbackToken = LockedStringBox()
    let callbackRelease = AsyncLatch()
    let callbackFinished = AsyncLatch()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in
        AuthTokens(token: "account-a-token", refreshToken: "account-a-refresh")
      }
    )
    provider.setToken("expired-account-a-token")

    _ = try await provider.loginFromCache { next in
      callbackScheduled.increment()
      Task {
        await callbackRelease.wait()
        callbackToken.set(next)
        await callbackFinished.open()
      }
    }
    generation.advance { provider.setToken("account-b-token") }

    if callbackScheduled.value > 0 {
      await callbackRelease.open()
      await callbackFinished.wait()
    }

    XCTAssertEqual(callbackScheduled.value, 0)
    XCTAssertNil(callbackToken.value)
    XCTAssertEqual(provider.currentToken(), "account-b-token")
  }

  @MainActor
  func testTerminalRefreshSignalClearsFakeBridgeThroughGenerationGate() async throws {
    let generation = NumaSessionGeneration()
    let gate = NumaAuthOperationGate()
    let fakeBridgeToken = LockedStringBox()
    let logoutCount = LockedIntBox()
    let callbackCount = LockedIntBox()
    let handled = AsyncLatch()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in throw NumaAuthError.refreshTokenRejected }
    )
    provider.setToken("revoked-account-token")
    fakeBridgeToken.set("revoked-account-token")
    provider.setTerminalRejectionHandler { rejectedGeneration in
      Task { @MainActor in
        await gate.run {
          if generation.isCurrent(rejectedGeneration) {
            generation.advance { fakeBridgeToken.set(nil) }
            logoutCount.increment()
          }
        }
        await handled.open()
      }
    }

    do {
      _ = try await provider.loginFromCache { _ in callbackCount.increment() }
      XCTFail("Expected terminal refresh rejection")
    } catch let error as NumaAuthError {
      guard case .refreshTokenRejected = error else {
        return XCTFail("Expected refresh-token rejection, got \(error)")
      }
    }
    await handled.wait()

    XCTAssertNil(provider.currentToken())
    XCTAssertNil(fakeBridgeToken.value)
    XCTAssertEqual(logoutCount.value, 1)
    XCTAssertEqual(callbackCount.value, 0)
  }

  func testDelayedTerminalRejectionCannotSignalReplacementLogout() async throws {
    let generation = NumaSessionGeneration()
    let started = expectation(description: "terminal refresh started")
    let release = AsyncLatch()
    let terminalSignals = LockedIntBox()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: generation,
      refreshTokens: { _ in
        started.fulfill()
        await release.wait()
        throw NumaAuthError.refreshTokenRejected
      }
    )
    provider.setTerminalRejectionHandler { _ in terminalSignals.increment() }
    provider.setToken("expired-account-a-token")

    let refreshTask = Task { () -> Error? in
      do {
        _ = try await provider.loginFromCache { _ in }
        return nil
      } catch {
        return error
      }
    }
    await fulfillment(of: [started], timeout: 2)
    generation.advance { provider.setToken("account-b-token") }
    await release.open()

    let error = await refreshTask.value
    guard let authError = error as? NumaAuthError,
          case .staleSession = authError
    else {
      return XCTFail("Expected stale-session rejection, got \(String(describing: error))")
    }
    XCTAssertEqual(provider.currentToken(), "account-b-token")
    XCTAssertEqual(terminalSignals.value, 0)
  }

  @MainActor
  func testAccountDeletionClearsLocalSessionOnlyAfterServerSuccess() async throws {
    let generation = NumaSessionGeneration()
    let expected = generation.snapshot()
    let deleteCalls = LockedIntBox()
    let clearCalls = LockedIntBox()

    try await NumaAccountDeletionTransition.perform(
      generation: generation,
      deleteRemote: {
        deleteCalls.increment()
      },
      clearLocalSession: {
        clearCalls.increment()
        generation.advance()
      }
    )

    XCTAssertEqual(deleteCalls.value, 1)
    XCTAssertEqual(clearCalls.value, 1)
    XCTAssertFalse(generation.isCurrent(expected))
  }

  @MainActor
  func testAccountDeletionFailurePreservesCurrentLocalSession() async {
    let generation = NumaSessionGeneration()
    let expected = generation.snapshot()
    let clearCalls = LockedIntBox()

    do {
      try await NumaAccountDeletionTransition.perform(
        generation: generation,
        deleteRemote: {
          throw NumaAuthError.invalidResponse
        },
        clearLocalSession: {
          clearCalls.increment()
          generation.advance()
        }
      )
      XCTFail("Expected remote deletion failure")
    } catch let error as NumaAuthError {
      guard case .invalidResponse = error else {
        return XCTFail("Expected invalid-response error, got \(error)")
      }
    } catch {
      XCTFail("Expected NumaAuthError, got \(error)")
    }

    XCTAssertEqual(clearCalls.value, 0)
    XCTAssertTrue(generation.isCurrent(expected))
  }

  @MainActor
  func testNativeCaptureRetriesOneUnauthorizedResponseWithFreshToken() async throws {
    let sessionGeneration = NumaSessionGeneration()
    let authorization = NumaAPIRequestLease(
      sessionGeneration: sessionGeneration,
      expectedGeneration: sessionGeneration.snapshot()
    )
    var tokens = ["expired-token", "fresh-token"]
    var authorizationHeaders: [String] = []
    let url = try XCTUnwrap(URL(string: "https://numa.example/api/chat"))

    let (data, response) = try await NumaCaptureClient.sendAuthorized(
      url: url,
      body: ["messages": []],
      authorization: authorization,
      tokenProvider: { lease in
        guard !tokens.isEmpty else { throw NumaAuthError.missingToken }
        return NumaAPIBearer(token: tokens.removeFirst(), lease: lease)
      },
      transport: { request in
        authorizationHeaders.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
        let status = authorizationHeaders.count == 1 ? 401 : 200
        return (
          Data("ok".utf8),
          try XCTUnwrap(HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: nil,
            headerFields: nil
          ))
        )
      }
    )

    XCTAssertEqual(String(data: data, encoding: .utf8), "ok")
    XCTAssertEqual(response.statusCode, 200)
    XCTAssertEqual(authorizationHeaders, ["Bearer expired-token", "Bearer fresh-token"])
  }

  func testDelayedUnauthorizedCaptureCannotRetryAcrossAccountGeneration() async throws {
    let sessionGeneration = NumaSessionGeneration()
    let authorization = NumaAPIRequestLease(
      sessionGeneration: sessionGeneration,
      expectedGeneration: sessionGeneration.snapshot()
    )
    let firstTransportStarted = expectation(description: "first capture transport started")
    let releaseFirstTransport = AsyncLatch()
    let tokenCalls = LockedIntBox()
    let transportCalls = LockedIntBox()
    let url = try XCTUnwrap(URL(string: "https://numa.example/api/chat"))

    let requestTask = Task { @MainActor () -> Error? in
      do {
        _ = try await NumaCaptureClient.sendAuthorized(
          url: url,
          body: ["context": ["portfolioName": "Account A"]],
          authorization: authorization,
          tokenProvider: { lease in
            tokenCalls.increment()
            guard lease.isCurrent() else { throw NumaAuthError.staleSession }
            return NumaAPIBearer(token: "account-a-token", lease: lease)
          },
          transport: { _ in
            transportCalls.increment()
            firstTransportStarted.fulfill()
            await releaseFirstTransport.wait()
            return (
              Data(),
              try XCTUnwrap(HTTPURLResponse(
                url: url,
                statusCode: 401,
                httpVersion: nil,
                headerFields: nil
              ))
            )
          }
        )
        return nil
      } catch {
        return error
      }
    }

    await fulfillment(of: [firstTransportStarted], timeout: 2)
    sessionGeneration.advance()
    await releaseFirstTransport.open()

    let error = await requestTask.value
    guard let authError = error as? NumaAuthError,
          case .staleSession = authError
    else {
      return XCTFail("Expected stale-session rejection, got \(String(describing: error))")
    }
    XCTAssertEqual(tokenCalls.value, 1)
    XCTAssertEqual(transportCalls.value, 1)
  }

  func testDelayedCaptureTaskCannotLeaseReplacementAccount() async throws {
    let sessionGeneration = NumaSessionGeneration()
    // Mirrors the SwiftUI tap/onChange boundary: account A's lease and input
    // are captured before the unstructured worker is scheduled.
    let authorization = NumaAPIRequestLease(
      sessionGeneration: sessionGeneration,
      expectedGeneration: sessionGeneration.snapshot()
    )
    let releaseWorker = AsyncLatch()
    let tokenCalls = LockedIntBox()
    let transportCalls = LockedIntBox()
    let url = try XCTUnwrap(URL(string: "https://numa.example/api/chat"))

    let requestTask = Task { @MainActor () -> Error? in
      await releaseWorker.wait()
      do {
        _ = try await NumaCaptureClient.sendAuthorized(
          url: url,
          body: ["context": ["portfolioName": "Account A"]],
          authorization: authorization,
          tokenProvider: { lease in
            tokenCalls.increment()
            return NumaAPIBearer(token: "unexpected-token", lease: lease)
          },
          transport: { _ in
            transportCalls.increment()
            return (
              Data(),
              try XCTUnwrap(HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
              ))
            )
          }
        )
        return nil
      } catch {
        return error
      }
    }

    sessionGeneration.advance()
    await releaseWorker.open()

    let error = await requestTask.value
    guard let authError = error as? NumaAuthError,
          case .staleSession = authError
    else {
      return XCTFail("Expected stale-session rejection, got \(String(describing: error))")
    }
    XCTAssertEqual(tokenCalls.value, 0)
    XCTAssertEqual(transportCalls.value, 0)
  }

  func testNativeCaptureDraftPreservesVoiceAndReceiptProvenance() {
    let capture = CaptureTransaction(
      kind: "expense",
      amount: 4.5,
      currency: "EUR",
      description: "Coffee",
      merchantOrCounterparty: "Cafe",
      occurredAt: "2026-08-23",
      suggestedCategoryId: "category",
      suggestedCategoryName: "Food",
      notes: "Morning",
      confidence: CaptureConfidence(
        amount: 0.9,
        currency: 0.9,
        description: 0.9,
        category: 0.8,
        date: 0.8
      )
    )

    let voice = TransactionDraft(
      capture: capture,
      defaultCurrency: "EUR",
      captureSource: .voice(transcript: "coffee 4.50")
    )
    let receipt = TransactionDraft(
      capture: capture,
      defaultCurrency: "EUR",
      captureSource: .receipt(summary: "One receipt item")
    )

    XCTAssertEqual(voice.captureSource, .voice(transcript: "coffee 4.50"))
    XCTAssertTrue(voice.auditPrompt.contains("Voice review"))
    XCTAssertEqual(receipt.captureSource, .receipt(summary: "One receipt item"))
    XCTAssertTrue(receipt.auditPrompt.contains("Receipt review"))
    XCTAssertNotEqual(voice.clientMutationId, receipt.clientMutationId)

    var failedVoice = voice
    let firstMutationId = failedVoice.clientMutationId
    failedVoice.markAuditFailedForRetry()
    let stableRetryRequestId = failedVoice.auditRetryRequestId
    failedVoice.markAuditFailedForRetry()
    XCTAssertNotEqual(failedVoice.clientMutationId, firstMutationId)
    XCTAssertEqual(failedVoice.auditRetryRequestId, stableRetryRequestId)

    let voicePayload = NativeTransactionAuditPayload(
      draft: voice,
      portfolioId: "portfolio",
      currency: "EUR",
      createdByUserId: "user",
      defaultAccountId: "cash"
    )
    let receiptPayload = NativeTransactionAuditPayload(
      draft: receipt,
      portfolioId: "portfolio",
      currency: "EUR",
      createdByUserId: "user",
      defaultAccountId: "cash"
    )
    XCTAssertEqual(voicePayload, receiptPayload)
    XCTAssertEqual(voicePayload?.description, "Coffee")
    XCTAssertEqual(voicePayload?.amount, 4.5)
    XCTAssertEqual(voicePayload?.accountId, "cash")
    XCTAssertEqual(voicePayload?.createdByUserId, "user")
  }

  @MainActor
  func testVoiceReviewSnapshotsTheExactNormalizedTranscript() throws {
    let normalized = try NumaCaptureClient.normalizedReceiptText("  coffee 4.50  ")
    let result = CaptureParseResponse(
      imageType: "voice",
      detectedSubject: "transaction",
      rejectionMessage: nil,
      transactions: [],
      summary: "One transaction"
    )
    let review = VoiceCaptureReview(transcript: normalized, result: result)

    XCTAssertEqual(review.transcript, "coffee 4.50")
    XCTAssertNotEqual(
      review.transcript,
      try NumaCaptureClient.normalizedReceiptText("rent 1000")
    )
  }

  private func makeOversizedPortfolioSnapshot() -> MobilePortfolioSnapshot {
    let itemCount = 125
    let longName = String(repeating: "😀", count: 120)
    let longDescription = String(repeating: "receipt ", count: 80)
    let categories = (0..<itemCount).map { index in
      MobileCategory(
        id: "\(String(repeating: "i", count: 140))-\(index)",
        portfolioId: "portfolio",
        name: "\(longName)-\(index)",
        kind: index.isMultiple(of: 2) ? "income" : "expense",
        icon: "wallet",
        color: "lime",
        sortOrder: Double(index),
        emoji: nil,
        monthlyLimit: 100
      )
    }
    let transactions = (0..<itemCount).map { index in
      MobileTransaction(
        id: "transaction-\(index)",
        portfolioId: "portfolio",
        occurredAt: 1_700_000_000_000,
        description: "\(longDescription)-\(index)",
        categoryId: categories[index].id,
        accountId: nil,
        kind: index.isMultiple(of: 2) ? "income" : "expense",
        amount: Double(index + 1),
        currency: "EUR",
        createdByUserId: "user",
        notes: nil
      )
    }
    let assets = (0..<itemCount).map { index in
      MobileAsset(
        id: "asset-\(index)",
        portfolioId: "portfolio",
        name: "\(longName)-\(index)",
        kind: String(repeating: "cash", count: 20),
        balance: Double(index),
        currency: "EUR",
        notes: nil,
        updatedAt: 1_700_000_000_000
      )
    }
    let liabilities = (0..<itemCount).map { index in
      MobileLiability(
        id: "liability-\(index)",
        portfolioId: "portfolio",
        name: "\(longName)-\(index)",
        kind: String(repeating: "loan", count: 20),
        balance: Double(index),
        currency: "EUR",
        interestRate: 4.5,
        dueDate: nil,
        notes: nil,
        updatedAt: 1_700_000_000_000
      )
    }
    return MobilePortfolioSnapshot(
      portfolio: MobilePortfolio(
        id: "portfolio",
        name: longName,
        type: "personal",
        tagline: "",
        defaultCurrency: "EUR",
        role: "owner",
        ownershipBps: 10_000,
        createdAt: 1_700_000_000_000
      ),
      dashboard: MobileDashboard(
        currency: "EUR",
        monthIncome: 2_000,
        monthExpenses: 1_000,
        monthCashflow: 1_000,
        monthDelta: nil,
        liquid: 3_000,
        invested: 4_000,
        hardAssets: 0,
        liabilities: 500,
        netWorth: 6_500,
        transactionCount: transactions.count,
        goalCount: 0
      ),
      categories: categories,
      transactions: transactions,
      assets: assets,
      liabilities: liabilities,
      holdings: [],
      goals: [],
      recurring: [],
      wealthSnapshots: []
    )
  }

  private func makeLargePhotoData() throws -> Data {
    let width = 1_400
    let height = 1_400
    var pixels = Data(count: width * height * 4)
    var state: UInt32 = 0x1234_5678
    pixels.withUnsafeMutableBytes { rawBuffer in
      let bytes = rawBuffer.bindMemory(to: UInt8.self)
      for pixel in 0..<(width * height) {
        state = 1_664_525 &* state &+ 1_013_904_223
        let offset = pixel * 4
        bytes[offset] = UInt8(truncatingIfNeeded: state)
        bytes[offset + 1] = UInt8(truncatingIfNeeded: state >> 8)
        bytes[offset + 2] = UInt8(truncatingIfNeeded: state >> 16)
        bytes[offset + 3] = 255
      }
    }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let provider = try XCTUnwrap(CGDataProvider(data: pixels as CFData))
    let cgImage = try XCTUnwrap(CGImage(
      width: width,
      height: height,
      bitsPerComponent: 8,
      bitsPerPixel: 32,
      bytesPerRow: width * 4,
      space: colorSpace,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
      provider: provider,
      decode: nil,
      shouldInterpolate: true,
      intent: .defaultIntent
    ))
    return try XCTUnwrap(UIImage(cgImage: cgImage).pngData())
  }
}

private final class LockedStringBox: @unchecked Sendable {
  private let lock = NSLock()
  private var stored: String?

  var value: String? {
    lock.lock()
    defer { lock.unlock() }
    return stored
  }

  func set(_ value: String?) {
    lock.lock()
    stored = value
    lock.unlock()
  }
}

private final class LockedIntBox: @unchecked Sendable {
  private let lock = NSLock()
  private var stored = 0

  var value: Int {
    lock.lock()
    defer { lock.unlock() }
    return stored
  }

  func increment() {
    lock.lock()
    stored += 1
    lock.unlock()
  }
}

private actor AsyncLatch {
  private var continuation: CheckedContinuation<Void, Never>?
  private var isOpen = false

  func wait() async {
    if isOpen { return }
    await withCheckedContinuation { continuation = $0 }
  }

  func open() {
    isOpen = true
    continuation?.resume()
    continuation = nil
  }
}
