import Foundation
import WidgetKit

enum NumaWidgetKind: String, CaseIterable, Identifiable {
  case netWorth, moneyMap, spending, blocks
  var id: String { rawValue }
  var title: String {
    switch self {
    case .netWorth: return "Net worth"
    case .moneyMap: return "Money map"
    case .spending: return "Spending by date"
    case .blocks: return "Own / owe blocks"
    }
  }
  var url: URL? {
    switch self {
    case .netWorth: return URL(string: "numanext:///")
    case .moneyMap: return URL(string: "numanext:///money-map")
    case .spending: return URL(string: "numanext:///flow")
    case .blocks: return URL(string: "numanext:///holdings")
    }
  }
}

enum NumaState: String, Decodable { case ready, hidden, empty, unavailable, partial }

func numaTime(_ value: Double?) -> Double? {
  guard let value, value.isFinite, value > 0, value <= 253_402_300_799_000 else { return nil }
  return value
}

func numaFraction(_ value: Double?) -> Double? {
  guard let value, value.isFinite, (0...1).contains(value) else { return nil }
  return value
}

/// Reject future quotes and use the same strict 24-hour expiry as the app publisher. Milliseconds throughout.
func numaQuoteIsCurrent(_ timestamp: Double?, at date: Date) -> Bool {
  guard let timestamp = numaTime(timestamp), let now = numaTime(date.timeIntervalSince1970 * 1000) else { return false }
  return timestamp <= now && now - timestamp < 86_400_000
}

private var numaUTCCalendar: Calendar {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: 0)!
  return calendar
}

/// Temporal half of the shared FX contract; the publisher validates the finite positive rate.
private func numaFxDay(_ value: String?) -> Date? {
  guard let value, value.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { return nil }
  let parts = value.split(separator: "-").compactMap { Int($0) }
  guard parts.count == 3, (1...9999).contains(parts[0]),
        let date = numaUTCCalendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
  let actual = numaUTCCalendar.dateComponents([.year, .month, .day], from: date)
  guard actual.year == parts[0], actual.month == parts[1], actual.day == parts[2] else { return nil }
  return date
}

func numaFxExpiry(_ asOf: String?) -> Date? {
  guard let day = numaFxDay(asOf) else { return nil }
  // Rate date + five UTC calendar days is usable, right up to the following UTC midnight.
  return numaUTCCalendar.date(byAdding: .day, value: 6, to: day)
}

func numaFxIsCurrent(_ asOf: String?, at date: Date) -> Bool {
  guard numaTime(date.timeIntervalSince1970 * 1000) != nil,
        let day = numaFxDay(asOf), let expiry = numaFxExpiry(asOf) else { return false }
  return day <= numaUTCCalendar.startOfDay(for: date) && date < expiry
}

struct NumaAmount: Decodable {
  let text: String
  let compact: String
  let exact: String
  var usable: Bool {
    [text, compact, exact].allSatisfy { !$0.isEmpty && $0.count <= 80 && $0.rangeOfCharacter(from: .controlCharacters) == nil }
  }
}

struct NumaDaily: Decodable {
  let text: String
  let direction: String
  let asOf: Double?
  let amount: String?
  let period: String?
  let currency: String?
  let fxAsOf: String?

  func hasChange(at date: Date) -> Bool {
    guard ["up", "down"].contains(direction), period == "quoteChange",
          let amount, !amount.isEmpty, amount.count <= 80,
          amount.rangeOfCharacter(from: .controlCharacters) == nil,
          ["EUR", "USD"].contains(currency ?? ""), numaQuoteIsCurrent(asOf, at: date) else { return false }
    return currency == "USD" || numaFxIsCurrent(fxAsOf, at: date)
  }

  func label(at date: Date, calendar: Calendar = .current) -> String {
    guard hasChange(at: date), let amount, let asOf = numaTime(asOf) else {
      return text == "No market prices today" ? "No market quotes" : "Quote change unavailable"
    }
    let quoteDate = Date(timeIntervalSince1970: asOf / 1000)
    if calendar.isDate(quoteDate, inSameDayAs: date) { return "\(amount) quote change today" }
    let formatter = DateFormatter()
    formatter.locale = calendar.locale ?? .current
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return "\(amount) quote change as of \(formatter.string(from: quoteDate))"
  }
}

struct NumaTrendPoint: Decodable, Identifiable {
  let t: Double
  let y: Double
  var id: Double { t }
}

struct NumaTrend: Decodable {
  let points: [NumaTrendPoint]
  let range: String
  let from: String
  let to: String
  let low: String
  let high: String

  // Decoding/sanitization happens once in the provider, never in a view body.
  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let raw = (try? c.decode([NumaTrendPoint].self, forKey: .points)) ?? []
    var byTime: [Double: NumaTrendPoint] = [:]
    for point in raw where numaTime(point.t) != nil && numaFraction(point.y) != nil { byTime[point.t] = point }
    points = Array(byTime.values.sorted { $0.t < $1.t }.suffix(90))
    range = (try? c.decode(String.self, forKey: .range)) ?? "Saved observations · 30 days"
    from = (try? c.decode(String.self, forKey: .from)) ?? ""
    to = (try? c.decode(String.self, forKey: .to)) ?? ""
    low = (try? c.decode(String.self, forKey: .low)) ?? ""
    high = (try? c.decode(String.self, forKey: .high)) ?? ""
  }
  private enum CodingKeys: String, CodingKey { case points, range, from, to, low, high }
  var usable: Bool { points.count >= 3 && points.last!.t > points.first!.t && !from.isEmpty && !to.isEmpty }
}

struct NumaNetWorth: Decodable {
  let state: NumaState
  let message: String?
  let value: NumaAmount?
  let daily: NumaDaily?
  let historyMessage: String?
  let trend: NumaTrend?
}

struct NumaMoneyMap: Decodable {
  let state: NumaState
  let message: String?
  let toYou: NumaAmount?
  let youOwe: NumaAmount?
  let toFraction: Double?
  let oweFraction: Double?
  var usable: Bool {
    toYou?.usable == true && youOwe?.usable == true && numaFraction(toFraction) != nil && numaFraction(oweFraction) != nil
  }
}

struct NumaCalendarDay: Decodable, Identifiable {
  let key: String
  let day: Int
  let level: Int
  let future: Bool
  let unknown: Bool
  let description: String
  var id: String { key }
}

struct NumaCalendarCell: Identifiable {
  let id: String
  let day: NumaCalendarDay?
}

struct NumaSpending: Decodable {
  let state: NumaState
  let message: String?
  let month: String?
  let monthKey: String?
  let validUntil: Double?
  let total: NumaAmount?
  let lead: Int?
  let days: [NumaCalendarDay]?
  let cells: [NumaCalendarCell]
  let usable: Bool

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    state = (try? c.decode(NumaState.self, forKey: .state)) ?? .unavailable
    message = try? c.decode(String.self, forKey: .message)
    month = try? c.decode(String.self, forKey: .month)
    monthKey = try? c.decode(String.self, forKey: .monthKey)
    validUntil = numaTime(try? c.decode(Double.self, forKey: .validUntil))
    total = try? c.decode(NumaAmount.self, forKey: .total)
    lead = try? c.decode(Int.self, forKey: .lead)
    days = try? c.decode([NumaCalendarDay].self, forKey: .days)
    if let days, let lead, (0...6).contains(lead), (28...31).contains(days.count), let monthKey,
       monthKey.count == 7, month?.isEmpty == false, total?.usable == true, validUntil != nil,
       days.enumerated().allSatisfy({ offset, day in
         day.day == offset + 1 && (0...4).contains(day.level)
           && day.key == String(format: "%@-%02d", monthKey, day.day)
       }) {
      var result = (0..<lead).map { NumaCalendarCell(id: "\(monthKey):leading:\($0)", day: nil) }
      result += days.map { NumaCalendarCell(id: $0.key, day: $0) }
      let trailing = (7 - result.count % 7) % 7
      result += (0..<trailing).map { NumaCalendarCell(id: "\(monthKey):trailing:\($0)", day: nil) }
      cells = result
      usable = true
    } else {
      cells = []
      usable = false
    }
  }
  private enum CodingKeys: String, CodingKey { case state, message, month, monthKey, validUntil, total, lead, days }
}

struct NumaCategory: Decodable, Identifiable {
  let key: String
  let name: String
  let value: NumaAmount
  let fraction: Double
  let percent: String
  var id: String { key }
  var code: String {
    switch key {
    case "crypto": return "1"
    case "stocks": return "2"
    case "business": return "3"
    case "property": return "4"
    case "cash": return "5"
    default: return "6"
    }
  }
  var colorName: String {
    switch key {
    case "crypto": return "catAmber"
    case "stocks": return "catBlue"
    case "business": return "catViolet"
    case "property": return "catSlate"
    case "cash": return "catSky"
    default: return "catSand"
    }
  }
}

struct NumaBlocks: Decodable {
  let state: NumaState
  let message: String?
  let own: NumaAmount?
  let owe: NumaAmount?
  let net: NumaAmount?
  let ownFraction: Double?
  let oweFraction: Double?
  let categories: [NumaCategory]?
  var usable: Bool {
    guard own?.usable == true, owe?.usable == true, net?.usable == true,
          numaFraction(ownFraction) != nil, numaFraction(oweFraction) != nil,
          let categories, categories.count <= 6 else { return false }
    let keys = ["crypto", "stocks", "business", "property", "cash", "things"]
    guard Set(categories.map(\.key)).count == categories.count,
          categories.allSatisfy({ keys.contains($0.key) && $0.value.usable && numaFraction($0.fraction) != nil }) else { return false }
    let sum = categories.reduce(0) { $0 + $1.fraction }
    return ownFraction == 0 ? sum == 0 : abs(sum - 1) < 0.00001
  }
}

struct NumaFreshness: Decodable {
  let sourceAsOf: Double?
  let quotesAsOf: Double?
  let quotes: String?
  let stale: Bool?
  let fxAsOf: String?
  let fxRequired: Bool?

  func quoteStatus(at date: Date) -> String? {
    guard let quotes else { return nil }
    if ["none", "partial", "stale"].contains(quotes) { return quotes }
    guard quotes == "current", numaTime(quotesAsOf) != nil else { return "partial" }
    return numaQuoteIsCurrent(quotesAsOf, at: date) ? "current" : "stale"
  }

  func conversionIsStale(at date: Date) -> Bool {
    fxRequired == true && !numaFxIsCurrent(fxAsOf, at: date)
  }

  func needsRefresh(at date: Date) -> Bool {
    stale == true || ["partial", "stale"].contains(quoteStatus(at: date) ?? "") || conversionIsStale(at: date)
  }
}

/// v1 fields are still decoded. Untimed v1 lines are never drawn by the repaired extension.
struct NumaSnapshot: Decodable {
  let version: Int?
  let net: String
  let today: String
  let up: Bool
  let line: [Double]
  let updatedAt: Double?
  let syncedAt: Double?
  let hidden: Bool
  let freshness: NumaFreshness?
  let netWorth: NumaNetWorth?
  let moneyMap: NumaMoneyMap?
  let spending: NumaSpending?
  let blocks: NumaBlocks?

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try? c.decode(Int.self, forKey: .version)
    let legacyNet = (try? c.decode(String.self, forKey: .net)) ?? "—"
    let newNet = try? c.decode(NumaNetWorth.self, forKey: .netWorth)
    let newMap = try? c.decode(NumaMoneyMap.self, forKey: .moneyMap)
    let newSpending = try? c.decode(NumaSpending.self, forKey: .spending)
    let newBlocks = try? c.decode(NumaBlocks.self, forKey: .blocks)
    hidden = (try? c.decode(String.self, forKey: .privacy)) == "hidden" || legacyNet == "••••"
      || newNet?.state == .hidden || newMap?.state == .hidden || newSpending?.state == .hidden || newBlocks?.state == .hidden
    net = hidden ? "••••" : String(legacyNet.prefix(80))
    today = hidden ? "" : String(((try? c.decode(String.self, forKey: .today)) ?? "").prefix(120))
    up = (try? c.decode(Bool.self, forKey: .up)) ?? true
    line = hidden ? [] : ((try? c.decode([Double].self, forKey: .line)) ?? []).filter { numaFraction($0) != nil }
    updatedAt = numaTime(try? c.decode(Double.self, forKey: .updatedAt))
    syncedAt = numaTime(try? c.decode(Double.self, forKey: .syncedAt)) ?? updatedAt
    freshness = hidden ? nil : (try? c.decode(NumaFreshness.self, forKey: .freshness))
    netWorth = hidden || version != 2 ? nil : newNet
    moneyMap = hidden || version != 2 ? nil : newMap
    spending = hidden || version != 2 ? nil : newSpending
    blocks = hidden || version != 2 ? nil : newBlocks
  }
  private enum CodingKeys: String, CodingKey {
    case version, privacy, net, today, up, line, updatedAt, syncedAt, freshness, netWorth, moneyMap, spending, blocks
  }
  static func decode(_ data: Data) -> NumaSnapshot? {
    guard data.count <= 128_000 else { return nil }
    return try? JSONDecoder().decode(NumaSnapshot.self, from: data)
  }
}

struct NumaEntry: TimelineEntry {
  let date: Date
  let snapshot: NumaSnapshot?
}

/// Local cached-state transitions only. Kept separate from storage so the native harness can
/// check exactly the dates consumed by the provider, without invoking WidgetKit or fetching data.
func numaTimelineDates(snapshot: NumaSnapshot?, now: Date, calendar: Calendar = .current) -> [Date] {
  guard let snapshot, !snapshot.hidden else { return [now] }
  var dates = [now]
  func append(_ date: Date?) { if let date, date > now { dates.append(date) } }
  if let sync = numaTime(snapshot.syncedAt) { append(Date(timeIntervalSince1970: sync / 1000 + 6 * 3600)) }
  if let until = numaTime(snapshot.spending?.validUntil) { append(Date(timeIntervalSince1970: until / 1000)) }
  for timestamp in [snapshot.netWorth?.daily?.asOf, snapshot.freshness?.quotesAsOf] {
    if let timestamp = numaTime(timestamp), numaQuoteIsCurrent(timestamp, at: now) {
      append(Date(timeIntervalSince1970: timestamp / 1000 + 24 * 3600))
    }
  }
  if snapshot.netWorth?.daily?.currency == "EUR" { append(numaFxExpiry(snapshot.netWorth?.daily?.fxAsOf)) }
  if snapshot.freshness?.fxRequired == true { append(numaFxExpiry(snapshot.freshness?.fxAsOf)) }
  // Date wording (including app-sync wording) changes at local midnight, even with the app closed.
  if snapshot.syncedAt != nil || snapshot.netWorth?.daily != nil || snapshot.freshness != nil {
    append(calendar.dateInterval(of: .day, for: now)?.end)
  }
  return Array(Set(dates)).sorted()
}
