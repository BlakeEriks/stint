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
///
/// **Every call goes through `/usr/bin/security`, not the in-process Security
/// framework, and that is the whole reason the password prompt stopped.**
///
/// A keychain grant is checked against a PARTITION LIST as well as an ACL.
/// The ACL can name a stable identity — ours names the certificate from
/// `dev-certificate.sh` — but macOS writes the partition list itself, pinned
/// to the calling binary's `cdhash`, and supplying an explicit `SecAccess` at
/// `SecItemAdd` does not change that. A cdhash moves on every build — measured
/// on two builds of IDENTICAL source, and by definition on any code change.
/// So an in-process read is a NEW CALLER every time, and each "Always allow"
/// only appended one more dead hash to a list that recorded past prompts
/// rather than granting future access.
///
/// `/usr/bin/security` is a system binary with a fixed identity, so one grant
/// against it holds across every rebuild and OS update. The trade is explicit:
/// any process running as this user can also invoke it, so the item is
/// protected by the login keychain's lock rather than by app identity — which
/// is what it was protected by anyway, since the ACL never survived a build.
///
/// Measured before this was written: a rebuilt binary's read prompted while
/// `security find-generic-password` returned the token instantly.
private enum Keychain {
    private static let service = "dev.stint.session"
    private static let account = "supabase"

    static func read() -> Session? {
        guard let out = run(["find-generic-password", "-s", service, "-a", account, "-w"]),
              let data = out.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    static func write(_ session: Session) {
        guard let data = try? JSONEncoder().encode(session),
              let json = String(data: data, encoding: .utf8)
        else { return }
        /* No `-T`. A fresh item already gets `/usr/bin/security` as its one
           trusted app and `apple-tool:` as its partition, because that IS the
           caller. Passing `-T /usr/bin/security` as well was harmless on
           creation and a prompt on every update: `-U` with `-T` APPENDS to
           the ACL rather than recognising the entry it already holds, and an
           ACL change is the one write the owner's password still guards.
           This runs at every hourly token refresh, so that was the password
           once an hour. Measured: `-U -T` on an existing item blocked 20s
           until the password was typed; `-U` alone took 20ms and left the
           ACL and partition list exactly as they were. */
        _ = run([
            "add-generic-password", "-U",
            "-s", service, "-a", account, "-w", json,
        ])
    }

    static func clear() {
        _ = run(["delete-generic-password", "-s", service, "-a", account])
    }

    /* Arguments are passed as argv, never through a shell: the session is
       JSON and carries quotes and braces that a shell would interpret. */
    private static func run(_ arguments: [String]) -> String? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        task.arguments = arguments

        let stdout = Pipe()
        task.standardOutput = stdout
        task.standardError = FileHandle.nullDevice

        do { try task.run() } catch { return nil }
        let out = stdout.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()
        guard task.terminationStatus == 0 else { return nil }

        let text = String(decoding: out, as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }
}

