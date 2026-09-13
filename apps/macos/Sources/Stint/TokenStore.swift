import Foundation
import Security

/// A Supabase session, as GoTrue returns it.
struct Session: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let email: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case user
    }

    init(accessToken: String, refreshToken: String, expiresAt: Date, email: String?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.email = email
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)

        // GoTrue sends `expires_at` as a Unix second AND `expires_in` as a
        // duration. Prefer the absolute one: a duration is relative to a
        // response time this app does not know precisely.
        if let at = try? c.decode(Double.self, forKey: .expiresAt) {
            expiresAt = Date(timeIntervalSince1970: at)
        } else {
            let seconds = (try? c.decode(Double.self, forKey: .expiresIn)) ?? 3600
            expiresAt = Date().addingTimeInterval(seconds)
        }

        struct User: Decodable { let email: String? }
        email = (try? c.decode(User.self, forKey: .user))?.email
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(expiresAt.timeIntervalSince1970, forKey: .expiresAt)
        struct User: Encodable { let email: String? }
        try c.encode(User(email: email), forKey: .user)
    }
}

/// Holds the session, refreshes it before it dies, and keeps it in the
/// Keychain so quitting the app is not signing out.
///
/// An access token lives an hour (`jwt_expiry = 3600`) and rotation is on, so
/// refreshing is not optional: an app left open overnight would otherwise 401
/// on every poll by morning and read as broken rather than signed out.
actor TokenStore {
    private let supabaseURL: URL
    private let anonKey: String
    private var session: Session?
    /// One in-flight refresh, shared. Two pollers racing would each spend a
    /// rotating refresh token and one would lose.
    private var refreshTask: Task<Session, Error>?

    /// Fires when the session appears or disappears, so the UI can follow.
    var onChange: (@Sendable (Session?) -> Void)?

    init(supabaseURL: URL, anonKey: String) {
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        self.session = Keychain.read()
    }

    func setOnChange(_ handler: @escaping @Sendable (Session?) -> Void) {
        onChange = handler
        handler(session)
    }

    var current: Session? { session }
    var isSignedIn: Bool { session != nil }
    var email: String? { session?.email }

    func store(_ session: Session) {
        self.session = session
        Keychain.write(session)
        onChange?(session)
    }

    func signOut() {
        session = nil
        refreshTask?.cancel()
        refreshTask = nil
        Keychain.clear()
        onChange?(nil)
    }

    /// A token good for the next request, refreshing first if it is close to
    /// expiry. Sixty seconds of headroom: a token that expires mid-flight
    /// fails a request that had every reason to succeed.
    func accessToken() async -> String? {
        guard let session else { return nil }
        guard session.expiresAt.timeIntervalSinceNow < 60 else {
            return session.accessToken
        }

        if let existing = refreshTask {
            return try? await existing.value.accessToken
        }
        let task = Task { try await refresh(session.refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }

        guard let refreshed = try? await task.value else {
            // The refresh token is spent or revoked; this is a real sign-out,
            // not a transient failure, and pretending otherwise would leave
            // the app retrying forever against a session that cannot return.
            signOut()
            return nil
        }
        store(refreshed)
        return refreshed.accessToken
    }

    private func refresh(_ refreshToken: String) async throws -> Session {
        var req = URLRequest(
            url: supabaseURL.appending(path: "/auth/v1/token")
                .appending(queryItems: [.init(name: "grant_type", value: "refresh_token")])
        )
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["refresh_token": refreshToken])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw APIError(status: 401, code: "UNAUTHORIZED", message: "Session expired")
        }
        return try JSONDecoder().decode(Session.self, from: data)
    }
}

/// The Keychain, holding one session under a fixed account.
///
/// Not `UserDefaults`: a refresh token is a long-lived credential and a plist
/// in the app container is readable by anything running as the user.
private enum Keychain {
    private static let service = "dev.stint.session"
    private static let account = "supabase"

    private static var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func read() -> Session? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    static func write(_ session: Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        SecItemDelete(query as CFDictionary)

        var q = query
        q[kSecValueData as String] = data
        // The session is only needed while someone is using the Mac, and
        // `WhenUnlocked` keeps it out of reach of anything reading the disk
        // on a locked machine.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked
        SecItemAdd(q as CFDictionary, nil)
    }

    static func clear() {
        SecItemDelete(query as CFDictionary)
    }
}
