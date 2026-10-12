import SwiftUI
// Pinned SDK has not adopted Sendable annotations. Match the interoperability
// boundary in NumaParity/PodStore; UI state stays actor-isolated and account-bound.
@preconcurrency import ConvexMobile

struct NumaPrivacyDisclosure: Codable, Equatable {
  struct PolicyLink: Codable, Equatable, Identifiable {
    var id: String { url }
    let label: String
    let url: String
  }
  let title: String
  let recipients: String
  let data: String
  let purpose: String
  let withdrawal: String
  let retention: String
  let alternative: String
  let links: [PolicyLink]
}

struct NumaPrivacyStatus: Codable, Equatable {
  let userId: String?
  let requiredVersion: String
  let allowed: Bool
  let decidedAt: Double?
  let deletionPending: Bool
  let disclosure: NumaPrivacyDisclosure

  func permitsSharing(for currentUserId: String?) -> Bool {
    guard let currentUserId, !currentUserId.isEmpty else { return false }
    return userId == currentUserId && allowed && !deletionPending && !requiredVersion.isEmpty
  }
}

/// Account-bound, server-backed choice. No preference in UserDefaults can
/// authorize AI sharing; unknown/unavailable consent leaves AI disabled.
struct NumaPrivacyControls: View {
  var compactWhenAllowed = false
  var permissionChanged: (Bool) -> Void = { _ in }
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var store
  @Environment(\.numa) private var numa
  @State private var expanded = false
  @State private var status: NumaPrivacyStatus?
  @State private var saving = false
  @State private var error: String?
  @State private var retry = 0
  @State private var intent: (allowed: Bool, version: String, receipt: String)?

  private var allowedForCurrentAccount: Bool { status?.permitsSharing(for: store.profile?.userId) == true }

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 14) {
        Text("Privacy & AI sharing").font(.headline)
        if compactWhenAllowed && allowedForCurrentAccount && !expanded {
          Label("AI sharing is on", systemImage: "checkmark.shield")
          Text("Submitted content goes to Vercel AI Gateway and Anthropic.").font(.footnote)
          Button("Review or withdraw permission") { expanded = true }
        } else if let status, status.userId == store.profile?.userId {
          Label(status.allowed ? "AI sharing is on" : "AI sharing is off", systemImage: status.allowed ? "checkmark.shield" : "hand.raised")
          Text(status.disclosure.title).font(.title3.bold())
          Text("Who receives data: \(status.disclosure.recipients)")
          Text(status.disclosure.data)
          Text(status.disclosure.purpose)
          Text(status.disclosure.withdrawal)
          Text(status.disclosure.retention)
          Text(status.disclosure.alternative).font(.subheadline.bold())
          ForEach(status.disclosure.links) { link in
            if let url = URL(string: link.url), url.scheme == "https" { Link(link.label, destination: url) }
          }
          if let error { Text(error).foregroundStyle(numa.negative) }
          if status.deletionPending {
            Text("AI sharing is disabled while account deletion is pending.")
          } else if status.allowed {
            Button("Withdraw AI sharing permission") { choose(false, status: status) }.disabled(saving)
          } else {
            Button("I agree to this AI data sharing") { choose(true, status: status) }.disabled(saving)
            Button("Keep AI sharing off") { choose(false, status: status) }.disabled(saving)
          }
          if saving { ProgressView("Saving choice…") }
        } else {
          Text("AI sharing stays off until your current account’s choice can be verified.")
          if let error { Text(error).foregroundStyle(numa.negative) }
          Button("Load privacy controls") { retry += 1 }
        }
      }
      .font(.subheadline)
      .foregroundStyle(numa.ink)
    }
    .onChange(of: allowedForCurrentAccount, initial: true) { _, allowed in permissionChanged(allowed) }
    .onDisappear { permissionChanged(false) }
    .task(id: "\(store.profile?.userId ?? "signed-out"):\(retry)") { await observe() }
  }

  private func observe() async {
    status = nil; saving = false; intent = nil; error = nil
    guard let lease = try? session.beginAccountLease(), let userId = store.profile?.userId else { return }
    do {
      for try await value in session.client.subscribe(to: "privacy:status", yielding: NumaPrivacyStatus.self).values {
        guard !Task.isCancelled, lease.isCurrent(), store.profile?.userId == userId else { return }
        guard value.userId == userId else {
          status = nil
          error = "Your account choice could not be verified. AI sharing stays off."
          return
        }
        status = value
      }
    } catch {
      guard !Task.isCancelled, lease.isCurrent() else { return }
      status = nil; self.error = "Privacy controls are unavailable. AI sharing cannot be enabled. Try again later."
    }
  }

  private func choose(_ allowed: Bool, status: NumaPrivacyStatus) {
    guard !saving, let lease = try? session.beginAccountLease(), let userId = status.userId, userId == store.profile?.userId else { return }
    if intent?.allowed != allowed || intent?.version != status.requiredVersion {
      intent = (allowed, status.requiredVersion, ClientMutationID.make("privacy.choice"))
    }
    guard let intent else { return }
    saving = true; error = nil
    Task {
      defer { _ = lease.performIfCurrent { saving = false } }
      do {
        guard lease.isCurrent() else { return }
        let _: MobileMutationResult = try await session.client.mutation("privacy:setAISharing", with: [
          "expectedUserId": userId, "allowed": allowed, "version": status.requiredVersion, "clientMutationId": intent.receipt,
        ])
        // Only the current server subscription changes the displayed state.
        _ = lease.performIfCurrent { self.intent = nil }
      } catch {
        _ = lease.performIfCurrent { self.error = "Could not confirm your choice. Retrying the same choice will not duplicate it." }
      }
    }
  }
}


struct NumaPrivacyHelp: View {
  @Environment(\.numa) private var numa
  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Your data, your controls").font(.headline)
        Text("Financial records live in your Numa cloud account. This iPhone keeps authentication credentials in its device-only Keychain. AI sharing is optional; manual tracking remains available.")
        Text("Account deletion has a seven-day recovery window. Shared financial history belonging to other owners and copies saved outside Numa may remain. Provider logs, backups and legacy attachment cleanup are not covered by a promise of immediate erasure.").font(.footnote)
        if let privacy = URL(string: NumaConfig.current.webAppURL + "/privacy") {
          Link("Read the privacy overview", destination: privacy)
        }
        Link("Contact support about your data", destination: URL(string: "mailto:support@example.com")!)
        Text("Do not email passwords, access tokens or private wallet keys. You can initiate account deletion here without contacting support.").font(.footnote)
      }
      .foregroundStyle(numa.ink)
    }
  }
}
