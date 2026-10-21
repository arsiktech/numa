import SwiftUI
import WidgetKit

struct NumaAmountView: View {
  let amount: NumaAmount
  var prominent = false
  var compactStyle = false
  var body: some View {
    ViewThatFits(in: .horizontal) {
      Text(amount.text).font(compactStyle ? .headline : prominent ? .largeTitle : .title2)
      Text(amount.compact).font(prominent ? .title : .headline)
      Text(amount.compact).font(.headline)
    }
    .fontWeight(.semibold).monospacedDigit().lineLimit(1)
    .foregroundStyle(Color("ink")).accessibilityLabel(amount.exact)
    .privacySensitive()
  }
}

struct NumaTitle: View {
  let text: String
  var compact = false
  var body: some View { Text(text).font(compact ? .caption2 : .caption).fontWeight(.semibold).foregroundStyle(Color("ink2")) }
}

struct NumaStateView: View {
  let title: String
  let message: String
  var hidden = false
  @Environment(\.dynamicTypeSize) private var typeSize
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      NumaTitle(text: title)
      Spacer(minLength: 0)
      if hidden && !typeSize.isAccessibilitySize { Text("••••").font(.largeTitle).fontWeight(.semibold).privacySensitive() }
      Text(message).font(.callout).foregroundStyle(Color("ink2")).fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

struct NumaFreshnessView: View {
  let syncedAt: Double?
  let source: NumaFreshness?
  let now: Date
  var detailed = false
  var compact = false

  private func stamp(_ milliseconds: Double) -> String {
    let date = Date(timeIntervalSince1970: milliseconds / 1000)
    return Calendar.current.isDate(date, inSameDayAs: now)
      ? date.formatted(.dateTime.hour().minute())
      : date.formatted(.dateTime.day().month(.abbreviated).hour().minute())
  }
  var label: String {
    guard let sync = numaTime(syncedAt) else { return "App sync unknown · open Numa Pro" }
    let old = now.timeIntervalSince1970 * 1000 - sync >= 6 * 3_600_000 || sync > now.timeIntervalSince1970 * 1000 + 60_000
    if compact {
      let date = Date(timeIntervalSince1970: sync / 1000)
      let time = Calendar.current.isDate(date, inSameDayAs: now) ? date.formatted(.dateTime.hour().minute()) : date.formatted(.dateTime.day().month(.abbreviated))
      return "\(old ? "Stale · " : source?.needsRefresh(at: now) == true ? "Values need refresh · " : "")app sync \(time)"
    }
    var parts = ["\(old ? "Stale · app sync" : "App sync") \(stamp(sync))"]
    let quoteStatus = source?.quoteStatus(at: now)
    if quoteStatus == "partial" { parts.append("quote coverage incomplete") }
    else if let quote = numaTime(source?.quotesAsOf) {
      parts.append("\(quoteStatus == "stale" ? "stale quotes" : "quotes") \(stamp(quote))")
    } else if quoteStatus == "none" { parts.append("no market quotes") }
    if source?.conversionIsStale(at: now) == true { parts.append("exchange rate needs refresh") }
    if source?.needsRefresh(at: now) == true { parts.append("values need refresh") }
    if detailed, let valueTime = numaTime(source?.sourceAsOf) { parts.append("oldest value \(stamp(valueTime))") }
    if detailed, let fx = source?.fxAsOf { parts.append("FX \(fx)") }
    return parts.joined(separator: " · ")
  }
  var body: some View {
    Text(label).font(.caption2).foregroundStyle(Color("ink2"))
      .fixedSize(horizontal: false, vertical: true).accessibilityLabel(label)
  }
}

/// Foreground labels carry meaning in accented rendering too; colors are supplementary.
struct NumaCategorySwatch: View {
  let category: NumaCategory
  @Environment(\.widgetRenderingMode) private var renderingMode
  private var color: Color {
    if #available(iOS 18.0, *), renderingMode == .accented { return Color.primary }
    return Color(category.colorName)
  }
  var body: some View {
    Text(category.code).font(.caption2).fontWeight(.bold)
      .foregroundStyle(Color("ink"))
      .frame(width: 13, height: 13)
      .background(color.opacity(0.25), in: Rectangle())
      .overlay(Rectangle().stroke(color, lineWidth: 1))
      .accessibilityHidden(true)
  }
}

struct NumaWidgetContent: View {
  let kind: NumaWidgetKind
  let entry: NumaEntry
  @Environment(\.redactionReasons) private var redactionReasons
  @Environment(\.dynamicTypeSize) private var typeSize
  let family: WidgetFamily
  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.hidden || redactionReasons.contains(.privacy) {
          NumaStateView(title: kind.title, message: "Amounts hidden", hidden: true)
        } else if typeSize.isAccessibilitySize && family != .systemLarge {
          // A fixed widget cannot fit six category rows or a calendar at accessibility sizes.
          // Omit the entire infographic explicitly; never keep a chart with missing legend rows.
          NumaStateView(title: kind.title, message: "Open Numa Pro for details")
        } else {
          switch kind {
          case .netWorth: NumaNetWorthView(data: snapshot.netWorth, legacyNet: snapshot.net, syncedAt: snapshot.syncedAt, source: snapshot.freshness, now: entry.date, family: family)
          case .moneyMap: NumaMoneyMapView(data: snapshot.moneyMap, syncedAt: snapshot.syncedAt, source: snapshot.freshness, now: entry.date, family: family)
          case .spending: NumaSpendingView(data: snapshot.spending, syncedAt: snapshot.syncedAt, source: snapshot.freshness, now: entry.date, family: family)
          case .blocks: NumaBlocksView(data: snapshot.blocks, syncedAt: snapshot.syncedAt, source: snapshot.freshness, now: entry.date, family: family)
          }
        }
      } else {
        NumaStateView(title: kind.title, message: "Open Numa Pro to update this widget")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .foregroundStyle(Color("ink"))
    .widgetAccentable(false)
    .privacySensitive()
  }
}

struct NumaWidgetHost: View {
  let kind: NumaWidgetKind
  let entry: NumaEntry
  @Environment(\.widgetFamily) private var family
  var body: some View {
    NumaWidgetContent(kind: kind, entry: entry, family: family)
      .containerBackground(Color("bg"), for: .widget)
      .widgetURL(kind.url)
  }
}
