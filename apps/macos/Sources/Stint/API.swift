import Foundation

/// The shapes `/api/v1` returns, mirroring `rows.ts` field for field.
struct TimeEntry: Codable, Identifiable, Equatable {
    var id: String
    var projectId: String?
    var taskName: String
    var startedAt: Date
    var endedAt: Date?
    var isBillable: Bool
    var rateOverride: Double?
    var durationSeconds: Int?
    /// False is what puts an entry in the strange-duration row. `0` is a
    /// valid rate, so `rateOverride` is read for null, never for truth.
    var durationOk: Bool
    var invoiceId: String?
}

/// `GET /entries/task-names`: a name the user has typed before, with the
/// project it was last used on. One per name case-insensitively, keeping
/// the most recent spelling, which is what makes the lowercased name an id.
struct TaskName: Codable, Identifiable, Equatable {
    let taskName: String
    let projectId: String?
    let lastUsedAt: Date

    var id: String { taskName.lowercased() }
}

struct Project: Codable, Identifiable, Equatable {
    let id: String
    let clientId: String?
    let name: String
    let hourlyRate: Double?
    let isBillableDefault: Bool
    let archivedAt: Date?
}

struct Client: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let color: String?
}

/// `GET /stats`, narrowed to the one figure the panel shows: what today's
/// entries earn, the web's Today figure.
struct Stats: Codable, Equatable {
    let currency: String
    let earnedToday: Double
}

struct Summary: Codable, Equatable {
    let running: TimeEntry?
    let todaySeconds: Int
    let weekSeconds: Int
    let serverTime: Date
}

struct ProjectList: Codable { let projects: [Project] }
struct TaskNameList: Codable { let taskNames: [TaskName] }
struct ClientList: Codable { let clients: [Client] }

struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }
    var isTimerConflict: Bool { code == "TIMER_ALREADY_RUNNING" }
    var isUnauthorized: Bool { status == 401 || code == "UNAUTHORIZED" }
}

/// What the panel says about `error`. Every error site goes through this,
/// so a lost connection reads the same everywhere, and never as
/// Foundation's "A server with the specified hostname could not be found."
func userMessage(for error: Error) -> String {
    let offline: [URLError.Code] = [
        .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost,
        .networkConnectionLost, .timedOut, .dnsLookupFailed,
    ]
    if let error = error as? URLError, offline.contains(error.code) {
        return "Can’t reach Stint. Check your internet connection."
    }
    return error.localizedDescription
}

/// `/api/v1` as a bearer-token client.
actor API {
    private let baseURL: URL
    private let session: URLSession
    private let tokens: TokenStore

    init(baseURL: URL, tokens: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    /// Postgres sends fractional seconds on some columns and not others.
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = iso8601Fractional.date(from: text) ?? iso8601Plain.date(from: text) {
                return date
            }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Not an ISO-8601 instant: \(text)")
            )
        }
        return d
    }()

    /// `nonisolated(unsafe)`: configured here and never mutated again, and
    /// Foundation documents parsing and formatting as thread-safe.
    private nonisolated(unsafe) static let iso8601Fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private nonisolated(unsafe) static let iso8601Plain = ISO8601DateFormatter()

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(iso8601Fractional.string(from: date))
        }
        return e
    }()

    /// "Today" is a local-calendar question, so the client states its zone.
    func summary(timeZone: TimeZone = .current) async throws -> Summary {
        try await request("GET", "/summary?tz=\(timeZone.identifier)")
    }

    func stats(timeZone: TimeZone = .current) async throws -> Stats {
        try await request("GET", "/stats?tz=\(timeZone.identifier)")
    }

    /// Archived included: a finished engagement still owns the color on
    /// today's entries.
    func clients() async throws -> [Client] {
        let list: ClientList = try await request("GET", "/clients?includeArchived=true")
        return list.clients
    }

    /// Newest first, the server's ranking, which clients must not re-sort.
    func taskNames(limit: Int) async throws -> [TaskName] {
        let list: TaskNameList = try await request("GET", "/entries/task-names?limit=\(limit)")
        return list.taskNames
    }

    func projects() async throws -> [Project] {
        let list: ProjectList = try await request("GET", "/projects")
        return list.projects.filter { $0.archivedAt == nil }
    }

    /// A timer press's answer with `?include=summary`: the summary read after
    /// the write, so the press needs no refetch of it.
    struct Pressed: Codable {
        let entry: TimeEntry
        let included: Included
    }

    struct Included: Codable { let summary: Summary }

    struct StartTimer: Encodable {
        let id: String
        let taskName: String
        let projectId: String?
    }

    /// The id is a client-generated UUIDv7, so a retried start lands on the
    /// same row.
    func startTimer(
        id: String = uuidv7(),
        taskName: String,
        projectId: String?,
        timeZone: TimeZone = .current
    ) async throws -> Pressed {
        try await request(
            "POST", "/timer/start?include=summary&tz=\(timeZone.identifier)",
            body: StartTimer(
                id: id,
                taskName: taskName,
                projectId: projectId
            )
        )
    }

    private struct Empty: Encodable {}

    func stopTimer(timeZone: TimeZone = .current) async throws -> Pressed {
        try await request("POST", "/timer/stop?include=summary&tz=\(timeZone.identifier)", body: Empty())
    }

    struct UpdateTimer: Encodable {
        let taskName: String?
        let projectId: String?
    }

    func updateTimer(_ patch: UpdateTimer) async throws -> TimeEntry {
        try await request("PATCH", "/timer/current", body: patch)
    }

    private struct ErrorBody: Decodable {
        let code: String
        let message: String
    }

    private func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: (any Encodable)? = nil
    ) async throws -> T {
        guard let token = try await tokens.accessToken() else {
            throw APIError(status: 401, code: "UNAUTHORIZED", message: "Not signed in")
        }

        var req = URLRequest(url: URL(string: baseURL.absoluteString + "/api/v1" + path)!)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let bypass = Config.vercelBypass {
            req.setValue(bypass, forHTTPHeaderField: "x-vercel-protection-bypass")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try Self.encoder.encode(body)
        }

        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if let err = try? JSONDecoder().decode(ErrorBody.self, from: data) {
                throw APIError(status: status, code: err.code, message: err.message)
            }
            throw APIError(status: status, code: "UNKNOWN", message: "The server returned \(status).")
        }
        return try Self.decoder.decode(T.self, from: data)
    }
}
