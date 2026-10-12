import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

@MainActor
@Observable
final class NumaAppStore {
  enum Phase: Equatable {
    case idle
    case loading
    case onboarding
    case ready
    case failed(String)
  }

  private let session: NumaSessionStore
  private var portfolioTask: Task<Void, Never>?
  private var spacesTask: Task<Void, Never>?
  private(set) var spaceContext = NumaSpaceContext()
  var spaceLoading = false
  var spacesError: String?
  var refreshingSpaces = false
  #if DEBUG && targetEnvironment(simulator)
  var previewSnapshots: [String: MobilePortfolioSnapshot] = [:]
  #endif
  private var profileTask: Task<Void, Never>?

  var phase: Phase = .idle
  var profile: MobileProfile?
  var portfolios: [MobilePortfolio] = []
  var selectedPortfolioId: String?
  var portfolioSnapshot: MobilePortfolioSnapshot?
  var pods: [MobilePod] = []
  var activeSheet: NumaSheet?
  var saving = false
  var toast: String?
  var achievement: NumaAchievement?
  var cancelingDeletion = false
  var deletionRecoveryError: String?

  init(session: NumaSessionStore) {
    self.session = session
  }

  var appMode: NumaAppMode {
    profile?.appMode ?? .light
  }

  var themeKey: NumaThemeKey {
    profile?.themeKey ?? .citrus
  }

  var appearance: NumaAppearance {
    profile?.theme ?? .auto
  }

  var currency: CurrencyCode {
    activeSpace?.defaultCurrency ?? profile?.defaultCurrency ?? "EUR"
  }

  func bootstrap() async {
    guard phase != .loading else { return }
    guard let lease = try? session.beginAccountLease() else { return }
    phase = .loading
    do {
      let bootstrap: MobileBootstrap = try await session.client.mutation("mobile:bootstrap")
      guard lease.isCurrent() else { return }
      let cloudCompletedAt = try await cloudOnboardingCompletion()
      guard lease.isCurrent() else { return }
      var nextProfile = bootstrap.profile
      nextProfile.onboardingCompletedAt = cloudCompletedAt
      let localCompleted = UserDefaults.standard.bool(forKey: onboardingKey(nextProfile.userId))
      let decision = NumaOnboardingPolicy.decision(
        localCompleted: localCompleted,
        cloudCompletedAt: cloudCompletedAt,
        hasRealData: bootstrap.hasRealData
      )
      let nextPhase: Phase
      var markOnboardingComplete = false
      switch decision {
      case .show:
        nextPhase = .onboarding
      case .ready:
        markOnboardingComplete = true
        nextPhase = .ready
      case .persistThenReady:
        let completedAt = Date().timeIntervalSince1970 * 1000
        try await session.client.mutation(
          "profiles:updateProfile",
          with: ["onboardingCompletedAt": completedAt]
        )
        guard lease.isCurrent() else { return }
        nextProfile.onboardingCompletedAt = completedAt
        markOnboardingComplete = true
        nextPhase = .ready
      }
      guard lease.performIfCurrent({
        profile = nextProfile
        portfolios = bootstrap.portfolios
        beginSpaceSelection(bootstrap.selectedPortfolioId)
        if let snapshot = bootstrap.portfolioSnapshot {
          acceptSpaceSnapshot(snapshot, context: spaceContext)
        }
        pods = bootstrap.pods
        phase = nextPhase
        if markOnboardingComplete {
          UserDefaults.standard.set(true, forKey: onboardingKey(nextProfile.userId))
        }
      }) else { return }
      if let id = bootstrap.selectedPortfolioId {
        subscribePortfolio(id, lease: lease)
      }
      subscribeSpaces(lease: lease)
      subscribeProfileLifecycle(lease: lease)
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent {
        phase = .failed(message)
      }
    }
  }

  func reset() {
    portfolioTask?.cancel()
    profileTask?.cancel()
    portfolioTask = nil
    profileTask = nil
    spacesTask?.cancel()
    spacesTask = nil
    spaceContext.select(nil)
    spaceLoading = false
    refreshingSpaces = false
    spacesError = nil
    saving = false
    #if DEBUG && targetEnvironment(simulator)
    previewSnapshots = [:]
    #endif
    phase = .idle
    profile = nil
    portfolios = []
    selectedPortfolioId = nil
    portfolioSnapshot = nil
    pods = []
    activeSheet = nil
    achievement = nil
    cancelingDeletion = false
    deletionRecoveryError = nil
    toast = nil
  }

  var activeSpace: MobilePortfolio? { portfolios.first { $0.id == selectedPortfolioId } }
  var canCapture: Bool { portfolioSnapshot != nil && activeSpace?.canEdit == true && !spaceLoading }

  /// Clears immediately, before any new subscription can publish. Testable without a cloud session.
  func beginSpaceSelection(_ id: String?) {
    portfolioTask?.cancel()
    spaceContext.select(id)
    saving = false
    selectedPortfolioId = id
    portfolioSnapshot = nil
    spaceLoading = id != nil
    spacesError = nil
    activeSheet = nil
    achievement = nil
    toast = nil
  }

  func acceptSpaceSnapshot(_ snapshot: MobilePortfolioSnapshot, context: NumaSpaceContext) {
    guard context == spaceContext else { return }
    guard context.accepts(snapshot), activeSpace != nil else {
      failSpace(context: context, message: "This space returned inconsistent records. Refresh to try again.")
      return
    }
    portfolioSnapshot = snapshot
    spaceLoading = false
    spacesError = nil
  }

  func failSpace(context: NumaSpaceContext, message: String) {
    guard context == spaceContext else { return }
    // A failed access/read verification invalidates async writes as well as UI.
    // Retry creates a fresh subscription; a late old response cannot revive it.
    beginSpaceSelection(selectedPortfolioId)
    spaceLoading = false
    spacesError = message
  }

  @discardableResult
  func selectPortfolio(_ id: String) -> Bool {
    guard !saving, portfolios.contains(where: { $0.id == id }) else { return false }
    #if DEBUG && targetEnvironment(simulator)
    if let snapshot = previewSnapshots[id] {
      beginSpaceSelection(id)
      acceptSpaceSnapshot(snapshot, context: spaceContext)
      return true
    }
    #endif
    guard let lease = try? session.beginAccountLease() else { return false }
    beginSpaceSelection(id)
    subscribePortfolio(id, lease: lease)
    return true
  }

  func retrySpace() {
    if let id = selectedPortfolioId { selectPortfolio(id) }
    else { Task { await refreshSpaces() } }
  }

  func beginSpaceLease() throws -> NumaSpaceLease {
    guard canCapture, !saving, let snapshot = portfolioSnapshot, spaceContext.accepts(snapshot) else {
      throw NumaAuthError.staleSession
    }
    let account = try session.beginAccountLease()
    return NumaSpaceLease(account: account, context: spaceContext, current: { [weak self] in
      self?.spaceContext ?? NumaSpaceContext()
    })
  }

  private func acceptsDraft(_ draft: some NumaSpaceBoundDraft) -> Bool {
    guard draft.spaceContext == spaceContext, draft.portfolioId == selectedPortfolioId, canCapture else {
      toast = "This draft belongs to an earlier space. Open a new draft in the selected space."
      return false
    }
    return true
  }

  func applySpaces(_ rows: [MobilePortfolio]) {
    let previouslyEditable = activeSpace?.canEdit == true
    portfolios = rows
    if let id = selectedPortfolioId, !rows.contains(where: { $0.id == id }) {
      beginSpaceSelection(nil)
      spacesError = "Access to that space is no longer available. Choose another space."
    }
    if let space = activeSpace, previouslyEditable && !space.canEdit {
      beginSpaceSelection(space.id)
      if let lease = try? session.beginAccountLease() { subscribePortfolio(space.id, lease: lease) }
    }
  }

  func refreshSpaces() async {
    guard !refreshingSpaces, let lease = try? session.beginAccountLease() else { return }
    let origin = spaceContext
    refreshingSpaces = true
    defer { _ = lease.performIfCurrent { refreshingSpaces = false } }
    do {
      for try await rows in session.client.subscribe(to: "spaces:listMine", yielding: [MobilePortfolio].self).values {
        guard lease.isCurrent(), origin == spaceContext else { return }
        applySpaces(rows)
        spacesError = nil
        return
      }
    } catch {
      _ = lease.performIfCurrent { spacesError = "Could not refresh spaces. Please try again." }
    }
  }

  func createSpace(_ intent: NumaSpaceCreateIntent, requestId: String) async -> String? {
    guard !saving, let lease = try? session.beginAccountLease() else { return "Sign in to create a space. Preview data cannot be saved." }
    let origin = spaceContext
    saving = true
    defer { if origin == spaceContext { _ = lease.performIfCurrent { saving = false } } }
    do {
      var args: [String: ConvexEncodable?] = ["name": intent.name, "spaceKind": intent.kind,
        "currency": intent.currency, "clientMutationId": requestId]
      if let bps = try intent.ownershipBps() { args["businessOwnershipBps"] = bps }
      let result: MobileMutationResult = try await session.client.mutation("spaces:create", with: args)
      guard lease.isCurrent(), origin == spaceContext else { return "Space request finished in an earlier context. Refresh your spaces to check the result." }
      await refreshSpaces()
      guard lease.isCurrent(), origin == spaceContext else { return "Space request finished in an earlier context. Refresh your spaces to check the result." }
      saving = false
      guard selectPortfolio(result.id) else { return "Space created. Refresh spaces to open it; retrying will not duplicate it." }
      return nil
    } catch { return error.localizedDescription }
  }

  private func subscribeSpaces(lease: NumaSessionLease) {
    spacesTask?.cancel()
    spacesTask = Task { [weak self] in
      guard let self else { return }
      do {
        for try await rows in session.client.subscribe(to: "spaces:listMine", yielding: [MobilePortfolio].self).values {
          guard !Task.isCancelled, lease.isCurrent() else { return }
          applySpaces(rows)
        }
      } catch {
        guard !Task.isCancelled, lease.isCurrent() else { return }
        beginSpaceSelection(nil)
        spaceLoading = false
        spacesError = "Could not verify space access. Refresh spaces to try again."
      }
    }
  }

  @discardableResult
  func completeOnboarding(
    themeKey: NumaThemeKey,
    primaryJob: NumaPrimaryJob,
    starterTemplate: NumaStarterTemplate
  ) async -> Bool {
    guard let lease = try? session.beginAccountLease() else { return false }
    guard await updatePreferences(
      themeKey: themeKey,
      appMode: primaryJob.appMode,
      primaryJob: primaryJob,
      starterTemplate: starterTemplate
    ) else { return false }
    guard lease.isCurrent() else { return false }
    guard let currentProfile = profile else { return false }
    do {
      let completedAt = Date().timeIntervalSince1970 * 1000
      try await persistOnboardingCompletion(completedAt)
      guard lease.performIfCurrent({
        UserDefaults.standard.set(true, forKey: onboardingKey(currentProfile.userId))
      }) else { return false }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent {
        toast = "Numa Pro couldn't finish setup: \(message)"
      }
      return false
    }
    return lease.performIfCurrent {
      phase = .ready
      showAchievement(
        kind: .ready,
        title: "Numa Pro is ready",
        message: "Your money space is set up in the style you chose."
      )
    }
  }

  @discardableResult
  func updatePreferences(
    displayName: String? = nil,
    theme: NumaAppearance? = nil,
    themeKey: NumaThemeKey? = nil,
    appMode: NumaAppMode? = nil,
    primaryJob: NumaPrimaryJob? = nil,
    starterTemplate: NumaStarterTemplate? = nil,
    locale: String? = nil,
    defaultCurrency: CurrencyCode? = nil
  ) async -> Bool {
    guard var next = profile else { return false }
    guard let lease = try? session.beginAccountLease() else { return false }
    saving = true
    let busyContext = spaceContext
    defer {
      if busyContext == spaceContext { _ = lease.performIfCurrent { saving = false } }
    }
    do {
      var args: [String: ConvexEncodable?] = [
        "clientMutationId": ClientMutationID.make("mobile.updateProfilePrefs")
      ]
      if let displayName { args["displayName"] = displayName }
      if let theme { args["theme"] = theme.rawValue }
      if let themeKey { args["themeKey"] = themeKey.rawValue }
      if let appMode { args["appMode"] = appMode.rawValue }
      if let primaryJob { args["primaryJob"] = primaryJob.rawValue }
      if let starterTemplate { args["starterTemplate"] = starterTemplate.rawValue }
      if let locale { args["locale"] = locale }
      if let defaultCurrency { args["defaultCurrency"] = defaultCurrency }
      let _: MobileMutationResult = try await session.client.mutation("mobile:updateProfilePrefs", with: args)
      if let displayName { next.displayName = displayName }
      if let theme { next.theme = theme }
      if let themeKey { next.themeKey = themeKey }
      if let appMode { next.appMode = appMode }
      if let primaryJob { next.primaryJob = primaryJob }
      if let starterTemplate { next.starterTemplate = starterTemplate }
      if let locale { next.locale = locale }
      if let defaultCurrency { next.defaultCurrency = defaultCurrency }
      return lease.performIfCurrent {
        profile = next
        toast = "Settings synced"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  @discardableResult
  func cancelScheduledDeletion() async -> Bool {
    guard var next = profile, next.deletionScheduledAt != nil else { return true }
    guard let lease = try? session.beginAccountLease() else { return false }
    guard lease.performIfCurrent({
      cancelingDeletion = true
      deletionRecoveryError = nil
    }) else { return false }
    defer {
      _ = lease.performIfCurrent {
        cancelingDeletion = false
      }
    }
    do {
      let response: MobileDeletionCancellationResponse = try await session.client.mutation(
        "users:cancelMyDeletion"
      )
      guard lease.isCurrent() else { return false }
      switch NumaDeletionRecoveryTransition.resolve(profile: &next, response: response) {
      case .canceled:
        return lease.performIfCurrent {
          profile = next
          toast = "Account deletion canceled"
        }
      case .alreadyDeleted:
        _ = lease.performIfCurrent {
          profile = next
          deletionRecoveryError = "Numa Pro could not recover this account because deletion has already started. Sign out and contact support."
        }
        return false
      case .alreadyStarted:
        _ = lease.performIfCurrent {
          profile = next
          deletionRecoveryError = "Account deletion has already started and can no longer be canceled safely. Contact support."
        }
        return false
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent {
        deletionRecoveryError = "Numa Pro could not cancel deletion: \(message)"
      }
      return false
    }
  }

  @discardableResult
  func openCapturedTransaction(
    _ capture: CaptureTransaction,
    source: TransactionCaptureSource,
    auditCreateRequestId: String,
    context: NumaSpaceContext
  ) async -> Bool {
    guard context == spaceContext else { return false }
    guard let lease = try? beginSpaceLease() else { return false }
    guard let portfolioId = selectedPortfolioId,
          let snapshot = portfolioSnapshot,
          let userId = profile?.userId
    else {
      _ = lease.performIfCurrent {
        toast = "Your money space is still syncing. Try again in a moment."
      }
      return false
    }
    var draft = TransactionDraft(
      capture: capture,
      defaultCurrency: snapshot.portfolio.defaultCurrency,
      captureSource: source,
      auditCreateRequestId: auditCreateRequestId
    )
    draft.bind(to: spaceContext)
    guard let payload = NativeTransactionAuditPayload(
      draft: draft,
      portfolioId: portfolioId,
      currency: snapshot.portfolio.defaultCurrency,
      createdByUserId: userId,
      defaultAccountId: nil
    ) else {
      _ = lease.performIfCurrent {
        toast = "Check the parsed description and amount before continuing."
      }
      return false
    }
    guard lease.performIfCurrent({ saving = true }) else { return false }
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      let auditId: String = try await session.client.mutation(
        "aiActions:createDraft",
        with: [
          "portfolioId": portfolioId,
          "actionType": "transaction.create",
          "prompt": draft.auditPrompt,
          "proposedPayload": payload.convexValue,
          "createRequestId": draft.auditCreateRequestId
        ] as [String: ConvexEncodable?]
      )
      guard lease.isCurrent() else { return false }
      draft.auditDraftId = auditId
      return lease.performIfCurrent { activeSheet = .transaction(draft) }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent {
        toast = "Numa Pro couldn't prepare the reviewed draft: \(message)"
      }
      return false
    }
  }

  func performMoneyMutation(_ operation: String, arguments: sending [String: ConvexEncodable?],
                            draft: some NumaSpaceBoundDraft) async -> String? {
    guard acceptsDraft(draft), let lease = try? beginSpaceLease() else {
      return "This space is no longer writable. Close this draft and reload the space."
    }
    guard ["money:createTransfer", "money:updateTransfer", "money:deleteTransfer", "money:setCategoryBudget"].contains(operation) else {
      return "Unsupported money operation."
    }
    guard lease.performIfCurrent({ saving = true }) else { return "The space changed." }
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      let _: MobileMutationResult = try await session.client.mutation(operation, with: arguments)
      guard lease.performIfCurrent({ toast = "Money record saved" }) else { return "The space changed before the result arrived." }
      return nil
    } catch { return error.localizedDescription }
  }

  func saveTransaction(_ draft: TransactionDraft) async -> TransactionSaveResult {
    guard acceptsDraft(draft), draft.id == nil || portfolioSnapshot?.transactions.contains(where: { $0.id == draft.id }) == true else { return .retry(draft) }
    guard let lease = try? beginSpaceLease() else { return .retry(draft) }
    var retryDraft = draft
    guard let portfolioId = selectedPortfolioId,
          let snapshot = portfolioSnapshot,
          let userId = profile?.userId,
          let payload = NativeTransactionAuditPayload(
            draft: draft,
            portfolioId: portfolioId,
            currency: snapshot.portfolio.defaultCurrency,
            createdByUserId: userId,
            defaultAccountId: nil
          )
    else {
      _ = lease.performIfCurrent {
        toast = "Enter a description and an amount greater than zero."
      }
      return .retry(draft)
    }
    guard (payload.categoryId == nil || snapshot.categories.contains(where: {
      $0.id == payload.categoryId && $0.kind == payload.kind && $0.portfolioId == portfolioId
    })), (payload.accountId == nil || snapshot.assets.contains(where: {
      $0.id == payload.accountId && $0.kind == "cash" && $0.currency == payload.currency && $0.portfolioId == portfolioId
    })) else {
      toast = "Choose a category and cash account matching this record's kind, currency and space."
      return .retry(draft)
    }
    guard lease.performIfCurrent({ saving = true }) else { return .retry(draft) }
    defer { _ = lease.performIfCurrent { saving = false } }

    var activeAuditId = draft.auditDraftId

    if draft.id == nil, draft.captureSource != nil {
      do {
        func updateAudit(_ auditId: String) async throws -> NativeAiAuditState {
          guard lease.isCurrent() else { throw NumaAuthError.staleSession }
          let state: NativeAiAuditState = try await session.client.mutation(
            "aiActions:updateDraftProposal",
            with: [
              "id": auditId,
              "prompt": draft.auditPrompt,
              "proposedPayload": payload.convexValue
            ] as [String: ConvexEncodable?]
          )
          guard lease.isCurrent() else { throw NumaAuthError.staleSession }
          return state
        }

        if let auditId = activeAuditId {
          var state = try await updateAudit(auditId)
          if state.status == "confirmed", state.resultId != nil {
            guard lease.performIfCurrent({ toast = "Transaction saved" }) else {
              return .retry(retryDraft)
            }
            return .saved
          }
          if state.status == "failed" {
            if retryDraft.auditRetryRequestId == nil {
              retryDraft.markAuditFailedForRetry()
          retryDraft.outcomeUnconfirmed = false
            }
            let retryRequestId = retryDraft.auditRetryRequestId
              ?? ClientMutationID.make("aiActions.redraftFailed")
            let redraftId: String = try await session.client.mutation(
              "aiActions:redraftFailed",
              with: [
                "id": auditId,
                "retryRequestId": retryRequestId
              ]
            )
            guard lease.isCurrent() else { throw NumaAuthError.staleSession }
            activeAuditId = redraftId
            retryDraft.auditDraftId = redraftId
            state = try await updateAudit(redraftId)
          }
          guard state.status == "draft" else {
            throw NumaAuthError.invalidResponse
          }
          retryDraft.auditRetryRequestId = nil
        } else {
          let auditId: String = try await session.client.mutation(
            "aiActions:createDraft",
            with: [
              "portfolioId": portfolioId,
              "actionType": "transaction.create",
              "prompt": draft.auditPrompt,
              "proposedPayload": payload.convexValue,
              "createRequestId": retryDraft.auditCreateRequestId
            ] as [String: ConvexEncodable?]
          )
          guard lease.isCurrent() else { throw NumaAuthError.staleSession }
          activeAuditId = auditId
          retryDraft.auditDraftId = auditId
          retryDraft.auditRetryRequestId = nil
        }
      } catch {
        let message = error.localizedDescription
        _ = lease.performIfCurrent {
          toast = "Numa Pro couldn't verify the reviewed draft: \(message)"
        }
        return .retry(retryDraft)
      }
    }

    guard lease.isCurrent() else { return .retry(retryDraft) }
    do {
      if let id = draft.id {
        let updateArgs: [String: ConvexEncodable?] = [
          "id": id,
          "occurredAt": payload.occurredAt,
          "description": payload.description,
          "categoryId": draft.categoryId,
          "accountId": draft.accountId,
          "kind": payload.kind,
          "amount": payload.amount,
          "currency": payload.currency,
          "notes": payload.notes,
          "clientMutationId": draft.clientMutationId
        ]
        let _: MobileMutationResult = try await session.client.mutation(
          "mobile:updateTransaction",
          with: updateArgs
        )
      } else {
        var createArgs = payload.convexValue
        createArgs.removeValue(forKey: "createdByUserId")
        createArgs["clientMutationId"] = retryDraft.clientMutationId
        if let activeAuditId { createArgs["auditDraftId"] = activeAuditId }
        let _: MobileMutationResult = try await session.client.mutation(
          "mobile:createTransaction",
          with: createArgs
        )
      }
      guard lease.performIfCurrent({ toast = "Transaction saved" }) else {
        return .retry(retryDraft)
      }
      return .saved
    } catch {
      guard lease.isCurrent() else { return .retry(retryDraft) }
      retryDraft.outcomeUnconfirmed = true
      guard let activeAuditId else {
        let message = error.localizedDescription
        _ = lease.performIfCurrent { toast = message }
        return .retry(retryDraft)
      }
      do {
        let state: NativeAiAuditState? = try await session.client.mutation(
          "aiActions:markFailed",
          with: [
            "id": activeAuditId,
            "error": error.localizedDescription
          ]
        )
        guard lease.isCurrent() else { return .retry(retryDraft) }
        if state?.status == "confirmed", state?.resultId != nil {
          guard lease.performIfCurrent({ toast = "Transaction saved" }) else {
            return .retry(retryDraft)
          }
          return .saved
        }
        if state?.status == "failed" {
          retryDraft.auditDraftId = activeAuditId
          retryDraft.markAuditFailedForRetry()
        }
      } catch {
        // Keep the same audit and mutation ids. The financial mutation may
        // have committed before a transport failure, so the next tap must be
        // an idempotent replay rather than a duplicate transaction.
      }
      _ = lease.performIfCurrent {
        toast = "Numa Pro couldn't save this reviewed transaction. Your draft is still here."
      }
      return .retry(retryDraft)
    }
  }

  func cancelReviewedTransaction(_ draft: TransactionDraft) async {
    // Dismissal is passive cleanup, not a new action in the next space/account.
    guard draft.spaceContext == spaceContext, draft.portfolioId == selectedPortfolioId else { return }
    guard let lease = try? beginSpaceLease() else { return }
    guard draft.id == nil,
          draft.captureSource != nil,
          let auditDraftId = draft.auditDraftId
    else { return }
    guard lease.isCurrent() else { return }
    let _: String? = try? await session.client.mutation(
      "aiActions:cancelDraft",
      with: ["id": auditDraftId]
    )
  }

  @discardableResult
  func deleteTransaction(id: String, clientMutationId: String, context: NumaSpaceContext?) async -> Bool {
    guard context == spaceContext else { return false }
    // A deletion subscription may arrive before its acknowledgement. The server
    // authenticates the original receipt when retrying an already-deleted ID.
    guard let lease = try? beginSpaceLease() else { return false }
    guard lease.performIfCurrent({ saving = true }) else { return false }
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      let _: MobileMutationResult = try await session.client.mutation(
        "mobile:deleteTransaction",
        with: [
          "id": id,
          "clientMutationId": clientMutationId
        ]
      )
      return lease.performIfCurrent { toast = "Transaction deleted" }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  func saveAsset(_ draft: AssetDraft) async -> Bool {
    guard acceptsDraft(draft), draft.id == nil || portfolioSnapshot?.assets.contains(where: { $0.id == draft.id }) == true else { return false }
    guard let portfolioId = selectedPortfolioId,
          let balance = Double(draft.balance.replacingOccurrences(of: ",", with: "."))
    else {
      toast = "Enter a valid asset balance."
      return false
    }
    guard let lease = try? beginSpaceLease() else { return false }
    saving = true
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      var args: [String: ConvexEncodable?] = [
        "portfolioId": portfolioId,
        "name": draft.name,
        "kind": draft.kind,
        "balance": balance,
        "currency": draft.currency,
        "notes": draft.notes.isEmpty ? nil : draft.notes,
        "clientMutationId": draft.clientMutationId
      ]
      if let id = draft.id { args["id"] = id }
      let _: MobileMutationResult = try await session.client.mutation("mobile:upsertAsset", with: args)
      return lease.performIfCurrent {
        activeSheet = nil
        toast = "Asset saved"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  @discardableResult
  func deleteAsset(_ asset: MobileAsset, clientMutationId: String, context: NumaSpaceContext?) async -> Bool {
    guard context == spaceContext else { return false }
    guard portfolioSnapshot?.assets.contains(where: { $0.id == asset.id }) == true else { return false }
    guard let lease = try? beginSpaceLease() else { return false }
    guard lease.performIfCurrent({ saving = true }) else { return false }
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      let _: MobileMutationResult = try await session.client.mutation(
        "mobile:deleteAsset",
        with: [
          "id": asset.id,
          "clientMutationId": clientMutationId
        ]
      )
      return lease.performIfCurrent {
        activeSheet = nil
        toast = "Asset deleted"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  func saveLiability(_ draft: LiabilityDraft) async -> Bool {
    guard acceptsDraft(draft), draft.id == nil || portfolioSnapshot?.liabilities.contains(where: { $0.id == draft.id }) == true else { return false }
    guard let portfolioId = selectedPortfolioId,
          let balance = Double(draft.balance.replacingOccurrences(of: ",", with: "."))
    else {
      toast = "Enter a valid liability balance."
      return false
    }
    guard let lease = try? beginSpaceLease() else { return false }
    saving = true
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      var args: [String: ConvexEncodable?] = [
        "portfolioId": portfolioId,
        "name": draft.name,
        "kind": draft.kind,
        "balance": balance,
        "currency": draft.currency,
        "interestRate": Double(draft.interestRate.replacingOccurrences(of: ",", with: ".")),
        "dueDate": draft.hasDueDate ? draft.dueDate.timeIntervalSince1970 * 1000 : nil,
        "notes": draft.notes.isEmpty ? nil : draft.notes,
        "clientMutationId": draft.clientMutationId
      ]
      if let id = draft.id { args["id"] = id }
      let _: MobileMutationResult = try await session.client.mutation("mobile:upsertLiability", with: args)
      return lease.performIfCurrent {
        activeSheet = nil
        toast = "Liability saved"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  @discardableResult
  func deleteLiability(
    _ liability: MobileLiability,
    clientMutationId: String,
    context: NumaSpaceContext?
  ) async -> Bool {
    guard context == spaceContext else { return false }
    guard portfolioSnapshot?.liabilities.contains(where: { $0.id == liability.id }) == true else { return false }
    guard let lease = try? beginSpaceLease() else { return false }
    guard lease.performIfCurrent({ saving = true }) else { return false }
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      let _: MobileMutationResult = try await session.client.mutation(
        "mobile:deleteLiability",
        with: [
          "id": liability.id,
          "clientMutationId": clientMutationId
        ]
      )
      return lease.performIfCurrent {
        activeSheet = nil
        toast = "Liability deleted"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  func saveHolding(_ draft: HoldingDraft) async -> Bool {
    guard acceptsDraft(draft), draft.id == nil || portfolioSnapshot?.holdings.contains(where: { $0.id == draft.id }) == true else { return false }
    guard let portfolioId = selectedPortfolioId,
          let quantity = Double(draft.quantity.replacingOccurrences(of: ",", with: ".")),
          let costBasis = Double(draft.costBasis.replacingOccurrences(of: ",", with: "."))
    else {
      toast = "Enter valid holding quantity and cost basis values."
      return false
    }
    guard let lease = try? beginSpaceLease() else { return false }
    saving = true
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      var args: [String: ConvexEncodable?] = [
        "portfolioId": portfolioId,
        "symbol": draft.symbol,
        "name": draft.name,
        "kind": draft.kind,
        "quantity": quantity,
        "costBasis": costBasis,
        "currency": draft.currency,
        "acquiredAt": draft.acquiredAt.timeIntervalSince1970 * 1000,
        "clientMutationId": draft.clientMutationId
      ]
      if let id = draft.id { args["id"] = id }
      let _: MobileMutationResult = try await session.client.mutation("mobile:upsertHolding", with: args)
      return lease.performIfCurrent {
        activeSheet = nil
        toast = "Holding saved"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  @discardableResult
  func deleteHolding(
    _ holding: MobileHolding,
    clientMutationId: String,
    context: NumaSpaceContext?
  ) async -> Bool {
    guard context == spaceContext else { return false }
    guard portfolioSnapshot?.holdings.contains(where: { $0.id == holding.id }) == true else { return false }
    guard let lease = try? beginSpaceLease() else { return false }
    guard lease.performIfCurrent({ saving = true }) else { return false }
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      let _: MobileMutationResult = try await session.client.mutation(
        "mobile:deleteHolding",
        with: [
          "id": holding.id,
          "clientMutationId": clientMutationId
        ]
      )
      return lease.performIfCurrent {
        activeSheet = nil
        toast = "Holding deleted"
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  func saveMonthlyIncomeTarget(_ draft: MonthlyIncomeTargetDraft) async -> Bool {
    guard acceptsDraft(draft), draft.id == nil || portfolioSnapshot?.goals.contains(where: { $0.id == draft.id }) == true else { return false }
    guard let portfolioId = selectedPortfolioId,
          let target = Double(draft.target.replacingOccurrences(of: ",", with: "."))
    else {
      toast = "Enter a valid monthly income target."
      return false
    }
    guard let lease = try? beginSpaceLease() else { return false }
    saving = true
    defer { _ = lease.performIfCurrent { saving = false } }
    do {
      var args: [String: ConvexEncodable?] = [
        "portfolioId": portfolioId,
        "scope": "monthly_income",
        "target": target,
        "currency": draft.currency,
        "startAt": draft.startAt.timeIntervalSince1970 * 1000,
        "label": draft.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Income target" : draft.label,
        "createdAt": draft.createdAt.timeIntervalSince1970 * 1000,
        "clientMutationId": draft.clientMutationId
      ]
      if let id = draft.id { args["id"] = id }
      let _: MobileMutationResult = try await session.client.mutation("mobile:upsertGoal", with: args)
      return lease.performIfCurrent {
        activeSheet = nil
        showAchievement(
          kind: .monthlyIncome,
          title: draft.id == nil ? "Income target set" : "Income target updated",
          message: "Today tracks recorded income. Scheduled income stays a forecast."
        )
      }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { toast = message }
      return false
    }
  }

  func showSharedSettledAchievement() {
    showAchievement(
      kind: .sharedSettled,
      title: "Shared pot balanced",
      message: "Everyone's part is clear and the next settlement can stay simple."
    )
  }

  private func showAchievement(kind: NumaAchievementKind, title: String, message: String) {
    toast = nil
    achievement = NumaAchievement(kind: kind, title: title, message: message)
    Haptic.success()
  }

  private func subscribePortfolio(_ id: String, lease: NumaSessionLease) {
    portfolioTask?.cancel()
    let context = spaceContext
    portfolioTask = Task { [weak self] in
      guard let self, lease.isCurrent() else { return }
      do {
        let stream = session.client.subscribe(to: "mobile:portfolioSnapshot",
          with: ["portfolioId": id], yielding: MobilePortfolioSnapshot?.self).values
        for try await next in stream {
          guard !Task.isCancelled, lease.isCurrent(), context == spaceContext else { return }
          if let next { acceptSpaceSnapshot(next, context: context) }
          else { failSpace(context: context, message: "This space is unavailable. Refresh spaces or try again.") }
        }
      } catch {
        guard !Task.isCancelled, lease.isCurrent() else { return }
        failSpace(context: context, message: "Could not load this space. Check your connection and retry.")
      }
    }
  }

  private func subscribeProfileLifecycle(lease: NumaSessionLease) {
    profileTask?.cancel()
    profileTask = Task { [weak self] in
      guard let self, lease.isCurrent() else { return }
      let stream = self.session.client
        .subscribe(to: "profiles:me", yielding: MobileCloudProfileStatus?.self)
        .replaceError(with: nil)
        .values
      for await status in stream {
        guard !Task.isCancelled, lease.isCurrent() else { return }
        guard let status else { continue }
        _ = lease.performIfCurrent {
          guard var next = self.profile else { return }
          next.onboardingCompletedAt = status.onboardingCompletedAt
          NumaDeletionRecoveryTransition.applyLifecycle(
            profile: &next,
            scheduledAt: status.deletionScheduledAt,
            startedAt: status.deletionStartedAt
          )
          self.profile = next
          if status.deletionStartedAt != nil {
            self.cancelingDeletion = false
          }
        }
      }
    }
  }

  private func cloudOnboardingCompletion() async throws -> Double? {
    let stream = session.client
      .subscribe(to: "profiles:me", yielding: MobileCloudProfileStatus?.self)
      .values
    for try await status in stream {
      return status?.onboardingCompletedAt
    }
    return nil
  }

  private func persistOnboardingCompletion(_ completedAt: Double) async throws {
    let lease = try session.beginAccountLease()
    try await session.client.mutation(
      "profiles:updateProfile",
      with: ["onboardingCompletedAt": completedAt]
    )
    guard lease.performIfCurrent({
      if var next = profile {
        next.onboardingCompletedAt = completedAt
        profile = next
      }
    }) else { throw NumaAuthError.staleSession }
  }

  private func onboardingKey(_ userId: String) -> String {
    "numa.ios.onboardingComplete.\(userId)"
  }
}
