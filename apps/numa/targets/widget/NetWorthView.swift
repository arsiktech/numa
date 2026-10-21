import SwiftUI
import WidgetKit

struct NumaNetWorthView: View {
  let data: NumaNetWorth?
  let legacyNet: String
  let syncedAt: Double?
  let source: NumaFreshness?
  let now: Date
  let family: WidgetFamily
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    if let data {
      if data.state == .unavailable {
        VStack(alignment: .leading, spacing: 6) {
          NumaStateView(title: "Net worth", message: data.message ?? "Net worth unavailable")
          NumaFreshnessView(syncedAt: syncedAt, source: source, now: now)
        }
      } else if let value = data.value, value.usable {
        VStack(alignment: .leading, spacing: family == .systemLarge ? 10 : 3) {
          NumaTitle(text: "Net worth")
          NumaAmountView(amount: value, prominent: true).layoutPriority(2)
          if family == .systemMedium && data.state != .empty && !typeSize.isAccessibilitySize {
            HStack(alignment: .top, spacing: 12) {
              VStack(alignment: .leading, spacing: 4) {
                if let daily = data.daily { NumaDailyView(daily: daily, now: now) }
                NumaFreshnessView(syncedAt: syncedAt, source: source, now: now, compact: true)
              }.frame(maxWidth: .infinity, alignment: .leading)
              NumaHistorySection(trend: data.trend, message: data.historyMessage, tall: false)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          } else if data.state == .empty {
            Text(data.message ?? "No assets or debts recorded").font(.caption).foregroundStyle(Color("ink2"))
          } else {
            if let daily = data.daily { NumaDailyView(daily: daily, now: now) }
            if family == .systemLarge && !typeSize.isAccessibilitySize {
              NumaHistorySection(trend: data.trend, message: data.historyMessage, tall: true)
            }
          }
          Spacer(minLength: 0)
          if family != .systemMedium || data.state == .empty || typeSize.isAccessibilitySize {
            NumaFreshnessView(syncedAt: syncedAt, source: source, now: now, detailed: family == .systemLarge, compact: family == .systemSmall)
          }
        }
      } else {
        NumaStateView(title: "Net worth", message: "Open Numa Pro to update this widget")
      }
    } else {
      VStack(alignment: .leading, spacing: 6) {
        NumaTitle(text: "Net worth")
        if legacyNet != "—" { Text(legacyNet).font(.title2).fontWeight(.semibold).monospacedDigit().lineLimit(2) }
        Text("Open Numa Pro to update this widget").font(.caption).foregroundStyle(Color("ink2"))
      }
    }
  }
}

struct NumaDailyView: View {
  let daily: NumaDaily
  let now: Date
  var label: String { daily.label(at: now) }
  var body: some View {
    Text(label)
      .font(.caption).fontWeight(.medium).foregroundStyle(Color("ink2"))
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityLabel(daily.hasChange(at: now) ? "\(label). Quote changes are not investment returns." : label)
  }
}

struct NumaTrendLine: Shape {
  let points: [NumaTrendPoint]
  func path(in rect: CGRect) -> Path {
    var path = Path()
    guard points.count >= 3, let first = points.first, let last = points.last,
          numaTime(first.t) != nil, numaTime(last.t) != nil, last.t > first.t else { return path }
    for point in points {
      guard numaTime(point.t) != nil, numaFraction(point.y) != nil else { return Path() }
      let x = (point.t - first.t) / (last.t - first.t)
      guard x.isFinite, (0...1).contains(x) else { return Path() }
      let position = CGPoint(x: rect.minX + rect.width * CGFloat(x), y: rect.minY + rect.height * CGFloat(0.9 - 0.8 * point.y))
      if point.id == first.id { path.move(to: position) } else { path.addLine(to: position) }
    }
    return path
  }
}

struct NumaHistorySection: View {
  let trend: NumaTrend?
  let message: String?
  let tall: Bool
  var body: some View {
    if let trend, trend.usable {
      NumaTrendView(trend: trend, tall: tall)
    } else {
      Text(message ?? "A trend needs 3 dated observations in 30 days.")
        .font(.caption).foregroundStyle(Color("ink2")).fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct NumaTrendView: View {
  let trend: NumaTrend
  let tall: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      if tall { Text(trend.range).font(.caption).foregroundStyle(Color("ink2")) }
      else {
        Text("Saved through \(trend.to)\nCurrent total above")
          .font(.caption2).foregroundStyle(Color("ink2")).fixedSize(horizontal: false, vertical: true)
      }
      NumaTrendLine(points: trend.points)
        .stroke(Color("ink"), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        .frame(height: tall ? 78 : 26)
        .overlay(alignment: .bottom) { Rectangle().fill(Color("ink2").opacity(0.3)).frame(height: 0.5) }
      HStack(alignment: .firstTextBaseline) {
        Text(trend.from)
        Spacer(minLength: 4)
        if !tall { Text("30 days").foregroundStyle(Color("ink2")) }
        Spacer(minLength: 4)
        Text(trend.to)
      }.font(.caption2).foregroundStyle(Color("ink2"))
      if tall { Text("Range \(trend.low) to \(trend.high) · saved net worth, not returns").font(.caption).foregroundStyle(Color("ink2")) }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Saved net worth observations over 30 days, from \(trend.from) through the last saved observation on \(trend.to). The headline is the current recorded total. Low \(trend.low), high \(trend.high). Not investment returns.")
  }
}
