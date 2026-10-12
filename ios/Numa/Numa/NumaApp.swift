import Observation
import SwiftUI

@main
struct NumaApp: App {
  @State private var session: NumaSessionStore
  @State private var appStore: NumaAppStore
  @State private var podStore: PodStore

  init() {
    NumaFonts.register()
    Task { _ = await NumaExportTemporaryFiles.shared.cleanStale() }
    let session = NumaSessionStore()
    _session = State(initialValue: session)
    _appStore = State(initialValue: NumaAppStore(session: session))
    _podStore = State(initialValue: PodStore(session: session))
  }

  private var liveContent: some View {
    NumaParityRootView()
      .environment(session)
      .environment(appStore)
      .environment(podStore)
  }

  var body: some Scene {
    WindowGroup {
      #if DEBUG && targetEnvironment(simulator)
      if let mode = ProcessInfo.processInfo.environment["NUMA_TODAY_PREVIEW"] {
        NumaTodayPreview(mode: mode)
      } else {
        liveContent
      }
      #else
      liveContent
      #endif
    }
  }
}
