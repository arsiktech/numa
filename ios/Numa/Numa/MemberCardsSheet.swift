import SwiftUI

struct MemberCardsSheet: View {
  @Environment(PodStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa

  let member: MobilePodMember
  @State private var cardsText: String
  @State private var clientMutationId = ClientMutationID.make("mobile.updateMemberCards")

  init(member: MobilePodMember) {
    self.member = member
    _cardsText = State(initialValue: member.cards.joined(separator: ", "))
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          NumaCard {
            VStack(alignment: .leading, spacing: 12) {
              Text(member.displayName)
                .font(.title2.bold())
                .foregroundStyle(numa.ink)
                .lineLimit(2)
              Text("Card labels are used when a shared expense was paid from a specific card or account.")
                .font(.subheadline)
                .foregroundStyle(numa.ink3)
            }
          }

          NumaTextField(title: "Cards", text: $cardsText, placeholder: "ZEN, Revolut, Cash")

          Text("Separate labels with commas.")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(numa.ink3)
        }
        .padding(18)
        .padding(.bottom, 96)
      }
      .background(numa.bg)
      .navigationTitle("Card labels")
      .toolbarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .bottom) {
        BottomSheetActionBar {
          NumaPrimaryButton(title: store.saving ? "Saving..." : "Save labels", systemImage: "checkmark") {
            Task {
              if await store.updateCards(
                member: member,
                cards: parsedCards,
                clientMutationId: clientMutationId
              ) {
                dismiss()
              }
            }
          }
          .disabled(store.saving)
          .opacity(store.saving ? 0.45 : 1)
        }
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            dismiss()
          }
        }
      }
    }
  }

  private var parsedCards: [String] {
    cardsText
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }
}
