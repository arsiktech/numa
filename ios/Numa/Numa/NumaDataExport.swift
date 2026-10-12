import SwiftUI
import UniformTypeIdentifiers
@preconcurrency import ConvexMobile

struct NumaExportManifest: Codable {
  let format: String
  let userId: String
  let portfolioId: String
  let name: String
  let currency: String
  let startedAt: Double
  let sections: [String]
  let consistency: String
  let interpretation: String
  let exclusions: [String]
}

struct NumaExportPage: Codable {
  let userId: String
  let portfolioId: String
  let section: String
  let rowsJSON: String
  let rowCount: Int
  let isDone: Bool
  let continueCursor: String?
  let sampledAt: Double
  let retryLimit: Int?
}

enum NumaExportError: LocalizedError {
  case changedAccount, invalidResponse, sizeLimit
  var errorDescription: String? {
    switch self {
    case .changedAccount: "Your account or space changed. Start the export again."
    case .invalidResponse: "The export could not be verified. No complete file was produced. Try again without editing this space."
    case .sizeLimit: "This export exceeds the 50 MB on-device limit. No partial file was saved. Contact support for a larger export."
    }
  }
}

/// Builds a valid JSON document only after ALL manifest sections have reached
/// their end. No model-specific decoding can silently discard financial fields.
@MainActor
struct NumaExportCollector {
  static let sections = ["portfolio", "membership", "categories", "transactions", "assets", "liabilities",
    "holdings", "holdingEvents", "cryptoWallets", "wealthSnapshots", "settlements", "goals", "recurring",
    "ledgerAccounts", "ledgerTransactions", "ledgerLines", "aiActionDrafts", "cashTransfers"]
  static let maximumBytes = 50 * 1024 * 1024

  static func collect(
    manifest: NumaExportManifest,
    userId: String,
    portfolioId: String,
    isCurrent: () -> Bool,
    fetch: (_ section: String, _ cursor: String?, _ limit: Int) async throws -> NumaExportPage,
    progress: (_ section: String, _ records: Int) -> Void
  ) async throws -> Data {
    guard manifest.format == "numa-space-export-v1", manifest.userId == userId,
      manifest.portfolioId == portfolioId, manifest.sections == sections else { throw NumaExportError.invalidResponse }
    var output = Data("{\"manifest\":".utf8)
    output.append(try JSONEncoder().encode(manifest))
    output.append(Data(",\"pages\":[".utf8))
    var firstPage = true
    var counts = [String: Int]()
    func checkCurrent() throws {
      try Task.checkCancellation()
      guard isCurrent() else { throw NumaExportError.changedAccount }
    }
    for section in manifest.sections {
      var cursor: String?
      var seenCursors = Set<String>(), seenIDs = Set<String>()
      var limit = 32
      while true {
        try checkCurrent()
        let page = try await fetch(section, cursor, limit)
        try checkCurrent()
        guard page.userId == userId, page.portfolioId == portfolioId, page.section == section,
          page.sampledAt.isFinite, page.rowCount >= 0 else { throw NumaExportError.invalidResponse }
        if let retryLimit = page.retryLimit {
          guard [8, 1].contains(retryLimit), retryLimit < limit, page.rowCount == 0,
            page.rowsJSON == "[]", !page.isDone, page.continueCursor == cursor else { throw NumaExportError.invalidResponse }
          limit = retryLimit
          continue
        }
        guard let rowsData = page.rowsJSON.data(using: .utf8),
          let rows = try JSONSerialization.jsonObject(with: rowsData) as? [[String: Any]],
          rows.count == page.rowCount else { throw NumaExportError.invalidResponse }
        for row in rows {
          guard let id = row["_id"] as? String, !id.isEmpty, seenIDs.insert(id).inserted else { throw NumaExportError.invalidResponse }
          if section == "portfolio" {
            guard id == portfolioId else { throw NumaExportError.invalidResponse }
          } else {
            guard row["portfolioId"] as? String == portfolioId else { throw NumaExportError.invalidResponse }
          }
          if section == "membership" || section == "aiActionDrafts" {
            guard row["userId"] as? String == userId else { throw NumaExportError.invalidResponse }
          }
        }
        if !firstPage { output.append(Data(",".utf8)) }
        firstPage = false
        // Embed rows as JSON, not as an escaped string, for ordinary JSON tools.
        let metadata: [String: Any] = ["section": section, "sampledAt": page.sampledAt, "rowCount": rows.count]
        var encoded = try JSONSerialization.data(withJSONObject: metadata, options: [.sortedKeys])
        encoded.removeLast()
        encoded.append(Data(",\"rows\":".utf8)); encoded.append(rowsData); encoded.append(Data("}".utf8))
        guard output.count + encoded.count < maximumBytes - 4096 else { throw NumaExportError.sizeLimit }
        output.append(encoded)
        counts[section, default: 0] += rows.count
        progress(section, counts.values.reduce(0, +))
        if page.isDone {
          guard page.continueCursor == nil else { throw NumaExportError.invalidResponse }
          break
        }
        guard let next = page.continueCursor, !next.isEmpty, next != cursor,
          seenCursors.insert(next).inserted else { throw NumaExportError.invalidResponse }
        cursor = next
      }
    }
    try checkCurrent()
    guard counts["portfolio"] == 1, counts["membership"] == 1 else { throw NumaExportError.invalidResponse }
    output.append(Data("],\"completion\":".utf8))
    output.append(try JSONSerialization.data(withJSONObject: ["allSectionsRead": true, "counts": counts,
      "finishedAt": Date().timeIntervalSince1970 * 1000], options: [.sortedKeys]))
    output.append(Data("}".utf8))
    return output
  }
}

/// SwiftUI creates an app-local temporary file when presenting FileDocument.
/// Register only our unique basename, never a user's destination URL. All disk
/// coordination runs on this actor, away from the UI/main actor. Failed cleanup
/// remains registered for the next cold launch; unrelated/legacy files are not swept.
actor NumaExportTemporaryFiles {
  static let shared = NumaExportTemporaryFiles(
    temporaryDirectory: FileManager.default.temporaryDirectory,
    registryURL: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NumaExportTemporaryFiles.json"))
  private let temporaryDirectory: URL
  private let registryURL: URL
  private var active = Set<String>()

  init(temporaryDirectory: URL, registryURL: URL) {
    self.temporaryDirectory = temporaryDirectory.resolvingSymlinksInPath().standardizedFileURL
    self.registryURL = registryURL
  }

  func register(_ id: UUID) throws -> String {
    let name = "numa-financial-export-\(id.uuidString).json"
    var registered = try readRegistry()
    registered.insert(name)
    try writeRegistry(registered) // No export presentation if durable registration fails.
    active.insert(name)
    return name
  }

  func finish(_ name: String) -> Bool {
    active.remove(name)
    return clean(only: name)
  }

  func cleanStale() -> Bool { clean(only: nil) }

  private func isOwnedName(_ name: String) -> Bool {
    let prefix = "numa-financial-export-", suffix = ".json"
    guard name.hasPrefix(prefix), name.hasSuffix(suffix), !name.contains("/") else { return false }
    return UUID(uuidString: String(name.dropFirst(prefix.count).dropLast(suffix.count))) != nil
  }

  private func readRegistry() throws -> Set<String> {
    guard FileManager.default.fileExists(atPath: registryURL.path) else { return [] }
    return Set(try JSONDecoder().decode([String].self, from: Data(contentsOf: registryURL)))
  }

  private func writeRegistry(_ names: Set<String>) throws {
    try FileManager.default.createDirectory(at: registryURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(names.sorted()).write(to: registryURL, options: .atomic)
  }

  private func clean(only name: String?) -> Bool {
    do {
      var registered = try readRegistry()
      let candidates = registered.filter { !active.contains($0) && (name == nil || $0 == name) }
      var complete = true
      for candidate in candidates {
        guard isOwnedName(candidate) else { complete = false; continue }
        let url = temporaryDirectory.appendingPathComponent(candidate).standardizedFileURL
        guard url.deletingLastPathComponent() == temporaryDirectory else { complete = false; continue }
        // A canceled preparation may never have created a file. Establish that
        // directly; NSFileCoordinator may reject a missing item before its accessor.
        do {
          let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
          guard attributes[.type] as? FileAttributeType == .typeRegular else { complete = false; continue }
        } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
          registered.remove(candidate)
          continue
        } catch { complete = false; continue }
        var coordinationError: NSError?
        var removed = false
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forDeleting, error: &coordinationError) { coordinated in
          // Recheck inside coordination; never follow/delete a symlink or directory.
          guard coordinated.standardizedFileURL == url else { return }
          do {
            let attributes = try FileManager.default.attributesOfItem(atPath: coordinated.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular else { return }
            try FileManager.default.removeItem(at: coordinated)
            removed = true
          } catch let error as CocoaError {
            removed = error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile
          } catch { /* Keep the registry entry; do not log private paths. */ }
        }
        if coordinationError == nil && removed { registered.remove(candidate) }
        else { complete = false }
      }
      try writeRegistry(registered)
      return complete
    } catch { return false }
  }
}

struct NumaExportDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.json] }
  var data: Data
  var filename: String?
  init(data: Data, filename: String? = nil) { self.data = data; self.filename = filename }
  init(configuration: ReadConfiguration) throws {
    guard let bytes = configuration.file.regularFileContents else { throw NumaExportError.invalidResponse }
    data = bytes
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    let wrapper = FileWrapper(regularFileWithContents: data)
    wrapper.preferredFilename = filename
    return wrapper
  }
}

struct NumaFinancialExportControl: View {
  let portfolioId: String
  let name: String
  @Environment(NumaSessionStore.self) private var session
  @Environment(NumaAppStore.self) private var store
  @Environment(\.numa) private var numa
  @State private var request: UUID?
  @State private var preparing = false
  @State private var progress = ""
  @State private var error: String?
  @State private var document: NumaExportDocument?
  @State private var showExporter = false
  @State private var presentedFilename: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Export \(name)").font(.subheadline.bold())
      Text("Includes this space’s full stored transaction and transfer history, liabilities, holdings and ledger, plus your AI review records. Original currencies, dates and source links are retained.")
      Text("This is a live copy, not a frozen accounting close. Avoid editing while it runs. Files you save outside Numa are private financial data and are not removed by deleting your Numa account.").font(.footnote)
      if preparing {
        ProgressView(progress)
        Button("Cancel export") { request = nil; preparing = false; document = nil }
      } else {
        Button("Prepare financial export", systemImage: "square.and.arrow.up") {
          document = nil; error = nil; preparing = true; progress = "Reading export scope…"; request = UUID()
        }
        .disabled(presentedFilename != nil)
      }
      if let error { Text(error).foregroundStyle(numa.negative).font(.footnote) }
    }
    .task(id: request) {
      guard let request else { return }
      await prepare(request)
    }
    .onDisappear { request = nil; document = nil; showExporter = false }
    .onChange(of: store.spaceContext) { _, _ in invalidate() }
    .onChange(of: store.profile?.userId) { _, _ in invalidate() }
    .fileExporter(isPresented: $showExporter, document: document, contentTypes: [.json],
      defaultFilename: presentedFilename,
      onCompletion: { result in
        // The returned URL belongs to the user. Never remove it.
        finishExport()
        if case .failure = result { error = "The file was not saved. Prepare the export again to retry." }
      }, onCancellation: { finishExport() })
  }

  private func finishExport() {
    let filename = presentedFilename
    presentedFilename = nil; document = nil; showExporter = false
    if let filename { Task { _ = await NumaExportTemporaryFiles.shared.finish(filename) } }
  }

  private func invalidate() {
    // Close the picker, but do not unlink a source while a provider may copy it.
    // Its terminal callback cleans it; a killed process is recovered at cold launch.
    request = nil; preparing = false; document = nil; showExporter = false; error = nil
  }

  private func prepare(_ id: UUID) async {
    guard let userId = store.profile?.userId, let lease = try? session.beginAccountLease(),
      store.spaceContext.id == portfolioId else { preparing = false; error = NumaExportError.changedAccount.localizedDescription; return }
    let context = store.spaceContext
    let isCurrent = { lease.isCurrent() && store.spaceContext == context && request == id }
    defer { if isCurrent() { preparing = false } }
    do {
      let args: [String: ConvexEncodable?] = ["expectedUserId": userId, "portfolioId": portfolioId, "requestId": id.uuidString]
      let manifest: NumaExportManifest = try await read("dataExport:manifest", args: args)
      let data = try await NumaExportCollector.collect(manifest: manifest, userId: userId, portfolioId: portfolioId,
        isCurrent: isCurrent, fetch: { section, cursor, limit in
          var pageArgs = args
          pageArgs["section"] = section; pageArgs.updateValue(cursor, forKey: "cursor"); pageArgs["limit"] = Double(limit)
          return try await read("dataExport:page", args: pageArgs)
        }, progress: { _, count in progress = "Read \(count.formatted()) records…" })
      // Fresh request identity prevents a cached first-page result being mistaken
      // for the final authorization check after a long export.
      let end: NumaExportManifest = try await read("dataExport:manifest", args: [
        "expectedUserId": userId, "portfolioId": portfolioId, "requestId": id.uuidString + "-finish",
      ])
      try Task.checkCancellation()
      guard isCurrent(), end.userId == userId, end.portfolioId == portfolioId else { throw NumaExportError.changedAccount }
      let filename = try await NumaExportTemporaryFiles.shared.register(id)
      // Registration is a suspension point: stale preparation may not present.
      guard isCurrent(), !Task.isCancelled else {
        _ = await NumaExportTemporaryFiles.shared.finish(filename)
        throw CancellationError()
      }
      presentedFilename = filename
      document = NumaExportDocument(data: data, filename: filename); showExporter = true
    } catch is CancellationError {
      // Canceled/disappeared/account-switched work must never offer its file.
    } catch {
      if isCurrent() {
        document = nil
        self.error = (error as? NumaExportError)?.localizedDescription ?? "Export unavailable. No complete file was produced. Check your connection and space access, then retry."
      }
    }
  }

  private func read<T: Decodable>(_ name: String, args: [String: ConvexEncodable?]) async throws -> T {
    for try await value in session.client.subscribe(to: name, with: args, yielding: T.self).values {
      try Task.checkCancellation()
      return value
    }
    throw NumaExportError.invalidResponse
  }
}
