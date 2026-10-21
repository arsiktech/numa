import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

enum NumaAppMode: String, Codable, CaseIterable, Identifiable {
  case light
  case advanced
  case shared

  var id: String { rawValue }
  var label: String {
    switch self {
    case .light: "Simple"
    case .advanced: "Advanced"
    case .shared: "Shared pot"
    }
  }
}

enum NumaThemeKey: String, Codable, CaseIterable, Identifiable {
  case citrus
  case pebble
  case coral
  case carbon
  case numa

  var id: String { rawValue }
  var label: String {
    switch self {
    case .citrus: "Citrus"
    case .pebble: "Pebble"
    case .coral: "Coral"
    case .carbon: "Carbon"
    case .numa: "Classic"
    }
  }
}

enum NumaAppearance: String, Codable, CaseIterable, Identifiable {
  case auto
  case light
  case dark

  var id: String { rawValue }
  var label: String { rawValue.capitalized }
}

enum NumaPrimaryJob: String, Codable, CaseIterable, Identifiable {
  case netWorth = "net_worth"
  case dailySpending = "daily_spending"
  case sharedMoney = "shared_money"

  var id: String { rawValue }
  var title: String {
    switch self {
    case .netWorth: "Track my net worth"
    case .dailySpending: "Track daily spending"
    case .sharedMoney: "Share expenses with someone"
    }
  }
  var template: NumaStarterTemplate {
    switch self {
    case .netWorth, .dailySpending: .personalCapital
    case .sharedMoney: .tripSharedFlat
    }
  }
  var appMode: NumaAppMode {
    switch self {
    case .netWorth: .advanced
    case .dailySpending: .light
    case .sharedMoney: .shared
    }
  }
}

enum NumaStarterTemplate: String, Codable, CaseIterable, Identifiable {
  case personalCapital = "personal_capital"
  case coupleFamily = "couple_family"
  case tripSharedFlat = "trip_shared_flat"

  var id: String { rawValue }
  var title: String {
    switch self {
    case .personalCapital: "Personal Capital"
    case .coupleFamily: "Couple / Family"
    case .tripSharedFlat: "Trip / Shared Flat"
    }
  }
}

struct MobileProfile: Codable, Identifiable, Equatable {
  let id: String
  let userId: String
  let email: String?
  var displayName: String
  var defaultCurrency: CurrencyCode
  var theme: NumaAppearance
  var locale: String
  var appMode: NumaAppMode
  var themeKey: NumaThemeKey
  var primaryJob: NumaPrimaryJob?
  var starterTemplate: NumaStarterTemplate?
  var onboardingCompletedAt: Double?
  var deletionScheduledAt: Double?
  var deletionStartedAt: Double?
  let createdAt: Double
}

struct MobileDeletionCancellationResponse: Codable, Equatable {
  let ok: Bool
  let reason: String?
}

enum NumaDeletionCancellationResult: Equatable {
  case canceled
  case alreadyStarted
  case alreadyDeleted
}

enum NumaDeletionRecoveryTransition {
  static func applyLifecycle(
    profile: inout MobileProfile,
    scheduledAt: Double?,
    startedAt: Double?
  ) {
    profile.deletionScheduledAt = scheduledAt
    profile.deletionStartedAt = startedAt
  }

  static func resolve(
    profile: inout MobileProfile,
    response: MobileDeletionCancellationResponse,
    now: Double = Date().timeIntervalSince1970 * 1000
  ) -> NumaDeletionCancellationResult {
    guard response.ok else {
      profile.deletionStartedAt = profile.deletionStartedAt ?? now
      return response.reason == "already-started" ? .alreadyStarted : .alreadyDeleted
    }
    profile.deletionScheduledAt = nil
    profile.deletionStartedAt = nil
    return .canceled
  }
}

enum NumaOnboardingPolicy {
  enum Decision: Equatable {
    case show
    case ready
    case persistThenReady
  }

  static func decision(
    localCompleted: Bool,
    cloudCompletedAt: Double?,
    hasRealData: Bool
  ) -> Decision {
    if cloudCompletedAt != nil { return .ready }
    if localCompleted || hasRealData { return .persistThenReady }
    return .show
  }
}

struct MobilePortfolio: Codable, Identifiable, Equatable {
  let id: String
  let name: String
  let type: String
  let tagline: String
  let defaultCurrency: CurrencyCode
  let role: String
  let ownershipBps: Double
  let createdAt: Double
  var spaceKind: String? = nil
  var businessOwnershipBps: Double? = nil
}

struct MobileDashboard: Codable, Equatable {
  let currency: CurrencyCode
  let monthIncome: Double
  let monthExpenses: Double
  let monthCashflow: Double
  let monthDelta: Double?
  let liquid: Double
  let invested: Double
  let hardAssets: Double
  let liabilities: Double
  let netWorth: Double
  let transactionCount: Int
  let goalCount: Int
  var dataQuality: MobileDashboardQuality? = nil
}

struct MobileDashboardQuality: Codable, Equatable {
  let generatedAt: Double
  let validUntil: Double?
  let fxEstimated: Bool
  let fxAsOf: Double?
  let missingQuoteCount: Int
  let staleQuoteCount: Int
  var periodStart: Double? = nil
  var periodEndExclusive: Double? = nil
  var recordedThrough: Double? = nil

  /// Nil keeps callers conservative when older servers omit period provenance.
  func containsRecordedTransaction(at timestamp: Double) -> Bool? {
    guard timestamp.isFinite, generatedAt.isFinite,
          let periodStart, periodStart.isFinite,
          let periodEndExclusive, periodEndExclusive.isFinite,
          let recordedThrough, recordedThrough.isFinite,
          periodStart <= recordedThrough,
          recordedThrough < periodEndExclusive,
          recordedThrough <= generatedAt else { return nil }
    return timestamp >= periodStart && timestamp < periodEndExclusive && timestamp <= recordedThrough
  }

  func isCurrent(at now: Date) -> Bool {
    let timestamp = now.timeIntervalSince1970 * 1000
    guard generatedAt.isFinite, generatedAt <= timestamp,
          let validUntil, validUntil.isFinite else { return false }
    return timestamp < validUntil
  }
}

struct MobileCategory: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let name: String
  let kind: String
  let icon: String
  let color: String
  let sortOrder: Double
  let emoji: String?
  let monthlyLimit: Double?
  var budgetCurrency: CurrencyCode? = nil
}

struct MobileTransaction: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let occurredAt: Double
  let description: String
  let categoryId: String?
  let accountId: String?
  let kind: String
  let amount: Double
  let currency: CurrencyCode
  let createdByUserId: String
  let notes: String?
}

struct MobileAsset: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let name: String
  let kind: String
  var investmentType: String? = nil
  let balance: Double
  let currency: CurrencyCode
  let notes: String?
  let updatedAt: Double
}

struct MobileLiability: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let name: String
  let kind: String
  let balance: Double
  let currency: CurrencyCode
  let interestRate: Double?
  let dueDate: Double?
  let notes: String?
  let updatedAt: Double
}

struct MobileHolding: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let symbol: String
  let name: String
  let kind: String
  let quantity: Double
  let costBasis: Double
  let currency: CurrencyCode
  let acquiredAt: Double
  let marketPrice: Double
  let marketValue: Double
  let changePercent: Double
  let quoteProvider: String?
  let quoteUpdatedAt: Double?
}

struct MobileGoal: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let scope: String
  let target: Double
  let currency: CurrencyCode
  let startAt: Double
  let deadline: Double?
  let label: String?
  let categoryId: String?
  let assetId: String?
  let holdingId: String?
  let createdAt: Double
}

struct MobileRecurring: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let description: String
  let kind: String
  let amount: Double
  let currency: CurrencyCode
  let categoryId: String?
  let accountId: String?
  let cadence: String
  let startAt: Double
  let nextRunAt: Double
  let endAt: Double?
  let notes: String?
  let active: Bool
  let createdAt: Double
  var revenueType: String? = nil
  var incomeSource: String? = nil
}

struct NumaRevenueSource: Codable, Equatable, Identifiable {
  let source: String
  let monthly: Double
  let rules: Int
  var id: String { source }
}

struct NumaRevenueExclusion: Codable, Equatable, Identifiable {
  let id: String
  let description: String
  let reason: String
}

/// Server-computed business run-rate. Present only for business spaces.
/// MRR counts explicitly marked subscriptions and retainers; it is not cash.
struct NumaRecurringRevenue: Codable, Equatable {
  let currency: CurrencyCode
  let valuedAt: Double
  let mrr: Double
  let arr: Double
  let qualifyingRules: Int
  let revenueSources: [NumaRevenueSource]
  let scheduledMonthlyIncome: Double
  let incomeSources: [NumaRevenueSource]
  let excluded: [NumaRevenueExclusion]
}

struct MobileWealthSnapshot: Codable, Identifiable, Equatable {
  let id: String
  let portfolioId: String
  let takenAt: Double
  let netWorth: Double
  let liquid: Double
  let invested: Double
  let hardAssets: Double
  let liabilities: Double
  let currency: CurrencyCode
  let label: String?
  let isAuto: Bool
}

struct MobilePortfolioSnapshot: Codable, Equatable {
  let portfolio: MobilePortfolio
  let dashboard: MobileDashboard
  let categories: [MobileCategory]
  let transactions: [MobileTransaction]
  let assets: [MobileAsset]
  let liabilities: [MobileLiability]
  let holdings: [MobileHolding]
  let goals: [MobileGoal]
  let recurring: [MobileRecurring]
  let wealthSnapshots: [MobileWealthSnapshot]
  var transfers: [MobileCashTransfer]? = nil
  var revenue: NumaRecurringRevenue? = nil
}

struct MobileBootstrap: Codable, Equatable {
  let profile: MobileProfile
  let portfolios: [MobilePortfolio]
  let selectedPortfolioId: String?
  let portfolioSnapshot: MobilePortfolioSnapshot?
  let pods: [MobilePod]
  let hasRealData: Bool
}

struct MobileCloudProfileStatus: Codable, Equatable {
  let onboardingCompletedAt: Double?
  let deletionScheduledAt: Double?
  let deletionStartedAt: Double?
}

extension NumaAppMode {
  var defaultPrimaryJob: NumaPrimaryJob {
    switch self {
    case .light: .dailySpending
    case .advanced: .netWorth
    case .shared: .sharedMoney
    }
  }
}
