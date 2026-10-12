import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct NumaPalette {
  let bg: Color
  let paper: Color
  let paperStrong: Color
  let ink: Color
  let ink2: Color
  let ink3: Color
  let line: Color
  let brand: Color
  let brandSoft: Color
  let brandMist: Color
  let ctaInk: Color
  let positive: Color
  let negative: Color

  static func palette(_ key: NumaThemeKey, scheme: ColorScheme, appearance: NumaAppearance) -> NumaPalette {
    let dark = appearance == .dark || (appearance == .auto && scheme == .dark)
    switch (key, dark) {
    case (.citrus, false):
      return NumaPalette(
        bg: Color(hex: 0xFBFAF3), paper: .white, paperStrong: .white,
        ink: Color(hex: 0x0F0F08), ink2: Color(hex: 0x2F2F25), ink3: Color(hex: 0x6D6D60),
        line: Color.black.opacity(0.08), brand: Color(hex: 0x0F0F08),
        brandSoft: Color(hex: 0xF0F8C8), brandMist: Color(hex: 0xF4F9D4),
        ctaInk: Color(hex: 0xBFE438), positive: Color(hex: 0x237451), negative: Color(hex: 0xBD3A37)
      )
    case (.citrus, true):
      return NumaPalette(
        bg: Color(hex: 0x0F0F08), paper: Color(hex: 0x181810), paperStrong: Color(hex: 0x24241A),
        ink: Color(hex: 0xF8F8EE), ink2: Color(hex: 0xD6D6CC), ink3: Color(hex: 0xA4A498),
        line: Color.white.opacity(0.12), brand: Color(hex: 0xD4FA42),
        brandSoft: Color(hex: 0x2D3415), brandMist: Color(hex: 0x1E1E14),
        ctaInk: Color(hex: 0x0F0F08), positive: Color(hex: 0x5FDCAE), negative: Color(hex: 0xFF7A78)
      )
    case (.pebble, false):
      return base(bg: 0xF2EFE6, paper: 0xFBF8EF, ink: 0x1F2520, brand: 0x4F7164, cta: 0xFFFFFF)
    case (.pebble, true):
      return base(bg: 0x15181A, paper: 0x1E2225, ink: 0xEBEDE8, brand: 0x9DC2B0, cta: 0x15181A, dark: true)
    case (.coral, false):
      return base(bg: 0xFBEFE6, paper: 0xFFF8F0, ink: 0x2A1A14, brand: 0xB94A3C, cta: 0xFFFFFF)
    case (.coral, true):
      return base(bg: 0x1A1412, paper: 0x251C19, ink: 0xF6ECE6, brand: 0xF08A78, cta: 0x1A1412, dark: true)
    case (.carbon, false):
      return base(bg: 0xF4F6F3, paper: 0xFFFFFF, ink: 0x111716, brand: 0x007F68, cta: 0xFFFFFF)
    case (.carbon, true):
      return base(bg: 0x080D0C, paper: 0x111716, ink: 0xEAF7F4, brand: 0x00C896, cta: 0x080D0C, dark: true)
    case (.numa, false):
      return base(bg: 0xFBF7F0, paper: 0xFFFFFF, ink: 0x1B1A17, brand: 0x5A3FB8, cta: 0xFFFFFF)
    case (.numa, true):
      return base(bg: 0x14121A, paper: 0x1F1C28, ink: 0xF6F1E8, brand: 0x725ACF, cta: 0xFFFFFF, dark: true)
    }
  }

  private static func base(
    bg: UInt,
    paper: UInt,
    ink: UInt,
    brand: UInt,
    cta: UInt,
    dark: Bool = false
  ) -> NumaPalette {
    NumaPalette(
      bg: Color(hex: bg),
      paper: Color(hex: paper),
      paperStrong: Color(hex: paper).opacity(dark ? 0.96 : 1),
      ink: Color(hex: ink),
      ink2: Color(hex: ink).opacity(0.82),
      ink3: Color(hex: ink).opacity(0.58),
      line: (dark ? Color.white : Color.black).opacity(dark ? 0.12 : 0.08),
      brand: Color(hex: brand),
      brandSoft: Color(hex: brand).opacity(0.22),
      brandMist: Color(hex: brand).opacity(0.12),
      ctaInk: Color(hex: cta),
      positive: Color(hex: dark ? 0x5FDCAE : 0x198047),
      negative: Color(hex: dark ? 0xFF7A78 : 0xBD3A2F)
    )
  }
}

extension Color {
  init(hex: UInt, alpha: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: alpha
    )
  }
}

/// Bundled brand faces (variable TTFs registered at launch — no Info.plist
/// keys needed, the generated plist stays untouched).
enum NumaFonts {
  static func register() {
    for name in ["DMSans", "GeistMono"] {
      guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else { continue }
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
  }
}

/// The Citrus type ramp: DM Sans carries display voice, Geist Mono carries
/// every amount (tabular by design). Small UI text stays on SF — native text
/// ramp under a branded display layer.
enum NumaType {
  static func display(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
    .custom("DM Sans", size: size).weight(weight)
  }

  static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
    .custom("Geist Mono", size: size).weight(weight)
  }
}

/// One tap vocabulary for the whole app — light for navigation, rigid for
/// capture actions, success for money writes.
@MainActor
enum Haptic {
  static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
  static func rigid() { UIImpactFeedbackGenerator(style: .rigid).impactOccurred() }
  static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

/// One motion vocabulary for native Numa. Motion should explain context,
/// drill, or continuity changes and collapse to direct state changes when the
/// user asks iOS to reduce motion.
@MainActor
enum NumaMotion {
  static let context = Animation.snappy(duration: 0.22)
  static let quick = Animation.snappy(duration: 0.18)
  static let settle = Animation.snappy(duration: 0.28)

  static func run(
    reduceMotion: Bool,
    _ animation: Animation = context,
    updates: () -> Void
  ) {
    if reduceMotion {
      updates()
    } else {
      withAnimation(animation, updates)
    }
  }

  static func contextTransition(reduceMotion: Bool) -> AnyTransition {
    reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.985))
  }

  static func topTransition(reduceMotion: Bool) -> AnyTransition {
    reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity)
  }

  static func bottomTransition(reduceMotion: Bool) -> AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
  }

  static func sheetHandoffDelay(reduceMotion: Bool) -> UInt64 {
    reduceMotion ? 60_000_000 : 180_000_000
  }
}

private struct NumaPaletteKey: EnvironmentKey {
  static let defaultValue = NumaPalette.palette(.citrus, scheme: .light, appearance: .auto)
}

extension EnvironmentValues {
  var numa: NumaPalette {
    get { self[NumaPaletteKey.self] }
    set { self[NumaPaletteKey.self] = newValue }
  }
}
