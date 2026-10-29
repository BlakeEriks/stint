import Foundation
import Security
import SwiftUI

/// What JS last drew (`SurfaceState` in `src/surfaces.ts`), as the app's
/// module stored it (`modules/stint-surfaces/ios/Keychain.swift`). The
/// extension draws it and decides nothing.
struct Surface: Decodable {
  var kind: String
  var title: String
  var detail: String?
  var color: String?
  /// Running: when it started (ms).
  var startedAt: Double?
  var why: String?
  var tile: String?
  var colors: Themes?

  struct Themes: Decodable {
    var light: [String: String]
    var dark: [String: String]
  }

  var running: Bool { kind == "running" }
  var signedOut: Bool { kind == "signedOut" }
  var start: Date { Date(timeIntervalSince1970: (startedAt ?? 0) / 1000) }

  /// Nothing to read: the build wasn't signed with the shared keychain
  /// group, or the app hasn't opened yet.
  static let unreadable = Surface(
    kind: "unreadable", title: "Open Stint", detail: "Tap to open the app")

  /// The item with no access group: the extension's first group, the
  /// app's shared one.
  static func load() -> Surface {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "dev.stint.surfaces",
      kSecAttrAccount as String: Data("state".utf8),
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
      let data = out as? Data,
      let surface = try? JSONDecoder().decode(Surface.self, from: data)
    else { return unreadable }
    return surface
  }
}

/// The app's tokens, as JS handed them over, for the phone's appearance.
struct Palette {
  let colors: [String: String]

  init(_ themes: Surface.Themes?, _ scheme: ColorScheme) {
    colors = (scheme == .dark ? themes?.dark : themes?.light) ?? [:]
  }

  init(light: [String: String], dark: [String: String], _ scheme: ColorScheme) {
    colors = scheme == .dark ? dark : light
  }

  subscript(_ token: String) -> Color {
    colors[token].flatMap(Color.init(hex:)) ?? .primary
  }
}

extension Color {
  /// `#RRGGBB`, as the tokens are written.
  init?(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard digits.count == 6, let n = UInt32(digits, radix: 16) else { return nil }
    self.init(
      red: Double((n >> 16) & 0xff) / 255,
      green: Double((n >> 8) & 0xff) / 255,
      blue: Double(n & 0xff) / 255
    )
  }
}
