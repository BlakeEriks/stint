import Foundation

/// Sign-in by emailed six-digit code, verified in-process against GoTrue.
/// `CLAUDE.md` has why it is a code and not a link.
actor Auth {
    private let supabaseURL: URL
    private let anonKey: String
    private let tokens: TokenStore

    init(supabaseURL: URL, anonKey: String, tokens: TokenStore) {
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        self.tokens = tokens
    }

    /// `type: "email"`, not `"magiclink"`: that is the type for the hashed
    /// token in a link and rejects a typed code.
    func signIn(withCode code: String, email: String) async throws {
        let digits = code.filter(\.isNumber)
        guard digits.count == 6 else {
            throw APIError(status: 400, code: "INVALID_CODE", message: "A sign-in code is six digits.")
        }
        let (data, status) = try await post(
            "/auth/v1/verify", ["type": "email", "email": email, "token": digits]
        )
        guard status == 200 else {
            throw Self.error(from: data, status: status)
                ?? APIError(
                    status: status, code: "INVALID_CODE",
                    message: "That code didn’t work. Codes work once and expire after 24 hours."
                )
        }
        await tokens.store(try JSONDecoder().decode(Session.self, from: data))
    }

    /// A preview build's seeded account (`Config.previewAccount`).
    func signIn(email: String, password: String) async throws {
        let (data, status) = try await post(
            "/auth/v1/token", query: [URLQueryItem(name: "grant_type", value: "password")],
            ["email": email, "password": password]
        )
        guard status == 200 else {
            throw Self.error(from: data, status: status)
                ?? APIError(status: status, code: "UNKNOWN", message: "Couldn’t sign in as \(email).")
        }
        await tokens.store(try JSONDecoder().decode(Session.self, from: data))
    }

    private func post(
        _ path: String, query: [URLQueryItem] = [], _ body: some Encodable
    ) async throws -> (Data, Int) {
        var req = URLRequest(url: supabaseURL.appending(path: path).appending(queryItems: query))
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: req)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    private static func error(from data: Data, status: Int) -> APIError? {
        struct Body: Decodable {
            let msg: String?
            let error_description: String?
            let error_code: String?
        }
        guard let body = try? JSONDecoder().decode(Body.self, from: data),
              let message = body.msg ?? body.error_description
        else { return nil }
        return APIError(status: status, code: body.error_code ?? "UNKNOWN", message: message)
    }
}
