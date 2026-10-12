import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct WealthNativePage: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa

  var body: some View {
    NumaScreen {
      if let snapshot = appStore.portfolioSnapshot {
        HeroMetricCard(
          eyebrow: "NET WORTH",
          title: "Your capital system.",
          value: formatNumaMoney(snapshot.dashboard.netWorth, snapshot.dashboard.currency),
          tint: numa.ink
        )
        HStack(spacing: 12) {
          MetricTile(title: "Liquid", value: formatNumaMoney(snapshot.dashboard.liquid, snapshot.dashboard.currency), tint: numa.positive)
          MetricTile(title: "Invested", value: formatNumaMoney(snapshot.dashboard.invested, snapshot.dashboard.currency), tint: numa.brand)
        }
        NumaCard {
          VStack(alignment: .leading, spacing: 12) {
            Text("Add capital")
              .font(.headline)
            HStack(spacing: 10) {
              WealthActionButton(title: "Asset", systemImage: "building.columns") {
                appStore.activeSheet = .asset(nil)
              }
              WealthActionButton(title: "Debt", systemImage: "creditcard") {
                appStore.activeSheet = .liability(nil)
              }
              WealthActionButton(title: "Holding", systemImage: "chart.line.uptrend.xyaxis") {
                appStore.activeSheet = .holding(nil)
              }
            }
          }
        }
        AllocationBars(snapshot: snapshot)
        HoldingsList(holdings: snapshot.holdings)
        AssetsLiabilitiesList(snapshot: snapshot)
        GoalsList(goals: snapshot.goals)
      } else {
        EmptyStateCard(title: "No wealth data", message: "Add assets, liabilities, or holdings to build the picture.")
      }
    }
  }
}

struct SharedPodNativePage: View {
  @Environment(PodStore.self) private var podStore
  @Environment(\.numa) private var numa
  @State private var editor: ExpenseEditorMode?
  @State private var cardsMember: MobilePodMember?

  var body: some View {
    NumaScreen {
      switch podStore.phase {
      case .idle, .loading:
        ProgressView()
          .tint(numa.brand)
          .frame(maxWidth: .infinity, minHeight: 260)
          .task { podStore.start() }
      case .failed(let message):
        VStack(spacing: 14) {
          EmptyStateCard(title: "Pod unavailable", message: message)
          NumaPrimaryButton(title: "Retry", systemImage: "arrow.clockwise") {
            podStore.reset(preserveCreateIntent: true)
            podStore.start()
          }
        }
      case .empty:
        VStack(spacing: 14) {
          EmptyStateCard(title: "No shared pod yet", message: "Create a household pod and start tracking shared expenses from your phone.")
          NumaPrimaryButton(title: podStore.saving ? "Creating..." : "Create home pod", systemImage: "person.2.badge.plus") {
            Task { await podStore.createPod() }
          }
          .disabled(podStore.saving)
          Button("Open demo pod") {
            podStore.startDemo()
          }
          .buttonStyle(NumaSecondaryButtonStyle())
        }
      case .ready:
        if let snapshot = podStore.snapshot {
          let summary = snapshot.settlementSummary
          HeroMetricCard(
            eyebrow: "SHARED POT",
            title: summary?.label ?? "All settled",
            value: formatNumaMoney(summary?.amount ?? 0, snapshot.pod.currency),
            tint: summary?.state == "user_owes" ? numa.negative : numa.positive
          )
          HStack(spacing: 12) {
            MetricTile(title: "Total", value: formatNumaMoney(snapshot.totalSpent, snapshot.pod.currency), tint: numa.ink)
            MetricTile(title: "Expenses", value: "\(snapshot.expenses.count)", tint: numa.brand)
          }
          HStack(spacing: 10) {
            NumaPrimaryButton(title: "Add expense", systemImage: "plus") {
              editor = .create
            }
            Button("Add person") {
              if let member = snapshot.members.first { cardsMember = member }
            }
            .buttonStyle(NumaSecondaryButtonStyle())
          }
          PodExpenseTimeline(snapshot: snapshot) { expense in
            editor = .edit(expense)
          }
          PodPeopleCards(snapshot: snapshot) { member in
            cardsMember = member
          }
        }
      }
    }
    .sheet(item: $editor) { mode in
      if let snapshot = podStore.snapshot {
        ExpenseEditorSheet(mode: mode, snapshot: snapshot)
      }
    }
    .sheet(item: $cardsMember) { member in
      MemberCardsSheet(member: member)
    }
  }
}

struct SettingsNativePage: View {
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  @State private var displayName = ""
  @State private var showDeleteConfirmation = false
  @State private var deletionError: String?

  var body: some View {
    NumaScroll {
      if let profile = appStore.profile {
        NumaCard {
          VStack(alignment: .leading, spacing: 10) {
            Text(profile.displayName)
              .font(.title2.bold())
              .foregroundStyle(numa.ink)
            Text(profile.email ?? "Cloud account")
              .foregroundStyle(numa.ink3)
            NumaTextField(title: "Display name", text: $displayName, placeholder: profile.displayName)
            NumaPrimaryButton(title: "Save profile", systemImage: "checkmark") {
              Task { await appStore.updatePreferences(displayName: displayName.isEmpty ? profile.displayName : displayName) }
            }
          }
        }

        SettingsPickerCard(title: "Mode", subtitle: "Matches web visibility rules") {
          ForEach(NumaAppMode.allCases) { mode in
            ChoicePill(title: mode.label, selected: profile.appMode == mode) {
              Task { await appStore.updatePreferences(appMode: mode) }
            }
          }
        }

        SettingsPickerCard(title: "Palette", subtitle: "Same palettes as web") {
          ForEach(NumaThemeKey.allCases) { key in
            ChoicePill(title: key.label, selected: profile.themeKey == key) {
              Task { await appStore.updatePreferences(themeKey: key) }
            }
          }
        }

        SettingsPickerCard(title: "Appearance", subtitle: "Auto follows iOS") {
          ForEach(NumaAppearance.allCases) { appearance in
            ChoicePill(title: appearance.label, selected: profile.theme == appearance) {
              Task { await appStore.updatePreferences(theme: appearance) }
            }
          }
        }

        NumaCard {
          VStack(alignment: .leading, spacing: 12) {
            Text("Data")
              .font(.headline)
            if let snapshot = appStore.portfolioSnapshot { NumaSpaceExport(snapshot: snapshot) }
            else { Text("Load a space to export its snapshot.") }
            Label("Webhook token management stays cloud-backed", systemImage: "link")
          }
          .foregroundStyle(numa.ink)
        }

        NumaPrivacyControls()
        NumaPrivacyHelp()

        if let deletionError {
          Text(deletionError)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(numa.negative)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        Button(role: .destructive) {
          deletionError = nil
          showDeleteConfirmation = true
        } label: {
          Label("Delete account", systemImage: "trash")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(NumaSecondaryButtonStyle())
        .disabled(session.busy)

        Button(role: .destructive) {
          Task { await session.signOut() }
        } label: {
          Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(NumaSecondaryButtonStyle())
        .disabled(session.busy)
      }
    }
    .onAppear {
      displayName = appStore.profile?.displayName ?? ""
    }
    .alert("Delete your Numa Pro account?", isPresented: $showDeleteConfirmation) {
      Button("Cancel", role: .cancel) {}
      Button("Delete account", role: .destructive) {
        Task {
          let deleted = await session.deleteAccount()
          if !deleted {
            deletionError = session.errorMessage ?? "Numa Pro could not schedule account deletion."
          }
        }
      }
    } message: {
      Text("This schedules permanent deletion after the seven-day recovery window and signs this device out. Your local session is cleared only after Numa Pro accepts the request.")
    }
  }
}

struct FloatingActionDock: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  @Binding var selection: AppTab

  var body: some View {
    HStack(alignment: .bottom) {
      if appStore.appMode != .shared {
        HStack(spacing: 8) {
          DockButton(systemImage: "plus", label: "Add") {
            appStore.activeSheet = .capture
          }
          DockButton(systemImage: "magnifyingglass", label: "Search") {
            appStore.activeSheet = .search
          }
          DockButton(systemImage: "sparkles", label: "Numa Pro", accent: true) {
            appStore.activeSheet = .askNuma
          }
        }
        .padding(8)
        .background(numa.paper)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(numa.line))
        .shadow(color: Color.black.opacity(0.10), radius: 14, x: 0, y: 8)
      }
      Spacer()
      ZStack(alignment: .topLeading) {
        Button {
          Haptic.rigid()
          appStore.activeSheet = .voice
        } label: {
          Image(systemName: "mic.fill")
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(numa.ctaInk)
            .frame(width: 56, height: 56)
            .background(numa.brand)
            .clipShape(Circle())
            .shadow(color: numa.brand.opacity(0.28), radius: 16, x: 0, y: 10)
        }
        Button {
          appStore.activeSheet = .scan
        } label: {
          Image(systemName: "viewfinder")
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(numa.ink)
            .frame(width: 32, height: 32)
            .background(numa.paper)
            .clipShape(Circle())
            .overlay(Circle().stroke(numa.line))
        }
        .offset(x: -10, y: -8)
      }
    }
  }
}
