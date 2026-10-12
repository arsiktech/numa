import SwiftUI

enum ExpenseEditorMode: Identifiable, Equatable {
  case create
  case edit(MobilePodExpense)

  var id: String {
    switch self {
    case .create:
      "create"
    case .edit(let expense):
      expense.id
    }
  }
}


struct ExpenseEditorSheet: View {
  @Environment(PodStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa

  let mode: ExpenseEditorMode
  let snapshot: MobilePodSnapshot

  @State private var draft: ExpenseDraft
  @State private var deleteConfirmation = false

  init(mode: ExpenseEditorMode, snapshot: MobilePodSnapshot) {
    self.mode = mode
    self.snapshot = snapshot
    switch mode {
    case .create:
      _draft = State(initialValue: .create(snapshot: snapshot, payer: nil))
    case .edit(let expense):
      _draft = State(initialValue: .edit(expense))
    }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          NumaTextField(title: "Description", text: $draft.description, placeholder: "Dinner, groceries, taxi...")
          NumaTextField(title: "Amount", text: $draft.amountText, placeholder: "24.00", keyboard: .decimalPad)
          NumaCard {
            DatePicker("Date", selection: $draft.occurredAt, displayedComponents: .date)
              .foregroundStyle(numa.ink)
              .tint(numa.brand)
          }

          NumaCard {
            VStack(spacing: 14) {
              Menu {
                ForEach(snapshot.members) { member in
                  Button(member.displayName) { draft.paidByMemberId = member.id }
                }
              } label: {
                SheetPickerRow(title: "Paid by", value: selectedPayer?.displayName ?? "Member")
              }
              Divider().overlay(numa.line)
              if (selectedPayer?.cards ?? []).isEmpty {
                NumaTextField(title: "Card label", text: $draft.paidByCard, placeholder: "Optional")
              } else {
                Menu {
                  Button("No card") { draft.paidByCard = "" }
                  ForEach(selectedPayer?.cards ?? [], id: \.self) { card in
                    Button(card) { draft.paidByCard = card }
                  }
                } label: {
                  SheetPickerRow(title: "Card", value: draft.paidByCard.isEmpty ? "No card" : draft.paidByCard)
                }
              }
            }
          }

          NumaCard {
            VStack(alignment: .leading, spacing: 14) {
              Menu {
                Button("Equal") { draft.splitMode = .equalPeople }
                Button("Shares") { draft.splitMode = .equalGroups }
                Button("Percent") { draft.splitMode = .custom }
                Button("Covered group") { draft.splitMode = .coveredGroup }
              } label: {
                SheetPickerRow(title: "Split", value: splitLabel)
              }

              if draft.splitMode == .coveredGroup {
                Divider().overlay(numa.line)
                Menu {
                  ForEach(snapshot.groups) { group in
                    Button(group.name) { draft.coveredGroupId = group.id }
                  }
                } label: {
                  let selected = snapshot.groups.first(where: { $0.id == draft.coveredGroupId })?.name ?? snapshot.groups.first?.name ?? "Group"
                  SheetPickerRow(title: "Covered group", value: selected)
                }
              }

              Divider().overlay(numa.line)
              Text("Participants")
                .font(.headline)
                .foregroundStyle(numa.ink)
              ForEach(snapshot.members) { member in
                Toggle(isOn: participantBinding(member.id)) {
                  Text(member.displayName)
                    .lineLimit(1)
                    .foregroundStyle(numa.ink)
                }
                .tint(numa.brand)
              }
            }
          }

          NumaTextField(title: "Notes", text: $draft.notes, placeholder: "Optional")

          if case .edit = mode {
            Button(role: .destructive) {
              deleteConfirmation = true
            } label: {
              Label("Delete expense", systemImage: "trash")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NumaSecondaryButtonStyle())
          }
        }
        .padding(18)
        .padding(.bottom, 32)
      }
      .background(numa.bg)
      .navigationTitle(title)
      .toolbarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .bottom) {
        BottomSheetActionBar {
          NumaPrimaryButton(title: store.saving ? "Saving..." : "Save expense", systemImage: "checkmark") {
            Task { await save() }
          }
          .disabled(!isValid || store.saving)
          .opacity(isValid && !store.saving ? 1 : 0.45)
        }
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            dismiss()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            Task { await save() }
          }
          .disabled(!isValid || store.saving)
        }
      }
      .confirmationDialog("Delete this expense?", isPresented: $deleteConfirmation, titleVisibility: .visible) {
        Button("Delete", role: .destructive) {
          Task { await deleteExpense() }
        }
        Button("Cancel", role: .cancel) {}
      }
    }
  }

  private var splitLabel: String {
    switch draft.splitMode {
    case .equalPeople:
      "Equal"
    case .equalGroups:
      "Shares"
    case .coveredGroup:
      "Covered group"
    case .custom:
      "Percent"
    }
  }

  private var title: String {
    switch mode {
    case .create:
      "Add expense"
    case .edit:
      "Edit expense"
    }
  }

  private var selectedPayer: MobilePodMember? {
    snapshot.members.first { $0.id == draft.paidByMemberId }
  }

  private var isValid: Bool {
    draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false &&
    (draft.amount ?? 0) > 0 &&
    draft.participantMemberIds.isEmpty == false &&
    snapshot.members.contains { $0.id == draft.paidByMemberId }
  }

  private func participantBinding(_ id: String) -> Binding<Bool> {
    Binding {
      draft.participantMemberIds.contains(id)
    } set: { isOn in
      if isOn {
        if !draft.participantMemberIds.contains(id) {
          draft.participantMemberIds.append(id)
        }
      } else {
        draft.participantMemberIds.removeAll { $0 == id }
      }
    }
  }

  private func save() async {
    let saved: Bool
    switch mode {
    case .create:
      saved = await store.createExpense(from: draft)
    case .edit(let expense):
      saved = await store.updateExpense(expense, from: draft)
    }
    if saved { dismiss() }
  }

  private func deleteExpense() async {
    if case .edit(let expense) = mode {
      if await store.deleteExpense(
        expense,
        clientMutationId: draft.deleteMutationId
      ) {
        dismiss()
      }
    }
  }
}
