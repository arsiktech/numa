import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct MainNativeShell: View {
  #if DEBUG && targetEnvironment(simulator)
  var previewOnly = false
  #endif
  @Environment(NumaAppStore.self) private var appStore
  @Environment(PodStore.self) private var podStore
  @Environment(\.numa) private var numa
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var textSize
  @State private var selection: AppTab = {
    #if DEBUG
      // Simulator-only QA hook: `SIMCTL_CHILD_NUMA_QA_TAB` opens a specific
      // tab at launch so screenshot sweeps can walk the app headlessly.
      if let raw = ProcessInfo.processInfo.environment["NUMA_QA_TAB"],
         let tab = AppTab(rawValue: raw) {
        return tab
      }
    #endif
    return .overview
  }()

  var body: some View {
    ZStack(alignment: .bottom) {
      TabView(selection: $selection) {
        ForEach(visibleTabs) { tab in
          NavigationStack {
            Group {
              if tab != .pod && tab != .settings && appStore.portfolioSnapshot == nil { NumaSpaceUnavailable() }
              else { tab.view }
            }
              .id(tab == .pod || tab == .settings ? "global" : String(appStore.spaceContext.generation))
              .toolbar {
                if tab != .pod {
                  ToolbarItem(placement: .principal) {
                    Button { appStore.activeSheet = .spaces } label: {
                      Label(appStore.activeSpace?.name ?? "Choose a space", systemImage: "chevron.down")
                        .labelStyle(.titleAndIcon)
                        .font(.headline).frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("choose-space")
                    .disabled(appStore.saving)
                  }
                }
              }
              .navigationTitle(tab.title)
              .toolbarTitleDisplayMode(.inline)
          }
          .tag(tab)
          .tabItem {
            Label(tab.title, systemImage: tab.icon)
          }
        }
      }
      .background(numa.bg)
      if selection != .pod && selection != .settings {
        FloatingActionDock(selection: $selection)
          .disabled(!appStore.canCapture || appStore.saving)
          .padding(.bottom, 62)
          .padding(.horizontal, 14)
          .transition(NumaMotion.bottomTransition(reduceMotion: reduceMotion))
      }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      if let profile = appStore.profile,
         let scheduledAt = profile.deletionScheduledAt {
        NativeDeletionRecoveryBanner(
          scheduledAt: scheduledAt,
          startedAt: profile.deletionStartedAt
        )
      }
    }
    .animation(reduceMotion ? nil : NumaMotion.context, value: selection)
    .sheet(item: Binding(
      get: { appStore.activeSheet },
      set: { appStore.activeSheet = $0 }
    )) { sheet in
      sheetView(sheet)
        .id(appStore.spaceContext.generation)
        .dynamicTypeSize(textSize)
    }
    .overlay(alignment: .top) {
      if let message = appStore.toast {
        NumaToastBanner(message: message)
          .padding(.horizontal, 16)
          .padding(.top, 10)
          .transition(NumaMotion.topTransition(reduceMotion: reduceMotion))
          .zIndex(2)
      }
    }
    .overlay {
      if let achievement = appStore.achievement {
        NumaConfettiLayer(trigger: achievement.id)
          .transition(.opacity)
          .allowsHitTesting(false)
      }
    }
    .overlay(alignment: .bottom) {
      if let achievement = appStore.achievement {
        NumaAchievementPopup(achievement: achievement) {
          NumaMotion.run(reduceMotion: reduceMotion) { appStore.achievement = nil }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, selection == .pod || selection == .settings ? 82 : 132)
        .transition(NumaMotion.bottomTransition(reduceMotion: reduceMotion))
        .zIndex(3)
      }
    }
    .task(id: appStore.toast) {
      guard let message = appStore.toast else { return }
      try? await Task.sleep(nanoseconds: 2_400_000_000)
      if appStore.toast == message {
        NumaMotion.run(reduceMotion: reduceMotion, NumaMotion.quick) { appStore.toast = nil }
      }
    }
    .task(id: appStore.achievement?.id) {
      guard let id = appStore.achievement?.id else { return }
      try? await Task.sleep(nanoseconds: 4_200_000_000)
      if appStore.achievement?.id == id {
        NumaMotion.run(reduceMotion: reduceMotion) { appStore.achievement = nil }
      }
    }
    .task {
      if appStore.appMode == .shared || appStore.appMode == .advanced {
        podStore.start()
      }
    }
    .onChange(of: selection) { _, _ in
      Haptic.tap()
    }
  }

  private var visibleTabs: [AppTab] {
    #if DEBUG && targetEnvironment(simulator)
    // The isolated preview must not expose account/logout controls, which
    // intentionally operate on the app-wide Keychain in the live app.
    if previewOnly { return [.overview, .money, .wealth] }
    #endif
    return switch appStore.appMode {
    case .light:
      [.overview, .money, .settings]
    case .advanced:
      [.overview, .money, .wealth, .pod, .settings]
    case .shared:
      [.pod, .settings]
    }
  }

  @ViewBuilder
  private func sheetView(_ sheet: NumaSheet) -> some View {
    switch sheet {
    case .spaces: NumaSpacePicker()
    case .createSpace: NumaCreateSpaceSheet()
    case .capture:
      UniversalCaptureNativeSheet()
    case .transaction(let draft):
      TransactionEditorSheet(draft: draft)
    case .transfer(let draft): NumaTransferEditor(draft: draft)
    case .budget(let draft): NumaBudgetEditor(draft: draft)
    case .search:
      SearchNativeSheet()
    case .askNuma:
      AskNumaNativeSheet()
    case .voice:
      VoiceNativeSheet()
    case .scan:
      ScanNativeSheet()
    case .asset(let asset):
      AssetQuickSheet(asset: asset)
    case .liability(let liability):
      LiabilityQuickSheet(liability: liability)
    case .holding(let holding):
      HoldingQuickSheet(holding: holding)
    case .monthlyIncomeTarget(let goal):
      MonthlyIncomeTargetSheet(goal: goal)
    }
  }
}

private struct NativeDeletionRecoveryBanner: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  let scheduledAt: Double
  let startedAt: Double?

  private var deadline: String {
    Date(timeIntervalSince1970: scheduledAt / 1000)
      .formatted(.dateTime.day().month(.wide).year())
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "hourglass")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(numa.negative)
          .frame(width: 34, height: 34)
          .background(numa.negative.opacity(0.12))
          .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(startedAt == nil
            ? "Account deletion is scheduled for \(deadline)"
            : "Account deletion has started")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(numa.ink)
          Text(startedAt == nil
            ? "Cancel now to keep your Numa Pro account and all of its data."
            : "Recovery is no longer safe because some data may already be gone. Contact support.")
            .font(.caption)
            .foregroundStyle(numa.ink3)
        }
        Spacer(minLength: 0)
      }

      if let error = appStore.deletionRecoveryError {
        Text(error)
          .font(.caption.weight(.semibold))
          .foregroundStyle(numa.negative)
      }

      if startedAt == nil {
        NumaPrimaryButton(
          title: appStore.cancelingDeletion ? "Canceling..." : "Cancel account deletion",
          systemImage: "arrow.uturn.backward"
        ) {
          Task { await appStore.cancelScheduledDeletion() }
        }
        .disabled(appStore.cancelingDeletion)
        .opacity(appStore.cancelingDeletion ? 0.6 : 1)
      }
    }
    .padding(12)
    .background(numa.paper)
    .overlay(alignment: .bottom) {
      Rectangle().fill(numa.negative.opacity(0.35)).frame(height: 1)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(startedAt == nil
      ? "Account deletion scheduled for \(deadline)"
      : "Account deletion has started and can no longer be canceled")
  }
}

enum AppTab: String, Identifiable, CaseIterable {
  case overview
  case money
  case wealth
  case pod
  case settings

  var id: String { rawValue }
  var title: String {
    switch self {
    case .overview: "Overview"
    case .money: "Money"
    case .wealth: "Wealth"
    case .pod: "Shared"
    case .settings: "Settings"
    }
  }

  var icon: String {
    switch self {
    case .overview: "square.grid.2x2"
    case .money: "wallet.pass"
    case .wealth: "chart.pie"
    case .pod: "person.2"
    case .settings: "gearshape"
    }
  }

  @MainActor
  @ViewBuilder
  var view: some View {
    switch self {
    case .overview: OverviewNativePage()
    case .money: MoneyNativePage()
    case .wealth: WealthNativePage()
    case .pod: SharedPodNativePage()
    case .settings: SettingsNativePage()
    }
  }
}
