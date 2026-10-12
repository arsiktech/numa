import Foundation
import Testing
@testable import Numa

@MainActor
struct NumaExportTests {
  private func manifest() -> NumaExportManifest {
    NumaExportManifest(format: "numa-space-export-v1", userId: "user", portfolioId: "space", name: "Synthetic Studio",
      currency: "EUR", startedAt: 1800000000000, sections: NumaExportCollector.sections,
      consistency: "Live copy", interpretation: "Do not sum ledger and operational records.", exclusions: [])
  }
  private func page(_ section: String, rows: String? = nil, done: Bool = true, cursor: String? = nil, retry: Int? = nil) -> NumaExportPage {
    let json = rows ?? (section == "portfolio" ? "[{\"_id\":\"space\"}]" : section == "membership" ? "[{\"_id\":\"member\",\"portfolioId\":\"space\",\"userId\":\"user\"}]" : "[]")
    let count = (try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[String: Any]])?.count ?? 0
    return NumaExportPage(userId: "user", portfolioId: "space", section: section, rowsJSON: json,
      rowCount: count, isDone: done, continueCursor: cursor, sampledAt: 1800000000001, retryLimit: retry)
  }
  @Test func completeFilePreservesLiabilityAndProvenanceAcrossAllPages() async throws {
    var calls = [String]()
    let data = try await NumaExportCollector.collect(manifest: manifest(), userId: "user", portfolioId: "space", isCurrent: { true }, fetch: { section, cursor, _ in
      calls.append(section)
      if section == "cashTransfers" {
        return page(section, rows: "[{\"_id\":\"transfer\",\"portfolioId\":\"space\",\"amount\":12.25,\"currency\":\"EUR\",\"sourceFingerprint\":\"original-transfer\",\"deletedAt\":1800000000123}]")
      }
      if section == "liabilities" {
        let id = cursor == nil ? "loan-1" : "loan-2"
        return page(section, rows: "[{\"_id\":\"\(id)\",\"portfolioId\":\"space\",\"balance\":1234.56,\"currency\":\"EUR\",\"wealthObservation\":null,\"notes\":\"Synthetic principal owed\"}]", done: cursor != nil, cursor: cursor == nil ? "next" : nil)
      }
      return page(section)
    }, progress: { _, _ in })
    let result = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let completion = try #require(result["completion"] as? [String: Any])
    #expect(completion["allSectionsRead"] as? Bool == true)
    #expect((completion["counts"] as? [String: Int])?["liabilities"] == 2)
    #expect((completion["counts"] as? [String: Int])?["cashTransfers"] == 1)
    #expect(Set(calls) == Set(NumaExportCollector.sections))
    let text = try #require(String(data: data, encoding: .utf8))
    #expect(text.contains("original-transfer")); #expect(text.contains("1800000000123"))
    #expect(text.contains("1234.56")); #expect(text.contains("\"wealthObservation\":null"))
  }
  @Test func splitPagesAreDiscardedAndRetriedWithoutSkippingTheirCursor() async throws {
    var limits = [Int]()
    _ = try await NumaExportCollector.collect(manifest: manifest(), userId: "user", portfolioId: "space", isCurrent: { true }, fetch: { section, cursor, limit in
      if section == "liabilities" {
        limits.append(limit); #expect(cursor == nil)
        if limit > 1 { return page(section, rows: "[]", done: false, retry: limit == 32 ? 8 : 1) }
      }
      return page(section)
    }, progress: { _, _ in })
    #expect(limits == [32, 8, 1])
  }
  @Test func accountChangeDuringReadNeverReturnsAFile() async {
    var current = true
    await #expect(throws: NumaExportError.self) {
      _ = try await NumaExportCollector.collect(manifest: manifest(), userId: "user", portfolioId: "space", isCurrent: { current }, fetch: { section, _, _ in
        current = false; return page(section)
      }, progress: { _, _ in })
    }
  }
  @Test func duplicateRowsCursorLoopsAndForeignScopeFailClosed() async {
    for bad in ["duplicate", "cursor", "foreign"] {
      await #expect(throws: NumaExportError.self) {
        _ = try await NumaExportCollector.collect(manifest: manifest(), userId: "user", portfolioId: "space", isCurrent: { true }, fetch: { section, _, _ in
          if section == "liabilities" {
            if bad == "cursor" { return page(section, rows: "[]", done: false, cursor: "loop") }
            return page(section, rows: "[{\"_id\":\"loan\",\"portfolioId\":\"\(bad == "foreign" ? "foreign" : "space")\"}]", done: bad == "foreign", cursor: bad == "foreign" ? nil : UUID().uuidString)
          }
          return page(section)
        }, progress: { _, _ in })
      }
    }
  }
  @Test func failedSectionDoesNotReturnPartialExport() async {
    await #expect(throws: URLError.self) {
      _ = try await NumaExportCollector.collect(manifest: manifest(), userId: "user", portfolioId: "space", isCurrent: { true }, fetch: { section, _, _ in
        if section == "liabilities" { throw URLError(.networkConnectionLost) }
        return page(section)
      }, progress: { _, _ in })
    }
  }
}

@MainActor
struct NumaPrivacyContractTests {
  @Test func firstUsePermissionRequiresCurrentAccountAndAvailableServerDecision() throws {
    let json = """
    {"userId":"user","requiredVersion":"v1","allowed":true,"decidedAt":1800000000000,"deletionPending":false,
     "disclosure":{"title":"Choose AI","recipients":"Vercel and Anthropic","data":"Submitted content","purpose":"Review",
     "withdrawal":"Settings","retention":"Provider policies apply","alternative":"Manual entry","links":[]}}
    """
    let status = try JSONDecoder().decode(NumaPrivacyStatus.self, from: Data(json.utf8))
    #expect(status.permitsSharing(for: "user"))
    #expect(!status.permitsSharing(for: "other")); #expect(!status.permitsSharing(for: nil))
    for changed in [json.replacingOccurrences(of: "\"allowed\":true", with: "\"allowed\":false"),
      json.replacingOccurrences(of: "\"deletionPending\":false", with: "\"deletionPending\":true"),
      json.replacingOccurrences(of: "\"requiredVersion\":\"v1\"", with: "\"requiredVersion\":\"\"")] {
      let denied = try JSONDecoder().decode(NumaPrivacyStatus.self, from: Data(changed.utf8))
      #expect(!denied.permitsSharing(for: "user"))
    }
  }
}

struct NumaExportTemporaryFilesTests {
  private func fixture() throws -> (URL, URL, URL, NumaExportTemporaryFiles) {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let temporary = root.appendingPathComponent("tmp")
    let registry = root.appendingPathComponent("support/registry.json")
    try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
    return (root, temporary, registry, NumaExportTemporaryFiles(temporaryDirectory: temporary, registryURL: registry))
  }

  @Test func activeExportSurvivesCleanupAndTerminalCallbackRemovesOnlyItsFile() async throws {
    let (root, temporary, registry, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let name = try await files.register(UUID())
    let owned = temporary.appendingPathComponent(name), other = temporary.appendingPathComponent("unrelated.json")
    try Data("private".utf8).write(to: owned); try Data("keep".utf8).write(to: other)
    #expect(await files.cleanStale())
    #expect(FileManager.default.fileExists(atPath: owned.path))
    #expect(await files.finish(name))
    #expect(!FileManager.default.fileExists(atPath: owned.path))
    #expect(FileManager.default.fileExists(atPath: other.path))
    #expect(try JSONDecoder().decode([String].self, from: Data(contentsOf: registry)).isEmpty)
  }

  @Test func coldLaunchRecoversRegisteredFilesButNotLegacyOrUserSavedCopies() async throws {
    let (root, temporary, registry, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let name = try await files.register(UUID())
    let owned = temporary.appendingPathComponent(name)
    let saved = root.appendingPathComponent(name), legacy = temporary.appendingPathComponent("numa-space-2026-09-12.json")
    for url in [owned, saved, legacy] { try Data("synthetic".utf8).write(to: url) }
    let relaunched = NumaExportTemporaryFiles(temporaryDirectory: temporary, registryURL: registry)
    #expect(await relaunched.cleanStale())
    #expect(!FileManager.default.fileExists(atPath: owned.path))
    #expect(FileManager.default.fileExists(atPath: saved.path))
    #expect(FileManager.default.fileExists(atPath: legacy.path))
  }

  @Test func symlinksAndMalformedRegistryPathsCannotDeleteOutsideFiles() async throws {
    let (root, temporary, registry, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let name = try await files.register(UUID())
    let outside = root.appendingPathComponent("keep.json")
    try Data("keep".utf8).write(to: outside)
    try FileManager.default.createSymbolicLink(at: temporary.appendingPathComponent(name), withDestinationURL: outside)
    try JSONEncoder().encode([name, "../keep.json"]).write(to: registry)
    let relaunched = NumaExportTemporaryFiles(temporaryDirectory: temporary, registryURL: registry)
    #expect(!(await relaunched.cleanStale()))
    #expect(try String(contentsOf: outside, encoding: .utf8) == "keep")
    #expect(try JSONDecoder().decode([String].self, from: Data(contentsOf: registry)).count == 2)
  }

  @Test func registrationFailurePreventsPresentationAndNoFileStillFinishesSafely() async throws {
    let (root, _, _, files) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let name = try await files.register(UUID())
    #expect(await files.finish(name))
    let blocker = root.appendingPathComponent("not-directory")
    try Data().write(to: blocker)
    let invalid = NumaExportTemporaryFiles(temporaryDirectory: root, registryURL: blocker.appendingPathComponent("registry.json"))
    await #expect(throws: (any Error).self) { _ = try await invalid.register(UUID()) }
  }
}
