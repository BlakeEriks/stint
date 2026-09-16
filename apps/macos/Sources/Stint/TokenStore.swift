import Foundation

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

    private struct User: Codable { let email: String? }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        // `expires_at` is absolute; `expires_in` is relative to a response
        // time this app does not know precisely.
        if let at = try? c.decode(Double.self, forKey: .expiresAt) {
            expiresAt = Date(timeIntervalSince1970: at)
        } else {
            expiresAt = Date().addingTimeInterval((try? c.decode(Double.self, forKey: .expiresIn)) ?? 3600)
        }
        email = (try? c.decode(User.self, forKey: .user))?.email
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(expiresAt.timeIntervalSince1970, forKey: .expiresAt)
        try c.encode(User(email: email), forKey: .user)
    }
}

/// Holds the session, refreshes it before it dies, and keeps it in the
/// Keychain so quitting is not signing out. `jwt_expiry` is an hour with
/// rotation on, so refresh is mandatory.
actor TokenStore {
    private let supabaseURL: URL
    private let anonKey: String
    private var session: Session?
    /// One in-flight refresh, shared: two pollers racing would each spend a
    /// rotating refresh token and one would lose.
    private var refreshTask: Task<Session, Error>?
    private var onChange: (@Sendable (Session?) -> Void)?

    /// The account is namespaced by backend host, so a local session and a
    /// production one coexist. One slot would mean every environment switch
    /// hands the new backend a token it must reject — a dead panel that reads
    /// as a bug rather than as a sign-out.
    private let account: String

    init(supabaseURL: URL, anonKey: String) {
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        self.account = "supabase@" + (supabaseURL.host() ?? "unknown")
        self.session = Keychain.read(account: account)
    }

    func setOnChange(_ handler: @escaping @Sendable (Session?) -> Void) {
        onChange = handler
        handler(session)
    }

    var isSignedIn: Bool { session != nil }

    func store(_ session: Session) {
        self.session = session
        Keychain.write(session, account: account)
        onChange?(session)
    }

    func signOut() {
        session = nil
        refreshTask?.cancel()
        refreshTask = nil
        Keychain.clear(account: account)
        onChange?(nil)
    }

    /// A token good for the next request, refreshed with 60s of headroom so
    /// one cannot expire mid-flight.
    func accessToken() async -> String? {
        guard let session else { return nil }
        guard session.expiresAt.timeIntervalSinceNow < 60 else { return session.accessToken }

        if let existing = refreshTask {
            return try? await existing.value.accessToken
        }
        let task = Task { try await refresh(session.refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }

        guard let refreshed = try? await task.value else {
            // The refresh token is spent or revoked: a real sign-out.
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

/// The login Keychain, holding one session per backend host. Not
/// `UserDefaults`: a refresh token is a long-lived credential.
///
/// **Every call shells out to `/usr/bin/security`. Do not replace this with
/// `SecItemCopyMatching`.** A grant is checked against a partition list as
/// well as an ACL, and macOS pins that list to the calling binary's `cdhash`
/// whenever the app has no team identifier. The hash changes with the code, so
/// an in-process read is a new caller on every build and prompts for the login
/// password, "Always Allow" included. `/usr/bin/security` has a fixed
/// identity, so one grant holds across rebuilds.
///
/// The trade: anything running as this user can invoke `security` too, so the
/// item rests on the login keychain's lock rather than on app identity. A
/// Developer ID would earn a `teamid:` partition — see `docs/tasks.md`.
private enum Keychain {
    private static let service = "dev.stint.session"

    static func read(account: String) -> Session? {
        guard let out = run(["find-generic-password", "-s", service, "-a", account, "-w"]),
              let data = out.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    /// No `-T`, deliberately: the caller is `security`, so a fresh item
    /// already trusts it, and `-T` with `-U` appends to the ACL — the one
    /// write still guarded by the owner's password, which would then be
    /// asked for at every hourly refresh.
    static func write(_ session: Session, account: String) {
        guard let data = try? JSONEncoder().encode(session),
              let json = String(data: data, encoding: .utf8)
        else { return }
        _ = run(["add-generic-password", "-U", "-s", service, "-a", account, "-w", json])
    }

    static func clear(account: String) {
        _ = run(["delete-generic-password", "-s", service, "-a", account])
    }

    /// Arguments go as argv, never through a shell: the session is JSON.
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

        let text = String(decoding: out, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }
}
