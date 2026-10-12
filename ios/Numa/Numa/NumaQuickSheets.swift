import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct AssetQuickSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  let asset: MobileAsset?
  @State private var draft: AssetDraft
  @State private var confirmDelete = false

  init(asset: MobileAsset?) {
    self.asset = asset
    _draft = State(initialValue: asset.map(AssetDraft.init(asset:)) ?? AssetDraft())
  }

  var body: some View {
    WealthEditorShell(title: asset == nil ? "New asset" : "Edit asset") {
      NumaTextField(title: "Name", text: $draft.name, placeholder: "Emergency fund")
      NumaTextField(title: "Balance", text: $draft.balance, placeholder: "2500", keyboard: .decimalPad)
      Picker("Kind", selection: $draft.kind) {
        Text("Cash").tag("cash")
        Text("Real estate").tag("real_estate")
        Text("Vehicle").tag("vehicle")
        Text("Collectible").tag("collectible")
        Text("Other").tag("other")
      }
      .pickerStyle(.segmented)
      Picker("Currency", selection: $draft.currency) {
        Text("EUR").tag("EUR")
        Text("USD").tag("USD")
      }
      .pickerStyle(.segmented)
      NumaTextField(title: "Notes", text: $draft.notes, placeholder: "Optional")
      if asset != nil {
        Button("Delete asset", role: .destructive) { confirmDelete = true }
      }
    } save: {
      if await appStore.saveAsset(draft) {
        dismiss()
      }
    }
    .task {
      draft.bind(to: appStore.spaceContext)
      if asset == nil, let currency = appStore.portfolioSnapshot?.portfolio.defaultCurrency {
        draft.currency = currency
      }
    }
    .confirmationDialog("Delete asset?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete", role: .destructive) {
        if let asset {
          Task {
            if await appStore.deleteAsset(
              asset,
              clientMutationId: draft.deleteMutationId,
              context: draft.spaceContext
            ) {
              dismiss()
            }
          }
        }
      }
    }
  }
}

struct LiabilityQuickSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  let liability: MobileLiability?
  @State private var draft: LiabilityDraft
  @State private var confirmDelete = false

  init(liability: MobileLiability?) {
    self.liability = liability
    _draft = State(initialValue: liability.map(LiabilityDraft.init(liability:)) ?? LiabilityDraft())
  }

  var body: some View {
    WealthEditorShell(title: liability == nil ? "New liability" : "Edit liability") {
      NumaTextField(title: "Name", text: $draft.name, placeholder: "Credit card")
      NumaTextField(title: "Balance", text: $draft.balance, placeholder: "1200", keyboard: .decimalPad)
      Picker("Kind", selection: $draft.kind) {
        Text("Card").tag("credit_card")
        Text("Loan").tag("loan")
        Text("Mortgage").tag("mortgage")
        Text("Other").tag("other")
      }
      .pickerStyle(.segmented)
      Picker("Currency", selection: $draft.currency) {
        Text("EUR").tag("EUR")
        Text("USD").tag("USD")
      }
      .pickerStyle(.segmented)
      NumaTextField(title: "APR", text: $draft.interestRate, placeholder: "18.5", keyboard: .decimalPad)
      Toggle("Has due date", isOn: $draft.hasDueDate)
      if draft.hasDueDate {
        DatePicker("Due date", selection: $draft.dueDate, displayedComponents: .date)
      }
      NumaTextField(title: "Notes", text: $draft.notes, placeholder: "Optional")
      if liability != nil {
        Button("Delete liability", role: .destructive) { confirmDelete = true }
      }
    } save: {
      if await appStore.saveLiability(draft) {
        dismiss()
      }
    }
    .task {
      draft.bind(to: appStore.spaceContext)
      if liability == nil, let currency = appStore.portfolioSnapshot?.portfolio.defaultCurrency {
        draft.currency = currency
      }
    }
    .confirmationDialog("Delete liability?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete", role: .destructive) {
        if let liability {
          Task {
            if await appStore.deleteLiability(
              liability,
              clientMutationId: draft.deleteMutationId,
              context: draft.spaceContext
            ) {
              dismiss()
            }
          }
        }
      }
    }
  }
}

struct HoldingQuickSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  let holding: MobileHolding?
  @State private var draft: HoldingDraft
  @State private var confirmDelete = false

  init(holding: MobileHolding?) {
    self.holding = holding
    _draft = State(initialValue: holding.map(HoldingDraft.init(holding:)) ?? HoldingDraft())
  }

  var body: some View {
    WealthEditorShell(title: holding == nil ? "New holding" : "Edit holding") {
      NumaTextField(title: "Symbol", text: $draft.symbol, placeholder: "AAPL")
      NumaTextField(title: "Name", text: $draft.name, placeholder: "Apple")
      NumaTextField(title: "Quantity", text: $draft.quantity, placeholder: "10", keyboard: .decimalPad)
      NumaTextField(title: "Cost basis", text: $draft.costBasis, placeholder: "1500", keyboard: .decimalPad)
      Picker("Kind", selection: $draft.kind) {
        Text("Stock").tag("stock")
        Text("ETF").tag("etf")
        Text("Crypto").tag("crypto")
        Text("Index").tag("index")
      }
      .pickerStyle(.segmented)
      Picker("Currency", selection: $draft.currency) {
        Text("EUR").tag("EUR")
        Text("USD").tag("USD")
      }
      .pickerStyle(.segmented)
      DatePicker("Acquired", selection: $draft.acquiredAt, displayedComponents: .date)
      if holding != nil {
        Button("Delete holding", role: .destructive) { confirmDelete = true }
      }
    } save: {
      if await appStore.saveHolding(draft) {
        dismiss()
      }
    }
    .task {
      draft.bind(to: appStore.spaceContext)
      if holding == nil, let currency = appStore.portfolioSnapshot?.portfolio.defaultCurrency {
        draft.currency = currency
      }
    }
    .confirmationDialog("Delete holding?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete", role: .destructive) {
        if let holding {
          Task {
            if await appStore.deleteHolding(
              holding,
              clientMutationId: draft.deleteMutationId,
              context: draft.spaceContext
            ) {
              dismiss()
            }
          }
        }
      }
    }
  }
}

struct MonthlyIncomeTargetSheet: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.dismiss) private var dismiss
  @State private var draft: MonthlyIncomeTargetDraft

  init(goal: MobileGoal?) {
    _draft = State(initialValue: MonthlyIncomeTargetDraft(goal: goal, defaultCurrency: "EUR"))
  }

  var body: some View {
    WealthEditorShell(title: draft.id == nil ? "Income target" : "Edit income target") {
      NumaTextField(title: "Target per month", text: $draft.target, placeholder: "0", keyboard: .decimalPad)
      NumaTextField(title: "Label", text: $draft.label, placeholder: "Income target")
      Picker("Currency", selection: $draft.currency) {
        Text("EUR").tag("EUR")
        Text("USD").tag("USD")
      }
      .pickerStyle(.segmented)
      Text("Today compares recorded income with this target. Scheduled recurring income stays a forecast.")
        .font(.footnote)
        .foregroundStyle(Color.secondary)
    } save: {
      if await appStore.saveMonthlyIncomeTarget(draft) {
        dismiss()
      }
    }
    .task {
      draft.bind(to: appStore.spaceContext)
      if draft.id == nil, let currency = appStore.portfolioSnapshot?.portfolio.defaultCurrency {
        draft.currency = currency
      }
    }
  }
}

struct WealthEditorShell<Content: View>: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  @Environment(\.dismiss) private var dismiss
  let title: String
  @ViewBuilder var content: () -> Content
  let save: () async -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          NumaActiveSpaceHeader()
          content()
        }
        .padding(18)
      }
      .background(numa.bg)
      .navigationTitle(title)
      .toolbarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .bottom) {
        BottomSheetActionBar {
          NumaPrimaryButton(title: "Save", systemImage: "checkmark") {
            Task { await save() }
          }
          .disabled(appStore.saving || !appStore.canCapture)
        }
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
  }
}
