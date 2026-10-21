import SwiftUI
import WidgetKit

struct NumaFractionBar: View {
  let fraction: Double
  let color: Color
  var fromTrailing = false
  var dashed = false
  var body: some View {
    GeometryReader { geometry in
      let width = geometry.size.width * CGFloat(numaFraction(fraction) ?? 0)
      Rectangle().fill(color.opacity(dashed ? 0.3 : 0.85))
        .overlay(Rectangle().stroke(color, style: StrokeStyle(lineWidth: 1, dash: dashed ? [3, 2] : [])))
        .frame(width: width)
        .frame(maxWidth: .infinity, alignment: fromTrailing ? .trailing : .leading)
    }
    .accessibilityHidden(true)
  }
}

struct NumaMapFigures: View {
  let toYou: NumaAmount
  let youOwe: NumaAmount
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        NumaTitle(text: "Owed to you")
        NumaAmountView(amount: toYou)
      }.frame(maxWidth: .infinity, alignment: .leading)
      VStack(alignment: .trailing, spacing: 4) {
        NumaTitle(text: "You owe")
        NumaAmountView(amount: youOwe)
      }.frame(maxWidth: .infinity, alignment: .trailing)
    }
  }
}

struct NumaDebtMap: View {
  let toFraction: Double
  let oweFraction: Double
  var body: some View {
    HStack(spacing: 4) {
      NumaFractionBar(fraction: toFraction, color: Color("catBlue"), fromTrailing: true)
      Rectangle().fill(Color("ink2")).frame(width: 1)
      NumaFractionBar(fraction: oweFraction, color: Color("down"), dashed: true)
    }
    .frame(height: 14)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Lending to the left, borrowing to the right. Both use the same scale.")
  }
}

struct NumaMoneyMapView: View {
  let data: NumaMoneyMap?
  let syncedAt: Double?
  let source: NumaFreshness?
  let now: Date
  let family: WidgetFamily
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    if let data {
      if data.state == .unavailable || !data.usable {
        VStack(alignment: .leading, spacing: 6) {
          NumaStateView(title: "Money map", message: data.message ?? "Money map unavailable · open Numa Pro")
          NumaFreshnessView(syncedAt: syncedAt, source: source, now: now)
        }
      } else if let toYou = data.toYou, let youOwe = data.youOwe {
        ViewThatFits(in: .vertical) {
          NumaMoneyMapDetails(data: data, toYou: toYou, youOwe: youOwe, syncedAt: syncedAt, source: source, now: now,
                              large: family == .systemLarge, showMap: !typeSize.isAccessibilitySize)
          NumaMoneyMapDetails(data: data, toYou: toYou, youOwe: youOwe, syncedAt: syncedAt, source: source, now: now,
                              large: false, showMap: false)
        }
      }
    } else {
      NumaStateView(title: "Money map", message: "Open Numa Pro to update this widget")
    }
  }
}

struct NumaMoneyMapDetails: View {
  let data: NumaMoneyMap
  let toYou: NumaAmount
  let youOwe: NumaAmount
  let syncedAt: Double?
  let source: NumaFreshness?
  let now: Date
  let large: Bool
  let showMap: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: large ? 14 : 4) {
      NumaTitle(text: "Money map")
      NumaMapFigures(toYou: toYou, youOwe: youOwe)
      if data.state != .empty && showMap {
        NumaDebtMap(toFraction: data.toFraction ?? 0, oweFraction: data.oweFraction ?? 0)
        Text("Same scale · lent assets counted once").font(.caption2).foregroundStyle(Color("ink2"))
      }
      if let message = data.message { Text(message).font(.caption).foregroundStyle(Color("ink2")) }
      if large {
        Text("Lent assets are already included in what you own. Borrowing includes recorded debts, overdrafts and wallet loans.")
          .font(.callout).foregroundStyle(Color("ink2"))
      }
      NumaFreshnessView(syncedAt: syncedAt, source: source, now: now, detailed: large)
    }
  }
}
