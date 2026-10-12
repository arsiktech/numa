import AuthenticationServices
import Combine
@preconcurrency import ConvexMobile
import Foundation
import Observation
import PhotosUI
import Security
import SwiftUI
import UIKit

@MainActor
enum NumaCaptureClient {
  private enum Limits {
    static let message = 4_000
    static let receiptText = 4_000
    static let receiptContextList = 100
    static let contextID = 128
    static let contextName = 100
    static let contextDescription = 200
    static let contextShort = 40
    static let contextCode = 16
    static let recentTransactions = 80
    static let imageDataURL = 6_000_000
    static let imageDimension: CGFloat = 1_280
  }

  static func ask(
    _ prompt: String,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?,
    authorization: NumaAPIRequestLease,
    tokenProvider: (NumaAPIRequestLease) async throws -> NumaAPIBearer
  ) async throws -> String {
    guard let snapshot else { throw NumaAuthError.invalidResponse }
    guard let url = URL(string: "\(NumaConfig.current.webAppURL)/api/chat") else {
      throw NumaAuthError.invalidResponse
    }
    let (data, response) = try await sendAuthorized(
      url: url,
      body: try makeChatBody(prompt: prompt, snapshot: snapshot, locale: locale),
      authorization: authorization,
      tokenProvider: tokenProvider
    )
    guard (200..<300).contains(response.statusCode) else {
      let message = String(data: data, encoding: .utf8) ?? "Numa Pro failed"
      throw NSError(domain: "NumaAI", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    return String(data: data, encoding: .utf8) ?? ""
  }

  static func parseText(
    _ text: String,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?,
    authorization: NumaAPIRequestLease,
    tokenProvider: (NumaAPIRequestLease) async throws -> NumaAPIBearer
  ) async throws -> CaptureParseResponse {
    try await parse(
      body: try makeReceiptTextBody(text: text, snapshot: snapshot, locale: locale),
      authorization: authorization,
      tokenProvider: tokenProvider
    )
  }

  static func parseImage(
    _ imageData: Data,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?,
    authorization: NumaAPIRequestLease,
    tokenProvider: (NumaAPIRequestLease) async throws -> NumaAPIBearer
  ) async throws -> CaptureParseResponse {
    try await parse(
      body: try makeReceiptImageBody(
        imageData: imageData,
        snapshot: snapshot,
        locale: locale
      ),
      authorization: authorization,
      tokenProvider: tokenProvider
    )
  }

  static func makeChatBody(
    prompt: String,
    snapshot: MobilePortfolioSnapshot,
    locale: String?
  ) throws -> [String: Any] {
    let content = bounded(prompt, maxUTF16Length: Limits.message)
    guard !content.isEmpty else { throw NumaCaptureRequestError.emptyText }
    return [
      "messages": [
        [
          "role": "user",
          "content": content
        ]
      ],
      "context": chatContext(snapshot),
      "locale": bounded(locale ?? "en", maxUTF16Length: Limits.contextCode)
    ]
  }

  static func makeReceiptTextBody(
    text: String,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?
  ) throws -> [String: Any] {
    let boundedText = try normalizedReceiptText(text)
    return receiptBody(text: boundedText, image: nil, snapshot: snapshot, locale: locale)
  }

  static func normalizedReceiptText(_ text: String) throws -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let boundedText = bounded(trimmed, maxUTF16Length: Limits.receiptText)
    guard !boundedText.isEmpty else { throw NumaCaptureRequestError.emptyText }
    return boundedText
  }

  static func makeReceiptImageBody(
    imageData: Data,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?
  ) throws -> [String: Any] {
    let image = try encodedReceiptImage(from: imageData)
    return receiptBody(text: nil, image: image, snapshot: snapshot, locale: locale)
  }

  static func makeRequest(
    url: URL,
    body: [String: Any],
    tokenProvider: () -> String?
  ) throws -> URLRequest {
    // Resolve exactly once before the URLSession suspension point. A sign-out
    // or account switch cannot silently retarget an in-flight request.
    guard let token = tokenProvider()?.trimmingCharacters(in: .whitespacesAndNewlines),
          !token.isEmpty
    else { throw NumaAuthError.missingToken }
    return try makeRequest(url: url, body: body, token: token)
  }

  private static func makeRequest(
    url: URL,
    body: [String: Any],
    token: String
  ) throws -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(
      NumaConfig.current.apiConvexDeploymentURL,
      forHTTPHeaderField: "X-Numa-Convex-Deployment"
    )
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    return request
  }

  /// Sends one authenticated request and performs exactly one refresh/retry
  /// when the API reports an expired or otherwise invalid bearer.
  static func sendAuthorized(
    url: URL,
    body: [String: Any],
    authorization: NumaAPIRequestLease,
    tokenProvider: (NumaAPIRequestLease) async throws -> NumaAPIBearer,
    transport: (URLRequest) async throws -> (Data, HTTPURLResponse) = liveTransport
  ) async throws -> (Data, HTTPURLResponse) {
    func send() async throws -> (Data, HTTPURLResponse) {
      guard authorization.isCurrent() else { throw NumaAuthError.staleSession }
      let bearer = try await tokenProvider(authorization)
      guard authorization.isCurrent(), bearer.lease.matches(authorization) else {
        throw NumaAuthError.staleSession
      }
      let token = bearer.token.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !token.isEmpty else { throw NumaAuthError.missingToken }
      let response = try await transport(try makeRequest(url: url, body: body, token: token))
      guard authorization.isCurrent() else { throw NumaAuthError.staleSession }
      return response
    }

    let first = try await send()
    if first.1.statusCode != 401 { return first }
    return try await send()
  }

  private static func liveTransport(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw NumaAuthError.invalidResponse
    }
    return (data, response)
  }

  private static func parse(
    body: [String: Any],
    authorization: NumaAPIRequestLease,
    tokenProvider: (NumaAPIRequestLease) async throws -> NumaAPIBearer
  ) async throws -> CaptureParseResponse {
    guard let url = URL(string: "\(NumaConfig.current.webAppURL)/api/parse-receipt") else {
      throw NumaAuthError.invalidResponse
    }
    let (data, response) = try await sendAuthorized(
      url: url,
      body: body,
      authorization: authorization,
      tokenProvider: tokenProvider
    )
    guard (200..<300).contains(response.statusCode) else {
      let message = String(data: data, encoding: .utf8) ?? "Capture failed"
      throw NSError(domain: "NumaCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    return try JSONDecoder().decode(CaptureParseResponse.self, from: data)
  }

  private static func receiptBody(
    text: String?,
    image: String?,
    snapshot: MobilePortfolioSnapshot?,
    locale: String?
  ) -> [String: Any] {
    let boundedLocale = bounded(locale ?? "en", maxUTF16Length: Limits.contextCode)
    let categories = (snapshot?.categories ?? [])
      .lazy
      .filter { $0.kind == "income" || $0.kind == "expense" }
      .prefix(Limits.receiptContextList)
      .map {
        [
          "id": bounded($0.id, maxUTF16Length: Limits.contextID),
          "name": bounded($0.name, maxUTF16Length: Limits.contextName),
          "kind": $0.kind
        ]
      }
    var body: [String: Any] = [
      "locale": boundedLocale,
      "portfolioContext": [
        "portfolioName": bounded(
          snapshot?.portfolio.name ?? "Personal",
          maxUTF16Length: Limits.contextName
        ),
        "portfolioType": "personal",
        "defaultCurrency": supportedCurrency(snapshot?.portfolio.defaultCurrency),
        "categories": Array(categories),
        "members": [],
        "locale": boundedLocale
      ] as [String: Any]
    ]
    if let text { body["text"] = text }
    if let image { body["image"] = image }
    return body
  }

  private static func chatContext(_ snapshot: MobilePortfolioSnapshot) -> [String: Any] {
    let eligibleCategories = snapshot.categories.filter {
      $0.kind == "income" || $0.kind == "expense"
    }
    let categories: [[String: Any]] = eligibleCategories
      .prefix(Limits.receiptContextList)
      .map {
        var row: [String: Any] = [
          "id": bounded($0.id, maxUTF16Length: Limits.contextID),
          "name": bounded($0.name, maxUTF16Length: Limits.contextName),
          "kind": $0.kind
        ]
        if let monthlyLimit = $0.monthlyLimit {
          row["monthlyLimit"] = monthlyLimit
        }
        return row
      }
    let categoryNames = Dictionary(
      uniqueKeysWithValues: eligibleCategories.map { ($0.id, $0.name) }
    )
    let recentTransactions: [[String: Any]] = snapshot.transactions
      .lazy
      .filter { $0.kind == "income" || $0.kind == "expense" }
      .prefix(Limits.recentTransactions)
      .map { tx in
        var row: [String: Any] = [
          "date": shortDate(tx.occurredAt),
          "description": bounded(
            tx.description,
            maxUTF16Length: Limits.contextDescription
          ),
          "amount": tx.amount,
          "currency": bounded(tx.currency, maxUTF16Length: Limits.contextCode),
          "kind": tx.kind
        ]
        if let categoryId = tx.categoryId, let categoryName = categoryNames[categoryId] {
          row["categoryName"] = bounded(categoryName, maxUTF16Length: Limits.contextName)
        }
        return row
      }
    let liabilities: [[String: Any]] = snapshot.liabilities
      .prefix(Limits.receiptContextList)
      .map {
        var row: [String: Any] = [
          "name": bounded($0.name, maxUTF16Length: Limits.contextName),
          "balance": $0.balance,
          "currency": bounded($0.currency, maxUTF16Length: Limits.contextCode),
          "kind": bounded($0.kind, maxUTF16Length: Limits.contextShort)
        ]
        if let interestRate = $0.interestRate {
          row["interestRate"] = interestRate
        }
        return row
      }
    let assets: [[String: Any]] = snapshot.assets
      .prefix(Limits.receiptContextList)
      .map {
        [
          "name": bounded($0.name, maxUTF16Length: Limits.contextName),
          "balance": $0.balance,
          "currency": bounded($0.currency, maxUTF16Length: Limits.contextCode),
          "kind": bounded($0.kind, maxUTF16Length: Limits.contextShort)
        ]
      }
    return [
      "portfolio": [
        "name": bounded(snapshot.portfolio.name, maxUTF16Length: Limits.contextName),
        "defaultCurrency": supportedCurrency(snapshot.portfolio.defaultCurrency)
      ],
      "netWorth": snapshot.dashboard.netWorth,
      "liquid": snapshot.dashboard.liquid,
      "invested": snapshot.dashboard.invested,
      "liabilities": snapshot.dashboard.liabilities,
      "categories": categories,
      "recentTransactions": Array(recentTransactions),
      "assets": assets,
      "liabilitiesDetail": liabilities
    ]
  }

  private static func encodedReceiptImage(from data: Data) throws -> String {
    guard let source = UIImage(data: data), source.size.width > 0, source.size.height > 0 else {
      throw NumaCaptureRequestError.invalidImage
    }
    let dimensions: [CGFloat] = [Limits.imageDimension, 1_024, 768, 640]
    let qualities: [CGFloat] = [0.82, 0.68, 0.5, 0.35]
    let prefix = "data:image/jpeg;base64,"
    for dimension in dimensions {
      let resized = resizedImage(source, maxDimension: dimension)
      for quality in qualities {
        guard let jpeg = resized.jpegData(compressionQuality: quality) else { continue }
        let encoded = "\(prefix)\(jpeg.base64EncodedString())"
        if encoded.utf16.count <= Limits.imageDataURL {
          return encoded
        }
      }
    }
    throw NumaCaptureRequestError.imageTooLarge
  }

  private static func resizedImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
    let longestSide = max(image.size.width, image.size.height)
    let ratio = min(1, maxDimension / longestSide)
    let size = CGSize(
      width: max(1, (image.size.width * ratio).rounded()),
      height: max(1, (image.size.height * ratio).rounded())
    )
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      image.draw(in: CGRect(origin: .zero, size: size))
    }
  }

  private static func bounded(_ value: String, maxUTF16Length: Int) -> String {
    guard value.utf16.count > maxUTF16Length else { return value }
    let utf16 = value.utf16
    var end = utf16.index(utf16.startIndex, offsetBy: maxUTF16Length)
    while String.Index(end, within: value) == nil {
      end = utf16.index(before: end)
    }
    guard let stringEnd = String.Index(end, within: value) else { return "" }
    return String(value[..<stringEnd])
  }

  private static func supportedCurrency(_ currency: CurrencyCode?) -> CurrencyCode {
    currency == "USD" ? "USD" : "EUR"
  }

  private static func shortDate(_ millis: Double) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date(timeIntervalSince1970: millis / 1000))
  }
}
