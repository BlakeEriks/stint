import Foundation

/// The shapes `/api/v1` returns, mirroring `rows.ts` field for field.
/// Hand-written and unchecked against `packages/schema`: a renamed field
/// fails here at runtime.
struct TimeEntry: Codable, Identifiable, Equatable {
    let id: String
    let projectId: String?
    let taskName: String
    let startedAt: Date
    let endedAt: Date?
    let isBillable: Bool
    let rateOverride: Double?
    let durationSeconds: Int?
    /// False is what puts an entry in the strange-duration row. `0` is a
    /// valid rate, so `rateOverride` is read for null, never for truth.
    let durationOk: Bool
    let invoiceId: String?
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

/// `GET /stats`, narrowed to the one figure the panel shows. Unbilled is
/// work done and not yet invoiced — never summed with `awaitingPayment`.
struct Stats: Codable, Equatable {
    struct Unbilled: Codable, Equatable {
        let total: Double
    }
    let currency: String
    let unbilled: Unbilled
}

struct Summary: Codable, Equatable {
    let running: TimeEntry?
    let todaySeconds: Int
    let weekSeconds: Int
    let exceedsThreshold: Bool
    let maxTimerHours: Double
    let serverTime: Date
}

private struct ProjectList: Codable { let projects: [Project] }
private struct EntryList: Codable { let entries: [TimeEntry] }
private struct ClientList: Codable { let clients: [Client] }

struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }
    var isTimerConflict: Bool { code == "TIMER_ALREADY_RUNNING" }
    var isUnauthorized: Bool { status == 401 || code == "UNAUTHORIZED" }
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
    private static let decoder: JSONDecoder = {
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

    /// Archived included: a finished engagement still owns the colour on
    /// today's entries.
    func clients() async throws -> [Client] {
        let list: ClientList = try await request("GET", "/clients?includeArchived=true")
        return list.clients
    }

    func entries(from: Date) async throws -> [TimeEntry] {
        // A bare `+` in a query string decodes as a space on the server.
        let stamp = Self.iso8601Fractional.string(from: from)
        let escaped = stamp.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? stamp
        let list: EntryList = try await request("GET", "/entries?from=\(escaped)")
        return list.entries
    }

    func projects() async throws -> [Project] {
        let list: ProjectList = try await request("GET", "/projects")
        return list.projects.filter { $0.archivedAt == nil }
    }

    struct StartTimer: Encodable {
        let id: String
        let taskName: String
        let projectId: String?
        /// Nil leaves the column's own default; set, it carries a resumed
        /// entry's own answer.
        let isBillable: Bool?
    }

    /// The id is a client-generated UUIDv7, so a retried start lands on the
    /// same row.
    func startTimer(
        taskName: String,
        projectId: String?,
        isBillable: Bool? = nil
    ) async throws -> TimeEntry {
        try await request(
            "POST", "/timer/start",
            body: StartTimer(
                id: uuidv7(),
                taskName: taskName,
                projectId: projectId,
                isBillable: isBillable
            )
        )
    }

    private struct Empty: Encodable {}

    func stopTimer() async throws -> TimeEntry {
        try await request("POST", "/timer/stop", body: Empty())
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
        guard let token = await tokens.accessToken() else {
            throw APIError(status: 401, code: "UNAUTHORIZED", message: "Not signed in")
        }

        var req = URLRequest(url: URL(string: baseURL.absoluteString + "/api/v1" + path)!)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
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

/// A UUIDv7, the scheme `uuidv7()` in `@stint/core` uses: 48 bits of
/// big-endian milliseconds, then randomness.
func uuidv7(now: Date = Date()) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let millis = UInt64(now.timeIntervalSince1970 * 1000)
    for i in 0..<6 { bytes[i] = UInt8((millis >> (40 - 8 * UInt64(i))) & 0xFF) }
    for i in 6..<16 { bytes[i] = UInt8.random(in: 0...255) }
    bytes[6] = (bytes[6] & 0x0F) | 0x70
    bytes[8] = (bytes[8] & 0x3F) | 0x80

    var hex = bytes.map { String(format: "%02x", $0) }.joined()
    for offset in [20, 16, 12, 8] {
        hex.insert("-", at: hex.index(hex.startIndex, offsetBy: offset))
    }
    return hex
}
