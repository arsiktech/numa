import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

private enum NativeAuthStage: Equatable {
  case credentials
  case verifyEmail
  case resetRequest
  case resetVerify
}

struct WelcomeNativeView: View {
  @Environment(NumaSessionStore.self) private var session
  @Environment(\.numa) private var numa
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @State private var signUpMode = false
  @State private var email = ""
  @State private var password = ""
  @State private var displayName = ""
  @State private var showPassword = false
  @State private var authStage: NativeAuthStage = .credentials
  @State private var verificationCode = ""
  @State private var resetCode = ""
  @State private var resetNewPassword = ""
  @State private var showResetPassword = false
  @State private var authNotice: String?
  @State private var localError: String?

  var body: some View {
    ScrollView(.vertical) {
      VStack(alignment: .leading, spacing: 18) {
        WelcomeHeroPanel()
        authBlock
        WelcomeMoneyPreview()
        WelcomeTrustStrip()
      }
      .padding(.horizontal, 20)
      .padding(.top, 18)
      .padding(.bottom, 28)
      .frame(maxWidth: 520)
      .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(numa.bg.ignoresSafeArea())
    .onChange(of: signUpMode) { _, _ in
      clearAuthFeedback()
    }
    .task {
      await session.loadAuthFlags()
      #if DEBUG
        // Simulator QA hook: kick the native OAuth round-trip on launch so a
        // headless sweep can screenshot the system auth sheet.
        if let oauthProvider = ProcessInfo.processInfo.environment["NUMA_QA_OAUTH"]?.lowercased(),
           oauthProvider == "google" || oauthProvider == "apple" {
          await session.signInWithProvider(oauthProvider)
        }
      #endif
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        Task { await session.loadAuthFlags() }
      }
    }
  }

  @ViewBuilder
  private var authBlock: some View {
    VStack(alignment: .leading, spacing: 14) {
      switch authStage {
      case .credentials:
        credentialsContent
      case .verifyEmail:
        verificationContent
      case .resetRequest:
        resetRequestContent
      case .resetVerify:
        resetVerificationContent
      }
    }
    .padding(16)
    .background(numa.paper)
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(numa.line))
  }

  @ViewBuilder
  private var credentialsContent: some View {
    HStack(alignment: .center) {
      authStageHeader(
        title: signUpMode ? "Create your Numa Pro" : "Welcome back",
        subtitle: signUpMode
          ? "Start with cloud sync and your own setup."
          : "Continue to your money space."
      )
      Spacer()
      AuthModeToggle(signUpMode: $signUpMode)
    }

    if session.canUseGoogleOAuth {
      Button {
        Task { await session.signInWithProvider("google") }
      } label: {
        HStack(spacing: 8) {
          Text("G")
            .font(.system(size: 17, weight: .bold))
          Text(session.busy ? "Connecting…" : "Continue with Google")
        }
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(NumaDarkButtonStyle())
      .disabled(session.busy)
    }

    if session.canUseAppleOAuth {
      Button {
        Task { await session.signInWithProvider("apple") }
      } label: {
        HStack(spacing: 8) {
          Image(systemName: "apple.logo")
            .font(.system(size: 17, weight: .semibold))
          Text(session.busy ? "Connecting..." : "Continue with Apple")
        }
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(NumaDarkButtonStyle())
      .disabled(session.busy)
    }

    if session.hasOAuthProvider {
      NumaDividerLabel("or use email")
    }

    if signUpMode {
      NumaAuthTextField(
        title: "Name",
        text: $displayName,
        placeholder: "Arsik",
        textContentType: .name,
        capitalization: .words
      )
      .transition(.opacity.combined(with: .move(edge: .top)))
    }
    NumaAuthTextField(
      title: "Email",
      text: $email,
      placeholder: "you@numa.app",
      keyboard: .emailAddress,
      textContentType: .emailAddress
    )
    NumaAuthPasswordField(
      title: "Password",
      text: $password,
      reveal: $showPassword,
      textContentType: signUpMode ? .newPassword : .password
    )
    if signUpMode {
      PasswordPolicyChips(password: password, email: email, displayName: displayName)
      if session.usesEmailVerification {
        Text("After creating your account, enter the 8-digit code we email you.")
          .font(.caption)
          .foregroundStyle(numa.ink3)
      }
    } else if session.canResetPassword {
      Button("Forgot password?") {
        clearAuthFeedback()
        authStage = .resetRequest
      }
      .font(.caption.weight(.semibold))
      .foregroundStyle(numa.ink3)
      .frame(maxWidth: .infinity, alignment: .trailing)
      .disabled(session.busy)
    }

    authFeedback

    NumaPrimaryButton(
      title: session.busy ? "Connecting..." : (signUpMode ? "Create account" : "Sign in"),
      systemImage: "arrow.right"
    ) {
      Task { await submitPasswordFlow() }
    }
    .disabled(!canSubmit)
    .opacity(canSubmit ? 1 : 0.55)

    Button(signUpMode ? "Already have an account? Sign in" : "New to Numa Pro? Create an account") {
      NumaMotion.run(reduceMotion: reduceMotion) {
        signUpMode.toggle()
      }
    }
    .font(.system(size: 14, weight: .semibold))
    .foregroundStyle(numa.ink3)

    #if DEBUG
      // Which backend this build talks to — kills "my account doesn't
      // work" confusion between dev and prod data.
      Text("BUILD · \(URL(string: NumaConfig.current.convexDeploymentURL)?.host() ?? "?")")
        .font(NumaType.mono(10, .bold))
        .tracking(1.4)
        .foregroundStyle(numa.ink3.opacity(0.7))
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, 6)
    #endif
  }

  @ViewBuilder
  private var verificationContent: some View {
    authStageHeader(
      title: "Check your email",
      subtitle: "Enter the 8-digit verification code sent to \(email.trimmingCharacters(in: .whitespacesAndNewlines))."
    )
    NumaAuthTextField(
      title: "Verification code",
      text: $verificationCode,
      placeholder: "12345678",
      keyboard: .numberPad,
      textContentType: .oneTimeCode
    )
    authFeedback
    NumaPrimaryButton(
      title: session.busy ? "Checking..." : "Verify and continue",
      systemImage: "checkmark"
    ) {
      Task { await submitEmailVerification() }
    }
    .disabled(session.busy || verificationCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    .opacity(session.busy || verificationCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.55 : 1)

    Button {
      Task { await resendVerificationCode() }
    } label: {
      Text(session.busy ? "Sending..." : "Send another code")
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(NumaSecondaryButtonStyle())
    .disabled(session.busy)
    backToCredentialsButton
  }

  @ViewBuilder
  private var resetRequestContent: some View {
    authStageHeader(
      title: "Reset your password",
      subtitle: "We’ll email a one-time code so you can choose a new password."
    )
    NumaAuthTextField(
      title: "Email",
      text: $email,
      placeholder: "you@numa.app",
      keyboard: .emailAddress,
      textContentType: .emailAddress
    )
    authFeedback
    NumaPrimaryButton(
      title: session.busy ? "Sending..." : "Send reset code",
      systemImage: "envelope"
    ) {
      Task { await submitResetRequest() }
    }
    .disabled(session.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    .opacity(session.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.55 : 1)
    backToCredentialsButton
  }

  @ViewBuilder
  private var resetVerificationContent: some View {
    authStageHeader(
      title: "Choose a new password",
      subtitle: "Enter the code sent to \(email.trimmingCharacters(in: .whitespacesAndNewlines))."
    )
    NumaAuthTextField(
      title: "Reset code",
      text: $resetCode,
      placeholder: "12345678",
      keyboard: .numberPad,
      textContentType: .oneTimeCode
    )
    NumaAuthPasswordField(
      title: "New password",
      text: $resetNewPassword,
      reveal: $showResetPassword,
      textContentType: .newPassword
    )
    PasswordPolicyChips(password: resetNewPassword, email: email, displayName: "")
    authFeedback
    NumaPrimaryButton(
      title: session.busy ? "Updating..." : "Update password",
      systemImage: "checkmark"
    ) {
      Task { await submitResetVerification() }
    }
    .disabled(!canSubmitResetVerification)
    .opacity(canSubmitResetVerification ? 1 : 0.55)

    Button("Send another code") {
      clearAuthFeedback()
      resetCode = ""
      resetNewPassword = ""
      authStage = .resetRequest
    }
    .font(.caption.weight(.semibold))
    .foregroundStyle(numa.ink3)
    .disabled(session.busy)
    backToCredentialsButton
  }

  @ViewBuilder
  private var authFeedback: some View {
    if let authNotice {
      Text(authNotice)
        .font(.caption.weight(.medium))
        .foregroundStyle(numa.ink3)
        .padding(.horizontal, 2)
    }
    if let message = localError ?? session.errorMessage {
      AuthErrorBanner(message: message)
    }
  }

  private func authStageHeader(title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(NumaType.display(24, .bold))
        .foregroundStyle(numa.ink)
      Text(subtitle)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(numa.ink3)
    }
  }

  private var backToCredentialsButton: some View {
    Button {
      returnToCredentials()
    } label: {
      Label("Back to sign in", systemImage: "arrow.left")
    }
    .font(.caption.weight(.semibold))
    .foregroundStyle(numa.ink3)
    .disabled(session.busy)
  }

  private var canSubmit: Bool {
    if session.busy { return false }
    let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleanEmail.isEmpty || password.isEmpty { return false }
    if signUpMode {
      guard !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return false
      }
      if !NumaPasswordPolicy.validate(
        password,
        email: cleanEmail,
        displayName: displayName
      ).isValid { return false }
    }
    return true
  }

  private var canSubmitResetVerification: Bool {
    if session.busy { return false }
    if resetCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
    return NumaPasswordPolicy.validate(
      resetNewPassword,
      email: email,
      displayName: ""
    ).isValid
  }

  private func submitPasswordFlow() async {
    clearAuthFeedback()
    let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard cleanEmail.contains("@"), cleanEmail.contains(".") else {
      localError = "Use a valid email address."
      return
    }
    let result: NumaPasswordFlowResult
    if signUpMode {
      guard !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        localError = "Add your name to create the account."
        return
      }
      let policy = NumaPasswordPolicy.validate(
        password,
        email: cleanEmail,
        displayName: displayName
      )
      guard policy.isValid else {
        localError = policy.issues.first?.message ?? "Password is too weak."
        return
      }
      result = await session.signUp(email: cleanEmail, password: password, displayName: displayName)
    } else {
      result = await session.signIn(email: cleanEmail, password: password)
    }

    switch result {
    case .signedIn:
      break
    case .verificationPending:
      password = ""
      verificationCode = ""
      authNotice = "We sent an 8-digit code. Check your inbox and spam folder."
      authStage = .verifyEmail
    case .failed:
      if session.errorMessage == nil {
        localError = signUpMode
          ? "Numa Pro couldn’t create the account. Try again."
          : "Numa Pro couldn’t sign you in. Check your details and try again."
      }
    }
  }

  private func submitEmailVerification() async {
    clearAuthFeedback()
    switch await session.verifyEmail(email: email, code: verificationCode) {
    case .signedIn:
      break
    case .invalidCode:
      if session.errorMessage == nil {
        localError = "That verification code is wrong or expired."
      }
    case .failed:
      if session.errorMessage == nil {
        localError = "Numa Pro couldn’t verify that code. Try again."
      }
    }
  }

  private func resendVerificationCode() async {
    clearAuthFeedback()
    if await session.resendEmailVerification(email: email) {
      authNotice = "A new verification code is on its way."
    } else if session.errorMessage == nil {
      localError = "Numa Pro couldn’t send another code. Try again."
    }
  }

  private func submitResetRequest() async {
    clearAuthFeedback()
    let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard cleanEmail.contains("@"), cleanEmail.contains(".") else {
      localError = "Use a valid email address."
      return
    }
    if await session.requestPasswordReset(email: cleanEmail) {
      resetCode = ""
      resetNewPassword = ""
      authNotice = "If that account exists, its reset code is in the inbox."
      authStage = .resetVerify
    } else if session.errorMessage == nil {
      localError = "Numa Pro couldn’t start the password reset. Try again."
    }
  }

  private func submitResetVerification() async {
    clearAuthFeedback()
    let policy = NumaPasswordPolicy.validate(
      resetNewPassword,
      email: email,
      displayName: ""
    )
    guard policy.isValid else {
      localError = policy.issues.first?.message ?? "Choose a stronger password."
      return
    }
    let confirmed = await session.confirmPasswordReset(
      email: email,
      code: resetCode,
      newPassword: resetNewPassword
    )
    if !confirmed, session.errorMessage == nil {
      localError = "That reset code is wrong or expired."
    }
  }

  private func returnToCredentials() {
    authStage = .credentials
    signUpMode = false
    password = ""
    verificationCode = ""
    resetCode = ""
    resetNewPassword = ""
    showPassword = false
    showResetPassword = false
    clearAuthFeedback()
  }

  private func clearAuthFeedback() {
    localError = nil
    authNotice = nil
    session.errorMessage = nil
  }
}

private struct WelcomeHeroPanel: View {
  @Environment(\.numa) private var numa
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .top) {
        NumaCoinMark(size: 52)
        Spacer()
        VStack(alignment: .trailing, spacing: 5) {
          Text("TRACK MONEY")
            .font(NumaType.mono(10, .bold))
            .tracking(2.2)
            .foregroundStyle(numa.ink3)
          Text("Your money, in perspective.")
            .font(.caption.weight(.semibold))
            .foregroundStyle(numa.ink2)
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        if dynamicTypeSize.isAccessibilitySize {
          // A compact, scalable two-word lockup avoids giant fragmented letters.
          Text("Numa\nPro")
            .font(NumaType.display(28, .bold))
            .foregroundStyle(numa.ink)
            .minimumScaleFactor(0.72)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel("Numa Pro")
        } else {
          Text("Numa Pro")
            .font(NumaType.display(56, .bold))
            .foregroundStyle(numa.ink)
            .minimumScaleFactor(0.72)
            .lineLimit(1)
        }
        Text("Small moments. Bigger ambitions. A clearer picture of your spending, savings, and capital.")
          .font(.system(size: 16, weight: .medium))
          .lineSpacing(3)
          .foregroundStyle(numa.ink2)
          .fixedSize(horizontal: false, vertical: true)
      }

    }
    .padding(24)
    .background(alignment: .topTrailing) {
      NumaBrandOrbit().foregroundStyle(numa.ink.opacity(0.06)).offset(x: 125, y: -120)
    }
    .background(numa.paper)
    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(numa.line))
  }
}

private struct WelcomeMoneyPreview: View {
  @Environment(\.numa) private var numa

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text("SPENT THIS WEEK")
          .font(NumaType.mono(10, .bold))
          .tracking(2)
          .foregroundStyle(numa.ctaInk.opacity(0.78))
        Spacer()
        Text("86%")
          .font(NumaType.mono(12, .bold))
          .foregroundStyle(numa.ctaInk)
      }
      Text("€214.40")
        .font(NumaType.mono(36, .semibold))
        .foregroundStyle(numa.ctaInk)
        .minimumScaleFactor(0.72)
        .lineLimit(1)
      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          Capsule().fill(numa.ctaInk.opacity(0.18))
          Capsule()
            .fill(numa.ctaInk)
            .frame(width: proxy.size.width * 0.86)
        }
      }
      .frame(height: 7)
      HStack {
        Text("€36 left of your €250 week")
        Spacer()
        Text("Tue")
      }
      .font(NumaType.mono(11, .semibold))
      .foregroundStyle(numa.ctaInk.opacity(0.84))

      HStack(spacing: 8) {
        WelcomePreviewChip(title: "Groceries", amount: "-€42")
        WelcomePreviewChip(title: "Income", amount: "+€5k")
      }
    }
    .padding(14)
    .background(numa.ink)
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
  }
}

private struct WelcomePreviewChip: View {
  @Environment(\.numa) private var numa
  let title: String
  let amount: String

  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(NumaType.mono(9, .bold))
          .tracking(1.1)
          .foregroundStyle(numa.bg.opacity(0.62))
      }
      Spacer()
      Text(amount)
        .font(NumaType.mono(12, .semibold))
        .foregroundStyle(amount.hasPrefix("+") ? numa.ctaInk : numa.bg)
    }
    .padding(.horizontal, 10)
    .frame(height: 34)
    .background(numa.bg.opacity(0.08))
    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
  }
}

private struct AuthModeToggle: View {
  @Environment(\.numa) private var numa
  @Binding var signUpMode: Bool

  var body: some View {
    HStack(spacing: 2) {
      AuthToggleButton(title: "Sign in", selected: !signUpMode) {
        signUpMode = false
      }
      AuthToggleButton(title: "Create", selected: signUpMode) {
        signUpMode = true
      }
    }
    .padding(3)
    .background(numa.brandMist)
    .clipShape(Capsule())
  }
}

private struct AuthToggleButton: View {
  @Environment(\.numa) private var numa
  let title: String
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.caption.weight(.bold))
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(selected ? numa.paper : Color.clear)
        .foregroundStyle(selected ? numa.ink : numa.ink3)
        .clipShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

private struct NumaDividerLabel: View {
  @Environment(\.numa) private var numa
  let label: String

  init(_ label: String) {
    self.label = label
  }

  var body: some View {
    HStack(spacing: 10) {
      Rectangle().fill(numa.line).frame(height: 1)
      Text(label)
        .font(.caption.weight(.bold))
        .foregroundStyle(numa.ink3)
      Rectangle().fill(numa.line).frame(height: 1)
    }
  }
}

private struct NumaAuthTextField: View {
  @Environment(\.numa) private var numa
  let title: String
  @Binding var text: String
  let placeholder: String
  var keyboard: UIKeyboardType = .default
  var textContentType: UITextContentType?
  var capitalization: TextInputAutocapitalization = .never

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(NumaType.mono(10, .bold))
        .tracking(1.6)
        .foregroundStyle(numa.ink3)
      TextField(placeholder, text: $text)
        .textInputAutocapitalization(capitalization)
        .autocorrectionDisabled()
        .keyboardType(keyboard)
        .textContentType(textContentType)
        .submitLabel(.next)
        .accessibilityLabel(title)
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(numa.bg)
        .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(numa.line))
    }
  }
}

private struct NumaAuthPasswordField: View {
  @Environment(\.numa) private var numa
  let title: String
  @Binding var text: String
  @Binding var reveal: Bool
  var textContentType: UITextContentType = .password

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(NumaType.mono(10, .bold))
        .tracking(1.6)
        .foregroundStyle(numa.ink3)
      HStack(spacing: 8) {
        Group {
          if reveal {
            TextField("Password", text: $text)
              .textContentType(textContentType)
          } else {
            SecureField("Password", text: $text)
              .textContentType(textContentType)
          }
        }
        .submitLabel(.go)
        .autocorrectionDisabled()

        Button {
          reveal.toggle()
        } label: {
          Image(systemName: reveal ? "eye.slash" : "eye")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(numa.ink3)
            .frame(width: 34, height: 34)
        }
        .accessibilityLabel(reveal ? "Hide password" : "Show password")
      }
      .padding(.leading, 14)
      .padding(.trailing, 8)
      .frame(height: 52)
      .background(numa.bg)
      .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(numa.line))
    }
  }
}

private struct PasswordPolicyChips: View {
  @Environment(\.numa) private var numa
  let password: String
  let email: String
  let displayName: String

  private var checks: [(String, Bool)] {
    let policy = NumaPasswordPolicy.validate(password, email: email, displayName: displayName)
    return [
      ("10+ chars", !policy.issues.contains(.minLength)),
      ("mix 3 types", !policy.issues.contains(.characterMix)),
      (
        "hard to guess",
        !policy.issues.contains(.commonPassword)
          && !policy.issues.contains(.repeatedCharacters)
          && !policy.issues.contains(.sequentialCharacters)
      ),
      ("not personal", !policy.issues.contains(.personalInfo))
    ]
  }

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: 6)], alignment: .leading, spacing: 6) {
      ForEach(checks, id: \.0) { title, passed in
        Label(title, systemImage: passed ? "checkmark.circle.fill" : "circle")
          .font(.caption2.weight(.bold))
          .lineLimit(1)
          .padding(.horizontal, 8)
          .frame(height: 28)
          .background(passed ? numa.brandSoft : numa.bg)
          .foregroundStyle(passed ? numa.ink : numa.ink3)
          .clipShape(Capsule())
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct AuthErrorBanner: View {
  @Environment(\.numa) private var numa
  let message: String

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: "exclamationmark.circle.fill")
        .font(.caption.weight(.bold))
      Text(message)
        .font(.footnote.weight(.semibold))
        .fixedSize(horizontal: false, vertical: true)
    }
    .foregroundStyle(numa.negative)
    .padding(11)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(numa.negative.opacity(0.10))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

private struct WelcomeTrustStrip: View {
  @Environment(\.numa) private var numa

  var body: some View {
    HStack(spacing: 8) {
      WelcomeTrustItem(title: "Cloud sync", systemImage: "cloud")
      WelcomeTrustItem(title: "Private", systemImage: "lock")
      WelcomeTrustItem(title: "No jargon", systemImage: "text.bubble")
    }
    .foregroundStyle(numa.ink3)
  }
}

private struct WelcomeTrustItem: View {
  @Environment(\.numa) private var numa
  let title: String
  let systemImage: String

  var body: some View {
    Label(title, systemImage: systemImage)
      .font(.caption.weight(.bold))
      .lineLimit(1)
      .minimumScaleFactor(0.78)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 10)
      .background(numa.brandMist)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}
