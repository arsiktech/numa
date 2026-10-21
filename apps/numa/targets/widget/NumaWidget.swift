import SwiftUI
import WidgetKit

struct NumaProvider: TimelineProvider {
  func placeholder(in context: Context) -> NumaEntry { NumaEntry(date: NumaSamples.date, snapshot: NumaSamples.ready) }

  func getSnapshot(in context: Context, completion: @escaping (NumaEntry) -> Void) {
    let stored = load()
    // Gallery examples are synthetic, but an existing Hide amounts preference takes priority.
    let snapshot = context.isPreview && stored?.hidden != true ? NumaSamples.ready : stored
    completion(NumaEntry(date: context.isPreview ? NumaSamples.date : .now, snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NumaEntry>) -> Void) {
    let now = Date.now
    let snapshot = load()
    let entries = numaTimelineDates(snapshot: snapshot, now: now).map { NumaEntry(date: $0, snapshot: snapshot) }
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
  }

  private func load() -> NumaSnapshot? {
    guard let text = UserDefaults(suiteName: "group.com.arsiktech.numa")?.string(forKey: "numa.widget"),
          let data = text.data(using: .utf8) else { return nil }
    return NumaSnapshot.decode(data)
  }
}

// The original stable kind survives so an already installed widget is repaired in place.
struct NumaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NumaWidget", provider: NumaProvider()) { NumaWidgetHost(kind: .netWorth, entry: $0) }
      .configurationDisplayName("Net worth")
      .description("Net worth, quote change and honest dated history. Respects Hide amounts.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct NumaMoneyMapWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NumaMoneyMapWidget", provider: NumaProvider()) { NumaWidgetHost(kind: .moneyMap, entry: $0) }
      .configurationDisplayName("Money map")
      .description("Owed to you and what you owe, shown on the same scale.")
      .supportedFamilies([.systemMedium, .systemLarge])
  }
}

struct NumaSpendingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NumaSpendingWidget", provider: NumaProvider()) { NumaWidgetHost(kind: .spending, entry: $0) }
      .configurationDisplayName("Spending by date")
      .description("This month’s spending on your local calendar. Respects Hide amounts.")
      .supportedFamilies([.systemMedium, .systemLarge])
  }
}

struct NumaBlocksWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NumaBlocksWidget", provider: NumaProvider()) { NumaWidgetHost(kind: .blocks, entry: $0) }
      .configurationDisplayName("Own / owe blocks")
      .description("What you own by category, what you owe, and net worth.")
      .supportedFamilies([.systemMedium, .systemLarge])
  }
}

@main
struct NumaWidgetBundle: WidgetBundle {
  var body: some Widget {
    NumaWidget()
    NumaMoneyMapWidget()
    NumaSpendingWidget()
    NumaBlocksWidget()
  }
}
