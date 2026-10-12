import SwiftUI

/// A→B→A is a new context, not the original A. Every async read/write captures
/// this generation as well as the independently invalidated account lease.
struct NumaSpaceContext: Equatable {
  private(set) var id: String?
  private(set) var generation: UInt64 = 0

  mutating func select(_ id: String?) {
    generation &+= 1
    self.id = id
  }

  func accepts(_ snapshot: MobilePortfolioSnapshot) -> Bool {
    guard let id, snapshot.portfolio.id == id else { return false }
    return snapshot.categories.allSatisfy { $0.portfolioId == id }
      && snapshot.transactions.allSatisfy { $0.portfolioId == id }
      && (snapshot.transfers ?? []).allSatisfy { $0.portfolioId == id }
      && snapshot.assets.allSatisfy { $0.portfolioId == id }
      && snapshot.liabilities.allSatisfy { $0.portfolioId == id }
      && snapshot.holdings.allSatisfy { $0.portfolioId == id }
      && snapshot.goals.allSatisfy { $0.portfolioId == id }
      && snapshot.recurring.allSatisfy { $0.portfolioId == id }
      && snapshot.wealthSnapshots.allSatisfy { $0.portfolioId == id }
  }
}

@MainActor
struct NumaSpaceLease {
  let account: NumaSessionLease
  let context: NumaSpaceContext
  let current: () -> NumaSpaceContext

  func isCurrent() -> Bool { account.isCurrent() && context == current() }

  @discardableResult
  func performIfCurrent(_ action: () -> Void) -> Bool {
    guard isCurrent() else { return false }
    return account.performIfCurrent(action)
  }
}

extension MobilePortfolio {
  var isBusiness: Bool { spaceKind == "business" }
  var spaceLabel: String {
    isBusiness ? "Business" : (type == "personal" ? "Personal" : "Shared portfolio")
  }
  var canEdit: Bool { role == "owner" || role == "editor" }
}

struct NumaSpaceBadge: View {
  let space: MobilePortfolio
  var body: some View {
    Label {
      Text("\(space.name) · \(space.defaultCurrency)")
        .font(.caption.weight(.semibold))
        .fixedSize(horizontal: false, vertical: true)
    } icon: {
      Image(systemName: space.isBusiness ? "building.2" : "person.crop.circle")
    }
    .accessibilityLabel("Active space: \(space.name), \(space.spaceLabel), \(space.defaultCurrency)")
  }
}

/// Inside sheet content, below the navigation bar: an outer safe-area inset
/// can overlap the native sheet toolbar on iOS 26.
struct NumaActiveSpaceHeader: View {
  @Environment(NumaAppStore.self) private var store
  var body: some View {
    if let space = store.activeSpace {
      NumaSpaceBadge(space: space)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct NumaSpacePicker: View {
  @Environment(NumaAppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.numa) private var numa

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(store.portfolios) { space in
            Button {
              if store.selectPortfolio(space.id) { dismiss() }
            } label: {
              HStack(spacing: 12) {
                Image(systemName: space.isBusiness ? "building.2" : "person.crop.circle")
                  .font(.title2)
                VStack(alignment: .leading, spacing: 5) {
                  Text(space.name).font(.headline)
                  Text("\(space.spaceLabel) · \(space.defaultCurrency)").font(.caption)
                  if space.isBusiness {
                    if let bps = space.businessOwnershipBps {
                      Text("Your stated ownership: \((bps / 100).formatted())%").font(.caption)
                    } else {
                      Text("Economic ownership not entered").font(.caption)
                    }
                  }
                  if !space.canEdit { Text("Read only").font(.caption) }
                }
                Spacer(minLength: 4)
                if space.id == store.selectedPortfolioId { Image(systemName: "checkmark.circle.fill") }
              }
              .foregroundStyle(numa.ink)
              .padding(.vertical, 6)
            }
            .disabled(store.saving)
            .accessibilityIdentifier("space-\(space.id)")
          }
          if store.portfolios.isEmpty { Text("No spaces available. Refresh or create your first space.") }
          if let error = store.spacesError { Text(error).foregroundStyle(numa.negative) }
          Button("Refresh spaces", systemImage: "arrow.clockwise") { Task { await store.refreshSpaces() } }
            .disabled(store.refreshingSpaces || store.saving)
        } header: { Text("Your spaces") } footer: {
          Text("One space at a time. Personal and business balances are not added together. Business cash is not your personal cash; ownership and valuation are never assumed.")
        }
        if let snapshot = store.portfolioSnapshot {
          Section("Only this space") { NumaSpaceExport(snapshot: snapshot) }
        }
        Section {
          Button("Add a space", systemImage: "plus") { store.activeSheet = .createSpace }
        }
      }
      .navigationTitle("Spaces")
      .toolbarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
    }
  }
}

struct NumaCreateSpaceSheet: View {
  @Environment(NumaAppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var kind = "personal"
  @State private var currency = "EUR"
  @State private var ownership = ""
  @State private var requestId = ClientMutationID.make("spaces.create")
  @State private var submitted: NumaSpaceCreateIntent?
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Form {
        Section("Separate money, clear purpose") {
          TextField("Space name", text: $name).accessibilityIdentifier("space-name")
          Picker("Purpose", selection: $kind) {
            Text("Personal").tag("personal")
            Text("Business").tag("business")
          }
          Picker("Currency", selection: $currency) {
            Text("EUR").tag("EUR")
            Text("USD").tag("USD")
          }
          if kind == "business" {
            TextField("Your ownership % (optional)", text: $ownership).keyboardType(.decimalPad)
            Text("Leave blank if unknown. Admin access does not mean 100% ownership. This does not set a business valuation.")
              .font(.caption)
          }
        }
        Section {
          Text("Starts empty. No records move from another space, and shared pods stay separate.")
          if let error { Text(error).foregroundStyle(.red) }
          Button(store.saving ? "Creating…" : "Create space") {
            let intent = NumaSpaceCreateIntent(name: name, kind: kind, currency: currency, ownership: ownership)
            if let submitted, submitted != intent { requestId = ClientMutationID.make("spaces.create") }
            submitted = intent
            Task {
              if let message = await store.createSpace(intent, requestId: requestId) { error = message }
              else { dismiss() }
            }
          }
          .disabled(store.saving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
      .disabled(store.saving)
      .navigationTitle("New space")
      .toolbarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(store.saving) } }
      .interactiveDismissDisabled(store.saving)
    }
  }
}

struct NumaSpaceCreateIntent: Equatable {
  let name: String
  let kind: String
  let currency: String
  let ownership: String

  func ownershipBps() throws -> Double? {
    guard kind == "business", !ownership.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    guard let value = Double(ownership.replacingOccurrences(of: ",", with: ".")), value.isFinite,
      value >= 0, value <= 100, abs((value * 100).rounded() - value * 100) < 0.000001 else {
      throw NumaSpaceError.invalidOwnership
    }
    return (value * 100).rounded()
  }
}

enum NumaSpaceError: LocalizedError {
  case invalidOwnership
  var errorDescription: String? { "Enter ownership from 0 to 100 with at most two decimal places, or leave it blank." }
}

struct NumaSpaceUnavailable: View {
  @Environment(NumaAppStore.self) private var store
  var body: some View {
    ContentUnavailableView {
      Label(store.spaceLoading ? "Loading your space" : "Space unavailable", systemImage: "square.stack")
    } description: {
      Text(store.spacesError ?? "No balances appear until this space has loaded.")
    } actions: {
      if store.spaceLoading { ProgressView() }
      Button("Retry") { store.retrySpace() }.disabled(store.spaceLoading)
      Button("Choose a space") { store.activeSheet = .spaces }
    }
  }
}

/// The snapshot supplies only the selected identity; export reads the complete
/// authorized financial history from the server, not the UI's limited snapshot.
struct NumaSpaceExport: View {
  let snapshot: MobilePortfolioSnapshot
  var body: some View {
    NumaFinancialExportControl(portfolioId: snapshot.portfolio.id, name: snapshot.portfolio.name)
      .id(snapshot.portfolio.id)
  }
}

protocol NumaSpaceBoundDraft {
  var spaceContext: NumaSpaceContext? { get set }
  var portfolioId: String? { get set }
}

extension NumaSpaceBoundDraft {
  mutating func bind(to context: NumaSpaceContext) {
    guard spaceContext == nil else { return }
    spaceContext = context
    if portfolioId == nil { portfolioId = context.id }
  }
}
