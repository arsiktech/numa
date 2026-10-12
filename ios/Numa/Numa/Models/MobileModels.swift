import Foundation

typealias CurrencyCode = String

struct MobileUser: Codable, Identifiable, Equatable {
  let id: String
  let email: String?
  let displayName: String
  let defaultCurrency: CurrencyCode
}

struct MobilePod: Codable, Identifiable, Equatable {
  let id: String
  let name: String
  let currency: CurrencyCode
  let myRole: PodRole
}

enum PodRole: String, Codable, Equatable {
  case owner
  case editor
  case viewer

  var canEditExpenses: Bool {
    self == .owner || self == .editor
  }
}

enum PodSplitMode: String, Codable, CaseIterable {
  case equalPeople = "equal_people"
  case equalGroups = "equal_groups"
  case custom
  case coveredGroup = "covered_group"
}

struct MobilePodMember: Codable, Identifiable, Equatable {
  let id: String
  let podId: String
  let displayName: String
  let invitedEmail: String?
  let linkedUserId: String?
  let groupId: String?
  let role: PodRole
  let joinedAt: Double
  let cards: [String]
}

struct MobilePodGroup: Codable, Identifiable, Equatable {
  let id: String
  let podId: String
  let name: String
  let color: String
}

struct MobileCustomSplit: Codable, Equatable {
  let memberId: String
  let bps: Double
}

struct MobilePodExpense: Codable, Identifiable, Equatable {
  let id: String
  let podId: String
  let paidByMemberId: String
  let paidByCard: String?
  let amount: Double
  let currency: CurrencyCode
  let description: String
  let occurredAt: Double
  let splitMode: PodSplitMode
  let participantMemberIds: [String]
  let customSplits: [MobileCustomSplit]
  let coveredGroupId: String?
  let notes: String?

  var occurredDate: Date {
    Date(timeIntervalSince1970: occurredAt / 1000)
  }
}

struct MobilePodSettlement: Codable, Identifiable, Equatable {
  let id: String
  let podId: String
  let fromMemberId: String
  let toMemberId: String
  let amount: Double
  let currency: CurrencyCode
  let occurredAt: Double
  let note: String?
}

struct MobilePodBalance: Codable, Equatable {
  let memberId: String
  let amount: Double
  let currency: CurrencyCode
}

struct MobilePodSettlementDraft: Codable, Equatable {
  let fromMemberId: String
  let toMemberId: String
  let amount: Double
  let currency: CurrencyCode
}

struct MobilePodTransfer: Codable, Equatable {
  let fromMemberId: String
  let toMemberId: String
  let fromName: String
  let toName: String
  let amount: Double
}

struct MobilePodSettlementSummary: Codable, Equatable {
  let state: String
  let counterpartyName: String?
  let amount: Double
  let currency: CurrencyCode
  let label: String
  let recommendedSettlementDraft: MobilePodSettlementDraft?
  let transfers: [MobilePodTransfer]
}

struct MobilePodSnapshot: Codable, Equatable {
  let pod: MobilePod
  let members: [MobilePodMember]
  let groups: [MobilePodGroup]
  let expenses: [MobilePodExpense]
  let settlements: [MobilePodSettlement]
  let balances: [MobilePodBalance]
  let settlementSummary: MobilePodSettlementSummary?

  var totalSpent: Double {
    expenses.reduce(0) { $0 + $1.amount }
  }
}

struct MobileMutationResult: Codable, Equatable {
  let id: String
  let clientMutationId: String?
  let replayed: Bool
}
