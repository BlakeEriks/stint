import Foundation

/// `/api/v1` with the app's session, as `src/request.ts` sends it: a bearer
/// token refreshed with a minute's headroom, one refresh and retry on a
/// 401, and Vercel's bypass on a preview. A refresh is stored where the
/// app's JS reads it, and JS takes it rather than spending its own
/// (`refresh()` in `src/session.ts`).
struct Backend {
  struct Refusal: Error { let message: String }

  private static let headroom: Double = 60

  let origin: String
  let supabaseUrl: String
  let supabaseKey: String
  let sessionKey: String
  let bypassKey: String

  init(_ b: [String: String]) {
    origin = b["origin"] ?? ""
    supabaseUrl = b["supabaseUrl"] ?? ""
    supabaseKey = b["supabaseKey"] ?? ""
    sessionKey = b["session"] ?? ""
    bypassKey = b["bypass"] ?? ""
  }

  /// `body` nil: a GET. Answers the status and the JSON body's data.
  func request(_ path: String, _ body: Data?) async throws -> (Int, Data) {
    var session = try load()
    if session.expiresAt - Date().timeIntervalSince1970 <= Self.headroom {
      session = try await refresh(session)
    }
    var (status, answer) = try await call(path, body, session.accessToken)
    if status == 401, Self.json(answer)["code"] is String {
      session = try await refresh(session)
      (status, answer) = try await call(path, body, session.accessToken)
    }
    return (status, answer)
  }

  private func call(_ path: String, _ body: Data?, _ token: String) async throws -> (Int, Data) {
    guard let url = URL(string: "\(origin)/api/v1\(path)") else { throw Refusal(message: "no server") }
    var req = URLRequest(url: url)
    req.httpMethod = body == nil ? "GET" : "POST"
    req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    if let pass = SecureStore.get(bypassKey) {
      req.setValue(pass, forHTTPHeaderField: "x-vercel-protection-bypass")
    }
    req.httpBody = body
    return try await send(req)
  }

  private func send(_ req: URLRequest) async throws -> (Int, Data) {
    let (data, res) = try await URLSession.shared.data(for: req)
    return ((res as? HTTPURLResponse)?.statusCode ?? 0, data)
  }

  /// A body as JSON; one that isn't, such as Vercel's page, as none.
  static func json(_ data: Data) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
  }

  // MARK: The session, as `src/session.ts` stores it

  struct Session {
    var raw: [String: Any]
    var accessToken: String { raw["accessToken"] as? String ?? "" }
    var refreshToken: String { raw["refreshToken"] as? String ?? "" }
    var expiresAt: Double { raw["expiresAt"] as? Double ?? 0 }
  }

  private func load() throws -> Session {
    guard
      let text = SecureStore.get(sessionKey),
      let raw = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
    else { throw Refusal(message: "open Stint to sign in") }
    return Session(raw: raw)
  }

  /// GoTrue rejecting the refresh token is the app's to act on: it signs
  /// out when it next asks, so this press only says so.
  private func refresh(_ current: Session) async throws -> Session {
    guard let url = URL(string: "\(supabaseUrl)/auth/v1/token?grant_type=refresh_token") else {
      throw Refusal(message: "no server")
    }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue(supabaseKey, forHTTPHeaderField: "apikey")
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": current.refreshToken])
    let (status, data) = try await send(req)
    let body = Self.json(data)
    guard status == 200,
      let access = body["access_token"] as? String,
      let refresh = body["refresh_token"] as? String,
      let expires = body["expires_at"] as? Double
    else {
      if (400..<500).contains(status), status != 408, status != 429 {
        throw Refusal(message: "open Stint to sign in again")
      }
      throw URLError(.badServerResponse)
    }
    var raw = current.raw
    raw["accessToken"] = access
    raw["refreshToken"] = refresh
    raw["expiresAt"] = expires
    // Stored where the app's JS takes it, or the rotated token is lost.
    let stored = try JSONSerialization.data(withJSONObject: raw)
    try SecureStore.set(sessionKey, String(decoding: stored, as: UTF8.self))
    return Session(raw: raw)
  }
}
