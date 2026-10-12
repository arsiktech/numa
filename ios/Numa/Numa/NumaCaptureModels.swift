import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct CaptureParseResponse: Codable, Equatable {
  let imageType: String
  let detectedSubject: String
  let rejectionMessage: String?
  let transactions: [CaptureTransaction]
  let summary: String
}

struct VoiceCaptureReview: Equatable {
  let transcript: String
  let result: CaptureParseResponse
}

struct CaptureTransaction: Codable, Identifiable, Equatable {
  var id: String { "\(description)-\(amount)-\(occurredAt ?? "")" }
  let kind: String
  let amount: Double
  let currency: String
  let description: String
  let merchantOrCounterparty: String?
  let occurredAt: String?
  let suggestedCategoryId: String?
  let suggestedCategoryName: String?
  let notes: String?
  let confidence: CaptureConfidence
}

func nativeCaptureRowIntentKey(
  index: Int,
  transaction: CaptureTransaction,
  source: TransactionCaptureSource
) -> String {
  "\(index):\(transaction.id):\(source.auditPrompt)"
}

func nextNativeCaptureCreateRequestId(
  current: String,
  draftOpened: Bool
) -> String {
  draftOpened ? ClientMutationID.make("aiActions.createDraft") : current
}

struct CaptureConfidence: Codable, Equatable {
  let amount: Double
  let currency: Double
  let description: Double
  let category: Double
  let date: Double
}

enum TransactionCaptureSource: Equatable {
  case voice(transcript: String)
  case receipt(summary: String)

  var auditPrompt: String {
    switch self {
    case .voice(let transcript):
      "Voice review: \(transcript.trimmingCharacters(in: .whitespacesAndNewlines).prefix(3_500))"
    case .receipt(let summary):
      "Receipt review: \(summary.trimmingCharacters(in: .whitespacesAndNewlines).prefix(3_500))"
    }
  }
}

struct TransactionDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  var id: String?
  var description = ""
  var amount = ""
  var kind = "expense"
  var currency: CurrencyCode?
  var outcomeUnconfirmed = false
  var categoryId: String?
  var accountId: String?
  var notes = ""
  var occurredAt = Date()
  var captureSource: TransactionCaptureSource?
  var auditDraftId: String?
  var auditCreateRequestId = ClientMutationID.make("aiActions.createDraft")
  var auditRetryRequestId: String?
  var clientMutationId = ClientMutationID.make("mobile.createTransaction")
  var deleteMutationId = ClientMutationID.make("mobile.deleteTransaction")

  var auditPrompt: String {
    captureSource?.auditPrompt ?? "Transaction review: \(description)"
  }

  mutating func markAuditFailedForRetry() {
    if auditRetryRequestId == nil {
      auditRetryRequestId = ClientMutationID.make("aiActions.redraftFailed")
    }
    clientMutationId = ClientMutationID.make("mobile.createTransaction")
  }

  init() {}

  init(transaction: MobileTransaction) {
    id = transaction.id
    portfolioId = transaction.portfolioId
    description = transaction.description
    amount = NumaMoneyAmount.editString(transaction.amount)
    currency = transaction.currency
    kind = transaction.kind
    categoryId = transaction.categoryId
    accountId = transaction.accountId
    notes = transaction.notes ?? ""
    occurredAt = Date(timeIntervalSince1970: transaction.occurredAt / 1000)
    clientMutationId = ClientMutationID.make("mobile.updateTransaction")
  }

  init(
    capture: CaptureTransaction,
    defaultCurrency: CurrencyCode,
    captureSource: TransactionCaptureSource,
    auditCreateRequestId: String = ClientMutationID.make("aiActions.createDraft")
  ) {
    description = capture.description
    amount = NumaMoneyAmount.editString(capture.amount)
    currency = capture.currency == "UNKNOWN" ? defaultCurrency : capture.currency
    kind = capture.kind == "income" ? "income" : "expense"
    categoryId = capture.suggestedCategoryId
    notes = capture.notes ?? capture.suggestedCategoryName ?? ""
    self.captureSource = captureSource
    self.auditCreateRequestId = auditCreateRequestId
    if let occurredAt = capture.occurredAt,
       let date = ISO8601DateFormatter.numaDayFormatter().date(from: occurredAt) {
      self.occurredAt = date
    }
    if capture.currency != "UNKNOWN", capture.currency != defaultCurrency {
      notes = [notes, "Detected currency: \(capture.currency)"].filter { !$0.isEmpty }.joined(separator: "\n")
    }
  }
}

struct NativeTransactionAuditPayload: Equatable {
  let portfolioId: String
  let occurredAt: Double
  let description: String
  let categoryId: String?
  let accountId: String?
  let kind: String
  let amount: Double
  let currency: CurrencyCode
  let notes: String?
  let createdByUserId: String

  init?(
    draft: TransactionDraft,
    portfolioId: String,
    currency: CurrencyCode,
    createdByUserId: String,
    defaultAccountId: String?
  ) {
    let description = draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !description.isEmpty,
          let amountMinor = NumaMoneyAmount.minor(draft.amount),
          ["income", "expense"].contains(draft.kind),
          ["EUR", "USD"].contains(draft.currency ?? currency),
          draft.occurredAt.timeIntervalSince1970.isFinite,
          draft.occurredAt <= Date()
    else { return nil }
    self.portfolioId = portfolioId
    self.occurredAt = (draft.occurredAt.timeIntervalSince1970 * 1_000).rounded(.down)
    self.description = description
    self.categoryId = draft.categoryId
    self.accountId = draft.accountId ?? defaultAccountId
    self.kind = draft.kind
    self.amount = Double(amountMinor) / 100
    self.currency = draft.currency ?? currency
    let notes = draft.notes.trimmingCharacters(in: .whitespacesAndNewlines)
    self.notes = notes.isEmpty ? nil : notes
    self.createdByUserId = createdByUserId
  }

  var convexValue: [String: ConvexEncodable?] {
    var value: [String: ConvexEncodable?] = [
      "portfolioId": portfolioId,
      "occurredAt": occurredAt,
      "description": description,
      "kind": kind,
      "amount": amount,
      "currency": currency,
      "createdByUserId": createdByUserId
    ]
    if let categoryId { value["categoryId"] = categoryId }
    if let accountId { value["accountId"] = accountId }
    if let notes { value["notes"] = notes }
    return value
  }
}

struct NativeAiAuditState: Codable, Equatable {
  let id: String
  let status: String
  let resultId: String?
}

enum TransactionSaveResult: Equatable {
  case saved
  case retry(TransactionDraft)
}

struct AssetDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  var id: String?
  var clientMutationId = ClientMutationID.make("mobile.upsertAsset")
  var deleteMutationId = ClientMutationID.make("mobile.deleteAsset")
  var name = ""
  var kind = "cash"
  var balance = ""
  var currency: CurrencyCode = "EUR"
  var notes = ""

  init(currency: CurrencyCode = "EUR") {
    self.currency = currency
  }

  init(asset: MobileAsset) {
    id = asset.id
    portfolioId = asset.portfolioId
    name = asset.name
    kind = asset.kind
    balance = String(format: "%.2f", asset.balance)
    currency = asset.currency
    notes = asset.notes ?? ""
  }
}

struct LiabilityDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  var id: String?
  var clientMutationId = ClientMutationID.make("mobile.upsertLiability")
  var deleteMutationId = ClientMutationID.make("mobile.deleteLiability")
  var name = ""
  var kind = "credit_card"
  var balance = ""
  var currency: CurrencyCode = "EUR"
  var interestRate = ""
  var dueDate = Date()
  var hasDueDate = false
  var notes = ""

  init(currency: CurrencyCode = "EUR") {
    self.currency = currency
  }

  init(liability: MobileLiability) {
    id = liability.id
    portfolioId = liability.portfolioId
    name = liability.name
    kind = liability.kind
    balance = String(format: "%.2f", liability.balance)
    currency = liability.currency
    interestRate = liability.interestRate.map { String(format: "%.2f", $0) } ?? ""
    if let dueDate = liability.dueDate {
      self.dueDate = Date(timeIntervalSince1970: dueDate / 1000)
      hasDueDate = true
    }
    notes = liability.notes ?? ""
  }
}

struct HoldingDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  var id: String?
  var clientMutationId = ClientMutationID.make("mobile.upsertHolding")
  var deleteMutationId = ClientMutationID.make("mobile.deleteHolding")
  var symbol = ""
  var name = ""
  var kind = "stock"
  var quantity = ""
  var costBasis = ""
  var currency: CurrencyCode = "EUR"
  var acquiredAt = Date()

  init(currency: CurrencyCode = "EUR") {
    self.currency = currency
  }

  init(holding: MobileHolding) {
    id = holding.id
    portfolioId = holding.portfolioId
    symbol = holding.symbol
    name = holding.name
    kind = holding.kind
    quantity = String(format: "%.4f", holding.quantity)
    costBasis = String(format: "%.2f", holding.costBasis)
    currency = holding.currency
    acquiredAt = Date(timeIntervalSince1970: holding.acquiredAt / 1000)
  }
}

struct MonthlyIncomeTargetDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  var id: String?
  var clientMutationId = ClientMutationID.make("mobile.upsertGoal")
  var target = ""
  var label = "Income target"
  var currency: CurrencyCode = "EUR"
  var startAt = Date()
  var createdAt = Date()

  init(goal: MobileGoal?, defaultCurrency: CurrencyCode) {
    if let goal {
      id = goal.id
      portfolioId = goal.portfolioId
      target = String(format: "%.2f", goal.target)
      label = goal.label ?? "Income target"
      currency = goal.currency
      startAt = Date(timeIntervalSince1970: goal.startAt / 1000)
      createdAt = Date(timeIntervalSince1970: goal.createdAt / 1000)
    } else {
      currency = defaultCurrency
    }
  }
}

enum NumaSheet: Identifiable, Equatable {
  case spaces
  case createSpace
  case capture
  case transaction(TransactionDraft)
  case transfer(NumaTransferDraft)
  case budget(NumaBudgetDraft)
  case search
  case askNuma
  case voice
  case scan
  case asset(MobileAsset?)
  case liability(MobileLiability?)
  case holding(MobileHolding?)
  case monthlyIncomeTarget(MobileGoal?)

  var id: String {
    switch self {
    case .spaces: "spaces"
    case .createSpace: "create-space"
    case .capture: "capture"
    case .transaction(let draft): "transaction-\(draft.id ?? "new")"
    case .transfer(let draft): "transfer-\(draft.id ?? "new")"
    case .budget(let draft): "budget-\(draft.category.id)"
    case .search: "search"
    case .askNuma: "ask"
    case .voice: "voice"
    case .scan: "scan"
    case .asset(let asset): "asset-\(asset?.id ?? "new")"
    case .liability(let liability): "liability-\(liability?.id ?? "new")"
    case .holding(let holding): "holding-\(holding?.id ?? "new")"
    case .monthlyIncomeTarget(let goal): "mrr-\(goal?.id ?? "new")"
    }
  }
}

enum NumaAchievementKind: Equatable {
  case ready
  case monthlyIncome
  case sharedSettled

  var assetName: String {
    switch self {
    case .ready: "NumaMilestoneReady"
    case .monthlyIncome: "NumaMilestoneMRR"
    case .sharedSettled: "NumaMilestoneShared"
    }
  }

  var symbolName: String {
    switch self {
    case .ready: "checkmark.circle.fill"
    case .monthlyIncome: "flag.checkered"
    case .sharedSettled: "person.2.fill"
    }
  }
}

struct NumaAchievement: Identifiable, Equatable {
  let id = UUID()
  let kind: NumaAchievementKind
  let title: String
  let message: String
}

enum NumaCaptureRequestError: LocalizedError {
  case emptyText
  case invalidImage
  case imageTooLarge

  var errorDescription: String? {
    switch self {
    case .emptyText:
      "Add something for Numa Pro to read."
    case .invalidImage:
      "Numa Pro could not read that image. Choose another photo or screenshot."
    case .imageTooLarge:
      "That image is still too large after resizing. Crop it and try again."
    }
  }
}
