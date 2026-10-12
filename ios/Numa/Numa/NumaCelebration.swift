import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct NumaAchievementPopup: View {
  @Environment(\.numa) private var numa
  let achievement: NumaAchievement
  let dismiss: () -> Void

  var body: some View {
    HStack(spacing: 13) {
      ZStack {
        Circle()
          .fill(numa.brandMist)
          .frame(width: 76, height: 76)
        Image(achievement.kind.assetName)
          .resizable()
          .scaledToFit()
          .frame(width: 92, height: 92)
          .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      }
      .frame(width: 82, height: 82)
      .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 4) {
        Label(achievement.title, systemImage: achievement.kind.symbolName)
          .font(.headline.weight(.bold))
          .lineLimit(1)
          .minimumScaleFactor(0.78)
          .foregroundStyle(numa.ink)
        Text(achievement.message)
          .font(.subheadline.weight(.medium))
          .lineLimit(2)
          .foregroundStyle(numa.ink3)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 4)

      Button(action: dismiss) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(numa.ink3)
          .frame(width: 34, height: 34)
          .background(numa.bg.opacity(0.72))
          .clipShape(Circle())
      }
      .accessibilityLabel("Dismiss")
    }
    .padding(12)
    .frame(maxWidth: 520, alignment: .leading)
    .numaMilestoneSurface(numa, cornerRadius: 30, interactive: true)
    .shadow(color: Color.black.opacity(0.14), radius: 24, x: 0, y: 18)
    .accessibilityElement(children: .combine)
  }
}

struct NumaToastBanner: View {
  @Environment(\.numa) private var numa
  let message: String

  var body: some View {
    HStack(spacing: 9) {
      Image(systemName: "info.circle.fill")
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(numa.brand)
      Text(message)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(numa.ink)
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 13)
    .padding(.vertical, 11)
    .frame(maxWidth: 520, alignment: .leading)
    .numaMilestoneSurface(numa, cornerRadius: 19)
    .shadow(color: Color.black.opacity(0.10), radius: 16, x: 0, y: 10)
  }
}

struct NumaConfettiLayer: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let trigger: UUID
  @State private var falling = false

  private let particles = NumaConfettiParticle.makeSeed()

  var body: some View {
    GeometryReader { proxy in
      if reduceMotion {
        NumaStaticCelebrationGlints()
      } else {
        ZStack {
          ForEach(particles) { particle in
            NumaConfettiPiece(particle: particle)
              .frame(width: particle.size, height: particle.size)
              .position(
                x: proxy.size.width * particle.x,
                y: falling ? proxy.size.height + 80 : -80
              )
              .rotationEffect(.degrees(falling ? particle.rotation + particle.spin : particle.rotation))
              .opacity(falling ? 0 : 1)
              .animation(
                .easeIn(duration: particle.duration).delay(particle.delay),
                value: falling
              )
          }
        }
        .onAppear { start() }
        .onChange(of: trigger) { _, _ in start() }
      }
    }
    .ignoresSafeArea()
  }

  private func start() {
    falling = false
    DispatchQueue.main.async {
      falling = true
    }
  }
}

private struct NumaStaticCelebrationGlints: View {
  @Environment(\.numa) private var numa

  var body: some View {
    ZStack {
      ForEach(0..<9, id: \.self) { index in
        Image(systemName: "sparkle")
          .font(.system(size: index.isMultiple(of: 2) ? 17 : 11, weight: .bold))
          .foregroundStyle(index.isMultiple(of: 3) ? numa.brand : Color(hex: 0xD7A72E))
          .position(
            x: CGFloat((index * 83) % 320) + 28,
            y: CGFloat((index * 47) % 460) + 54
          )
      }
    }
    .opacity(0.9)
  }
}

private struct NumaConfettiPiece: View {
  let particle: NumaConfettiParticle

  var body: some View {
    let color = Color(hex: particle.hex)
    switch particle.shape {
    case .circle:
      Circle().fill(color)
    case .capsule:
      Capsule().fill(color)
    case .rect:
      RoundedRectangle(cornerRadius: 3, style: .continuous).fill(color)
    case .sparkle:
      Image(systemName: "sparkle")
        .font(.system(size: particle.size, weight: .bold))
        .foregroundStyle(color)
    case .arc:
      Circle()
        .trim(from: 0.15, to: 0.62)
        .stroke(color, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
    }
  }
}

private enum NumaConfettiShape: Int {
  case circle
  case capsule
  case rect
  case sparkle
  case arc
}

private struct NumaConfettiParticle: Identifiable {
  let id: Int
  let x: CGFloat
  let size: CGFloat
  let rotation: Double
  let spin: Double
  let delay: Double
  let duration: Double
  let hex: UInt
  let shape: NumaConfettiShape

  static func makeSeed() -> [NumaConfettiParticle] {
    let colors: [UInt] = [0xBFE438, 0x0F0F08, 0xFBFAF3, 0xD7A72E, 0xBFD8C9]
    let shapes: [NumaConfettiShape] = [.circle, .capsule, .rect, .sparkle, .arc]
    var seed: [NumaConfettiParticle] = []
    seed.reserveCapacity(36)
    for index in 0..<36 {
      let particle = NumaConfettiParticle(
        id: index,
        x: CGFloat(((index * 37) % 100)) / 100,
        size: CGFloat(8 + ((index * 11) % 14)),
        rotation: Double((index * 29) % 180),
        spin: Double(220 + ((index * 43) % 420)),
        delay: Double((index * 7) % 18) / 100,
        duration: Double(165 + ((index * 13) % 90)) / 100,
        hex: colors[index % colors.count],
        shape: shapes[index % shapes.count]
      )
      seed.append(particle)
    }
    return seed
  }
}
