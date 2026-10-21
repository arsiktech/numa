import Foundation

// Synthetic gallery/preview fixtures. Cached in the provider, never decoded in a View body.
// baseJSON + top-level patches mirror src/widget/samples/*.json.
enum NumaSampleState: String, CaseIterable, Identifiable {
  case ready, hidden, empty, unavailable, stale, sparse, partial, largeValues, legacy, calendarSixRows, calendarLeapYear
  var id: String { rawValue }
}

enum NumaSamples {
  static let date = Date(timeIntervalSince1970: 1792584000)
  static func date(for state: NumaSampleState) -> Date {
    switch state {
    case .calendarSixRows: return Date(timeIntervalSince1970: 1773576000)
    case .calendarLeapYear: return Date(timeIntervalSince1970: 1834228800)
    default: return date
    }
  }
  static let ready = snapshots[.ready]
  static let snapshots: [NumaSampleState: NumaSnapshot] = {
    guard let base = try? JSONSerialization.jsonObject(with: Data(baseJSON.utf8)) as? [String: Any],
          let patches = try? JSONSerialization.jsonObject(with: Data(patchesJSON.utf8)) as? [String: [String: Any]] else { return [:] }
    var result: [NumaSampleState: NumaSnapshot] = [:]
    for state in NumaSampleState.allCases {
      var payload = base
      if let patch = patches[state.rawValue] {
        if let replacement = patch["replace"] as? [String: Any] { payload = replacement }
        if let changes = patch["set"] as? [String: Any] { payload.merge(changes) { _, new in new } }
        for key in patch["remove"] as? [String] ?? [] { payload.removeValue(forKey: key) }
      }
      if let data = try? JSONSerialization.data(withJSONObject: payload), let snapshot = NumaSnapshot.decode(data) { result[state] = snapshot }
    }
    return result
  }()

  private static let baseJSON = #"""
{
  "version": 2,
  "privacy": "visible",
  "net": "−€260",
  "today": "+€8.40 quote change today",
  "up": true,
  "line": [],
  "updatedAt": 1792584000000,
  "syncedAt": 1792584000000,
  "freshness": {
    "sourceAsOf": 1792583880000,
    "quotesAsOf": 1792583880000,
    "quotes": "current",
    "stale": false,
    "fxAsOf": "2026-10-21",
    "fxRequired": true
  },
  "netWorth": {
    "state": "ready",
    "value": {
      "text": "−€260",
      "compact": "−€260",
      "exact": "−€260.00"
    },
    "daily": {
      "text": "+€8.40 quote change today",
      "direction": "up",
      "asOf": 1792583880000,
      "amount": "+€8.40",
      "period": "quoteChange",
      "currency": "EUR",
      "fxAsOf": "2026-10-21"
    },
    "trend": {
      "points": [
        {
          "t": 1790856000000,
          "y": 0
        },
        {
          "t": 1791201600000,
          "y": 1
        },
        {
          "t": 1792497600000,
          "y": 0.5
        }
      ],
      "range": "Saved observations · 30 days",
      "from": "1 Oct",
      "to": "20 Oct",
      "low": "€100",
      "high": "€110"
    }
  },
  "moneyMap": {
    "state": "ready",
    "toYou": {
      "text": "€80",
      "compact": "€80",
      "exact": "€80.00"
    },
    "youOwe": {
      "text": "€900",
      "compact": "€900",
      "exact": "€900.00"
    },
    "toFraction": 0.08888888888888889,
    "oweFraction": 1
  },
  "spending": {
    "state": "ready",
    "month": "October",
    "monthKey": "2026-10",
    "validUntil": 1792627200000,
    "total": {
      "text": "€36",
      "compact": "€36",
      "exact": "€36.00"
    },
    "lead": 3,
    "days": [
      {
        "key": "2026-10-01",
        "day": 1,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "1 October: no spending"
      },
      {
        "key": "2026-10-02",
        "day": 2,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "2 October: no spending"
      },
      {
        "key": "2026-10-03",
        "day": 3,
        "level": 4,
        "future": false,
        "unknown": false,
        "description": "3 October: €32.00 spent"
      },
      {
        "key": "2026-10-04",
        "day": 4,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "4 October: no spending"
      },
      {
        "key": "2026-10-05",
        "day": 5,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "5 October: no spending"
      },
      {
        "key": "2026-10-06",
        "day": 6,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "6 October: no spending"
      },
      {
        "key": "2026-10-07",
        "day": 7,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "7 October: no spending"
      },
      {
        "key": "2026-10-08",
        "day": 8,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "8 October: no spending"
      },
      {
        "key": "2026-10-09",
        "day": 9,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "9 October: no spending"
      },
      {
        "key": "2026-10-10",
        "day": 10,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "10 October: no spending"
      },
      {
        "key": "2026-10-11",
        "day": 11,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "11 October: no spending"
      },
      {
        "key": "2026-10-12",
        "day": 12,
        "level": 2,
        "future": false,
        "unknown": false,
        "description": "12 October: €4.00 spent"
      },
      {
        "key": "2026-10-13",
        "day": 13,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "13 October: no spending"
      },
      {
        "key": "2026-10-14",
        "day": 14,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "14 October: no spending"
      },
      {
        "key": "2026-10-15",
        "day": 15,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "15 October: no spending"
      },
      {
        "key": "2026-10-16",
        "day": 16,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "16 October: no spending"
      },
      {
        "key": "2026-10-17",
        "day": 17,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "17 October: no spending"
      },
      {
        "key": "2026-10-18",
        "day": 18,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "18 October: no spending"
      },
      {
        "key": "2026-10-19",
        "day": 19,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "19 October: no spending"
      },
      {
        "key": "2026-10-20",
        "day": 20,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "20 October: no spending"
      },
      {
        "key": "2026-10-21",
        "day": 21,
        "level": 0,
        "future": false,
        "unknown": false,
        "description": "21 October: no spending"
      },
      {
        "key": "2026-10-22",
        "day": 22,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "22 October: future date"
      },
      {
        "key": "2026-10-23",
        "day": 23,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "23 October: future date"
      },
      {
        "key": "2026-10-24",
        "day": 24,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "24 October: future date"
      },
      {
        "key": "2026-10-25",
        "day": 25,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "25 October: future date"
      },
      {
        "key": "2026-10-26",
        "day": 26,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "26 October: future date"
      },
      {
        "key": "2026-10-27",
        "day": 27,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "27 October: future date"
      },
      {
        "key": "2026-10-28",
        "day": 28,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "28 October: future date"
      },
      {
        "key": "2026-10-29",
        "day": 29,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "29 October: future date"
      },
      {
        "key": "2026-10-30",
        "day": 30,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "30 October: future date"
      },
      {
        "key": "2026-10-31",
        "day": 31,
        "level": 0,
        "future": true,
        "unknown": false,
        "description": "31 October: future date"
      }
    ]
  },
  "blocks": {
    "state": "ready",
    "own": {
      "text": "€640",
      "compact": "€640",
      "exact": "€640.00"
    },
    "owe": {
      "text": "€900",
      "compact": "€900",
      "exact": "€900.00"
    },
    "net": {
      "text": "−€260",
      "compact": "−€260",
      "exact": "−€260.00"
    },
    "ownFraction": 0.7111111111111111,
    "oweFraction": 1,
    "categories": [
      {
        "key": "crypto",
        "name": "Crypto",
        "value": {
          "text": "€40",
          "compact": "€40",
          "exact": "€40.00"
        },
        "fraction": 0.0625,
        "percent": "6%"
      },
      {
        "key": "stocks",
        "name": "Stocks",
        "value": {
          "text": "€100",
          "compact": "€100",
          "exact": "€100.00"
        },
        "fraction": 0.15625,
        "percent": "16%"
      },
      {
        "key": "business",
        "name": "Business",
        "value": {
          "text": "€60",
          "compact": "€60",
          "exact": "€60.00"
        },
        "fraction": 0.09375,
        "percent": "9%"
      },
      {
        "key": "property",
        "name": "Property",
        "value": {
          "text": "€120",
          "compact": "€120",
          "exact": "€120.00"
        },
        "fraction": 0.1875,
        "percent": "19%"
      },
      {
        "key": "cash",
        "name": "Cash",
        "value": {
          "text": "€200",
          "compact": "€200",
          "exact": "€200.00"
        },
        "fraction": 0.3125,
        "percent": "31%"
      },
      {
        "key": "things",
        "name": "Things",
        "value": {
          "text": "€120",
          "compact": "€120",
          "exact": "€120.00"
        },
        "fraction": 0.1875,
        "percent": "19%"
      }
    ]
  }
}
"""#

  private static let patchesJSON = #"""
{
  "empty": {
    "set": {
      "net": "€0",
      "today": "No market prices today",
      "freshness": {
        "sourceAsOf": null,
        "quotesAsOf": null,
        "quotes": "none",
        "stale": false,
        "fxAsOf": "2026-10-21"
      },
      "netWorth": {
        "state": "empty",
        "value": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "message": "No assets or debts recorded",
        "daily": {
          "text": "No market prices today",
          "direction": "unknown",
          "asOf": null
        },
        "historyMessage": "A trend needs 3 dated observations in 30 days."
      },
      "moneyMap": {
        "state": "empty",
        "message": "No lending or borrowing recorded",
        "toYou": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "youOwe": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "toFraction": 0,
        "oweFraction": 0
      },
      "spending": {
        "state": "empty",
        "month": "October",
        "monthKey": "2026-10",
        "validUntil": 1792627200000,
        "total": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "lead": 3,
        "days": [
          {
            "key": "2026-10-01",
            "day": 1,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "1 October: no spending"
          },
          {
            "key": "2026-10-02",
            "day": 2,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "2 October: no spending"
          },
          {
            "key": "2026-10-03",
            "day": 3,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "3 October: no spending"
          },
          {
            "key": "2026-10-04",
            "day": 4,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "4 October: no spending"
          },
          {
            "key": "2026-10-05",
            "day": 5,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "5 October: no spending"
          },
          {
            "key": "2026-10-06",
            "day": 6,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "6 October: no spending"
          },
          {
            "key": "2026-10-07",
            "day": 7,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "7 October: no spending"
          },
          {
            "key": "2026-10-08",
            "day": 8,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "8 October: no spending"
          },
          {
            "key": "2026-10-09",
            "day": 9,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "9 October: no spending"
          },
          {
            "key": "2026-10-10",
            "day": 10,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "10 October: no spending"
          },
          {
            "key": "2026-10-11",
            "day": 11,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "11 October: no spending"
          },
          {
            "key": "2026-10-12",
            "day": 12,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "12 October: no spending"
          },
          {
            "key": "2026-10-13",
            "day": 13,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "13 October: no spending"
          },
          {
            "key": "2026-10-14",
            "day": 14,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "14 October: no spending"
          },
          {
            "key": "2026-10-15",
            "day": 15,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "15 October: no spending"
          },
          {
            "key": "2026-10-16",
            "day": 16,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "16 October: no spending"
          },
          {
            "key": "2026-10-17",
            "day": 17,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "17 October: no spending"
          },
          {
            "key": "2026-10-18",
            "day": 18,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "18 October: no spending"
          },
          {
            "key": "2026-10-19",
            "day": 19,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "19 October: no spending"
          },
          {
            "key": "2026-10-20",
            "day": 20,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "20 October: no spending"
          },
          {
            "key": "2026-10-21",
            "day": 21,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "21 October: no spending"
          },
          {
            "key": "2026-10-22",
            "day": 22,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "22 October: future date"
          },
          {
            "key": "2026-10-23",
            "day": 23,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "23 October: future date"
          },
          {
            "key": "2026-10-24",
            "day": 24,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "24 October: future date"
          },
          {
            "key": "2026-10-25",
            "day": 25,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "25 October: future date"
          },
          {
            "key": "2026-10-26",
            "day": 26,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "26 October: future date"
          },
          {
            "key": "2026-10-27",
            "day": 27,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "27 October: future date"
          },
          {
            "key": "2026-10-28",
            "day": 28,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "28 October: future date"
          },
          {
            "key": "2026-10-29",
            "day": 29,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "29 October: future date"
          },
          {
            "key": "2026-10-30",
            "day": 30,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "30 October: future date"
          },
          {
            "key": "2026-10-31",
            "day": 31,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "31 October: future date"
          }
        ],
        "message": "No spending logged this month"
      },
      "blocks": {
        "state": "empty",
        "message": "No assets or debts recorded",
        "own": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "owe": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "net": {
          "text": "€0",
          "compact": "€0",
          "exact": "€0.00"
        },
        "ownFraction": 0,
        "oweFraction": 0,
        "categories": []
      }
    },
    "remove": []
  },
  "calendarLeapYear": {
    "set": {
      "updatedAt": 1834228800000,
      "syncedAt": 1834228800000,
      "freshness": {
        "sourceAsOf": 1834228680000,
        "quotesAsOf": 1834228680000,
        "quotes": "current",
        "stale": false,
        "fxAsOf": "2028-02-15",
        "fxRequired": true
      },
      "netWorth": {
        "state": "ready",
        "value": {
          "text": "−€260",
          "compact": "−€260",
          "exact": "−€260.00"
        },
        "daily": {
          "text": "+€8.40 quote change today",
          "direction": "up",
          "asOf": 1834228680000,
          "amount": "+€8.40",
          "period": "quoteChange",
          "currency": "EUR",
          "fxAsOf": "2028-02-15"
        },
        "trend": {
          "points": [
            {
              "t": 1833019200000,
              "y": 0
            },
            {
              "t": 1833364800000,
              "y": 1
            },
            {
              "t": 1834142400000,
              "y": 0.5
            }
          ],
          "range": "Saved observations · 30 days",
          "from": "1 Feb",
          "to": "14 Feb",
          "low": "€100",
          "high": "€110"
        }
      },
      "spending": {
        "state": "ready",
        "month": "February",
        "monthKey": "2028-02",
        "validUntil": 1834272000000,
        "total": {
          "text": "€36",
          "compact": "€36",
          "exact": "€36.00"
        },
        "lead": 1,
        "days": [
          {
            "key": "2028-02-01",
            "day": 1,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "1 February: no spending"
          },
          {
            "key": "2028-02-02",
            "day": 2,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "2 February: no spending"
          },
          {
            "key": "2028-02-03",
            "day": 3,
            "level": 4,
            "future": false,
            "unknown": false,
            "description": "3 February: €32.00 spent"
          },
          {
            "key": "2028-02-04",
            "day": 4,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "4 February: no spending"
          },
          {
            "key": "2028-02-05",
            "day": 5,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "5 February: no spending"
          },
          {
            "key": "2028-02-06",
            "day": 6,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "6 February: no spending"
          },
          {
            "key": "2028-02-07",
            "day": 7,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "7 February: no spending"
          },
          {
            "key": "2028-02-08",
            "day": 8,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "8 February: no spending"
          },
          {
            "key": "2028-02-09",
            "day": 9,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "9 February: no spending"
          },
          {
            "key": "2028-02-10",
            "day": 10,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "10 February: no spending"
          },
          {
            "key": "2028-02-11",
            "day": 11,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "11 February: no spending"
          },
          {
            "key": "2028-02-12",
            "day": 12,
            "level": 2,
            "future": false,
            "unknown": false,
            "description": "12 February: €4.00 spent"
          },
          {
            "key": "2028-02-13",
            "day": 13,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "13 February: no spending"
          },
          {
            "key": "2028-02-14",
            "day": 14,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "14 February: no spending"
          },
          {
            "key": "2028-02-15",
            "day": 15,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "15 February: no spending"
          },
          {
            "key": "2028-02-16",
            "day": 16,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "16 February: future date"
          },
          {
            "key": "2028-02-17",
            "day": 17,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "17 February: future date"
          },
          {
            "key": "2028-02-18",
            "day": 18,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "18 February: future date"
          },
          {
            "key": "2028-02-19",
            "day": 19,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "19 February: future date"
          },
          {
            "key": "2028-02-20",
            "day": 20,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "20 February: future date"
          },
          {
            "key": "2028-02-21",
            "day": 21,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "21 February: future date"
          },
          {
            "key": "2028-02-22",
            "day": 22,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "22 February: future date"
          },
          {
            "key": "2028-02-23",
            "day": 23,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "23 February: future date"
          },
          {
            "key": "2028-02-24",
            "day": 24,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "24 February: future date"
          },
          {
            "key": "2028-02-25",
            "day": 25,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "25 February: future date"
          },
          {
            "key": "2028-02-26",
            "day": 26,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "26 February: future date"
          },
          {
            "key": "2028-02-27",
            "day": 27,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "27 February: future date"
          },
          {
            "key": "2028-02-28",
            "day": 28,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "28 February: future date"
          },
          {
            "key": "2028-02-29",
            "day": 29,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "29 February: future date"
          }
        ]
      }
    },
    "remove": []
  },
  "hidden": {
    "set": {
      "privacy": "hidden",
      "net": "••••",
      "today": "",
      "netWorth": {
        "state": "hidden"
      },
      "moneyMap": {
        "state": "hidden"
      },
      "spending": {
        "state": "hidden"
      },
      "blocks": {
        "state": "hidden"
      }
    },
    "remove": [
      "freshness"
    ]
  },
  "stale": {
    "set": {
      "today": "Quote change unavailable",
      "updatedAt": 1792324800000,
      "syncedAt": 1792324800000,
      "freshness": {
        "sourceAsOf": 1792324800000,
        "quotesAsOf": 1792324800000,
        "quotes": "stale",
        "stale": true,
        "fxAsOf": "2026-10-21"
      },
      "netWorth": {
        "state": "ready",
        "value": {
          "text": "−€260",
          "compact": "−€260",
          "exact": "−€260.00"
        },
        "daily": {
          "text": "Quote change unavailable",
          "direction": "unknown",
          "asOf": null
        },
        "trend": {
          "points": [
            {
              "t": 1790856000000,
              "y": 0
            },
            {
              "t": 1791201600000,
              "y": 1
            },
            {
              "t": 1792238400000,
              "y": 0.5
            }
          ],
          "range": "Saved observations · 30 days",
          "from": "1 Oct",
          "to": "17 Oct",
          "low": "€100",
          "high": "€110"
        }
      },
      "spending": {
        "state": "ready",
        "month": "October",
        "monthKey": "2026-10",
        "validUntil": 1792368000000,
        "total": {
          "text": "€36",
          "compact": "€36",
          "exact": "€36.00"
        },
        "lead": 3,
        "days": [
          {
            "key": "2026-10-01",
            "day": 1,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "1 October: no spending"
          },
          {
            "key": "2026-10-02",
            "day": 2,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "2 October: no spending"
          },
          {
            "key": "2026-10-03",
            "day": 3,
            "level": 4,
            "future": false,
            "unknown": false,
            "description": "3 October: €32.00 spent"
          },
          {
            "key": "2026-10-04",
            "day": 4,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "4 October: no spending"
          },
          {
            "key": "2026-10-05",
            "day": 5,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "5 October: no spending"
          },
          {
            "key": "2026-10-06",
            "day": 6,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "6 October: no spending"
          },
          {
            "key": "2026-10-07",
            "day": 7,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "7 October: no spending"
          },
          {
            "key": "2026-10-08",
            "day": 8,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "8 October: no spending"
          },
          {
            "key": "2026-10-09",
            "day": 9,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "9 October: no spending"
          },
          {
            "key": "2026-10-10",
            "day": 10,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "10 October: no spending"
          },
          {
            "key": "2026-10-11",
            "day": 11,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "11 October: no spending"
          },
          {
            "key": "2026-10-12",
            "day": 12,
            "level": 2,
            "future": false,
            "unknown": false,
            "description": "12 October: €4.00 spent"
          },
          {
            "key": "2026-10-13",
            "day": 13,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "13 October: no spending"
          },
          {
            "key": "2026-10-14",
            "day": 14,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "14 October: no spending"
          },
          {
            "key": "2026-10-15",
            "day": 15,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "15 October: no spending"
          },
          {
            "key": "2026-10-16",
            "day": 16,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "16 October: no spending"
          },
          {
            "key": "2026-10-17",
            "day": 17,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "17 October: no spending"
          },
          {
            "key": "2026-10-18",
            "day": 18,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "18 October: no spending"
          },
          {
            "key": "2026-10-19",
            "day": 19,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "19 October: no spending"
          },
          {
            "key": "2026-10-20",
            "day": 20,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "20 October: no spending"
          },
          {
            "key": "2026-10-21",
            "day": 21,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "21 October: no spending"
          },
          {
            "key": "2026-10-22",
            "day": 22,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "22 October: future date"
          },
          {
            "key": "2026-10-23",
            "day": 23,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "23 October: future date"
          },
          {
            "key": "2026-10-24",
            "day": 24,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "24 October: future date"
          },
          {
            "key": "2026-10-25",
            "day": 25,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "25 October: future date"
          },
          {
            "key": "2026-10-26",
            "day": 26,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "26 October: future date"
          },
          {
            "key": "2026-10-27",
            "day": 27,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "27 October: future date"
          },
          {
            "key": "2026-10-28",
            "day": 28,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "28 October: future date"
          },
          {
            "key": "2026-10-29",
            "day": 29,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "29 October: future date"
          },
          {
            "key": "2026-10-30",
            "day": 30,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "30 October: future date"
          },
          {
            "key": "2026-10-31",
            "day": 31,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "31 October: future date"
          }
        ]
      }
    },
    "remove": []
  },
  "calendarSixRows": {
    "set": {
      "updatedAt": 1773576000000,
      "syncedAt": 1773576000000,
      "freshness": {
        "sourceAsOf": 1773575880000,
        "quotesAsOf": 1773575880000,
        "quotes": "current",
        "stale": false,
        "fxAsOf": "2026-03-15",
        "fxRequired": true
      },
      "netWorth": {
        "state": "ready",
        "value": {
          "text": "−€260",
          "compact": "−€260",
          "exact": "−€260.00"
        },
        "daily": {
          "text": "+€8.40 quote change today",
          "direction": "up",
          "asOf": 1773575880000,
          "amount": "+€8.40",
          "period": "quoteChange",
          "currency": "EUR",
          "fxAsOf": "2026-03-15"
        },
        "trend": {
          "points": [
            {
              "t": 1772366400000,
              "y": 0
            },
            {
              "t": 1772712000000,
              "y": 1
            },
            {
              "t": 1773489600000,
              "y": 0.5
            }
          ],
          "range": "Saved observations · 30 days",
          "from": "1 Mar",
          "to": "14 Mar",
          "low": "€100",
          "high": "€110"
        }
      },
      "spending": {
        "state": "ready",
        "month": "March",
        "monthKey": "2026-03",
        "validUntil": 1773619200000,
        "total": {
          "text": "€36",
          "compact": "€36",
          "exact": "€36.00"
        },
        "lead": 6,
        "days": [
          {
            "key": "2026-03-01",
            "day": 1,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "1 March: no spending"
          },
          {
            "key": "2026-03-02",
            "day": 2,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "2 March: no spending"
          },
          {
            "key": "2026-03-03",
            "day": 3,
            "level": 4,
            "future": false,
            "unknown": false,
            "description": "3 March: €32.00 spent"
          },
          {
            "key": "2026-03-04",
            "day": 4,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "4 March: no spending"
          },
          {
            "key": "2026-03-05",
            "day": 5,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "5 March: no spending"
          },
          {
            "key": "2026-03-06",
            "day": 6,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "6 March: no spending"
          },
          {
            "key": "2026-03-07",
            "day": 7,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "7 March: no spending"
          },
          {
            "key": "2026-03-08",
            "day": 8,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "8 March: no spending"
          },
          {
            "key": "2026-03-09",
            "day": 9,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "9 March: no spending"
          },
          {
            "key": "2026-03-10",
            "day": 10,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "10 March: no spending"
          },
          {
            "key": "2026-03-11",
            "day": 11,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "11 March: no spending"
          },
          {
            "key": "2026-03-12",
            "day": 12,
            "level": 2,
            "future": false,
            "unknown": false,
            "description": "12 March: €4.00 spent"
          },
          {
            "key": "2026-03-13",
            "day": 13,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "13 March: no spending"
          },
          {
            "key": "2026-03-14",
            "day": 14,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "14 March: no spending"
          },
          {
            "key": "2026-03-15",
            "day": 15,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "15 March: no spending"
          },
          {
            "key": "2026-03-16",
            "day": 16,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "16 March: future date"
          },
          {
            "key": "2026-03-17",
            "day": 17,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "17 March: future date"
          },
          {
            "key": "2026-03-18",
            "day": 18,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "18 March: future date"
          },
          {
            "key": "2026-03-19",
            "day": 19,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "19 March: future date"
          },
          {
            "key": "2026-03-20",
            "day": 20,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "20 March: future date"
          },
          {
            "key": "2026-03-21",
            "day": 21,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "21 March: future date"
          },
          {
            "key": "2026-03-22",
            "day": 22,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "22 March: future date"
          },
          {
            "key": "2026-03-23",
            "day": 23,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "23 March: future date"
          },
          {
            "key": "2026-03-24",
            "day": 24,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "24 March: future date"
          },
          {
            "key": "2026-03-25",
            "day": 25,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "25 March: future date"
          },
          {
            "key": "2026-03-26",
            "day": 26,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "26 March: future date"
          },
          {
            "key": "2026-03-27",
            "day": 27,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "27 March: future date"
          },
          {
            "key": "2026-03-28",
            "day": 28,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "28 March: future date"
          },
          {
            "key": "2026-03-29",
            "day": 29,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "29 March: future date"
          },
          {
            "key": "2026-03-30",
            "day": 30,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "30 March: future date"
          },
          {
            "key": "2026-03-31",
            "day": 31,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "31 March: future date"
          }
        ]
      }
    },
    "remove": []
  },
  "sparse": {
    "set": {
      "netWorth": {
        "state": "ready",
        "value": {
          "text": "−€260",
          "compact": "−€260",
          "exact": "−€260.00"
        },
        "daily": {
          "text": "+€8.40 quote change today",
          "direction": "up",
          "asOf": 1792583880000,
          "amount": "+€8.40",
          "period": "quoteChange",
          "currency": "EUR",
          "fxAsOf": "2026-10-21"
        },
        "historyMessage": "Not enough saved history. A trend needs 3 dated observations in 30 days."
      }
    },
    "remove": []
  },
  "legacy": {
    "set": {
      "net": "€740",
      "today": "+€8 today",
      "line": [
        0,
        1
      ]
    },
    "remove": [
      "version",
      "privacy",
      "syncedAt",
      "freshness",
      "netWorth",
      "moneyMap",
      "spending",
      "blocks"
    ]
  },
  "largeValues": {
    "set": {
      "net": "−€10,000,000,000,000",
      "netWorth": {
        "state": "ready",
        "value": {
          "text": "−€10,000,000,000,000",
          "compact": "−€10T",
          "exact": "−€10,000,000,000,000.00"
        },
        "daily": {
          "text": "+€8.40 quote change today",
          "direction": "up",
          "asOf": 1792583880000,
          "amount": "+€8.40",
          "period": "quoteChange",
          "currency": "EUR",
          "fxAsOf": "2026-10-21"
        },
        "trend": {
          "points": [
            {
              "t": 1790856000000,
              "y": 0
            },
            {
              "t": 1791201600000,
              "y": 1
            },
            {
              "t": 1792497600000,
              "y": 0.5
            }
          ],
          "range": "Saved observations · 30 days",
          "from": "1 Oct",
          "to": "20 Oct",
          "low": "€100",
          "high": "€110"
        }
      },
      "moneyMap": {
        "state": "ready",
        "toYou": {
          "text": "€20,000,000,000,000",
          "compact": "€20T",
          "exact": "€20,000,000,000,000.00"
        },
        "youOwe": {
          "text": "€90,000,000,000,000",
          "compact": "€90T",
          "exact": "€90,000,000,000,000.00"
        },
        "toFraction": 0.2222222222222222,
        "oweFraction": 1
      },
      "spending": {
        "state": "ready",
        "month": "October",
        "monthKey": "2026-10",
        "validUntil": 1792627200000,
        "total": {
          "text": "€128,000,000",
          "compact": "€128M",
          "exact": "€128,000,000.00"
        },
        "lead": 3,
        "days": [
          {
            "key": "2026-10-01",
            "day": 1,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "1 October: no spending"
          },
          {
            "key": "2026-10-02",
            "day": 2,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "2 October: no spending"
          },
          {
            "key": "2026-10-03",
            "day": 3,
            "level": 4,
            "future": false,
            "unknown": false,
            "description": "3 October: €112,000,000.00 spent"
          },
          {
            "key": "2026-10-04",
            "day": 4,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "4 October: no spending"
          },
          {
            "key": "2026-10-05",
            "day": 5,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "5 October: no spending"
          },
          {
            "key": "2026-10-06",
            "day": 6,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "6 October: no spending"
          },
          {
            "key": "2026-10-07",
            "day": 7,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "7 October: no spending"
          },
          {
            "key": "2026-10-08",
            "day": 8,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "8 October: no spending"
          },
          {
            "key": "2026-10-09",
            "day": 9,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "9 October: no spending"
          },
          {
            "key": "2026-10-10",
            "day": 10,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "10 October: no spending"
          },
          {
            "key": "2026-10-11",
            "day": 11,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "11 October: no spending"
          },
          {
            "key": "2026-10-12",
            "day": 12,
            "level": 2,
            "future": false,
            "unknown": false,
            "description": "12 October: €16,000,000.00 spent"
          },
          {
            "key": "2026-10-13",
            "day": 13,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "13 October: no spending"
          },
          {
            "key": "2026-10-14",
            "day": 14,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "14 October: no spending"
          },
          {
            "key": "2026-10-15",
            "day": 15,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "15 October: no spending"
          },
          {
            "key": "2026-10-16",
            "day": 16,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "16 October: no spending"
          },
          {
            "key": "2026-10-17",
            "day": 17,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "17 October: no spending"
          },
          {
            "key": "2026-10-18",
            "day": 18,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "18 October: no spending"
          },
          {
            "key": "2026-10-19",
            "day": 19,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "19 October: no spending"
          },
          {
            "key": "2026-10-20",
            "day": 20,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "20 October: no spending"
          },
          {
            "key": "2026-10-21",
            "day": 21,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "21 October: no spending"
          },
          {
            "key": "2026-10-22",
            "day": 22,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "22 October: future date"
          },
          {
            "key": "2026-10-23",
            "day": 23,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "23 October: future date"
          },
          {
            "key": "2026-10-24",
            "day": 24,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "24 October: future date"
          },
          {
            "key": "2026-10-25",
            "day": 25,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "25 October: future date"
          },
          {
            "key": "2026-10-26",
            "day": 26,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "26 October: future date"
          },
          {
            "key": "2026-10-27",
            "day": 27,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "27 October: future date"
          },
          {
            "key": "2026-10-28",
            "day": 28,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "28 October: future date"
          },
          {
            "key": "2026-10-29",
            "day": 29,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "29 October: future date"
          },
          {
            "key": "2026-10-30",
            "day": 30,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "30 October: future date"
          },
          {
            "key": "2026-10-31",
            "day": 31,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "31 October: future date"
          }
        ]
      },
      "blocks": {
        "state": "ready",
        "own": {
          "text": "€80,000,000,000,000",
          "compact": "€80T",
          "exact": "€80,000,000,000,000.00"
        },
        "owe": {
          "text": "€90,000,000,000,000",
          "compact": "€90T",
          "exact": "€90,000,000,000,000.00"
        },
        "net": {
          "text": "−€10,000,000,000,000",
          "compact": "−€10T",
          "exact": "−€10,000,000,000,000.00"
        },
        "ownFraction": 0.8888888888888888,
        "oweFraction": 1,
        "categories": [
          {
            "key": "crypto",
            "name": "Crypto",
            "value": {
              "text": "€79,999,999,999,999",
              "compact": "€80T",
              "exact": "€79,999,999,999,999.95"
            },
            "fraction": 0.9999999999999993,
            "percent": "100%"
          },
          {
            "key": "stocks",
            "name": "Stocks",
            "value": {
              "text": "€0",
              "compact": "€0",
              "exact": "€0.01"
            },
            "fraction": 1.25e-16,
            "percent": "<1%"
          },
          {
            "key": "business",
            "name": "Business",
            "value": {
              "text": "€0",
              "compact": "€0",
              "exact": "€0.01"
            },
            "fraction": 1.25e-16,
            "percent": "<1%"
          },
          {
            "key": "property",
            "name": "Property",
            "value": {
              "text": "€0",
              "compact": "€0",
              "exact": "€0.01"
            },
            "fraction": 1.25e-16,
            "percent": "<1%"
          },
          {
            "key": "cash",
            "name": "Cash",
            "value": {
              "text": "€0",
              "compact": "€0",
              "exact": "€0.01"
            },
            "fraction": 1.25e-16,
            "percent": "<1%"
          },
          {
            "key": "things",
            "name": "Things",
            "value": {
              "text": "€0",
              "compact": "€0",
              "exact": "€0.01"
            },
            "fraction": 1.25e-16,
            "percent": "<1%"
          }
        ]
      }
    },
    "remove": []
  },
  "partial": {
    "set": {
      "net": "—",
      "today": "Some values or exchange rates are unavailable",
      "freshness": {
        "sourceAsOf": 1792583880000,
        "quotesAsOf": 1792583880000,
        "quotes": "partial",
        "stale": true,
        "fxAsOf": "2026-10-21"
      },
      "netWorth": {
        "state": "unavailable",
        "message": "Some values or exchange rates are unavailable"
      },
      "moneyMap": {
        "state": "partial",
        "toYou": {
          "text": "€80",
          "compact": "€80",
          "exact": "€80.00"
        },
        "youOwe": {
          "text": "€900",
          "compact": "€900",
          "exact": "€900.00"
        },
        "toFraction": 0.08888888888888889,
        "oweFraction": 1,
        "message": "Partial · unvalued records left out"
      },
      "spending": {
        "state": "partial",
        "month": "October",
        "monthKey": "2026-10",
        "validUntil": 1792627200000,
        "total": {
          "text": "€36",
          "compact": "€36",
          "exact": "€36.00"
        },
        "lead": 3,
        "days": [
          {
            "key": "2026-10-01",
            "day": 1,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "1 October: no spending"
          },
          {
            "key": "2026-10-02",
            "day": 2,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "2 October: no spending"
          },
          {
            "key": "2026-10-03",
            "day": 3,
            "level": 4,
            "future": false,
            "unknown": true,
            "description": "3 October: €32.00 known spending, unconverted spending also present"
          },
          {
            "key": "2026-10-04",
            "day": 4,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "4 October: no spending"
          },
          {
            "key": "2026-10-05",
            "day": 5,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "5 October: no spending"
          },
          {
            "key": "2026-10-06",
            "day": 6,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "6 October: no spending"
          },
          {
            "key": "2026-10-07",
            "day": 7,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "7 October: no spending"
          },
          {
            "key": "2026-10-08",
            "day": 8,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "8 October: no spending"
          },
          {
            "key": "2026-10-09",
            "day": 9,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "9 October: no spending"
          },
          {
            "key": "2026-10-10",
            "day": 10,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "10 October: no spending"
          },
          {
            "key": "2026-10-11",
            "day": 11,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "11 October: no spending"
          },
          {
            "key": "2026-10-12",
            "day": 12,
            "level": 2,
            "future": false,
            "unknown": false,
            "description": "12 October: €4.00 spent"
          },
          {
            "key": "2026-10-13",
            "day": 13,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "13 October: no spending"
          },
          {
            "key": "2026-10-14",
            "day": 14,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "14 October: no spending"
          },
          {
            "key": "2026-10-15",
            "day": 15,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "15 October: no spending"
          },
          {
            "key": "2026-10-16",
            "day": 16,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "16 October: no spending"
          },
          {
            "key": "2026-10-17",
            "day": 17,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "17 October: no spending"
          },
          {
            "key": "2026-10-18",
            "day": 18,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "18 October: no spending"
          },
          {
            "key": "2026-10-19",
            "day": 19,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "19 October: no spending"
          },
          {
            "key": "2026-10-20",
            "day": 20,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "20 October: no spending"
          },
          {
            "key": "2026-10-21",
            "day": 21,
            "level": 0,
            "future": false,
            "unknown": false,
            "description": "21 October: no spending"
          },
          {
            "key": "2026-10-22",
            "day": 22,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "22 October: future date"
          },
          {
            "key": "2026-10-23",
            "day": 23,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "23 October: future date"
          },
          {
            "key": "2026-10-24",
            "day": 24,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "24 October: future date"
          },
          {
            "key": "2026-10-25",
            "day": 25,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "25 October: future date"
          },
          {
            "key": "2026-10-26",
            "day": 26,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "26 October: future date"
          },
          {
            "key": "2026-10-27",
            "day": 27,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "27 October: future date"
          },
          {
            "key": "2026-10-28",
            "day": 28,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "28 October: future date"
          },
          {
            "key": "2026-10-29",
            "day": 29,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "29 October: future date"
          },
          {
            "key": "2026-10-30",
            "day": 30,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "30 October: future date"
          },
          {
            "key": "2026-10-31",
            "day": 31,
            "level": 0,
            "future": true,
            "unknown": false,
            "description": "31 October: future date"
          }
        ],
        "message": "Partial total · ? needs exchange rates"
      },
      "blocks": {
        "state": "unavailable",
        "message": "Some values or exchange rates are unavailable"
      }
    },
    "remove": []
  },
  "unavailable": {
    "set": {
      "net": "—",
      "today": "Values unavailable",
      "netWorth": {
        "state": "unavailable",
        "message": "Some values or exchange rates are unavailable"
      },
      "moneyMap": {
        "state": "unavailable",
        "message": "Some values or exchange rates are unavailable"
      },
      "spending": {
        "state": "unavailable",
        "message": "Some values or exchange rates are unavailable"
      },
      "blocks": {
        "state": "unavailable",
        "message": "Some values or exchange rates are unavailable"
      }
    },
    "remove": [
      "freshness"
    ]
  }
}
"""#
}
