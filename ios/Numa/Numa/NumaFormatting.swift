import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

func formatNumaMoney(_ amount: Double, _ currency: CurrencyCode) -> String {
  let formatter = NumberFormatter()
  formatter.numberStyle = .currency
  formatter.currencyCode = currency
  formatter.maximumFractionDigits = 2
  return formatter.string(from: NSNumber(value: amount)) ?? "\(amount) \(currency)"
}

func dateString(_ millis: Double) -> String {
  let formatter = DateFormatter()
  formatter.dateStyle = .medium
  formatter.timeStyle = .none
  return formatter.string(from: Date(timeIntervalSince1970: millis / 1000))
}

extension ISO8601DateFormatter {
  static func numaDayFormatter() -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    return formatter
  }
}
