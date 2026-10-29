import Foundation
import Security

/// Generic-password items with no access group, so each lands in the first
/// of the app's `keychain-access-groups`, the one the widget extension
/// shares (`app.config.ts`). Signed without that group, they stay the app's.
enum Keychain {
  static func read(service: String, account: String) -> Data? {
    var query = base(service, account)
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    query[kSecReturnData as String] = true
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess else { return nil }
    return out as? Data
  }

  /// Replaces the item, or adds it readable after first unlock, so a lock
  /// screen widget redraws while the phone is locked.
  static func write(service: String, account: String, data: Data) {
    let query = base(service, account)
    let update = [kSecValueData as String: data]
    let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
    guard status == errSecItemNotFound else { return }
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(add as CFDictionary, nil)
  }

  /// Rewrites an item that exists, keeping its access group and protection.
  static func update(service: String, account: String, data: Data) {
    let update = [kSecValueData as String: data]
    SecItemUpdate(base(service, account) as CFDictionary, update as CFDictionary)
  }

  private static func base(_ service: String, _ account: String) -> [String: Any] {
    let key = Data(account.utf8)
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: key,
      kSecAttrAccount as String: key,
    ]
  }
}

/// What JS last drew, with the press's words and backend
/// (`nativeState()` in `src/surfaces.ts`): the item the widgets read.
enum Store {
  private static let service = "dev.stint.surfaces"
  private static let account = "state"

  static func load() -> [String: Any]? {
    guard let data = Keychain.read(service: service, account: account) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  static func save(_ state: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: state) else { return }
    Keychain.write(service: service, account: account, data: data)
  }
}

/// expo-secure-store's items (`src/storage.ts`): the session and the bypass.
enum SecureStore {
  private static let service = "app:no-auth"

  static func get(_ key: String) -> String? {
    Keychain.read(service: service, account: key).flatMap { String(data: $0, encoding: .utf8) }
  }

  static func set(_ key: String, _ value: String) {
    Keychain.update(service: service, account: key, data: Data(value.utf8))
  }
}
