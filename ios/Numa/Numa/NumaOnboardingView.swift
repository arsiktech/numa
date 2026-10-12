import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct OnboardingNativeView: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var step = 0
  @State private var pickedTheme: NumaThemeKey = .citrus
  @State private var pickedJob: NumaPrimaryJob = .netWorth
  @State private var launched = false
  @State private var completionError: String?

  var body: some View {
    VStack(spacing: 0) {
      OnboardingProgressHeader(step: step, total: 3) {
        guard step > 0 else { return }
        NumaMotion.run(reduceMotion: reduceMotion) { step -= 1 }
      }
      .padding(.horizontal, 20)
      .padding(.top, 16)

      ScrollView(.vertical) {
        VStack(alignment: .leading, spacing: 18) {
          stepContent
            .id(step)
            .transition(NumaMotion.contextTransition(reduceMotion: reduceMotion))
          if let completionError {
            Text(completionError)
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(numa.negative)
              .accessibilityLabel("Setup error: \(completionError)")
          }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 110)
        .frame(maxWidth: 540)
        .frame(maxWidth: .infinity)
      }
      .scrollDismissesKeyboard(.interactively)
    }
    .safeAreaInset(edge: .bottom) {
      OnboardingFooter(
        backVisible: step > 0,
        primaryTitle: primaryButtonTitle,
        saving: appStore.saving,
        back: { NumaMotion.run(reduceMotion: reduceMotion) { step -= 1 } },
        next: advance
      )
    }
    .background(numa.bg.ignoresSafeArea())
    .task(id: step) {
      guard step == 2 else { return }
      let delay: UInt64 = UIAccessibility.isReduceMotionEnabled ? 250_000_000 : 1_800_000_000
      try? await Task.sleep(nanoseconds: delay)
      if Task.isCancelled { return }
      await finishOnboarding()
    }
    .onAppear {
      if let profile = appStore.profile {
        pickedTheme = profile.themeKey
        pickedJob = profile.primaryJob ?? profile.appMode.defaultPrimaryJob
      }
    }
  }

  @ViewBuilder
  private var stepContent: some View {
    switch step {
    case 0:
      OnboardingTitleBlock(
        kicker: "STEP 1 OF 3",
        title: "How will you use Numa Pro?",
        highlightedWord: "Numa Pro?",
        subtitle: "Tap a starting point to continue. You can switch later in Settings."
      )
      VStack(spacing: 12) {
        OnboardingJobCard(
          job: .dailySpending,
          selected: pickedJob == .dailySpending,
          badge: "Simple",
          amount: "€214",
          caption: "One weekly number, fast capture, and buckets."
        ) { pickJobAndContinue(.dailySpending) }
        OnboardingJobCard(
          job: .netWorth,
          selected: pickedJob == .netWorth,
          badge: "Advanced",
          amount: "€50k",
          caption: "Capital, goals, MRR, holdings, and Numa Pro AI."
        ) { pickJobAndContinue(.netWorth) }
        OnboardingJobCard(
          job: .sharedMoney,
          selected: pickedJob == .sharedMoney,
          badge: "Shared",
          amount: "€82",
          caption: "Splits, cards, people, and fewest-transfer settlements."
        ) { pickJobAndContinue(.sharedMoney) }
      }
    case 1:
      OnboardingTitleBlock(
        kicker: "STEP 2 OF 3",
        title: "Pick the feel.",
        highlightedWord: "feel.",
        subtitle: "Citrus is the default. Choose the palette you want to see first."
      )
      LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
        ForEach(NumaThemeKey.allCases) { key in
          ThemeChoiceCard(key: key, selected: pickedTheme == key) {
            pickedTheme = key
          }
        }
      }
      OnboardingThemePreview(theme: pickedTheme, job: pickedJob)
    default:
      OnboardingTitleBlock(
        kicker: "ALL SET",
        title: "You're ready.",
        highlightedWord: "ready.",
        subtitle: "Numa Pro will open in the shape you chose."
      )
      OnboardingReadyCard(theme: pickedTheme, job: pickedJob)
    }
  }

  private var primaryButtonTitle: String {
    if appStore.saving || launched { return "Opening..." }
    if step == 0 { return "Continue with current choice" }
    if step == 1 { return "Continue with \(pickedTheme.label)" }
    return "Open Numa Pro"
  }

  private func pickJobAndContinue(_ job: NumaPrimaryJob) {
    Haptic.tap()
    pickedJob = job
    NumaMotion.run(reduceMotion: reduceMotion) { step = 1 }
  }

  private func advance() {
    Haptic.tap()
    if step < 2 {
      NumaMotion.run(reduceMotion: reduceMotion) { step += 1 }
    } else {
      Task { await finishOnboarding() }
    }
  }

  private func finishOnboarding() async {
    guard !launched else { return }
    launched = true
    completionError = nil
    let completed = await appStore.completeOnboarding(
      themeKey: pickedTheme,
      primaryJob: pickedJob,
      starterTemplate: pickedJob.template
    )
    if !completed {
      launched = false
      completionError = appStore.toast ?? "Numa Pro couldn't finish setup. Try again."
    }
  }
}

private struct OnboardingProgressHeader: View {
  @Environment(\.numa) private var numa
  let step: Int
  let total: Int
  let back: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Button(action: back) {
        Image(systemName: "chevron.left")
          .font(.system(size: 14, weight: .bold))
          .frame(width: 36, height: 36)
          .background(numa.paper)
          .foregroundStyle(step == 0 ? numa.ink3.opacity(0.35) : numa.ink)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(numa.line))
      }
      .disabled(step == 0)
      HStack(spacing: 7) {
        ForEach(0..<total, id: \.self) { index in
          Capsule()
            .fill(index <= step ? numa.brand : numa.line)
            .frame(height: 5)
        }
      }
    }
  }
}

private struct OnboardingTitleBlock: View {
  @Environment(\.numa) private var numa
  let kicker: String
  let title: String
  let highlightedWord: String
  let subtitle: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(kicker)
        .font(NumaType.mono(10, .bold))
        .tracking(2)
        .foregroundStyle(numa.ink3)
      HighlightedTitle(text: title, highlightedWord: highlightedWord)
      Text(subtitle)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(numa.ink3)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct HighlightedTitle: View {
  @Environment(\.numa) private var numa
  let text: String
  let highlightedWord: String

  var body: some View {
    if let range = text.range(of: highlightedWord) {
      let first = String(text[..<range.lowerBound])
      let highlight = String(text[range])
      let tail = String(text[range.upperBound...])
      VStack(alignment: .leading, spacing: 2) {
        if !first.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Text(first.trimmingCharacters(in: .whitespacesAndNewlines))
            .font(NumaType.display(34, .bold))
            .foregroundStyle(numa.ink)
            .fixedSize(horizontal: false, vertical: true)
        }
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          Text(highlight)
            .font(NumaType.display(34, .bold))
            .foregroundStyle(numa.ink)
            .padding(.horizontal, 4)
            .background(numa.ctaInk)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
          if !tail.isEmpty {
            Text(tail)
              .font(NumaType.display(34, .bold))
              .foregroundStyle(numa.ink)
          }
        }
      }
    } else {
      Text(text)
        .font(NumaType.display(34, .bold))
        .foregroundStyle(numa.ink)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct OnboardingJobCard: View {
  @Environment(\.numa) private var numa
  let job: NumaPrimaryJob
  let selected: Bool
  let badge: String
  let amount: String
  let caption: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 14) {
        VStack(spacing: 5) {
          Text(amount)
            .font(NumaType.mono(17, .bold))
            .minimumScaleFactor(0.68)
            .lineLimit(1)
          Text(badge.uppercased())
            .font(NumaType.mono(8, .bold))
            .tracking(1)
        }
        .frame(width: 68, height: 68)
        .background(selected ? numa.brand : numa.brandMist)
        .foregroundStyle(selected ? numa.ctaInk : numa.ink)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

        VStack(alignment: .leading, spacing: 5) {
          Text(job.title)
            .font(.headline)
            .foregroundStyle(numa.ink)
          Text(caption)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(numa.ink3)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer()
        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
          .font(.title3.weight(.bold))
          .foregroundStyle(selected ? numa.brand : numa.ink3.opacity(0.45))
      }
      .padding(14)
      .background(selected ? numa.brandSoft : numa.paper)
      .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(selected ? numa.brand : numa.line, lineWidth: selected ? 2 : 1))
    }
    .buttonStyle(.plain)
  }
}

private struct OnboardingThemePreview: View {
  @Environment(\.colorScheme) private var colorScheme
  let theme: NumaThemeKey
  let job: NumaPrimaryJob

  private var palette: NumaPalette {
    NumaPalette.palette(theme, scheme: colorScheme, appearance: .auto)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Preview")
        .font(NumaType.mono(10, .bold))
        .tracking(1.8)
        .foregroundStyle(palette.ink3)
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 5) {
          Text(job.appMode.label.uppercased())
            .font(NumaType.mono(9, .bold))
            .tracking(1.5)
            .foregroundStyle(palette.ink3)
          Text(job == .netWorth ? "€50k" : job == .sharedMoney ? "€82" : "€214")
            .font(NumaType.mono(30, .semibold))
            .foregroundStyle(palette.ctaInk)
        }
        Spacer()
        SparkleMark(size: 38)
          .environment(\.numa, palette)
      }
      .padding(16)
      .background(palette.brand)
      .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
    .padding(14)
    .background(palette.paper)
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(palette.line))
  }
}

private struct OnboardingReadyCard: View {
  @Environment(\.numa) private var numa
  let theme: NumaThemeKey
  let job: NumaPrimaryJob

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Image(systemName: "checkmark")
          .font(.system(size: 34, weight: .bold))
          .foregroundStyle(numa.ctaInk)
          .frame(width: 82, height: 82)
          .background(numa.brand)
          .clipShape(Circle())
        Spacer()
      }
      VStack(spacing: 10) {
        OnboardingSummaryRow(title: "Mode", value: job.appMode.label, systemImage: "rectangle.grid.2x2")
        OnboardingSummaryRow(title: "First screen", value: job.title, systemImage: "scope")
        OnboardingSummaryRow(title: "Style", value: theme.label, systemImage: "paintpalette")
        OnboardingSummaryRow(title: "Starter", value: job.template.title, systemImage: "sparkles")
      }
    }
    .padding(16)
    .background(numa.paper)
    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(numa.line))
  }
}

private struct OnboardingSummaryRow: View {
  @Environment(\.numa) private var numa
  let title: String
  let value: String
  let systemImage: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(numa.ink)
        .frame(width: 34, height: 34)
        .background(numa.brandMist)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(numa.ink3)
      Spacer()
      Text(value)
        .font(.subheadline.weight(.bold))
        .foregroundStyle(numa.ink)
        .lineLimit(1)
        .minimumScaleFactor(0.72)
    }
  }
}

private struct OnboardingFooter: View {
  @Environment(\.numa) private var numa
  let backVisible: Bool
  let primaryTitle: String
  let saving: Bool
  let back: () -> Void
  let next: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      if backVisible {
        Button("Back", action: back)
          .buttonStyle(NumaSecondaryButtonStyle())
      }
      NumaPrimaryButton(title: primaryTitle, systemImage: saving ? "hourglass" : "arrow.right", action: next)
        .disabled(saving)
        .opacity(saving ? 0.72 : 1)
    }
    .padding(.horizontal, 20)
    .padding(.top, 12)
    .padding(.bottom, 12)
    .background(.ultraThinMaterial)
    .overlay(alignment: .top) {
      Rectangle().fill(numa.line).frame(height: 1)
    }
  }
}
