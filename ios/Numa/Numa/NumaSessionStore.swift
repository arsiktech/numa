import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

@MainActor
@Observable
final class NumaSessionStore {
  enum Status: Equatable {
    case checking
    case signedOut
    case signedIn
    case failed(String)
  }

  private let unauthenticatedClient: ConvexClient
  private let authProvider: NumaConvexAuthProvider
  private let sessionGeneration: NumaSessionGeneration
  private let authOperations = NumaAuthOperationGate()
  let client: ConvexClientWithAuth<String>

  var status: Status = .checking
  var busy = false
  var errorMessage: String?

  private var authFlags: AuthCapabilityFlags = .fallback
  private var authFlagsLoadState = NumaAuthFlagsLoadState()

  var canUseGoogleOAuth: Bool { authFlags.canUseGoogle }
  var canUseAppleOAuth: Bool { authFlags.canUseApple }
  var hasOAuthProvider: Bool { authFlags.hasOAuthProvider }
  var canResetPassword: Bool { authFlags.passwordReset ?? false }
  var usesEmailVerification: Bool { authFlags.emailVerification ?? false }
  init(deploymentURL: String = NumaConfig.current.convexDeploymentURL) {
    let unauthenticatedClient = ConvexClient(deploymentUrl: deploymentURL)
    let sessionGeneration = NumaSessionGeneration()
    let provider = NumaConvexAuthProvider(
      sessionGeneration: sessionGeneration,
      refreshTokens: { requestGeneration in
        try await NumaGenerationBoundRefresh.perform(
          generation: sessionGeneration,
          expectedGeneration: requestGeneration,
          readRefreshToken: { NumaKeychain.read("numa.auth.refreshToken") },
          exchange: { refreshToken in
            let response: AuthSignInResponse = try await unauthenticatedClient.action(
              "auth:signIn",
              with: ["refreshToken": refreshToken]
            )
            guard let tokens = response.tokens else {
              // Convex Auth deliberately returns `tokens: null` for an
              // invalid, expired, or revoked refresh session.
              throw NumaAuthError.refreshTokenRejected
            }
            return tokens
          }
        )
      },
      persistTokens: Self.persistTokens
    )
    self.sessionGeneration = sessionGeneration
    self.authProvider = provider
    self.unauthenticatedClient = unauthenticatedClient
    self.client = ConvexClientWithAuth(deploymentUrl: deploymentURL, authProvider: provider)
    provider.setTerminalRejectionHandler { [weak self] rejectedGeneration in
      Task { @MainActor [weak self] in
        await self?.handleTerminalRefreshRejection(for: rejectedGeneration)
      }
    }
  }

  func restore() async {
    #if DEBUG
      // Simulator-only QA hook: keychain sessions outlive reinstalls, so
      // sweeps need an explicit way back to the signed-out surface.
      if ProcessInfo.processInfo.environment["NUMA_QA_SIGNOUT"] == "1" {
        await authOperations.run {
          clearSessionState()
          await client.logout()
        }
        return
      }
    #endif
    guard NumaKeychain.read("numa.auth.refreshToken") != nil else {
      #if DEBUG
        // Simulator-only QA hook: `SIMCTL_CHILD_NUMA_QA_EMAIL/_PASSWORD` sign
        // the QA account in without driving the UI. Never compiled into
        // release builds.
        let env = ProcessInfo.processInfo.environment
        if let email = env["NUMA_QA_EMAIL"], let password = env["NUMA_QA_PASSWORD"],
           !email.isEmpty, !password.isEmpty {
          if env["NUMA_QA_SIGNUP"] == "1" {
            if await signUp(email: email, password: password, displayName: "QA Signup") == .signedIn { return }
          } else if await signIn(email: email, password: password) == .signedIn {
            return
          }
        }
      #endif
      await authOperations.run {
        clearSessionState()
        await client.logout()
      }
      return
    }
    await authOperations.run {
      let restoreGeneration = sessionGeneration.snapshot()
      _ = sessionGeneration.performIfCurrent(restoreGeneration) {
        authProvider.setToken(NumaKeychain.read("numa.auth.jwt"))
      }
      switch await client.loginFromCache() {
      case .success where sessionGeneration.isCurrent(restoreGeneration):
        status = .signedIn
      case .success:
        break
      case .failure(let error) where sessionGeneration.isCurrent(restoreGeneration):
        if NumaRefreshFailurePolicy.invalidatesSavedSession(error) {
          clearSessionState()
          await client.logout()
        } else {
          status = .failed(friendlyAuthMessage(error))
        }
      case .failure:
        break
      }
    }
  }

  /// Captures the account generation before a paid request snapshots any
  /// financial data. The lease stays bound to that account across refreshes,
  /// transport suspension, and the single 401 retry.
  func beginAPIRequest() throws -> NumaAPIRequestLease {
    try beginAccountLease()
  }

  /// Binds any async client-store operation to the account that launched it.
  /// A sign-out, terminal refresh rejection, or replacement login advances
  /// the generation, making every older lease permanently stale.
  func beginAccountLease() throws -> NumaSessionLease {
    guard case .signedIn = status else { throw NumaAuthError.missingToken }
    return NumaSessionLease(
      sessionGeneration: sessionGeneration,
      expectedGeneration: sessionGeneration.snapshot()
    )
  }

  /// Returns a newly exchanged bearer and updates ConvexMobile's auth bridge.
  /// This is intentionally async: paid API requests must never use a cached
  /// access JWT that may have expired while the app remained open.
  func freshAPIAuthToken(for lease: NumaAPIRequestLease) async throws -> NumaAPIBearer {
    try await authOperations.run {
      guard case .signedIn = status else { throw NumaAuthError.missingToken }
      guard lease.isBound(to: sessionGeneration), lease.isCurrent() else {
        throw NumaAuthError.staleSession
      }
      switch await client.loginFromCache() {
      case .success(let token):
        guard lease.isCurrent() else {
          throw NumaAuthError.staleSession
        }
        status = .signedIn
        return NumaAPIBearer(token: token, lease: lease)
      case .failure(let error):
        guard lease.isCurrent() else {
          throw NumaAuthError.staleSession
        }
        if NumaRefreshFailurePolicy.invalidatesSavedSession(error) {
          clearSessionState()
          await client.logout()
        }
        throw error
      }
    }
  }

  func signIn(email: String, password: String) async -> NumaPasswordFlowResult {
    await passwordFlow(email: email, password: password, displayName: nil, flow: "signIn")
  }

  func signUp(email: String, password: String, displayName: String) async -> NumaPasswordFlowResult {
    await passwordFlow(email: email, password: password, displayName: displayName, flow: "signUp")
  }

  func loadAuthFlags() async {
    guard authFlagsLoadState.begin() else { return }
    do {
      let publisher = unauthenticatedClient
        .subscribe(to: "authConfig:flags", yielding: AuthCapabilityFlags.self)
      for try await flags in publisher.values {
        authFlags = flags
        authFlagsLoadState.finish(success: true)
        return
      }
      authFlagsLoadState.finish(success: false)
    } catch {
      // Keep conservative flags, but leave the load retryable when the app
      // next becomes active. A transient offline launch must not hide reset
      // and verification for the rest of the session.
      authFlagsLoadState.finish(success: false)
    }
  }

  /// Full native OAuth: Convex Auth hands us its provider URL with our
  /// custom scheme as the final hop (backend allows `numa://auth` in
  /// callbacks.redirect), ASWebAuthenticationSession runs the browser dance
  /// sharing Safari's cookies, and the returned code is exchanged for tokens
  /// over the same action the password flow uses.
  @MainActor
  func signInWithProvider(_ provider: String) async {
    busy = true
    errorMessage = nil
    defer { busy = false }
    let attemptGeneration = sessionGeneration.snapshot()
    do {
      let response: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: [
          "provider": provider,
          "params": ["redirectTo": "numa://auth"]
        ]
      )
      if let tokens = response.tokens {
        guard await apply(tokens: tokens, ifCurrent: attemptGeneration) else {
          throw NumaAuthError.staleSession
        }
        return
      }
      guard let redirect = response.redirect, let redirectURL = URL(string: redirect) else {
        throw NumaAuthError.invalidResponse
      }
      let callback = try await presentWebAuth(url: redirectURL)
      guard
        let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
          .queryItems?.first(where: { $0.name == "code" })?.value
      else {
        throw NumaAuthError.invalidResponse
      }
      var exchange: [String: ConvexEncodable?] = ["params": ["code": code]]
      if let verifier = response.verifier {
        exchange["verifier"] = verifier
      }
      let final: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: exchange
      )
      guard let tokens = final.tokens else { throw NumaAuthError.invalidResponse }
      guard await apply(tokens: tokens, ifCurrent: attemptGeneration) else {
        throw NumaAuthError.staleSession
      }
    } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
      // The user closed the sheet — not an error worth red text.
    } catch let error as NumaAuthError {
      errorMessage = error.errorDescription
    } catch {
      errorMessage = friendlyAuthMessage(error)
    }
  }

  private let webAuthPresenter = WebAuthPresenter()

  @MainActor
  private func presentWebAuth(url: URL) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "numa") { callback, error in
        if let callback {
          continuation.resume(returning: callback)
        } else {
          continuation.resume(throwing: error ?? NumaAuthError.invalidResponse)
        }
      }
      session.presentationContextProvider = webAuthPresenter
      // Share Safari's session — the user's Google login is one tap away.
      session.prefersEphemeralWebBrowserSession = false
      if !session.start() {
        continuation.resume(throwing: NumaAuthError.invalidResponse)
      }
    }
  }

  func signOut() async {
    busy = true
    defer { busy = false }
    await authOperations.run {
      clearSessionState()
      try? await client.action("auth:signOut")
      await client.logout()
    }
  }

  @discardableResult
  func deleteAccount() async -> Bool {
    busy = true
    errorMessage = nil
    defer { busy = false }
    do {
      try await authOperations.run {
        guard case .signedIn = status else { throw NumaAuthError.missingToken }
        try await NumaAccountDeletionTransition.perform(
          generation: sessionGeneration,
          deleteRemote: {
            try await client.mutation("users:deleteMyAccount")
          },
          clearLocalSession: {
            self.clearSessionState()
            await self.client.logout()
          }
        )
      }
      return true
    } catch {
      // The remote mutation is authoritative. On failure leave the bearer,
      // refresh token, SDK bridge, and signed-in UI intact so the user can
      // retry without losing access.
      errorMessage = friendlyAuthMessage(error)
      return false
    }
  }

  private func passwordFlow(
    email: String,
    password: String,
    displayName: String?,
    flow: String
  ) async -> NumaPasswordFlowResult {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !trimmedEmail.isEmpty, !password.isEmpty else { return .failed }
    busy = true
    errorMessage = nil
    defer { busy = false }
    let attemptGeneration = sessionGeneration.snapshot()
    do {
      var params: [String: ConvexEncodable?] = [
        "email": trimmedEmail,
        "password": password,
        "flow": flow
      ]
      if let displayName, !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        params["name"] = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      let response: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: [
          "provider": "password",
          "params": params
        ]
      )
      return await NumaPasswordAuthTransition.resolve(tokens: response.tokens) { tokens in
        await self.apply(tokens: tokens, ifCurrent: attemptGeneration)
      }
    } catch {
      errorMessage = friendlyAuthMessage(error)
      return .failed
    }
  }

  func verifyEmail(email: String, code: String) async -> NumaEmailVerificationResult {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedEmail.isEmpty, !trimmedCode.isEmpty else { return .invalidCode }
    busy = true
    errorMessage = nil
    defer { busy = false }
    let attemptGeneration = sessionGeneration.snapshot()
    do {
      let response: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: [
          "provider": "password",
          "params": [
            "email": trimmedEmail,
            "code": trimmedCode,
            "flow": "email-verification"
          ]
        ]
      )
      guard let tokens = response.tokens else {
        errorMessage = "That verification code is wrong or expired."
        return .invalidCode
      }
      guard await apply(tokens: tokens, ifCurrent: attemptGeneration) else {
        throw NumaAuthError.staleSession
      }
      return .signedIn
    } catch {
      errorMessage = friendlyAuthMessage(error)
      return .failed
    }
  }

  @discardableResult
  func resendEmailVerification(email: String) async -> Bool {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !trimmedEmail.isEmpty else { return false }
    busy = true
    errorMessage = nil
    defer { busy = false }
    do {
      let _: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: [
          "provider": "password",
          "params": [
            "email": trimmedEmail,
            "flow": "email-verification"
          ]
        ]
      )
      return true
    } catch {
      errorMessage = friendlyAuthMessage(error)
      return false
    }
  }

  @discardableResult
  func requestPasswordReset(email: String) async -> Bool {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard canResetPassword, !trimmedEmail.isEmpty else { return false }
    busy = true
    errorMessage = nil
    defer { busy = false }
    do {
      let _: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: [
          "provider": "password",
          "params": [
            "email": trimmedEmail,
            "flow": "reset"
          ]
        ]
      )
      return true
    } catch {
      errorMessage = friendlyAuthMessage(error)
      return false
    }
  }

  @discardableResult
  func confirmPasswordReset(email: String, code: String, newPassword: String) async -> Bool {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canResetPassword, !trimmedEmail.isEmpty, !trimmedCode.isEmpty, !newPassword.isEmpty else {
      return false
    }
    busy = true
    errorMessage = nil
    defer { busy = false }
    let attemptGeneration = sessionGeneration.snapshot()
    do {
      let response: AuthSignInResponse = try await unauthenticatedClient.action(
        "auth:signIn",
        with: [
          "provider": "password",
          "params": [
            "email": trimmedEmail,
            "code": trimmedCode,
            "newPassword": newPassword,
            "flow": "reset-verification"
          ]
        ]
      )
      guard let tokens = response.tokens else { throw NumaAuthError.invalidResponse }
      guard await apply(tokens: tokens, ifCurrent: attemptGeneration) else {
        throw NumaAuthError.staleSession
      }
      return true
    } catch {
      errorMessage = friendlyAuthMessage(error)
      return false
    }
  }

  private func apply(tokens: AuthTokens, ifCurrent expectedGeneration: UInt64) async -> Bool {
    await authOperations.run {
      guard sessionGeneration.isCurrent(expectedGeneration) else { return false }
      let appliedGeneration = sessionGeneration.advance {
        Self.persistTokens(tokens)
        authProvider.setToken(tokens.token)
      }
      switch await client.login() {
      case .success where sessionGeneration.isCurrent(appliedGeneration):
        status = .signedIn
        return true
      case .success:
        return false
      case .failure(let error) where sessionGeneration.isCurrent(appliedGeneration):
        status = .failed(error.localizedDescription)
        return false
      case .failure:
        return false
      }
    }
  }

  private func clearSessionState() {
    sessionGeneration.advance {
      NumaKeychain.delete("numa.auth.jwt")
      NumaKeychain.delete("numa.auth.refreshToken")
      authProvider.setToken(nil)
    }
    status = .signedOut
  }

  private func handleTerminalRefreshRejection(for rejectedGeneration: UInt64) async {
    await authOperations.run {
      guard sessionGeneration.isCurrent(rejectedGeneration) else { return }
      clearSessionState()
      await client.logout()
    }
  }

  private nonisolated static func persistTokens(_ tokens: AuthTokens) {
    NumaKeychain.write(tokens.token, account: "numa.auth.jwt")
    NumaKeychain.write(tokens.refreshToken, account: "numa.auth.refreshToken")
  }
}
