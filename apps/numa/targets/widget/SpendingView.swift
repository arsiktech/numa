import SwiftUI
import WidgetKit

private enum NumaWeekday: String, CaseIterable, Identifiable {
  case monday, tuesday, wednesday, thursday, friday, saturday, sunday
  var id: String { rawValue }
  var letter: String { String(rawValue.prefix(1)).uppercased() }
}

struct NumaSpendingDayView: View {
  let day: NumaCalendarDay
  let large: Bool
  @Environment(\.widgetRenderingMode) private var renderingMode
  private var accented: Bool {
    if #available(iOS 18.0, *), renderingMode == .accented { return true }
    return false
  }
  private var fill: Color {
    if day.future || day.level == 0 { return .clear }
    if accented { return Color.primary.opacity(Double(day.level) * 0.06) }
    return Color("ink").opacity([0, 0.1, 0.22, 0.4, 0.65][day.level])
  }
  var body: some View {
    Text("\(day.day)\(day.unknown && !day.future ? "?" : "")")
      .font(large ? .callout : .caption2).monospacedDigit()
      .fontWeight(day.level >= 3 ? .semibold : .regular)
      .foregroundStyle(!accented && day.level == 4 && !day.future ? Color("bg") : Color("ink"))
      .frame(maxWidth: .infinity, minHeight: large ? 29 : 14)
      .background(fill, in: Rectangle())
      .overlay(Rectangle().stroke(Color("ink2").opacity(day.future ? 0.65 : 0.35), style: StrokeStyle(lineWidth: 0.5, dash: day.future ? [2, 2] : [])))
      .accessibilityLabel(day.description)
  }
}

struct NumaCalendarGrid: View {
  let cells: [NumaCalendarCell]
  let large: Bool
  private let columns = Array(repeating: GridItem(.flexible(minimum: 0), spacing: 2), count: 7)
  var body: some View {
    VStack(spacing: 2) {
      HStack(spacing: 2) {
        ForEach(NumaWeekday.allCases) { day in
          Text(day.letter).font(.caption2).foregroundStyle(Color("ink2"))
            .frame(maxWidth: .infinity).accessibilityLabel(day.rawValue)
        }
      }
      LazyVGrid(columns: columns, spacing: 2) {
        ForEach(cells) { cell in
          if let day = cell.day {
            NumaSpendingDayView(day: day, large: large)
          } else {
            Color.clear.frame(minHeight: large ? 29 : 14).accessibilityHidden(true)
          }
        }
      }
      Text(large ? "Stronger = more · ○ none · ? FX · ┄ future" : "? FX · ┄ future").font(.caption2).foregroundStyle(Color("ink2"))
        .accessibilityLabel("Unshaded: no spending. Question mark: unconverted spending. Dashed outline: future date. Stronger shades mean more spending.")
    }
  }
}

struct NumaSpendingSummary: View {
  let month: String
  let total: NumaAmount
  let message: String?
  let compact: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 4 : 6) {
      NumaTitle(text: compact ? "\(month) spending" : "Spending by date")
      if !compact { Text(month).font(.caption).foregroundStyle(Color("ink2")) }
      NumaAmountView(amount: total, prominent: !compact)
      if let message { Text(message).font(.caption2).foregroundStyle(Color("ink2")) }
      if compact { Text("Stronger = more").font(.caption2).foregroundStyle(Color("ink2")) }
    }
  }
}

struct NumaSpendingView: View {
  let data: NumaSpending?
  let syncedAt: Double?
  let source: NumaFreshness?
  let now: Date
  let family: WidgetFamily
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    if let data {
      if data.state == .unavailable || !data.usable {
        NumaStateView(title: "Spending by date", message: data.message ?? "Spending unavailable · open Numa Pro")
      } else if let until = data.validUntil, now.timeIntervalSince1970 * 1000 >= until {
        VStack(alignment: .leading, spacing: 6) {
          NumaStateView(title: "Spending by date", message: "Calendar is stale. Open Numa Pro to refresh today’s dates.")
          NumaFreshnessView(syncedAt: syncedAt, source: nil, now: now)
        }
      } else if let month = data.month, let total = data.total {
        ViewThatFits(in: .vertical) {
          if !typeSize.isAccessibilitySize {
            if family == .systemLarge {
              VStack(alignment: .leading, spacing: 8) {
                NumaSpendingSummary(month: month, total: total, message: data.message, compact: false)
                NumaCalendarGrid(cells: data.cells, large: true)
                NumaFreshnessView(syncedAt: syncedAt, source: nil, now: now)
              }
            } else {
              HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                  NumaSpendingSummary(month: month, total: total, message: data.message, compact: true)
                  NumaFreshnessView(syncedAt: syncedAt, source: nil, now: now, compact: true)
                }.frame(maxWidth: .infinity, alignment: .leading)
                NumaCalendarGrid(cells: data.cells, large: false).frame(maxWidth: .infinity)
              }
            }
          }
          VStack(alignment: .leading, spacing: 6) {
            NumaSpendingSummary(month: month, total: total, message: data.message, compact: true)
            Text("Open Numa Pro for the calendar").font(.callout).foregroundStyle(Color("ink2"))
            NumaFreshnessView(syncedAt: syncedAt, source: nil, now: now, compact: true)
          }
        }
      }
    } else {
      NumaStateView(title: "Spending by date", message: "Open Numa Pro to update this widget")
    }
  }
}
