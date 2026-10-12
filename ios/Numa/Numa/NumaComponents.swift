import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

struct NumaScroll<Content: View>: View {
  @Environment(\.numa) private var numa
  @ViewBuilder var content: () -> Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        content()
      }
      .padding(18)
      .padding(.bottom, 220)
    }
    .scrollIndicators(.hidden)
    .background(numa.bg.ignoresSafeArea())
  }
}

struct NumaScreen<Content: View>: View {
  @Environment(\.numa) private var numa
  @ViewBuilder var content: () -> Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        content()
      }
      .padding(.horizontal, 16)
      .padding(.top, 8)
      // Room for the floating dock + voice button — list tails must never
      // disappear under chrome.
      .padding(.bottom, 176)
    }
    .scrollIndicators(.hidden)
    .background(numa.bg.ignoresSafeArea())
  }
}

struct NumaCard<Content: View>: View {
  @Environment(\.numa) private var numa
  @ViewBuilder var content: () -> Content

  var body: some View {
    content()
      .padding(18)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(numa.paper)
      .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(numa.line))
      .shadow(color: Color.black.opacity(0.025), radius: 14, y: 6)
  }
}

struct HeroMetricCard: View {
  @Environment(\.numa) private var numa
  let eyebrow: String
  let title: String
  let value: String
  let tint: Color

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 16) {
        Text(eyebrow)
          .font(NumaType.mono(11, .bold))
          .tracking(2.4)
          .foregroundStyle(numa.ink3)
        Text(title)
          .font(NumaType.display(28, .bold))
          .foregroundStyle(numa.ink)
        Text(value)
          .font(NumaType.mono(40, .semibold))
          .minimumScaleFactor(0.6)
          .lineLimit(1)
          .foregroundStyle(tint)
      }
    }
  }
}

struct MetricTile: View {
  @Environment(\.numa) private var numa
  let title: String
  let value: String
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Circle()
          .fill(tint)
          .frame(width: 6, height: 6)
        Text(title)
          .font(.caption.weight(.semibold))
          .foregroundStyle(numa.ink3)
      }
      Text(value)
        .font(NumaType.mono(20, .semibold))
        .minimumScaleFactor(0.7)
        .lineLimit(1)
        .foregroundStyle(numa.ink)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(numa.paper)
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(numa.line))
  }
}

struct ProgressRow: View {
  @Environment(\.numa) private var numa
  let title: String
  let value: Double
  let limit: Double
  let currency: CurrencyCode

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(title)
        Spacer()
        Text("\(formatNumaMoney(value, currency)) / \(formatNumaMoney(limit, currency))")
          .foregroundStyle(numa.ink3)
      }
      .font(.subheadline.weight(.semibold))
      GeometryReader { proxy in
        Capsule()
          .fill(numa.line)
          .overlay(alignment: .leading) {
            Capsule()
              // The fill IS the accent: lime while healthy, negative past cap.
              .fill(value > limit ? numa.negative : Color(hex: 0xBFE438))
              .frame(width: proxy.size.width * min(value / max(limit, 1), 1))
          }
      }
      .frame(height: 9)
    }
  }
}

struct RecentTransactionsList: View {
  @Environment(\.numa) private var numa
  @Environment(NumaAppStore.self) private var appStore
  let transactions: [MobileTransaction]

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Recent")
          .font(.headline)
        if transactions.isEmpty {
          Text("No transactions yet.")
            .foregroundStyle(numa.ink3)
        } else {
          ForEach(transactions) { tx in
            Button {
              appStore.activeSheet = .transaction(TransactionDraft(transaction: tx))
            } label: {
              TransactionRowNative(transaction: tx)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider().overlay(numa.line)
          }
        }
      }
    }
  }
}

struct TransactionRowNative: View {
  @Environment(\.numa) private var numa
  @Environment(\.dynamicTypeSize) private var typeSize
  let transaction: MobileTransaction

  var body: some View {
    Group {
      if typeSize.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 10) {
          Label(transaction.kind == "income" ? "Income" : "Expense",
            systemImage: transaction.kind == "income" ? "arrow.down.left" : "arrow.up.right")
            .font(.caption).foregroundStyle(numa.ink3)
          details
          amount
        }.frame(maxWidth: .infinity, alignment: .leading)
      } else {
        HStack(spacing: 12) {
          Image(systemName: transaction.kind == "income" ? "arrow.down.left" : "arrow.up.right")
            .foregroundStyle(transaction.kind == "income" ? numa.positive : numa.ink2)
            .frame(width: 34, height: 34).background(numa.bg)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
          details
          Spacer(minLength: 4)
          amount
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
  private var details: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(transaction.description).font(.subheadline.weight(.semibold)).foregroundStyle(numa.ink)
        .fixedSize(horizontal: false, vertical: true)
      Text(dateString(transaction.occurredAt)).font(.caption).foregroundStyle(numa.ink3)
    }
  }
  private var amount: some View {
    Text(formatNumaMoney(transaction.amount, transaction.currency))
      .font(NumaType.mono(14, .semibold))
      .foregroundStyle(transaction.kind == "income" ? numa.positive : numa.ink)
      .fixedSize(horizontal: false, vertical: true)
      .layoutPriority(1)
  }
}

struct AllocationBars: View {
  @Environment(\.numa) private var numa
  let snapshot: MobilePortfolioSnapshot

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 14) {
        Text("Allocation")
          .font(.headline)
        ProgressRow(title: "Liquid", value: snapshot.dashboard.liquid, limit: max(snapshot.dashboard.netWorth, 1), currency: snapshot.dashboard.currency)
        ProgressRow(title: "Invested", value: snapshot.dashboard.invested, limit: max(snapshot.dashboard.netWorth, 1), currency: snapshot.dashboard.currency)
        ProgressRow(title: "Hard assets", value: snapshot.dashboard.hardAssets, limit: max(snapshot.dashboard.netWorth, 1), currency: snapshot.dashboard.currency)
      }
    }
  }
}

struct WealthActionButton: View {
  @Environment(\.numa) private var numa
  let title: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(spacing: 8) {
        Image(systemName: systemImage)
          .font(.headline)
        Text(title)
          .font(.caption.weight(.bold))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 12)
      .background(numa.bg)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(numa.line))
    }
    .buttonStyle(.plain)
    .foregroundStyle(numa.ink)
  }
}

struct HoldingsList: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  let holdings: [MobileHolding]

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Holdings")
          .font(.headline)
        if holdings.isEmpty {
          Text("No market positions yet.")
            .foregroundStyle(numa.ink3)
        } else {
          ForEach(holdings) { holding in
            HStack {
              VStack(alignment: .leading) {
                Text(holding.symbol)
                  .font(.headline)
                Text(holding.name)
                  .font(.caption)
                  .foregroundStyle(numa.ink3)
              }
              Spacer()
              VStack(alignment: .trailing) {
                Text(formatNumaMoney(holding.marketValue, holding.currency))
                  .fontWeight(.bold)
                Text("\(holding.changePercent, specifier: "%.2f")%")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(holding.changePercent >= 0 ? numa.positive : numa.negative)
              }
            }
            .contentShape(Rectangle())
            .onTapGesture {
              appStore.activeSheet = .holding(holding)
            }
          }
        }
      }
    }
  }
}

struct AssetsLiabilitiesList: View {
  @Environment(NumaAppStore.self) private var appStore
  @Environment(\.numa) private var numa
  let snapshot: MobilePortfolioSnapshot

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Assets & liabilities")
          .font(.headline)
        ForEach(snapshot.assets) { asset in
          HStack {
            Text(asset.name)
            Spacer()
            Text(formatNumaMoney(asset.balance, asset.currency))
              .fontWeight(.bold)
          }
          .contentShape(Rectangle())
          .onTapGesture {
            appStore.activeSheet = .asset(asset)
          }
        }
        ForEach(snapshot.liabilities) { liability in
          HStack {
            Text(liability.name)
            Spacer()
            Text("-\(formatNumaMoney(liability.balance, liability.currency))")
              .fontWeight(.bold)
              .foregroundStyle(numa.negative)
          }
          .contentShape(Rectangle())
          .onTapGesture {
            appStore.activeSheet = .liability(liability)
          }
        }
      }
      .foregroundStyle(numa.ink)
    }
  }
}

struct GoalsList: View {
  @Environment(\.numa) private var numa
  let goals: [MobileGoal]

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Goals")
          .font(.headline)
        if goals.isEmpty {
          Text("No goals yet.")
            .foregroundStyle(numa.ink3)
        } else {
          ForEach(goals) { goal in
            HStack {
              Text(goal.label ?? goal.scope.replacingOccurrences(of: "_", with: " ").capitalized)
              Spacer()
              Text(formatNumaMoney(goal.target, goal.currency))
                .fontWeight(.bold)
            }
          }
        }
      }
    }
  }
}

struct PodPeopleCards: View {
  @Environment(\.numa) private var numa
  let snapshot: MobilePodSnapshot
  let onCards: (MobilePodMember) -> Void

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("People")
          .font(.headline)
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
          ForEach(snapshot.members) { member in
            Button {
              onCards(member)
            } label: {
              VStack(alignment: .leading, spacing: 8) {
                Text(member.displayName)
                  .font(.headline)
                Text(snapshot.balances.first(where: { $0.memberId == member.id }).map { formatNumaMoney($0.amount, $0.currency) } ?? formatNumaMoney(0, snapshot.pod.currency))
                  .foregroundStyle(numa.ink3)
                Text(member.cards.isEmpty ? "No cards" : member.cards.joined(separator: " / "))
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(numa.ink3)
                  .lineLimit(1)
              }
              .padding(14)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(numa.brandMist)
              .clipShape(RoundedRectangle(cornerRadius: 18))
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }
}

struct PodExpenseTimeline: View {
  @Environment(\.numa) private var numa
  let snapshot: MobilePodSnapshot
  let onEdit: (MobilePodExpense) -> Void

  var body: some View {
    NumaCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Recent")
          .font(.headline)
        ForEach(snapshot.expenses) { expense in
          Button {
            onEdit(expense)
          } label: {
            HStack {
              VStack(alignment: .leading, spacing: 4) {
                Text(expense.description)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(numa.ink)
                Text(memberName(expense.paidByMemberId) + (expense.paidByCard.map { " · \($0)" } ?? ""))
                  .font(.caption)
                  .foregroundStyle(numa.ink3)
              }
              Spacer()
              Text(formatNumaMoney(expense.amount, expense.currency))
                .font(.subheadline.bold())
                .foregroundStyle(numa.ink)
            }
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func memberName(_ id: String) -> String {
    snapshot.members.first(where: { $0.id == id })?.displayName ?? "Member"
  }
}

/// Shared with the web lockup: the canonical coin, never a financial status icon.
struct NumaCoinMark: View {
  var size: CGFloat = 40
  var body: some View {
    Image("NumaCoin")
      .resizable().scaledToFit().frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

/// Decorative orbital geometry. It deliberately has no implied trend or scale.
struct NumaBrandOrbit: View {
  var body: some View {
    ZStack {
      Circle().stroke(lineWidth: 0.8)
      Ellipse().stroke(lineWidth: 0.8).frame(height: 110).rotationEffect(.degrees(-35))
      Ellipse().stroke(lineWidth: 0.8).frame(height: 110).rotationEffect(.degrees(55))
      Circle().frame(width: 15, height: 15).offset(x: 109, y: -73)
    }
    .frame(width: 270, height: 270)
    .accessibilityHidden(true)
    .allowsHitTesting(false)
  }
}
