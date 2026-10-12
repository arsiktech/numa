import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation

@MainActor
@Observable
final class PodStore {
  enum Phase: Equatable {
    case idle
    case loading
    case ready
    case empty
    case failed(String)
  }

  private let session: NumaSessionStore
  private nonisolated(unsafe) let client: ConvexClientWithAuth<String>
  private var bootstrapTask: Task<Void, Never>?
  private var podsTask: Task<Void, Never>?
  private var snapshotTask: Task<Void, Never>?
  private var didStart = false
  private var createPodMutationId: String?

  var phase: Phase = .idle
  var user: MobileUser?
  var pods: [MobilePod] = []
  var selectedPodId: String?
  var snapshot: MobilePodSnapshot?
  var saving = false
  var errorMessage: String?
  private var isDemo = false

  init(session: NumaSessionStore) {
    self.session = session
    self.client = session.client
  }

  func start() {
    guard !didStart else { return }
    guard let lease = try? session.beginAccountLease() else { return }
    didStart = true
    phase = .loading
    bootstrapTask = Task { [weak self] in
      await self?.bootstrap(lease: lease)
    }
  }

  func reset(preserveCreateIntent: Bool = false) {
    didStart = false
    bootstrapTask?.cancel()
    podsTask?.cancel()
    snapshotTask?.cancel()
    bootstrapTask = nil
    podsTask = nil
    snapshotTask = nil
    user = nil
    pods = []
    selectedPodId = nil
    snapshot = nil
    saving = false
    phase = .idle
    errorMessage = nil
    isDemo = false
    if !preserveCreateIntent { createPodMutationId = nil }
  }

  func startDemo() {
    guard !isDemo else { return }
    podsTask?.cancel()
    snapshotTask?.cancel()
    isDemo = true
    user = MobileUser(
      id: "usr_demo_arsik",
      email: "arsik@example.com",
      displayName: "Arsik",
      defaultCurrency: "EUR"
    )
    let pod = MobilePod(id: "pod_demo_home", name: "Barcelona", currency: "EUR", myRole: .owner)
    pods = [pod]
    selectedPodId = pod.id
    snapshot = Self.demoSnapshot(pod: pod)
    phase = .ready
  }

  func selectPod(_ podId: String) {
    guard let lease = try? session.beginAccountLease() else { return }
    selectedPodId = podId
    subscribeSnapshot(podId: podId, lease: lease)
  }

  @discardableResult
  func createPod(name: String = "Home pod", currency: String = "EUR") async -> Bool {
    if isDemo {
      startDemo()
      return true
    }
    guard let lease = try? session.beginAccountLease() else { return false }
    let mutationId = createPodMutationId ?? ClientMutationID.make("mobile.createPod")
    createPodMutationId = mutationId
    saving = true
    defer {
      _ = lease.performIfCurrent { saving = false }
    }
    do {
      let result: MobileMutationResult = try await client.mutation(
        "mobile:createPod",
        with: [
          "clientMutationId": mutationId,
          "name": name,
          "currency": currency
        ]
      )
      guard lease.performIfCurrent({
        createPodMutationId = nil
        errorMessage = nil
        selectedPodId = result.id
        phase = .ready
      }) else { return false }
      subscribeSnapshot(podId: result.id, lease: lease)
      return true
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent {
        errorMessage = message
        phase = .failed(message)
      }
      return false
    }
  }

  @discardableResult
  func createExpense(from draft: ExpenseDraft) async -> Bool {
    guard let snapshot else { return false }
    if isDemo {
      applyDemoCreate(draft: draft, snapshot: snapshot)
      return true
    }
    guard let lease = try? session.beginAccountLease() else { return false }
    saving = true
    defer {
      _ = lease.performIfCurrent { saving = false }
    }
    do {
      let _: MobileMutationResult = try await client.mutation(
        "mobile:createExpense",
        with: draft.createArgs(snapshot: snapshot)
      )
      return lease.performIfCurrent { errorMessage = nil }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { errorMessage = message }
      return false
    }
  }

  @discardableResult
  func updateExpense(_ expense: MobilePodExpense, from draft: ExpenseDraft) async -> Bool {
    if isDemo {
      applyDemoUpdate(expense: expense, draft: draft)
      return true
    }
    guard let lease = try? session.beginAccountLease() else { return false }
    saving = true
    defer {
      _ = lease.performIfCurrent { saving = false }
    }
    do {
      let _: MobileMutationResult = try await client.mutation(
        "mobile:updateExpense",
        with: draft.updateArgs(expense: expense)
      )
      return lease.performIfCurrent { errorMessage = nil }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { errorMessage = message }
      return false
    }
  }

  @discardableResult
  func deleteExpense(
    _ expense: MobilePodExpense,
    clientMutationId: String
  ) async -> Bool {
    if isDemo {
      applyDemoDelete(expense: expense)
      return true
    }
    guard let lease = try? session.beginAccountLease() else { return false }
    saving = true
    defer {
      _ = lease.performIfCurrent { saving = false }
    }
    do {
      let _: MobileMutationResult = try await client.mutation(
        "mobile:deleteExpense",
        with: [
          "clientMutationId": clientMutationId,
          "expenseId": expense.id
        ]
      )
      return lease.performIfCurrent { errorMessage = nil }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { errorMessage = message }
      return false
    }
  }

  @discardableResult
  func updateCards(
    member: MobilePodMember,
    cards: [String],
    clientMutationId: String
  ) async -> Bool {
    if isDemo {
      applyDemoCards(member: member, cards: cards)
      return true
    }
    guard let lease = try? session.beginAccountLease() else { return false }
    saving = true
    defer {
      _ = lease.performIfCurrent { saving = false }
    }
    do {
      let _: MobileMutationResult = try await client.mutation(
        "mobile:updateMemberCards",
        with: [
          "clientMutationId": clientMutationId,
          "memberId": member.id,
          "cards": cards.map { Optional($0) as ConvexEncodable? } as [ConvexEncodable?]
        ]
      )
      return lease.performIfCurrent { errorMessage = nil }
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent { errorMessage = message }
      return false
    }
  }

  var myMember: MobilePodMember? {
    guard let userId = user?.id else { return nil }
    return snapshot?.members.first { $0.linkedUserId == userId }
  }

  var myBalance: MobilePodBalance? {
    guard let memberId = myMember?.id else { return nil }
    return snapshot?.balances.first { $0.memberId == memberId }
  }

  private func bootstrap(lease: NumaSessionLease) async {
    do {
      let nextUser: MobileUser = try await client.mutation("mobile:me")
      guard !Task.isCancelled else { return }
      guard lease.performIfCurrent({ user = nextUser }) else { return }
      subscribePods(lease: lease)
    } catch {
      let message = error.localizedDescription
      _ = lease.performIfCurrent {
        guard !Task.isCancelled else { return }
        phase = .failed(message)
      }
    }
  }

  private static func demoSnapshot(pod: MobilePod) -> MobilePodSnapshot {
    let now = Date().timeIntervalSince1970 * 1000
    let members = [
      MobilePodMember(
        id: "pm_demo_arsik",
        podId: pod.id,
        displayName: "Arsik",
        invitedEmail: nil,
        linkedUserId: "usr_demo_arsik",
        groupId: "pg_demo_us",
        role: .owner,
        joinedAt: now - 86400000,
        cards: ["ZEN", "Revolut"]
      ),
      MobilePodMember(
        id: "pm_demo_maya",
        podId: pod.id,
        displayName: "Maya",
        invitedEmail: "maya@example.com",
        linkedUserId: nil,
        groupId: "pg_demo_us",
        role: .editor,
        joinedAt: now - 86400000,
        cards: ["Cash"]
      ),
      MobilePodMember(
        id: "pm_demo_kim",
        podId: pod.id,
        displayName: "Kim",
        invitedEmail: "kim@example.com",
        linkedUserId: nil,
        groupId: "pg_demo_them",
        role: .editor,
        joinedAt: now - 86400000,
        cards: ["BBVA"]
      )
    ]
    let groups = [
      MobilePodGroup(id: "pg_demo_us", podId: pod.id, name: "Us", color: "mint"),
      MobilePodGroup(id: "pg_demo_them", podId: pod.id, name: "Them", color: "coral")
    ]
    let expenses = [
      MobilePodExpense(
        id: "pe_demo_dinner",
        podId: pod.id,
        paidByMemberId: "pm_demo_arsik",
        paidByCard: "ZEN",
        amount: 84.60,
        currency: pod.currency,
        description: "Tapas dinner",
        occurredAt: now - 3600000,
        splitMode: .equalPeople,
        participantMemberIds: members.map(\.id),
        customSplits: [],
        coveredGroupId: nil,
        notes: nil
      ),
      MobilePodExpense(
        id: "pe_demo_market",
        podId: pod.id,
        paidByMemberId: "pm_demo_kim",
        paidByCard: "BBVA",
        amount: 42.15,
        currency: pod.currency,
        description: "Groceries",
        occurredAt: now - 7200000,
        splitMode: .equalPeople,
        participantMemberIds: members.map(\.id),
        customSplits: [],
        coveredGroupId: nil,
        notes: "Fruit, breakfast, water"
      )
    ]
    return MobilePodSnapshot(
      pod: pod,
      members: members,
      groups: groups,
      expenses: expenses,
      settlements: [],
      balances: demoBalances(members: members, expenses: expenses, currency: pod.currency),
      settlementSummary: nil
    )
  }

  private func applyDemoCreate(draft: ExpenseDraft, snapshot: MobilePodSnapshot) {
    let expense = MobilePodExpense(
      id: "pe_demo_\(UUID().uuidString.lowercased())",
      podId: snapshot.pod.id,
      paidByMemberId: draft.paidByMemberId,
      paidByCard: draft.paidByCard.isEmpty ? nil : draft.paidByCard,
      amount: draft.amount ?? 0,
      currency: snapshot.pod.currency,
      description: draft.description,
      occurredAt: draft.occurredAt.timeIntervalSince1970 * 1000,
      splitMode: draft.splitMode,
      participantMemberIds: draft.participantMemberIds,
      customSplits: [],
      coveredGroupId: draft.coveredGroupId,
      notes: draft.notes.isEmpty ? nil : draft.notes
    )
    var next = snapshot
    next = MobilePodSnapshot(
      pod: next.pod,
      members: next.members,
      groups: next.groups,
      expenses: [expense] + next.expenses,
      settlements: next.settlements,
      balances: Self.demoBalances(members: next.members, expenses: [expense] + next.expenses, currency: next.pod.currency),
      settlementSummary: nil
    )
    self.snapshot = next
  }

  private func applyDemoUpdate(expense: MobilePodExpense, draft: ExpenseDraft) {
    guard let snapshot else { return }
    let updated = MobilePodExpense(
      id: expense.id,
      podId: expense.podId,
      paidByMemberId: draft.paidByMemberId,
      paidByCard: draft.paidByCard.isEmpty ? nil : draft.paidByCard,
      amount: draft.amount ?? expense.amount,
      currency: expense.currency,
      description: draft.description,
      occurredAt: draft.occurredAt.timeIntervalSince1970 * 1000,
      splitMode: draft.splitMode,
      participantMemberIds: draft.participantMemberIds,
      customSplits: expense.customSplits,
      coveredGroupId: draft.coveredGroupId,
      notes: draft.notes.isEmpty ? nil : draft.notes
    )
    let expenses = snapshot.expenses.map { $0.id == expense.id ? updated : $0 }
    self.snapshot = MobilePodSnapshot(
      pod: snapshot.pod,
      members: snapshot.members,
      groups: snapshot.groups,
      expenses: expenses.sorted { $0.occurredAt > $1.occurredAt },
      settlements: snapshot.settlements,
      balances: Self.demoBalances(members: snapshot.members, expenses: expenses, currency: snapshot.pod.currency),
      settlementSummary: nil
    )
  }

  private func applyDemoDelete(expense: MobilePodExpense) {
    guard let snapshot else { return }
    let expenses = snapshot.expenses.filter { $0.id != expense.id }
    self.snapshot = MobilePodSnapshot(
      pod: snapshot.pod,
      members: snapshot.members,
      groups: snapshot.groups,
      expenses: expenses,
      settlements: snapshot.settlements,
      balances: Self.demoBalances(members: snapshot.members, expenses: expenses, currency: snapshot.pod.currency),
      settlementSummary: nil
    )
  }

  private func applyDemoCards(member: MobilePodMember, cards: [String]) {
    guard let snapshot else { return }
    let cleanCards = cards.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    let members = snapshot.members.map { current in
      current.id == member.id
        ? MobilePodMember(
          id: current.id,
          podId: current.podId,
          displayName: current.displayName,
          invitedEmail: current.invitedEmail,
          linkedUserId: current.linkedUserId,
          groupId: current.groupId,
          role: current.role,
          joinedAt: current.joinedAt,
          cards: cleanCards
        )
        : current
    }
    self.snapshot = MobilePodSnapshot(
      pod: snapshot.pod,
      members: members,
      groups: snapshot.groups,
      expenses: snapshot.expenses,
      settlements: snapshot.settlements,
      balances: snapshot.balances,
      settlementSummary: snapshot.settlementSummary
    )
  }

  private static func demoBalances(
    members: [MobilePodMember],
    expenses: [MobilePodExpense],
    currency: CurrencyCode
  ) -> [MobilePodBalance] {
    var balances = Dictionary(uniqueKeysWithValues: members.map { ($0.id, 0.0) })
    for expense in expenses {
      balances[expense.paidByMemberId, default: 0] += expense.amount
      let participants = expense.participantMemberIds.isEmpty ? members.map(\.id) : expense.participantMemberIds
      let share = expense.amount / Double(max(participants.count, 1))
      for memberId in participants {
        balances[memberId, default: 0] -= share
      }
    }
    return members.map { member in
      MobilePodBalance(
        memberId: member.id,
        amount: ((balances[member.id] ?? 0) * 100).rounded() / 100,
        currency: currency
      )
    }
  }

  private func subscribePods(lease: NumaSessionLease) {
    podsTask?.cancel()
    podsTask = Task { [weak self] in
      guard let self else { return }
      guard lease.isCurrent() else { return }
      let publisher = client
        .subscribe(to: "mobile:listPods", yielding: [MobilePod].self)
        .replaceError(with: [])

      for await latest in publisher.values {
        guard !Task.isCancelled, lease.isCurrent() else { return }
        var nextSubscriptionId: String?
        guard lease.performIfCurrent({
          pods = latest
          if latest.isEmpty {
            phase = .empty
            selectedPodId = nil
            snapshot = nil
            snapshotTask?.cancel()
            return
          }
          phase = .ready
          let nextId = selectedPodId.flatMap { id in latest.first { $0.id == id }?.id } ?? latest[0].id
          if selectedPodId != nextId {
            selectedPodId = nextId
            nextSubscriptionId = nextId
          }
        }) else { return }
        if let nextSubscriptionId {
          subscribeSnapshot(podId: nextSubscriptionId, lease: lease)
        }
      }
    }
  }

  private func subscribeSnapshot(podId: String, lease: NumaSessionLease) {
    snapshotTask?.cancel()
    snapshotTask = Task { [weak self] in
      guard let self else { return }
      guard lease.isCurrent() else { return }
      let publisher = client
        .subscribe(
          to: "mobile:podSnapshot",
          with: ["podId": podId],
          yielding: MobilePodSnapshot?.self
        )
        .replaceError(with: nil)

      for await latest in publisher.values {
        guard !Task.isCancelled else { return }
        guard lease.performIfCurrent({ snapshot = latest }) else { return }
      }
    }
  }
}

struct ExpenseDraft {
  var clientMutationId: String
  var deleteMutationId: String
  var description: String
  var amountText: String
  var paidByMemberId: String
  var paidByCard: String
  var occurredAt: Date
  var splitMode: PodSplitMode
  var participantMemberIds: [String]
  var coveredGroupId: String?
  var notes: String

  var amount: Double? {
    Double(amountText.replacingOccurrences(of: ",", with: "."))
  }

  func createArgs(snapshot: MobilePodSnapshot) -> [String: ConvexEncodable] {
    var args: [String: ConvexEncodable] = [
      "clientMutationId": clientMutationId,
      "podId": snapshot.pod.id,
      "paidByMemberId": paidByMemberId,
      "amount": amount ?? 0,
      "currency": snapshot.pod.currency,
      "description": description,
      "occurredAt": occurredAt.timeIntervalSince1970 * 1000,
      "splitMode": splitMode.rawValue,
      "participantMemberIds": participantMemberIds.map { $0 as ConvexEncodable }
    ]
    if !paidByCard.isEmpty { args["paidByCard"] = paidByCard }
    if let coveredGroupId { args["coveredGroupId"] = coveredGroupId }
    if !notes.isEmpty { args["notes"] = notes }
    return args
  }

  func updateArgs(expense: MobilePodExpense) -> [String: ConvexEncodable] {
    var args: [String: ConvexEncodable] = [
      "clientMutationId": clientMutationId,
      "expenseId": expense.id,
      "paidByMemberId": paidByMemberId,
      "amount": amount ?? expense.amount,
      "currency": expense.currency,
      "description": description,
      "occurredAt": occurredAt.timeIntervalSince1970 * 1000,
      "splitMode": splitMode.rawValue,
      "participantMemberIds": participantMemberIds.map { $0 as ConvexEncodable }
    ]
    if !paidByCard.isEmpty { args["paidByCard"] = paidByCard }
    if let coveredGroupId { args["coveredGroupId"] = coveredGroupId }
    if !notes.isEmpty { args["notes"] = notes }
    return args
  }

  static func create(snapshot: MobilePodSnapshot, payer: MobilePodMember?) -> ExpenseDraft {
    ExpenseDraft(
      clientMutationId: ClientMutationID.make("mobile.createExpense"),
      deleteMutationId: ClientMutationID.make("mobile.deleteExpense"),
      description: "",
      amountText: "",
      paidByMemberId: payer?.id ?? snapshot.members.first?.id ?? "",
      paidByCard: payer?.cards.first ?? "",
      occurredAt: Date(),
      splitMode: .equalPeople,
      participantMemberIds: snapshot.members.map(\.id),
      coveredGroupId: nil,
      notes: ""
    )
  }

  static func edit(_ expense: MobilePodExpense) -> ExpenseDraft {
    ExpenseDraft(
      clientMutationId: ClientMutationID.make("mobile.updateExpense"),
      deleteMutationId: ClientMutationID.make("mobile.deleteExpense"),
      description: expense.description,
      amountText: String(format: "%.2f", expense.amount),
      paidByMemberId: expense.paidByMemberId,
      paidByCard: expense.paidByCard ?? "",
      occurredAt: expense.occurredDate,
      splitMode: expense.splitMode,
      participantMemberIds: expense.participantMemberIds,
      coveredGroupId: expense.coveredGroupId,
      notes: expense.notes ?? ""
    )
  }
}
