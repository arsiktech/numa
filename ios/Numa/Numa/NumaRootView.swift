import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct NumaParityRootView: View {
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var appStore
  @Environment(PodStore.self) private var podStore
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = NumaPalette.palette(appStore.themeKey, scheme: colorScheme, appearance: appStore.appearance)
    Group {
      switch session.status {
      case .checking:
        NumaLaunchView()
      case .signedOut:
        WelcomeNativeView()
      case .signedIn:
        signedInContent
      case .failed(let message):
        NumaErrorView(title: "Could not start Numa Pro", message: message) {
          Task { await session.restore() }
        }
      }
    }
    .environment(\.numa, palette)
    .tint(palette.brand)
    .background(palette.bg.ignoresSafeArea())
    .task {
      if case .checking = session.status {
        await session.restore()
      }
    }
    .onChange(of: session.status) { _, status in
      if case .signedIn = status {
        return
      } else {
        appStore.reset()
        podStore.reset()
      }
    }
  }

  @ViewBuilder
  private var signedInContent: some View {
    switch appStore.phase {
    case .idle, .loading:
      NumaLaunchView()
        .task { await appStore.bootstrap() }
    case .onboarding:
      OnboardingNativeView()
    case .ready:
      MainNativeShell()
    case .failed(let message):
      NumaErrorView(title: "Could not load your workspace", message: message) {
        Task { await appStore.bootstrap() }
      }
    }
  }
}

struct NumaLaunchView: View {
  @Environment(\.numa) private var numa

  var body: some View {
    ZStack {
      numa.bg.ignoresSafeArea()
      VStack(spacing: 16) {
        NumaCoinMark(size: 64)
        Text("Numa Pro")
          .font(NumaType.mono(13, .bold))
          .tracking(3)
          .foregroundStyle(numa.ink3)
        ProgressView()
          .tint(numa.brand)
          .padding(.top, 8)
      }
    }
  }
}
