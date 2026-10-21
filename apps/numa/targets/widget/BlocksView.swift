import SwiftUI
import WidgetKit

struct NumaCompositionStrip: View {
  let categories: [NumaCategory]
  let ownFraction: Double
  @Environment(\.widgetRenderingMode) private var renderingMode
  private func color(_ category: NumaCategory) -> Color {
    if #available(iOS 18.0, *), renderingMode == .accented {
      return Color.primary.opacity(0.25 + (Double(category.code) ?? 1) * 0.1)
    }
    return Color(category.colorName)
  }
  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .leading) {
        ForEach(categories) { category in
          let start = categories.prefix { $0.key != category.key }.reduce(0) { $0 + $1.fraction }
          Rectangle().fill(color(category))
            .frame(width: geometry.size.width * CGFloat(ownFraction * category.fraction))
            .offset(x: geometry.size.width * CGFloat(ownFraction * start))
        }
      }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }.accessibilityHidden(true)
  }
}

struct NumaCategoryLegend: View {
  let categories: [NumaCategory]
  let large: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: large ? 6 : 1) {
      ForEach(categories) { category in
        HStack(spacing: 5) {
          NumaCategorySwatch(category: category)
          Text(category.name).lineLimit(1)
          Spacer(minLength: 2)
          Text(large ? category.value.exact : category.percent).monospacedDigit().lineLimit(1)
        }
        .font(large ? .caption : .caption2).foregroundStyle(Color("ink"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(category.name), \(category.value.exact), \(category.percent) of what you own")
      }
    }
  }
}

struct NumaBalanceFigures: View {
  let own: NumaAmount
  let owe: NumaAmount
  let net: NumaAmount
  let horizontal: Bool
  var body: some View {
    if horizontal {
      HStack(alignment: .top, spacing: 8) {
        figure("What you own", own)
        figure("What you owe", owe)
        figure("Net worth", net)
      }
    } else {
      VStack(alignment: .leading, spacing: 2) {
        figure("What you own", own)
        figure("What you owe", owe)
        figure("Net worth", net)
      }
    }
  }
  private func figure(_ label: String, _ amount: NumaAmount) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      NumaTitle(text: label, compact: !horizontal)
      NumaAmountView(amount: amount, compactStyle: !horizontal)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct NumaBlocksView: View {
  let data: NumaBlocks?
  let syncedAt: Double?
  let source: NumaFreshness?
  let now: Date
  let family: WidgetFamily

  var body: some View {
    if let data {
      if data.state == .empty {
        VStack(alignment: .leading, spacing: 6) {
          NumaStateView(title: "What you own / What you owe", message: data.message ?? "No assets or debts recorded")
          NumaFreshnessView(syncedAt: syncedAt, source: source, now: now, compact: family != .systemLarge)
        }
      } else if data.state == .unavailable || !data.usable {
        VStack(alignment: .leading, spacing: 6) {
          NumaStateView(title: "What you own / What you owe", message: data.message ?? "Composition unavailable · open Numa Pro")
          NumaFreshnessView(syncedAt: syncedAt, source: source, now: now, compact: family != .systemLarge)
        }
      } else if let own = data.own, let owe = data.owe, let net = data.net, let categories = data.categories {
        VStack(alignment: .leading, spacing: family == .systemLarge ? 10 : 3) {
          if family == .systemLarge {
            NumaBalanceFigures(own: own, owe: owe, net: net, horizontal: true)
            NumaCompositionStrip(categories: categories, ownFraction: data.ownFraction ?? 0).frame(height: 22)
            NumaFractionBar(fraction: data.oweFraction ?? 0, color: Color("down"), dashed: true).frame(height: 14)
            Text("Top: what you own · dashed: what you owe · same scale").font(.caption).foregroundStyle(Color("ink2"))
            NumaCategoryLegend(categories: categories, large: true)
          } else {
            HStack(alignment: .top, spacing: 10) {
              NumaBalanceFigures(own: own, owe: owe, net: net, horizontal: false)
              VStack(alignment: .leading, spacing: 2) {
                NumaCompositionStrip(categories: categories, ownFraction: data.ownFraction ?? 0).frame(height: 8)
                NumaFractionBar(fraction: data.oweFraction ?? 0, color: Color("down"), dashed: true).frame(height: 8)
                NumaCategoryLegend(categories: categories, large: false)
              }.frame(maxWidth: .infinity)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Composition of what you own. Upper bar: assets. Dashed bar: liabilities. Both use the same scale.")
            }
          }
          Spacer(minLength: 0)
          NumaFreshnessView(syncedAt: syncedAt, source: source, now: now, compact: family != .systemLarge)
        }
      }
    } else {
      NumaStateView(title: "What you own / What you owe", message: "Open Numa Pro to update this widget")
    }
  }
}
