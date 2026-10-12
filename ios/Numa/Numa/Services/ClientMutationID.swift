import Foundation

enum ClientMutationID {
  static func make(_ operation: String) -> String {
    "\(operation):ios:\(UUID().uuidString.lowercased())"
  }
}
