import SwiftUI
import WidgetKit

/// What the app last wrote for the widget. Strings arrive formatted, so the widget matches the app.
struct NumaSnapshot: Decodable {
  let net: String
  let today: String
  let up: Bool
  let line: [Double]
  let updatedAt: Double
}

struct NumaEntry: TimelineEntry {
  let date: Date
  let snapshot: NumaSnapshot?
}

struct NumaProvider: TimelineProvider {
  static let sample = NumaSnapshot(net: "€42,035", today: "+€120 today", up: true, line: [0.1, 0.3, 0.25, 0.5, 0.45, 0.7, 1], updatedAt: 0)

  func placeholder(in context: Context) -> NumaEntry { NumaEntry(date: .now, snapshot: Self.sample) }

  func getSnapshot(in context: Context, completion: @escaping (NumaEntry) -> Void) {
    completion(NumaEntry(date: .now, snapshot: context.isPreview ? Self.sample : load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NumaEntry>) -> Void) {
    // The app reloads the widget whenever its numbers change; this is only a fallback.
    completion(Timeline(entries: [NumaEntry(date: .now, snapshot: load())], policy: .after(.now.addingTimeInterval(30 * 60))))
  }

  private func load() -> NumaSnapshot? {
    guard let text = UserDefaults(suiteName: "group.com.arsiktech.numa")?.string(forKey: "numa.widget"),
          let data = text.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(NumaSnapshot.self, from: data)
  }
}

struct Sparkline: Shape {
  let values: [Double]
  func path(in rect: CGRect) -> Path {
    var path = Path()
    guard values.count > 1 else { return path }
    for (i, v) in values.enumerated() {
      let point = CGPoint(x: rect.minX + rect.width * CGFloat(i) / CGFloat(values.count - 1), y: rect.maxY - rect.height * CGFloat(v))
      if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
    }
    return path
  }
}

struct NumaWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: NumaEntry

  var body: some View {
    Group {
      if let s = entry.snapshot {
        HStack(alignment: .bottom, spacing: 12) {
          VStack(alignment: .leading, spacing: 4) {
            Text("NET WORTH").font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(Color("ink2"))
            Spacer(minLength: 0)
            Text(s.net).font(.system(size: 26, weight: .semibold, design: .monospaced)).foregroundStyle(Color("ink"))
              .minimumScaleFactor(0.5).lineLimit(1)
            if !s.today.isEmpty {
              Text(s.today).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(s.up ? "up" : "down")).lineLimit(1).minimumScaleFactor(0.7)
            }
          }
          if family == .systemMedium && s.line.count > 1 {
            Sparkline(values: s.line)
              .stroke(Color(s.up ? "up" : "down"), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
              .padding(.vertical, 8)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(s.net == "••••" ? "Net worth hidden" : "Net worth \(s.net). \(s.today)")
      } else {
        VStack(alignment: .leading, spacing: 6) {
          Text("numa").font(.system(size: 20, weight: .bold)).foregroundStyle(Color("ink"))
          Spacer(minLength: 0)
          Text("Open Numa to see your net worth here.").font(.system(size: 13)).foregroundStyle(Color("ink2"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      }
    }
    .containerBackground(Color("bg"), for: .widget)
    .widgetURL(URL(string: "numanext://"))
  }
}

@main
struct NumaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NumaWidget", provider: NumaProvider()) { entry in
      NumaWidgetView(entry: entry)
    }
    .configurationDisplayName("Net worth")
    .description("Your net worth and today’s change. Shows dots when Hide amounts is on.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
