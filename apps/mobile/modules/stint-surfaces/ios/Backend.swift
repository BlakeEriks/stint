import Foundation

/// `/api/v1` with the app's session, as `src/request.ts` sends it: a bearer
/// token refreshed with a minute's headroom, one refresh and retry on a
/// 401, and Vercel's bypass on a preview. A refresh is stored where the
/// app's JS reads it, and JS takes it rather than spending its own
/// (`refresh()` in `src/session.ts`).
struct Backend {
  struct Refusal: Error { let message: String }

  /// Constitution VI: a silent server fails the prediction after 10s.
  private static let timeout: TimeInterval = 10
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

  func post(_ path: String, _ body: [String: Any]) async throws -> (Int, [String: Any]) {
    var session = try load()
    if session.expiresAt - Date().timeIntervalSince1970 <= Self.headroom {
      session = try await refresh(session)
    }
    var (status, answer) = try await call(path, body, session.accessToken)
    if status == 401, answer["code"] is String {
      session = try await refresh(session)
      (status, answer) = try await call(path, body, session.accessToken)
    }
    return (status, answer)
  }

  private func call(_ path: String, _ body: [String: Any], _ token: String) async throws -> (Int, [String: Any]) {
    guard let url = URL(string: "\(origin)/api/v1\(path)") else { throw Refusal(message: "no server") }
    var req = URLRequest(url: url, timeoutInterval: Self.timeout)
    req.httpMethod = "POST"
    req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    if let pass = SecureStore.get(bypassKey) {
      req.setValue(pass, forHTTPHeaderField: "x-vercel-protection-bypass")
    }
    req.httpBody = try JSONSerialization.data(withJSONObject: body)
    return try await send(req)
  }

  private func send(_ req: URLRequest) async throws -> (Int, [String: Any]) {
    let (data, res) = try await URLSession.shared.data(for: req)
    let status = (res as? HTTPURLResponse)?.statusCode ?? 0
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    return (status, json)
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
    var req = URLRequest(url: url, timeoutInterval: Self.timeout)
    req.httpMethod = "POST"
    req.setValue(supabaseKey, forHTTPHeaderField: "apikey")
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": current.refreshToken])
    let (status, body) = try await send(req)
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
    if let data = try? JSONSerialization.data(withJSONObject: raw),
      let text = String(data: data, encoding: .utf8)
    {
      SecureStore.set(sessionKey, text)
    }
    return Session(raw: raw)
  }
}
