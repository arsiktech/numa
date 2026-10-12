import SwiftUI

enum NumaTheme {
  static let background = Color(red: 0.98, green: 0.96, blue: 0.91)
  static let paper = Color(red: 1.0, green: 0.99, blue: 0.95)
  static let ink = Color(red: 0.10, green: 0.11, blue: 0.13)
  static let secondaryInk = Color(red: 0.38, green: 0.39, blue: 0.42)
  static let brand = Color(red: 0.98, green: 0.53, blue: 0.24)
  static let positive = Color(red: 0.04, green: 0.55, blue: 0.31)
  static let negative = Color(red: 0.76, green: 0.18, blue: 0.18)
  static let line = Color.black.opacity(0.08)
}

extension View {
  func numaCard() -> some View {
    self
      .background(NumaTheme.paper)
      .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(NumaTheme.line)
      )
  }
}
