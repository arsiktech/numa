import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

private struct NativeQuickExpensePreset: Identifiable {
  let title: String
  let amount: Double
  let systemImage: String
  let categoryKeywords: [String]

  var id: String { title }
}

private let nativeQuickExpensePresets: [NativeQuickExpensePreset] = [
  NativeQuickExpensePreset(title: "Coffee", amount: 4.50, systemImage: "cup.and.saucer.fill", categoryKeywords: ["coffee", "cafe", "dining", "food"]),
  NativeQuickExpensePreset(title: "Lunch", amount: 12, systemImage: "fork.knife", categoryKeywords: ["lunch", "restaurant", "dining", "food"]),
  NativeQuickExpensePreset(title: "Groceries", amount: 40, systemImage: "basket.fill", categoryKeywords: ["grocery", "groceries", "food", "shopping"]),
  NativeQuickExpensePreset(title: "Ride", amount: 8, systemImage: "car.fill", categoryKeywords: ["transport", "taxi", "ride", "uber", "travel"])
]

struct UniversalCaptureNativeSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var textSize
  @State private var text = ""

  var body: some View {
    NavigationStack {
      ScrollView {
      VStack(alignment: .leading, spacing: 18) {
          NumaActiveSpaceHeader()
        Text("Saves only to the active space. Add shared pod expenses from Shared.")
          .font(.caption).foregroundStyle(numa.ink3)

        NumaCard {
          VStack(alignment: .leading, spacing: 12) {
            Text("Start with one tap")
              .font(.headline)
              .foregroundStyle(numa.ink)
            Text("Pick a common expense. Numa Pro fills the amount, note, and best category; you still save explicitly.")
              .font(.caption.weight(.medium))
              .foregroundStyle(numa.ink3)
              .fixedSize(horizontal: false, vertical: true)
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 8) {
                ForEach(nativeQuickExpensePresets) { preset in
                  NativeQuickPresetButton(
                    preset: preset,
                    currency: appStore.currency
                  ) {
                    openPreset(preset)
                  }
                }
              }
              .padding(.vertical, 1)
            }
          }
        }

        NumaCard {
          VStack(alignment: .leading, spacing: 12) {
            Text("Text capture")
              .font(.headline)
              .foregroundStyle(numa.ink)
            TextField("coffee 5.50, groceries 80", text: $text, axis: .vertical)
              .textFieldStyle(.plain)
              .font(.body)
              .lineLimit(3...5)
              .padding(12)
              .background(numa.bg)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            NumaPrimaryButton(title: "Create editable draft", systemImage: "sparkles") {
              presentAfterDismiss(.transaction(TransactionDraft()))
            }
          }
        }

        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: textSize.isAccessibilitySize ? 1 : 2), spacing: 10) {
          QuickAction(title: "Manual", systemImage: "square.and.pencil") {
            presentAfterDismiss(.transaction(TransactionDraft()))
          }
          .accessibilityIdentifier("capture.manual")
          QuickAction(title: "Voice", systemImage: "mic.fill") {
            presentAfterDismiss(.voice)
          }
          .accessibilityIdentifier("capture.voice")
          QuickAction(title: "Scan", systemImage: "viewfinder") {
            presentAfterDismiss(.scan)
          }
          .accessibilityIdentifier("capture.scan")
          QuickAction(title: "Ask Numa Pro", systemImage: "sparkles") {
            presentAfterDismiss(.askNuma)
          }
          .accessibilityIdentifier("capture.askNuma")
        }

        Spacer()
      }
      .padding(20)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(numa.bg.ignoresSafeArea())
      .navigationTitle("Capture")
      .toolbarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }

  private func openPreset(_ preset: NativeQuickExpensePreset) {
    Haptic.tap()
    presentAfterDismiss(.transaction(draft(for: preset)))
  }

  private func presentAfterDismiss(_ sheet: NumaSheet) {
    let context = appStore.spaceContext
    dismiss()
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: NumaMotion.sheetHandoffDelay(reduceMotion: reduceMotion))
      guard !Task.isCancelled, context == appStore.spaceContext else { return }
      appStore.activeSheet = sheet
    }
  }

  private func draft(for preset: NativeQuickExpensePreset) -> TransactionDraft {
    var draft = TransactionDraft()
    draft.description = preset.title
    draft.amount = formatPresetAmount(preset.amount)
    draft.kind = "expense"
    draft.categoryId = categoryId(for: preset)
    return draft
  }

  private func categoryId(for preset: NativeQuickExpensePreset) -> String? {
    guard let snapshot = appStore.portfolioSnapshot else { return nil }
    return snapshot.categories.first { category in
      guard category.kind == "expense" else { return false }
      let name = category.name.lowercased()
      return preset.categoryKeywords.contains { name.contains($0) }
    }?.id
  }

  private func formatPresetAmount(_ amount: Double) -> String {
    NumaMoneyAmount.editString(amount)
  }
}

private struct NativeQuickPresetButton: View {
  @Environment(\.numa) private var numa
  let preset: NativeQuickExpensePreset
  let currency: CurrencyCode
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Image(systemName: preset.systemImage)
          .font(.system(size: 13, weight: .bold))
          .frame(width: 28, height: 28)
          .background(numa.brandMist)
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        VStack(alignment: .leading, spacing: 1) {
          Text(preset.title)
            .font(.caption.weight(.bold))
            .foregroundStyle(numa.ink)
          Text(formatNumaMoney(preset.amount, currency))
            .font(NumaType.mono(11, .bold))
            .foregroundStyle(numa.ink3)
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(numa.paper)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(numa.line))
    }
    .buttonStyle(.plain)
  }
}

struct QuickAction: View {
  @Environment(\.numa) private var numa
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label {
        Text(title)
          .fixedSize(horizontal: false, vertical: true)
      } icon: {
        Image(systemName: systemImage)
      }
        .labelStyle(.titleAndIcon)
        .font(.subheadline.weight(.bold))
        .foregroundStyle(numa.ink)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 46)
        .background(numa.paper)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(numa.line))
    }
    .buttonStyle(.plain)
  }
}

struct TransactionEditorSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @State var draft: TransactionDraft
  @State private var confirmingDelete = false
  @State private var didFinish = false
  @State private var deletePending = false

  private var isValid: Bool {
    !draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
      NumaMoneyAmount.minor(draft.amount) != nil && ["EUR", "USD"].contains(draft.currency ?? "") &&
      draft.occurredAt <= Date()
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          NumaActiveSpaceHeader()
          TextField("0", text: $draft.amount)
            .keyboardType(.decimalPad)
            .font(.largeTitle.bold())
            .accessibilityLabel("Amount")
            .accessibilityIdentifier("money-amount")
          Text("Positive amount · up to two decimal places").font(.caption).foregroundStyle(numa.ink3)
          Picker("Currency", selection: $draft.currency) {
            Text("EUR").tag(Optional("EUR"))
            Text("USD").tag(Optional("USD"))
          }
          NumaTextField(title: "Description", text: $draft.description, placeholder: "Coffee, rent, salary...")
          NumaCard {
            VStack(spacing: 14) {
              Menu {
                Button("Expense") { draft.kind = "expense"; draft.categoryId = nil }
                Button("Income") { draft.kind = "income"; draft.categoryId = nil }
              } label: {
                SheetPickerRow(title: "Kind", value: draft.kind == "income" ? "Income" : "Expense")
              }
              Divider().overlay(numa.line)
              NumaRecordedDatePicker(date: $draft.occurredAt)
                .foregroundStyle(numa.ink)
                .tint(numa.brand)
            }
          }

        if let snapshot = appStore.portfolioSnapshot {
            NumaCard {
              Menu {
                Button("None") { draft.categoryId = nil }
                ForEach(snapshot.categories.filter { $0.kind == draft.kind }) { category in
                  Button(category.name) { draft.categoryId = category.id }
                }
              } label: {
                let selected = snapshot.categories.first(where: { $0.id == draft.categoryId })?.name ?? "None"
                SheetPickerRow(title: "Category", value: selected)
              }
            }
            NumaCard {
              Menu {
                Button("Unlinked") { draft.accountId = nil }
                ForEach(snapshot.assets.filter { $0.kind == "cash" && $0.currency == draft.currency }) { asset in
                  Button(asset.name) { draft.accountId = asset.id }
                }
              } label: {
                let selected = snapshot.assets.first(where: { $0.id == draft.accountId })?.name ?? "Unlinked"
                SheetPickerRow(title: "Cash account", value: selected)
              }
            }
          }

          Text("Unlinked records affect cash flow but do not update any cash account.").font(.caption).foregroundStyle(numa.ink3)
          NumaTextField(title: "Notes", text: $draft.notes, placeholder: "Optional")
          if draft.id != nil {
            Button(role: .destructive) {
              confirmingDelete = true
            } label: {
              Label("Delete transaction", systemImage: "trash")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NumaSecondaryButtonStyle())
          }
        }
        .disabled(appStore.saving || draft.outcomeUnconfirmed || deletePending)
        .padding(18)
        .padding(.bottom, 32)
      }
      .background(numa.bg)
      .navigationTitle(draft.id == nil ? "Add transaction" : "Edit transaction")
      .toolbarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .bottom) {
        BottomSheetActionBar {
          if draft.outcomeUnconfirmed || deletePending {
            Text("Outcome unconfirmed. Retry keeps the same values and prevents duplicates. Check your records before starting another entry.")
              .font(.caption).fixedSize(horizontal: false, vertical: true)
          }
          NumaPrimaryButton(title: deletePending ? "Retry deletion" : draft.outcomeUnconfirmed ? "Retry same record" : (draft.id == nil ? "Save transaction" : "Save changes"), systemImage: "checkmark") {
            Task { await performSave() }
          }
          .disabled((!isValid && !deletePending) || appStore.saving)
          .opacity((isValid || deletePending) && !appStore.saving ? 1 : 0.45)
        }
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }.disabled(appStore.saving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(deletePending ? "Retry" : "Save") {
            Task { await performSave() }
          }
          .disabled((!isValid && !deletePending) || appStore.saving)
        }
      }
      .confirmationDialog("Delete this transaction?", isPresented: $confirmingDelete, titleVisibility: .visible) {
        Button("Delete transaction", role: .destructive) {
          deletePending = true
          Task { await performDelete() }
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("This removes it from cashflow and updates the linked cash account.")
      }
      .interactiveDismissDisabled(appStore.saving)
      .onAppear {
        draft.bind(to: appStore.spaceContext)
        if draft.currency == nil { draft.currency = appStore.activeSpace?.defaultCurrency ?? "EUR" }
      }
      .onChange(of: draft.currency) { old, _ in if old != nil { draft.accountId = nil } }
      .onDisappear {
        guard !didFinish else { return }
        Task { await appStore.cancelReviewedTransaction(draft) }
      }
    }
  }

  private func performDelete() async {
    guard !appStore.saving, let id = draft.id else { return }
    if await appStore.deleteTransaction(id: id, clientMutationId: draft.deleteMutationId, context: draft.spaceContext) {
      didFinish = true
      dismiss()
    }
  }

  private func performSave() async {
    if deletePending { await performDelete(); return }
    switch await appStore.saveTransaction(draft) {
    case .saved:
      didFinish = true
      dismiss()
    case .retry(let nextDraft):
      draft = nextDraft
    }
  }
}

struct SheetPickerRow: View {
  @Environment(\.numa) private var numa
  let title: String
  let value: String
  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack { Text(title).font(.headline); Spacer(); valueLabel }
      VStack(alignment: .leading, spacing: 6) { Text(title).font(.headline); valueLabel }
    }
    .foregroundStyle(numa.ink)
    .frame(minHeight: 44)
    .contentShape(Rectangle())
  }
  private var valueLabel: some View {
    Label(value, systemImage: "chevron.up.chevron.down")
      .foregroundStyle(numa.ink2).fontWeight(.semibold)
      .fixedSize(horizontal: false, vertical: true)
  }
}

struct BottomSheetActionBar<Content: View>: View {
  @Environment(\.numa) private var numa
  @ViewBuilder var content: () -> Content

  var body: some View {
    content()
      .padding(.horizontal, 18)
      .padding(.top, 12)
      .padding(.bottom, 10)
      .background(.ultraThinMaterial)
      .overlay(alignment: .top) {
        Rectangle()
          .fill(numa.line)
          .frame(height: 1)
      }
  }
}

struct SearchNativeSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @State private var query = ""

  var results: [MobileTransaction] {
    let all = appStore.portfolioSnapshot?.transactions ?? []
    if query.isEmpty { return Array(all.prefix(12)) }
    return all.filter { $0.description.localizedCaseInsensitiveContains(query) }
  }

  var body: some View {
    NavigationStack {
      List {
        NumaActiveSpaceHeader().listRowBackground(numa.paper)
        ForEach(results) { tx in
          TransactionRowNative(transaction: tx)
            .listRowBackground(numa.paper)
        }
      }
      .searchable(text: $query)
      .navigationTitle("Search")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
      .scrollContentBackground(.hidden)
      .background(numa.bg)
    }
  }
}

struct AskNumaNativeSheet: View {
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @State private var prompt = ""
  @State private var answer: String?
  @State private var isAsking = false
  @State private var error: String?
  @State private var aiSharingAllowed = false

  var body: some View {
    NavigationStack {
      ScrollView {
      VStack(alignment: .leading, spacing: 16) {
          NumaActiveSpaceHeader()
          NumaPrivacyControls(compactWhenAllowed: true) { aiSharingAllowed = $0 }
        NumaCard {
          VStack(alignment: .leading, spacing: 12) {
            HStack {
              SparkleMark(size: 28)
              Text("Ask Numa Pro")
                .font(.title2.bold())
            }
            TextField("What changed this month?", text: $prompt, axis: .vertical)
              .textFieldStyle(.plain)
              .accessibilityLabel("Ask Numa Pro prompt")
              .padding(12)
              .background(numa.brandMist)
              .clipShape(RoundedRectangle(cornerRadius: 16))
            NumaPrimaryButton(title: isAsking ? "Thinking..." : "Ask", systemImage: "sparkles") {
              startAskNuma()
            }
            .disabled(!aiSharingAllowed || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isAsking)
          }
        }
        if let error {
          Text(error)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(numa.negative)
        }
        if let answer {
          NumaCard {
            VStack(alignment: .leading, spacing: 10) {
              Text("Numa Pro")
                .font(.headline)
              Text(answer)
                .foregroundStyle(numa.ink3)
              HStack {
                Button("Clear") { self.answer = nil }
                  .buttonStyle(NumaSecondaryButtonStyle())
                Button("Make draft") {
                  appStore.activeSheet = .transaction(TransactionDraft())
                }
                  .buttonStyle(NumaSecondaryButtonStyle())
              }
            }
          }
        }
        Spacer()
      }
      .padding(20)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(numa.bg)
      .navigationTitle("Numa Pro")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }

  private func startAskNuma() {
    guard aiSharingAllowed else { return }
    do {
      let spaceLease = try appStore.beginSpaceLease()
      let authorization = try session.beginAPIRequest()
      let submittedPrompt = prompt
      let snapshot = appStore.portfolioSnapshot
      let locale = appStore.profile?.locale
      isAsking = true
      error = nil
      Task {
        await askNuma(
          submittedPrompt,
          snapshot: snapshot,
          locale: locale,
          authorization: authorization,
          spaceLease: spaceLease
        )
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func askNuma(
    _ submittedPrompt: String,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?,
    authorization: NumaAPIRequestLease,
    spaceLease: NumaSpaceLease
  ) async {
    defer { isAsking = false }
    do {
      guard spaceLease.isCurrent() else { return }
      let answer = try await NumaCaptureClient.ask(
        submittedPrompt,
        snapshot: snapshot,
        locale: locale,
        authorization: authorization,
        tokenProvider: { try await session.freshAPIAuthToken(for: $0) }
      )
      guard spaceLease.isCurrent() else { return }
      self.answer = answer
    } catch {
      guard spaceLease.isCurrent() else { return }
      self.error = error.localizedDescription
    }
  }
}

struct VoiceNativeSheet: View {
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @State private var text = ""
  @State private var review: VoiceCaptureReview?
  @State private var isParsing = false
  @State private var error: String?
  @State private var aiSharingAllowed = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 18) {
          NumaActiveSpaceHeader()
          NumaPrivacyControls(compactWhenAllowed: true) { aiSharingAllowed = $0 }
        Image(systemName: "mic.fill")
          .font(.system(size: 42, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 96, height: 96)
          .background(numa.negative)
          .clipShape(Circle())
        Text("Voice add")
          .font(.largeTitle.bold())
        Text("Dictate or type a transaction. Numa Pro parses it, then you confirm before anything is saved.")
          .foregroundStyle(numa.ink3)
          .multilineTextAlignment(.center)
        TextField("Say or type: coffee 4.50", text: $text)
          .textFieldStyle(.roundedBorder)
          .accessibilityLabel("Voice text")
          .disabled(isParsing)
        NumaPrimaryButton(title: isParsing ? "Parsing..." : "Parse voice", systemImage: "waveform") {
          startVoiceParse()
        }
        .disabled(!aiSharingAllowed || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isParsing)
        if let error {
          Text(error)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(numa.negative)
        }
        if let review {
          CaptureResultCard(
            result: review.result,
            source: .voice(transcript: review.transcript)
          )
        }
        Spacer(minLength: 40)
        }
        .padding(24)
      }
      .background(numa.bg)
      .navigationTitle("Voice")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
      .onChange(of: text) { _, next in
        guard let review else { return }
        let normalized = try? NumaCaptureClient.normalizedReceiptText(next)
        if normalized != review.transcript { self.review = nil }
      }
    }
  }

  private func startVoiceParse() {
    guard aiSharingAllowed else { return }
    do {
      let spaceLease = try appStore.beginSpaceLease()
      let authorization = try session.beginAPIRequest()
      let snapshot = appStore.portfolioSnapshot
      let locale = appStore.profile?.locale
      let submittedTranscript = try NumaCaptureClient.normalizedReceiptText(text)
      isParsing = true
      error = nil
      Task {
        await parseVoice(
          submittedTranscript,
          snapshot: snapshot,
          locale: locale,
          authorization: authorization,
          spaceLease: spaceLease
        )
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func parseVoice(
    _ submittedTranscript: String,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?,
    authorization: NumaAPIRequestLease,
    spaceLease: NumaSpaceLease
  ) async {
    defer { isParsing = false }
    do {
      guard spaceLease.isCurrent() else { return }
      let result = try await NumaCaptureClient.parseText(
        submittedTranscript,
        snapshot: snapshot,
        locale: locale,
        authorization: authorization,
        tokenProvider: { try await session.freshAPIAuthToken(for: $0) }
      )
      guard spaceLease.isCurrent() else { return }
      guard (try? NumaCaptureClient.normalizedReceiptText(text)) == submittedTranscript else {
        return
      }
      review = VoiceCaptureReview(transcript: submittedTranscript, result: result)
    } catch {
      self.error = error.localizedDescription
    }
  }
}

struct ScanNativeSheet: View {
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa
  @State private var selectedItem: PhotosPickerItem?
  @State private var result: CaptureParseResponse?
  @State private var isParsing = false
  @State private var error: String?
  @State private var aiSharingAllowed = false

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 18) {
          NumaActiveSpaceHeader()
          NumaPrivacyControls(compactWhenAllowed: true) { aiSharingAllowed = $0 }
        Image(systemName: "viewfinder")
          .font(.system(size: 42, weight: .bold))
          .foregroundStyle(numa.ink)
          .frame(width: 96, height: 96)
          .background(numa.paper)
          .clipShape(RoundedRectangle(cornerRadius: 28))
          .overlay(RoundedRectangle(cornerRadius: 28).stroke(numa.line))
        Text("Scan receipt")
          .font(.largeTitle.bold())
        Text("Pick a receipt or bank screenshot. Numa Pro extracts draft transactions for review.")
          .foregroundStyle(numa.ink3)
          .multilineTextAlignment(.center)
        PhotosPicker(selection: $selectedItem, matching: .images) {
          Label("Choose image", systemImage: "photo.on.rectangle")
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
        }
        .buttonStyle(NumaSecondaryButtonStyle())
        .disabled(!aiSharingAllowed || isParsing)
        if let error {
          Text(error)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(numa.negative)
        }
        if let result {
          CaptureResultCard(
            result: result,
            source: .receipt(summary: result.summary)
          )
        }
        Spacer(minLength: 40)
        }
        .padding(24)
      }
      .background(numa.bg)
      .navigationTitle("Scan")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
      .onChange(of: selectedItem) { _, newValue in
        guard let newValue else { return }
        startImageParse(newValue)
      }
    }
  }

  private func startImageParse(_ item: PhotosPickerItem) {
    guard aiSharingAllowed else { selectedItem = nil; return }
    do {
      let spaceLease = try appStore.beginSpaceLease()
      let authorization = try session.beginAPIRequest()
      let snapshot = appStore.portfolioSnapshot
      let locale = appStore.profile?.locale
      isParsing = true
      error = nil
      // Capture the lease, selected item, and account snapshot before Task is
      // scheduled. An account switch before the worker starts stays stale.
      Task {
        await parseImage(
          item,
          snapshot: snapshot,
          locale: locale,
          authorization: authorization,
          spaceLease: spaceLease
        )
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func parseImage(
    _ item: PhotosPickerItem,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?,
    authorization: NumaAPIRequestLease,
    spaceLease: NumaSpaceLease
  ) async {
    defer { isParsing = false }
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else {
        throw NumaAuthError.invalidResponse
      }
      guard spaceLease.isCurrent() else { return }
      let result = try await NumaCaptureClient.parseImage(
        data,
        snapshot: snapshot,
        locale: locale,
        authorization: authorization,
        tokenProvider: { try await session.freshAPIAuthToken(for: $0) }
      )
      guard spaceLease.isCurrent() else { return }
      self.result = result
    } catch {
      guard spaceLease.isCurrent() else { return }
      self.error = error.localizedDescription
    }
  }
}

struct CaptureResultCard: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  let result: CaptureParseResponse
  let source: TransactionCaptureSource
  @State private var auditCreateRequestIds: [String: String] = [:]

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text(result.summary)
          .font(.headline)
        if let rejection = result.rejectionMessage {
          Text(rejection)
            .foregroundStyle(numa.ink3)
        }
        ForEach(Array(result.transactions.enumerated()), id: \.offset) { index, tx in
          VStack(alignment: .leading, spacing: 8) {
            HStack {
              Text(tx.description)
                .font(.subheadline.weight(.bold))
              Spacer()
              Text(formatNumaMoney(tx.amount, tx.currency == "UNKNOWN" ? (appStore.portfolioSnapshot?.portfolio.defaultCurrency ?? "EUR") : tx.currency))
                .font(.subheadline.weight(.bold))
            }
            Text([tx.suggestedCategoryName, tx.notes].compactMap { $0 }.joined(separator: " · "))
              .font(.caption)
              .foregroundStyle(numa.ink3)
            Button("Create draft") {
              let key = nativeCaptureRowIntentKey(
                index: index,
                transaction: tx,
                source: source
              )
              let createRequestId = auditCreateRequestIds[key]
                ?? ClientMutationID.make("aiActions.createDraft")
              auditCreateRequestIds[key] = createRequestId
              let context = appStore.spaceContext
              Task {
                if await appStore.openCapturedTransaction(
                  tx,
                  source: source,
                  auditCreateRequestId: createRequestId,
                  context: context
                ) {
                  // The row is now represented by an opened draft. A later
                  // cancel/reopen is a new intent, while a lost response keeps
                  // the old id for idempotent recovery.
                  auditCreateRequestIds[key] = nextNativeCaptureCreateRequestId(
                    current: createRequestId,
                    draftOpened: true
                  )
                }
              }
            }
            .buttonStyle(NumaSecondaryButtonStyle())
            .disabled(appStore.saving)
          }
          .padding(.top, 4)
        }
      }
    }
  }
}
