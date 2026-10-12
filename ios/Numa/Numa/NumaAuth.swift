import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

enum NumaAuthError: LocalizedError {
  case missingToken
  case invalidResponse
  case oauthNeedsCallback
  case refreshTokenRejected
  case staleSession

  var errorDescription: String? {
    switch self {
    case .missingToken:
      "No saved Numa Pro session."
    case .invalidResponse:
      "Numa Pro could not read the auth response."
    case .oauthNeedsCallback:
      "OAuth opened in the browser. Finish there or use email sign-in in Simulator."
    case .refreshTokenRejected:
      "Your saved Numa Pro session expired. Sign in again."
    case .staleSession:
      "That sign-in session changed. Try again from the current account."
    }
  }
}

struct AuthTokens: Codable, Equatable {
  let token: String
  let refreshToken: String
}

enum NumaGenerationBoundRefresh {
  static func perform(
    generation: NumaSessionGeneration,
    expectedGeneration: UInt64,
    readRefreshToken: @Sendable () -> String?,
    exchange: @Sendable (String) async throws -> AuthTokens
  ) async throws -> AuthTokens {
    var capturedRefreshToken: String?
    guard generation.performIfCurrent(expectedGeneration, action: {
      capturedRefreshToken = readRefreshToken()
    }) else {
      throw NumaAuthError.staleSession
    }
    guard let capturedRefreshToken else { throw NumaAuthError.missingToken }

    do {
      let tokens = try await exchange(capturedRefreshToken)
      guard generation.isCurrent(expectedGeneration) else {
        throw NumaAuthError.staleSession
      }
      return tokens
    } catch {
      guard generation.isCurrent(expectedGeneration) else {
        throw NumaAuthError.staleSession
      }
      throw error
    }
  }
}

enum NumaRefreshFailurePolicy {
  static func invalidatesSavedSession(_ error: Error) -> Bool {
    guard let authError = error as? NumaAuthError else { return false }
    if case .refreshTokenRejected = authError { return true }
    return false
  }
}

enum NumaPasswordPolicyIssue: String, Equatable {
  case minLength
  case characterMix
  case commonPassword
  case repeatedCharacters
  case sequentialCharacters
  case personalInfo

  var message: String {
    switch self {
    case .minLength: "Use at least 10 characters."
    case .characterMix: "Use at least 3 of: uppercase, lowercase, number, symbol."
    case .commonPassword: "Avoid common or easily guessed passwords."
    case .repeatedCharacters: "Avoid long repeated characters."
    case .sequentialCharacters: "Avoid obvious sequences like 123456 or qwerty."
    case .personalInfo: "Do not include your email or name."
    }
  }
}

struct NumaPasswordPolicyResult: Equatable {
  let issues: [NumaPasswordPolicyIssue]
  var isValid: Bool { issues.isEmpty }
}

enum NumaPasswordPolicy {
  private static let commonPasswords: Set<String> = [
    "password", "password1", "password12", "password123", "qwerty", "qwerty123",
    "123456", "12345678", "123456789", "111111", "letmein", "welcome",
    "welcome1", "admin", "admin123", "test", "test1234", "numa", "numa1234"
  ]
  private static let commonFragments = [
    "password", "qwerty", "letmein", "welcome", "admin", "test", "numa"
  ]
  private static let sequences = [
    "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "0123456789"
  ]

  static func validate(
    _ password: String,
    email: String? = nil,
    displayName: String? = nil
  ) -> NumaPasswordPolicyResult {
    var issues: [NumaPasswordPolicyIssue] = []
    func add(_ issue: NumaPasswordPolicyIssue) {
      if !issues.contains(issue) { issues.append(issue) }
    }

    // JavaScript's String.length counts UTF-16 code units. Mirror that exact
    // server boundary so emoji/non-BMP passwords are accepted or rejected
    // consistently on web and native clients.
    if password.utf16.count < 10 { add(.minLength) }
    let scalars = password.unicodeScalars
    let hasLower = scalars.contains { (97...122).contains(Int($0.value)) }
    let hasUpper = scalars.contains { (65...90).contains(Int($0.value)) }
    let hasDigit = scalars.contains { (48...57).contains(Int($0.value)) }
    let hasSymbol = scalars.contains {
      let value = Int($0.value)
      return !(48...57).contains(value) && !(65...90).contains(value) && !(97...122).contains(value)
    }
    if [hasLower, hasUpper, hasDigit, hasSymbol].filter({ $0 }).count < 3 {
      add(.characterMix)
    }
    if hasFiveRepeatedCharacters(password) { add(.repeatedCharacters) }

    let normalized = normalizeForCommonPassword(password)
    if commonPasswords.contains(normalized)
      || commonFragments.contains(where: normalized.contains) {
      add(.commonPassword)
    }
    if hasObviousSequence(normalizeForSequence(password)) { add(.sequentialCharacters) }

    var rawPersonalTokens: [String] = []
    if let emailLocalPart = email?.split(separator: "@", maxSplits: 1).first {
      rawPersonalTokens.append(String(emailLocalPart))
    }
    if let displayName {
      rawPersonalTokens.append(contentsOf: displayName.split(whereSeparator: { $0.isWhitespace }).map(String.init))
    }
    let personalTokens = rawPersonalTokens
      .map(normalizeForCommonPassword)
      .filter { $0.count >= 3 }
    if personalTokens.contains(where: normalized.contains) { add(.personalInfo) }

    return NumaPasswordPolicyResult(issues: issues)
  }

  private static func normalizeForCommonPassword(_ value: String) -> String {
    let replaced = value.lowercased()
      .replacingOccurrences(of: "@", with: "a")
      .replacingOccurrences(of: "$", with: "s")
      .replacingOccurrences(of: "0", with: "o")
      .replacingOccurrences(of: "1", with: "i")
      .replacingOccurrences(of: "!", with: "i")
      .replacingOccurrences(of: "3", with: "e")
      .replacingOccurrences(of: "5", with: "s")
    return asciiLettersAndDigits(replaced)
  }

  private static func normalizeForSequence(_ value: String) -> String {
    asciiLettersAndDigits(value.lowercased())
  }

  private static func asciiLettersAndDigits(_ value: String) -> String {
    var normalized = ""
    for scalar in value.unicodeScalars {
      let code = Int(scalar.value)
      if (48...57).contains(code) || (65...90).contains(code) || (97...122).contains(code) {
        normalized.unicodeScalars.append(scalar)
      }
    }
    return normalized
  }

  private static func hasFiveRepeatedCharacters(_ value: String) -> Bool {
    var previous: Unicode.Scalar?
    var count = 0
    for scalar in value.unicodeScalars {
      if scalar == previous {
        count += 1
      } else {
        previous = scalar
        count = 1
      }
      if count >= 5 { return true }
    }
    return false
  }

  private static func hasObviousSequence(_ value: String) -> Bool {
    guard value.count >= 4 else { return false }
    return sequences.contains { sequence in
      let characters = Array(sequence)
      for size in 4...characters.count {
        for start in 0...(characters.count - size) {
          let chunk = String(characters[start..<(start + size)])
          if value.contains(chunk) || value.contains(String(chunk.reversed())) { return true }
        }
      }
      return false
    }
  }
}

/// ConvexMobile surfaces server throws as
/// "[Request ID: …] Server Error\nUncaught Error: <message>\n<stack>" — unwrap
/// the message and translate auth internals into calm, human copy. Password
/// policy texts pass through untouched (they are written for people).
func friendlyAuthMessage(_ error: Error) -> String {
  let raw = error.localizedDescription
  var message = raw
  if let range = raw.range(of: "Uncaught Error: ") {
    message = String(raw[range.upperBound...])
  }
  // Server stacks arrive with LITERAL "\n" sequences (not newlines) — the
  // message is everything before the first of either. Stack frames always
  // follow a newline, so no further cutting (a " at " boundary would maim
  // copy like "Use at least 10 characters.").
  for boundary in ["\\n", "\n"] {
    if let range = message.range(of: boundary) {
      message = String(message[..<range.lowerBound])
    }
  }
  message = message.trimmingCharacters(in: .whitespacesAndNewlines)
  if message.contains("InvalidAccountId") || message.contains("InvalidSecret") {
    return "Wrong email or password."
  }
  if message == "Invalid password" {
    // convex-auth's built-in floor rejects before our policy can speak.
    return "Password is too weak. Use 10+ characters, mixing letters with numbers or symbols."
  }
  if message.localizedCaseInsensitiveContains("already exists") {
    return "That account already exists — sign in instead."
  }
  if message.contains("TooManyFailedAttempts") {
    return "Too many attempts. Wait a minute and try again."
  }
  if message.isEmpty || message.contains("Server Error") || message.hasPrefix("[Request ID") {
    return "Numa Pro couldn't reach the server. Check your connection and try again."
  }
  return message
}

struct AuthSignInResponse: Codable {
  let tokens: AuthTokens?
  let redirect: String?
  let verifier: String?
}

enum NumaPasswordFlowResult: Equatable {
  case signedIn
  case verificationPending
  case failed
}

enum NumaEmailVerificationResult: Equatable {
  case signedIn
  case invalidCode
  case failed
}

@MainActor
enum NumaPasswordAuthTransition {
  static func resolve(
    tokens: AuthTokens?,
    apply: (AuthTokens) async -> Bool
  ) async -> NumaPasswordFlowResult {
    guard let tokens else { return .verificationPending }
    return await apply(tokens) ? .signedIn : .failed
  }
}

struct AuthCapabilityFlags: Codable, Equatable {
  let passwordReset: Bool?
  let emailVerification: Bool?
  let googleOAuth: Bool?
  let appleOAuth: Bool?

  static let fallback = AuthCapabilityFlags(
    passwordReset: false,
    emailVerification: false,
    googleOAuth: true,
    appleOAuth: false
  )

  /// App Review Guideline 4.8: Google sign-in on iOS requires an equivalent
  /// privacy-preserving option, so it appears only while Apple sign-in does.
  /// Google-only accounts keep working on the web.
  var canUseGoogle: Bool { (googleOAuth ?? true) && canUseApple }
  var canUseApple: Bool { appleOAuth ?? false }
  var hasOAuthProvider: Bool { canUseGoogle || canUseApple }
}

struct NumaAuthFlagsLoadState: Equatable {
  private(set) var didLoad = false
  private(set) var isLoading = false

  mutating func begin() -> Bool {
    guard !didLoad, !isLoading else { return false }
    isLoading = true
    return true
  }

  mutating func finish(success: Bool) {
    isLoading = false
    if success { didLoad = true }
  }
}

final class NumaSessionGeneration: @unchecked Sendable {
  private let lock = NSLock()
  private var value: UInt64 = 0

  func snapshot() -> UInt64 {
    lock.lock()
    defer { lock.unlock() }
    return value
  }

  func isCurrent(_ expected: UInt64) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return value == expected
  }

  @discardableResult
  func advance(_ action: () -> Void = {}) -> UInt64 {
    lock.lock()
    value &+= 1
    action()
    let next = value
    lock.unlock()
    return next
  }

  func performIfCurrent(_ expected: UInt64, action: () -> Void) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard value == expected else { return false }
    action()
    return true
  }
}

struct NumaSessionLease: Sendable {
  let sessionGeneration: NumaSessionGeneration
  let expectedGeneration: UInt64

  func isCurrent() -> Bool {
    sessionGeneration.isCurrent(expectedGeneration)
  }

  func isBound(to generation: NumaSessionGeneration) -> Bool {
    sessionGeneration === generation
  }

  func matches(_ other: NumaSessionLease) -> Bool {
    sessionGeneration === other.sessionGeneration &&
      expectedGeneration == other.expectedGeneration
  }

  @discardableResult
  func performIfCurrent(_ action: () -> Void) -> Bool {
    sessionGeneration.performIfCurrent(expectedGeneration, action: action)
  }
}

typealias NumaAPIRequestLease = NumaSessionLease

struct NumaAPIBearer: Sendable {
  let token: String
  let lease: NumaAPIRequestLease
}

@MainActor
final class NumaAuthOperationGate {
  private var isLocked = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func run<T>(_ operation: @MainActor () async throws -> T) async rethrows -> T {
    await acquire()
    do {
      let result = try await operation()
      release()
      return result
    } catch {
      release()
      throw error
    }
  }

  private func acquire() async {
    if !isLocked {
      isLocked = true
      return
    }
    await withCheckedContinuation { continuation in
      waiters.append(continuation)
    }
  }

  private func release() {
    guard !waiters.isEmpty else {
      isLocked = false
      return
    }
    waiters.removeFirst().resume()
  }
}

@MainActor
enum NumaAccountDeletionTransition {
  static func perform(
    generation: NumaSessionGeneration,
    deleteRemote: () async throws -> Void,
    clearLocalSession: () async -> Void
  ) async throws {
    let expectedGeneration = generation.snapshot()
    try await deleteRemote()
    guard generation.isCurrent(expectedGeneration) else {
      throw NumaAuthError.staleSession
    }
    await clearLocalSession()
  }
}

private struct NumaRefreshedCredentials {
  let generation: UInt64
  let tokens: AuthTokens
}

private actor NumaTokenRefreshCoordinator {
  private let generation: NumaSessionGeneration
  private let operation: @Sendable (UInt64) async throws -> AuthTokens
  private var inFlight: (generation: UInt64, task: Task<AuthTokens, Error>)?

  init(
    generation: NumaSessionGeneration,
    operation: @escaping @Sendable (UInt64) async throws -> AuthTokens
  ) {
    self.generation = generation
    self.operation = operation
  }

  func freshCredentials(for requestGeneration: UInt64) async throws -> NumaRefreshedCredentials {
    guard generation.isCurrent(requestGeneration) else {
      throw NumaAuthError.staleSession
    }
    if let inFlight, inFlight.generation == requestGeneration {
      return try await resolve(inFlight.task, for: requestGeneration)
    }
    let operation = self.operation
    let task = Task { try await operation(requestGeneration) }
    inFlight = (requestGeneration, task)
    return try await resolve(task, for: requestGeneration)
  }

  private func resolve(
    _ task: Task<AuthTokens, Error>,
    for requestGeneration: UInt64
  ) async throws -> NumaRefreshedCredentials {
    do {
      let tokens = try await task.value
      guard generation.isCurrent(requestGeneration) else {
        throw NumaAuthError.staleSession
      }
      if inFlight?.generation == requestGeneration { inFlight = nil }
      return NumaRefreshedCredentials(generation: requestGeneration, tokens: tokens)
    } catch {
      if inFlight?.generation == requestGeneration { inFlight = nil }
      guard generation.isCurrent(requestGeneration) else {
        throw NumaAuthError.staleSession
      }
      throw error
    }
  }
}

final class NumaConvexAuthProvider: AuthProvider, @unchecked Sendable {
  private let lock = NSLock()
  private var token: String?
  private var terminalRejectionHandler: (@Sendable (UInt64) -> Void)?
  private let sessionGeneration: NumaSessionGeneration?
  private let refreshCoordinator: NumaTokenRefreshCoordinator?
  private let persistTokens: @Sendable (AuthTokens) -> Void

  init(
    sessionGeneration: NumaSessionGeneration? = nil,
    refreshTokens: (@Sendable (UInt64) async throws -> AuthTokens)? = nil,
    persistTokens: @escaping @Sendable (AuthTokens) -> Void = { _ in }
  ) {
    self.sessionGeneration = sessionGeneration
    self.persistTokens = persistTokens
    if let sessionGeneration, let refreshTokens {
      refreshCoordinator = NumaTokenRefreshCoordinator(
        generation: sessionGeneration,
        operation: refreshTokens
      )
    } else {
      refreshCoordinator = nil
    }
  }

  func setToken(_ next: String?) {
    lock.lock()
    token = next
    lock.unlock()
  }

  func currentToken() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return token
  }

  func setTerminalRejectionHandler(_ handler: @escaping @Sendable (UInt64) -> Void) {
    lock.lock()
    terminalRejectionHandler = handler
    lock.unlock()
  }

  private func signalTerminalRejection(for generation: UInt64) {
    lock.lock()
    let handler = terminalRejectionHandler
    lock.unlock()
    handler?(generation)
  }

  func login(onIdToken _: @Sendable @escaping (String?) -> Void) async throws -> String {
    guard let token = currentToken() else {
      throw NumaAuthError.missingToken
    }
    return token
  }

  func logout() async throws {
    setToken(nil)
  }

  func loginFromCache(onIdToken _: @Sendable @escaping (String?) -> Void) async throws -> String {
    guard let refreshCoordinator, let sessionGeneration else {
      guard let token = currentToken() else { throw NumaAuthError.missingToken }
      return token
    }
    let requestGeneration = sessionGeneration.snapshot()
    do {
      let refreshed = try await refreshCoordinator.freshCredentials(for: requestGeneration)
      guard sessionGeneration.performIfCurrent(refreshed.generation, action: {
        persistTokens(refreshed.tokens)
        setToken(refreshed.tokens.token)
      }) else { throw NumaAuthError.staleSession }
      return refreshed.tokens.token
    } catch NumaAuthError.staleSession {
      // A newer account/sign-out owns the provider now. Never clear its token
      // or invoke an old Convex callback from this superseded refresh.
      throw NumaAuthError.staleSession
    } catch {
      guard NumaRefreshFailurePolicy.invalidatesSavedSession(error) else {
        // Offline/timeouts and server failures must not turn a usable saved
        // session into a forced sign-in. The current request can retry later.
        throw error
      }
      guard sessionGeneration.performIfCurrent(requestGeneration, action: {
        setToken(nil)
      }) else {
        throw NumaAuthError.staleSession
      }
      // ConvexMobile 0.8.1 swallows errors from an internal forced refresh
      // and keeps its cached JWT. Notify the app-owned, generation-checked
      // coordinator so it can serialize the actual bridge teardown.
      signalTerminalRejection(for: requestGeneration)
      throw error
    }
  }

  func extractIdToken(from authResult: String) -> String {
    authResult
  }
}

/// Anchors ASWebAuthenticationSession to the key window.
@MainActor
final class WebAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
  func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }
      .first ?? ASPresentationAnchor()
  }
}

enum NumaKeychain {
  private static let service = "com.arsiktech.numa"

  static func read(_ account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func write(_ value: String, account: String) {
    delete(account)
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ]
    SecItemAdd(query as CFDictionary, nil)
  }

  static func delete(_ account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account
    ]
    SecItemDelete(query as CFDictionary)
  }
}
