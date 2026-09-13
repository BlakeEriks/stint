import Foundation

/// The shapes `/api/v1` actually returns.
///
/// Hand-written rather than generated, and that is a liability the repo
/// already names: `docs/architecture.md` wants an OpenAPI spec from the Zod
/// schemas to keep these honest. Until that exists, a field renamed in
/// `packages/schema` fails here at runtime, not at build time — so these
/// mirror `rows.ts` field for field and nothing else may be added to them.
struct TimeEntry: Codable, Identifiable, Equatable {
    let id: String
    let projectId: String?
    let taskName: String
    let startedAt: Date
    let endedAt: Date?
    let isBillable: Bool
    let durationSeconds: Int?
    let invoiceId: String?
}

struct Project: Codable, Identifiable, Equatable {
    let id: String
    let clientId: String?
    let name: String
    let archivedAt: Date?
}

private struct ProjectList: Codable {
    let projects: [Project]
}

/// `GET /summary` — the one call this app is built around.
///
/// It carries the running entry AND the day total precisely so the menu bar
/// can toggle between them without a second request.
struct Summary: Codable, Equatable {
    let running: TimeEntry?
    let todaySeconds: Int
    let weekSeconds: Int
    let exceedsThreshold: Bool
    let maxTimerHours: Double
    /// The server's clock, so a skewed device does not count wrong.
    let serverTime: Date
}

/// A documented error from the API, carrying the code the routes promise.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }

    /// `409` from `/timer/start`: someone already has a timer running, which
    /// is the invariant the database enforces rather than a bug to retry.
    var isTimerConflict: Bool { code == "TIMER_ALREADY_RUNNING" }
    var isUnauthorized: Bool { status == 401 || code == "UNAUTHORIZED" }
}

/// Talks to `/api/v1` as a bearer-token client.
///
/// The web app sends a cookie; every native client sends the JWT in an
/// `Authorization` header. `requireSession()` accepts both.
actor API {
    private let baseURL: URL
    private let session: URLSession
    private let tokens: TokenStore

    init(baseURL: URL, tokens: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    /// Dates cross the wire as ISO-8601, and Postgres sends fractional
    /// seconds on some columns and not others — `.iso8601` alone rejects the
    /// fractional form, which is why this parses both rather than assuming.
    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = iso8601Fractional.date(from: text) { return date }
            if let date = iso8601Plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(
                .init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Not an ISO-8601 instant: \(text)"
                )
            )
        }
        return d
    }()

    private static let iso8601Fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let iso8601Plain = ISO8601DateFormatter()

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(iso8601Fractional.string(from: date))
        }
        return e
    }()

    func summary(timeZone: TimeZone = .current) async throws -> Summary {
        // "Today" is a local-calendar question the server cannot infer, so
        // the client states its zone. The route falls back to UTC.
        try await request(
            "GET",
            "/summary?tz=\(timeZone.identifier)",
            body: Optional<Never>.none
        )
    }

    func projects() async throws -> [Project] {
        let list: ProjectList = try await request(
            "GET",
            "/projects",
            body: Optional<Never>.none
        )
        // An archived project is a finished engagement; offering it in the
        // picker invites logging against work that has ended.
        return list.projects.filter { $0.archivedAt == nil }
    }

    struct StartTimer: Encodable {
        /// Client-generated UUIDv7, so a retried start lands on the same row
        /// instead of creating a second entry.
        let id: String
        let taskName: String
        let projectId: String?
    }

    func startTimer(taskName: String, projectId: String?) async throws -> TimeEntry {
        try await request(
            "POST",
            "/timer/start",
            body: StartTimer(id: uuidv7(), taskName: taskName, projectId: projectId)
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

    /// Retitle or reassign the entry that is running.
    func updateTimer(_ patch: UpdateTimer) async throws -> TimeEntry {
        try await request("PATCH", "/timer/current", body: patch)
    }

    private func request<Body: Encodable, T: Decodable>(
        _ method: String,
        _ path: String,
        body: Body?
    ) async throws -> T {
        guard let token = await tokens.accessToken() else {
            throw APIError(status: 401, code: "UNAUTHORIZED", message: "Not signed in")
        }

        var req = URLRequest(url: baseURL.appending(path: "/api/v1").appending(path: path))
        // `appending(path:)` percent-escapes the query, so the URL is built
        // from the string instead when one is present.
        if path.contains("?"), let url = URL(string: baseURL.absoluteString + "/api/v1" + path) {
            req = URLRequest(url: url)
        }
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try Self.encoder.encode(body)
        }

        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard (200..<300).contains(status) else {
            // The routes answer with a flat `{ code, message }`; anything
            // else is a proxy or a crash, and saying so beats a decode error.
            if let err = try? JSONDecoder().decode(ErrorBody.self, from: data) {
                throw APIError(status: status, code: err.code, message: err.message)
            }
            throw APIError(
                status: status,
                code: "UNKNOWN",
                message: "The server returned \(status)."
            )
        }

        if T.self == EmptyResponse.self, let empty = EmptyResponse() as? T { return empty }
        return try Self.decoder.decode(T.self, from: data)
    }

    private struct ErrorBody: Decodable {
        let code: String
        let message: String
    }
}

struct EmptyResponse: Decodable {}

/// A UUIDv7: 48 bits of big-endian milliseconds, then randomness.
///
/// The same scheme the web client uses (`uuidv7()` in `@stint/core`), and for
/// the same reason — a client-supplied id makes a retried insert idempotent,
/// so a start that times out and is sent again cannot produce two entries.
func uuidv7(now: Date = Date()) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let millis = UInt64(now.timeIntervalSince1970 * 1000)

    bytes[0] = UInt8((millis >> 40) & 0xFF)
    bytes[1] = UInt8((millis >> 32) & 0xFF)
    bytes[2] = UInt8((millis >> 24) & 0xFF)
    bytes[3] = UInt8((millis >> 16) & 0xFF)
    bytes[4] = UInt8((millis >> 8) & 0xFF)
    bytes[5] = UInt8(millis & 0xFF)

    for i in 6..<16 { bytes[i] = UInt8.random(in: 0...255) }
    bytes[6] = (bytes[6] & 0x0F) | 0x70  // version 7
    bytes[8] = (bytes[8] & 0x3F) | 0x80  // RFC 4122 variant

    let hex = bytes.map { String(format: "%02x", $0) }.joined()
    let s = Array(hex)
    return String(s[0..<8]) + "-" + String(s[8..<12]) + "-"
        + String(s[12..<16]) + "-" + String(s[16..<20]) + "-" + String(s[20..<32])
}

private extension String {
    init(_ slice: ArraySlice<Character>) { self.init(String(Array(slice))) }
}
