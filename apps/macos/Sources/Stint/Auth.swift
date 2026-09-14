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

    /// `create_user: false` — this app signs existing accounts in; signing
    /// up is a web concern. A struct, so the bool is not sent quoted.
    func requestLink(email: String) async throws {
        struct Body: Encodable {
            let email: String
            let create_user: Bool
        }
        let (data, status) = try await post("/auth/v1/otp", Body(email: email, create_user: false))
        guard status == 200 else {
            let reported = Self.error(from: data, status: status)
            // GoTrue's answer for "no such account" is "Signups not allowed
            // for otp", which names a server setting rather than the fact.
            if reported?.code == "otp_disabled" {
                throw APIError(
                    status: status, code: "NO_ACCOUNT",
                    message: "No Stint account for that email. Create one in the app first, then sign in here."
                )
            }
            throw reported
                ?? APIError(status: status, code: "UNKNOWN", message: "Could not send the sign-in email.")
        }
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
                    message: "That code did not work. Codes expire quickly and can only be used once."
                )
        }
        await tokens.store(try JSONDecoder().decode(Session.self, from: data))
    }

    private func post(_ path: String, _ body: some Encodable) async throws -> (Data, Int) {
        var req = URLRequest(url: supabaseURL.appending(path: path))
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
