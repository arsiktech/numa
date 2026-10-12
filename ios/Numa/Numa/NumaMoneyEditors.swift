import SwiftUI
@preconcurrency import ConvexMobile

struct NumaTransferDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  var id: String?
  var amount = ""
  var currency = ""
  var fromAccountId = ""
  var toAccountId = ""
  var description = "Transfer"
  var notes = ""
  var occurredAt = Date()
  var sourceEventId = UUID().uuidString
  var clientMutationId = ClientMutationID.make("money.createTransfer")
  var deleteMutationId = ClientMutationID.make("money.deleteTransfer")
  init() {}
  init(transfer: MobileCashTransfer) {
    id = transfer.id
    portfolioId = transfer.portfolioId
    amount = NumaMoneyAmount.editString(transfer.amount)
    currency = transfer.currency
    fromAccountId = transfer.fromAccountId
    toAccountId = transfer.toAccountId
    description = transfer.description
    notes = transfer.notes ?? ""
    occurredAt = Date(timeIntervalSince1970: transfer.occurredAt / 1000)
    sourceEventId = transfer.sourceEventId
    clientMutationId = ClientMutationID.make("money.updateTransfer")
  }
  func arguments(snapshot: MobilePortfolioSnapshot, now: Date = Date()) -> [String: ConvexEncodable?]? {
    guard portfolioId == snapshot.portfolio.id,
          let cents = NumaMoneyAmount.minor(amount), ["EUR", "USD"].contains(currency),
          !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          occurredAt <= now, occurredAt.timeIntervalSince1970.isFinite,
          fromAccountId != toAccountId,
          [fromAccountId, toAccountId].allSatisfy({ id in snapshot.assets.contains {
            $0.id == id && $0.portfolioId == portfolioId && $0.kind == "cash" && $0.currency == currency
          } }), id == nil || snapshot.transfers?.contains(where: { $0.id == id }) == true else { return nil }
    var args: [String: ConvexEncodable?] = [
      "amount": Double(cents) / 100, "currency": currency,
      "fromAccountId": fromAccountId, "toAccountId": toAccountId,
      "occurredAt": (occurredAt.timeIntervalSince1970 * 1000).rounded(.down),
      "description": description.trimmingCharacters(in: .whitespacesAndNewlines),
      "notes": notes, "clientMutationId": clientMutationId
    ]
    if let id { args["id"] = id }
    else { args["portfolioId"] = portfolioId; args["sourceEventId"] = sourceEventId }
    return args
  }
}

struct NumaBudgetDraft: Equatable, NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext?
  var portfolioId: String?
  let category: MobileCategory
  var amount: String
  var clientMutationId = ClientMutationID.make("money.setCategoryBudget")
  init(category: MobileCategory) {
    self.category = category
    portfolioId = category.portfolioId
    amount = category.monthlyLimit.map { NumaMoneyAmount.editString($0) } ?? ""
  }
}

struct NumaTransferEditor: View {
  @Environment(NumaAppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @State var draft: NumaTransferDraft
  @State private var submitted: NumaTransferDraft?
  @State private var confirmDelete = false
  @State private var error: String?
  @State private var deleting = false

  private var valid: Bool {
    store.portfolioSnapshot.flatMap { draft.arguments(snapshot: $0) } != nil
  }
  var body: some View {
    NavigationStack {
      Form {
        Section {
          NumaActiveSpaceHeader()
          TextField("Amount", text: $draft.amount).keyboardType(.decimalPad).font(.largeTitle.bold())
            .accessibilityLabel("Transfer amount")
          Picker("Currency", selection: $draft.currency) {
            Text("EUR").tag("EUR"); Text("USD").tag("USD")
          }
          TextField("Description", text: $draft.description).accessibilityLabel("Transfer description")
          if let snapshot = store.portfolioSnapshot {
            let accounts = snapshot.assets.filter { $0.kind == "cash" && $0.currency == draft.currency }
            NumaMoneyAccountPicker(title: "From account", selection: $draft.fromAccountId, accounts: accounts)
            NumaMoneyAccountPicker(title: "To account", selection: $draft.toAccountId,
              accounts: accounts.filter { $0.id != draft.fromAccountId })
            if accounts.count < 2 { Text("Add two cash accounts in the same currency in Wealth first.") }
          }
          NumaRecordedDatePicker(date: $draft.occurredAt)
          TextField("Notes (optional)", text: $draft.notes, axis: .vertical).accessibilityLabel("Transfer notes")
        } footer: {
          Text("Records money already moved between your accounts in this space. Does not move real money or affect profit. Cross-currency transfers are not supported.")
        }.disabled(submitted != nil || store.saving)
        if let error { Section { Text(error).foregroundStyle(numa.negative) } }
        if submitted != nil {
          Section { Text("The outcome is unconfirmed. Retry the same record safely; its values are locked to prevent duplicate or mismatched saves.") }
        }
        if draft.id != nil && submitted == nil {
          Section { Button("Delete transfer", role: .destructive) { confirmDelete = true } }
            .disabled(store.saving)
        }
      }
      .navigationTitle(draft.id == nil ? "Record transfer" : "Edit transfer")
      .toolbarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(store.saving) }
        ToolbarItem(placement: .confirmationAction) {
          Button(submitted == nil ? "Save" : "Retry") { Task { await save() } }
            .disabled((submitted == nil && !valid) || store.saving)
        }
      }
      .interactiveDismissDisabled(store.saving)
      .confirmationDialog("Delete this transfer and undo both recorded account changes?", isPresented: $confirmDelete, titleVisibility: .visible) {
        Button("Delete transfer", role: .destructive) { deleting = true; Task { await save() } }
        Button("Cancel", role: .cancel) {}
      }
      .onAppear {
        draft.bind(to: store.spaceContext)
        if draft.currency.isEmpty { draft.currency = store.activeSpace?.defaultCurrency ?? "EUR" }
      }
      .onChange(of: draft.currency) { old, _ in
        if !old.isEmpty { draft.fromAccountId = ""; draft.toAccountId = "" }
      }
    }
  }
  private func save() async {
    guard !store.saving, let snapshot = store.portfolioSnapshot else { return }
    let intent = submitted ?? draft
    let args: [String: ConvexEncodable?]
    let operation: String
    if deleting, let id = intent.id {
      args = ["id": id, "clientMutationId": intent.deleteMutationId]
      operation = "money:deleteTransfer"
    } else {
      guard let validated = intent.arguments(snapshot: snapshot) else { return }
      args = validated
      operation = intent.id == nil ? "money:createTransfer" : "money:updateTransfer"
    }
    submitted = intent
    if let message = await store.performMoneyMutation(operation, arguments: args, draft: intent) {
      error = message
    } else { dismiss() }
  }
}

struct NumaBudgetEditor: View {
  @Environment(NumaAppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State var draft: NumaBudgetDraft
  @State private var submitted = false
  @State private var remove = false
  @State private var error: String?
  @State private var confirmRemove = false
  var body: some View {
    NavigationStack {
      Form {
        Section {
          NumaActiveSpaceHeader()
          Text(draft.category.name).font(.headline)
          TextField("Monthly limit", text: $draft.amount).keyboardType(.decimalPad).accessibilityLabel("Monthly limit")
          Text("\(draft.category.budgetCurrency ?? store.activeSpace?.defaultCurrency ?? "EUR") · recurring monthly category limit")
            .font(.caption)
        }.disabled(submitted || store.saving)
        if let error { Text(error) }
        if submitted { Text("Retry keeps the same limit and request identity until the result is confirmed.") }
        if draft.category.monthlyLimit != nil && !submitted {
          Button("Remove limit", role: .destructive) { confirmRemove = true }.disabled(store.saving)
        }
      }
      .navigationTitle("Category budget")
      .toolbarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(store.saving) }
        ToolbarItem(placement: .confirmationAction) {
          Button(submitted ? "Retry" : "Save") { Task { await save() } }
            .disabled(store.saving || (!remove && NumaMoneyAmount.minor(draft.amount) == nil))
        }
      }
      .interactiveDismissDisabled(store.saving)
      .confirmationDialog("Remove this category's monthly limit?", isPresented: $confirmRemove, titleVisibility: .visible) {
        Button("Remove limit", role: .destructive) { remove = true; Task { await save() } }
        Button("Cancel", role: .cancel) {}
      }
      .onAppear { draft.bind(to: store.spaceContext) }
    }
  }
  private func save() async {
    guard !store.saving, remove || NumaMoneyAmount.minor(draft.amount) != nil else { return }
    let limit: Double? = remove ? nil : NumaMoneyAmount.minor(draft.amount).map { Double($0) / 100 }
    let args: [String: ConvexEncodable?] = ["categoryId": draft.category.id,
      "monthlyLimit": limit, "clientMutationId": draft.clientMutationId]
    submitted = true
    if let message = await store.performMoneyMutation("money:setCategoryBudget", arguments: args, draft: draft) { error = message }
    else { dismiss() }
  }
}

/// Compact date capsules cannot share one row with an A5 label. Keep the
/// native picker, but give its label and value their own lines when enlarged.
struct NumaRecordedDatePicker: View {
  @Binding var date: Date
  @Environment(\.dynamicTypeSize) private var typeSize
  var body: some View {
    if typeSize.isAccessibilitySize {
      VStack(alignment: .leading, spacing: 8) {
        Text("Date").font(.headline)
        DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
          .labelsHidden().accessibilityLabel("Date")
      }
    } else {
      DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
    }
  }
}

struct NumaMoneyAccountPicker: View {
  let title: String
  @Binding var selection: String
  let accounts: [MobileAsset]
  var body: some View {
    Menu {
      Button("Choose account") { selection = "" }
      ForEach(accounts) { account in Button(account.name) { selection = account.id } }
    } label: {
      SheetPickerRow(title: title, value: accounts.first(where: { $0.id == selection })?.name ?? "Choose account")
    }
  }
}
