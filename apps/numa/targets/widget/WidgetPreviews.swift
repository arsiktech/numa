#if DEBUG
import SwiftUI
import WidgetKit

// Previews are synthetic design fixtures, not evidence of a render or a successful native build.
private struct NumaPreviewFixture: Identifiable {
  let state: NumaSampleState
  let entry: NumaEntry
  var id: String { state.rawValue }
  static let all = NumaSampleState.allCases.map {
    NumaPreviewFixture(state: $0, entry: NumaEntry(date: NumaSamples.date(for: $0), snapshot: NumaSamples.snapshots[$0]))
  }
}

struct NumaNetWorthPreviews: PreviewProvider {
  static var previews: some View {
    Group {
      ForEach(NumaPreviewFixture.all) { fixture in
        NumaWidgetHost(kind: .netWorth, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemSmall))
          .previewDisplayName("Net worth · small · \(fixture.id)")
        NumaWidgetHost(kind: .netWorth, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemMedium))
          .previewDisplayName("Net worth · medium · \(fixture.id)")
        NumaWidgetHost(kind: .netWorth, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemLarge))
          .previewDisplayName("Net worth · large · \(fixture.id)")
      }
    }
  }
}

struct NumaMoneyMapPreviews: PreviewProvider {
  static var previews: some View {
    Group {
      ForEach(NumaPreviewFixture.all) { fixture in
        NumaWidgetHost(kind: .moneyMap, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemMedium))
          .previewDisplayName("Money map · medium · \(fixture.id)")
        NumaWidgetHost(kind: .moneyMap, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemLarge))
          .previewDisplayName("Money map · large · \(fixture.id)")
      }
    }
  }
}

struct NumaSpendingPreviews: PreviewProvider {
  static var previews: some View {
    Group {
      ForEach(NumaPreviewFixture.all) { fixture in
        NumaWidgetHost(kind: .spending, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemMedium))
          .previewDisplayName("Spending · medium · \(fixture.id)")
        NumaWidgetHost(kind: .spending, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemLarge))
          .previewDisplayName("Spending · large · \(fixture.id)")
      }
    }
  }
}

struct NumaBlocksPreviews: PreviewProvider {
  static var previews: some View {
    Group {
      ForEach(NumaPreviewFixture.all) { fixture in
        NumaWidgetHost(kind: .blocks, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemMedium))
          .previewDisplayName("Blocks · medium · \(fixture.id)")
        NumaWidgetHost(kind: .blocks, entry: fixture.entry)
          .previewContext(WidgetPreviewContext(family: .systemLarge))
          .previewDisplayName("Blocks · large · \(fixture.id)")
      }
    }
  }
}

struct NumaAppearancePreviews: PreviewProvider {
  static var previews: some View {
    Group {
      NumaWidgetHost(kind: .blocks, entry: NumaEntry(date: NumaSamples.date, snapshot: NumaSamples.ready))
        .environment(\.colorScheme, .light)
        .previewContext(WidgetPreviewContext(family: .systemLarge))
        .previewDisplayName("Blocks · light")
      NumaWidgetHost(kind: .spending, entry: NumaEntry(date: NumaSamples.date, snapshot: NumaSamples.ready))
        .environment(\.colorScheme, .dark)
        .previewContext(WidgetPreviewContext(family: .systemLarge))
        .previewDisplayName("Spending · dark")
      NumaWidgetHost(kind: .netWorth, entry: NumaEntry(date: NumaSamples.date, snapshot: NumaSamples.ready))
        .environment(\.dynamicTypeSize, .accessibility1)
        .previewContext(WidgetPreviewContext(family: .systemMedium))
        .previewDisplayName("Net worth · larger text")
    }
  }
}

// The very same cached sample is evaluated at different entry dates. These use the real
// widget views and do not replace parent-run XCTest, ImageRenderer, or layout inspection.
struct NumaCachedQuotePreviews: PreviewProvider {
  private static let quote = NumaSamples.ready?.netWorth?.daily?.asOf ?? 1792583880000
  static var previews: some View {
    Group {
      NumaWidgetHost(kind: .netWorth, entry: NumaEntry(date: Date(timeIntervalSince1970: quote / 1000 + 24 * 3600 - 1), snapshot: NumaSamples.ready))
        .previewContext(WidgetPreviewContext(family: .systemMedium))
        .previewDisplayName("Cached quote · before expiry · actual as-of date")
      NumaWidgetHost(kind: .netWorth, entry: NumaEntry(date: Date(timeIntervalSince1970: quote / 1000 + 24 * 3600), snapshot: NumaSamples.ready))
        .previewContext(WidgetPreviewContext(family: .systemLarge))
        .previewDisplayName("Cached quote · exact 24h · unavailable")
      NumaWidgetHost(kind: .netWorth, entry: NumaEntry(date: NumaSamples.date.addingTimeInterval(3 * 24 * 3600), snapshot: NumaSamples.snapshots[.hidden]))
        .previewContext(WidgetPreviewContext(family: .systemMedium))
        .previewDisplayName("Hidden · after cached boundaries")
    }
  }
}
#endif
