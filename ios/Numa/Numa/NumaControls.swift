import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct SettingsPickerCard<Content: View>: View {
  @Environment(\.numa) private var numa
  let title: String
  let subtitle: String
  @ViewBuilder var content: () -> Content

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text(title)
          .font(.headline)
        Text(subtitle)
          .font(.caption)
          .foregroundStyle(numa.ink3)
        FlowLayout(spacing: 8) {
          content()
        }
      }
    }
  }
}

struct FlowLayout<Content: View>: View {
  let spacing: CGFloat
  @ViewBuilder var content: () -> Content

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: spacing)], spacing: spacing) {
      content()
    }
  }
}

struct ChoicePill: View {
  @Environment(\.numa) private var numa
  let title: String
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(selected ? numa.brand : numa.brandMist)
        .foregroundStyle(selected ? numa.ctaInk : numa.ink)
        .clipShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

struct ThemeChoiceCard: View {
  @Environment(\.numa) private var numa
  let key: NumaThemeKey
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 14) {
        Text(key.label)
          .font(.headline)
        RoundedRectangle(cornerRadius: 18)
          .fill(NumaPalette.palette(key, scheme: .light, appearance: .light).brand)
          .frame(height: 76)
          .overlay(alignment: .bottomLeading) {
            Text("$214")
              .font(NumaType.display(22, .bold))
              .padding(14)
              .foregroundStyle(NumaPalette.palette(key, scheme: .light, appearance: .light).ctaInk)
          }
        if selected {
          Label("Selected", systemImage: "checkmark.circle.fill")
            .font(.caption.bold())
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(numa.paper)
      .clipShape(RoundedRectangle(cornerRadius: 22))
      .overlay(RoundedRectangle(cornerRadius: 22).stroke(selected ? numa.brand : numa.line, lineWidth: selected ? 2 : 1))
      .foregroundStyle(numa.ink)
    }
    .buttonStyle(.plain)
  }
}

struct DockButton: View {
  @Environment(\.numa) private var numa
  let systemImage: String
  let label: String
  var accent = false
  let action: () -> Void

  var body: some View {
    Button {
      Haptic.tap()
      action()
    } label: {
      Image(systemName: systemImage)
        .font(.system(size: 17, weight: .bold))
        .foregroundStyle(accent ? numa.ctaInk : numa.ink)
        .frame(width: 44, height: 44)
        .background(accent ? numa.brand : Color.clear)
        .clipShape(Circle())
    }
    .accessibilityLabel(label)
  }
}

struct SparkleMark: View {
  @Environment(\.numa) private var numa
  let size: CGFloat

  var body: some View {
    Image(systemName: "sparkles")
      .font(.system(size: size * 0.48, weight: .bold))
      .foregroundStyle(numa.ctaInk)
      .frame(width: size, height: size)
      .background(numa.brand)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
  }
}

extension View {
  @ViewBuilder
  func numaMilestoneSurface(_ numa: NumaPalette, cornerRadius: CGFloat, interactive: Bool = false) -> some View {
    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    if #available(iOS 26.0, *) {
      self
        .background(numa.paper.opacity(0.42), in: shape)
        .glassEffect(
          interactive ? .regular.tint(numa.paper.opacity(0.28)).interactive() : .regular.tint(numa.paper.opacity(0.24)),
          in: .rect(cornerRadius: cornerRadius)
        )
        .overlay(shape.stroke(numa.line))
    } else {
      self
        .background(.ultraThinMaterial, in: shape)
        .background(numa.paper.opacity(0.78), in: shape)
        .overlay(shape.stroke(numa.line))
    }
  }
}

struct NumaTextField: View {
  @Environment(\.numa) private var numa
  let title: String
  @Binding var text: String
  let placeholder: String
  var keyboard: UIKeyboardType = .default

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(NumaType.mono(10, .bold))
        .tracking(1.6)
        .foregroundStyle(numa.ink3)
      TextField(placeholder, text: $text)
        .textInputAutocapitalization(.never)
        .keyboardType(keyboard)
        .accessibilityLabel(title)
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(numa.paper)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(numa.line))
    }
  }
}

struct NumaPrimaryButton: View {
  @Environment(\.numa) private var numa
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: systemImage)
        .font(.headline)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(numa.brand)
        .foregroundStyle(numa.ctaInk)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
  }
}

struct NumaSecondaryButtonStyle: ButtonStyle {
  @Environment(\.numa) private var numa

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.headline)
      .padding(.vertical, 13)
      .padding(.horizontal, 14)
      .background(numa.paper)
      .foregroundStyle(numa.ink)
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(numa.line))
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
  }
}

struct NumaDarkButtonStyle: ButtonStyle {
  @Environment(\.numa) private var numa

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.headline)
      .padding(.vertical, 15)
      .padding(.horizontal, 14)
      .background(numa.ink)
      .foregroundStyle(numa.bg)
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
  }
}

struct EmptyStateCard: View {
  @Environment(\.numa) private var numa
  let title: String
  let message: String

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 10) {
        Text(title)
          .font(.headline)
        Text(message)
          .foregroundStyle(numa.ink3)
      }
    }
  }
}

struct NumaErrorView: View {
  @Environment(\.numa) private var numa
  let title: String
  let message: String
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Text(title)
        .font(.title.bold())
      Text(message)
        .foregroundStyle(numa.ink3)
        .multilineTextAlignment(.center)
      NumaPrimaryButton(title: "Retry", systemImage: "arrow.clockwise", action: retry)
    }
    .padding(24)
    .background(numa.bg.ignoresSafeArea())
  }
}
