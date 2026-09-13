import Foundation

/// Signing in, by the same email link the web app uses.
///
/// **Not the PKCE code exchange the web performs**, and that is deliberate.
/// PKCE stores its verifier per origin, which is what makes two browser tabs
/// on `localhost:3100` clobber each other (see `CLAUDE.md`); a native app
/// holding its own verifier while the link opens in a *browser* has the same
/// split-brain problem in a worse form. Verifying the emailed token directly
/// keeps the whole exchange inside this process.
///
/// Sign in with Apple is what `docs/architecture.md` specifies long-term. It
/// needs a paid developer account, an App ID with the capability, and a
/// signed bundle — none of which a SwiftPM executable can produce — so this
/// is the flow that works today, and the API contract does not change when
/// Apple sign-in is added beside it.
actor Auth {
    private let supabaseURL: URL
    private let anonKey: String
    private let tokens: TokenStore

    init(supabaseURL: URL, anonKey: String, tokens: TokenStore) {
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        self.tokens = tokens
    }

    /// Email a sign-in link.
    ///
    /// `create_user: false` — this app signs existing accounts in and does not
    /// register. Signing up is a web concern, where the terms and the rest of
    /// the account live.
    func requestLink(email: String) async throws {
        var req = URLRequest(url: supabaseURL.appending(path: "/auth/v1/otp"))
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(
            ["email": email, "create_user": "false"]
        )

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            throw Self.error(from: data, status: status)
                ?? APIError(
                    status: status,
                    code: "UNKNOWN",
                    message: "Could not send the sign-in email."
                )
        }
    }

    /// Turn the emailed link into a session.
    ///
    /// The user pastes the whole link; the token is pulled out of it. Asking
    /// for a link rather than a 6-digit code is not a preference — this
    /// project's email template sends only a link, so a code field would be
    /// asking for something the email does not contain.
    func signIn(withLink link: String) async throws {
        guard let token = Self.token(in: link) else {
            throw APIError(
                status: 400,
                code: "INVALID_LINK",
                message: "That does not look like a sign-in link. Paste the whole link from the email."
            )
        }

        var req = URLRequest(url: supabaseURL.appending(path: "/auth/v1/verify"))
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // `token_hash`, NOT `token`. The value in the emailed URL is already
        // hashed and the plain `token` field rejects it as `otp_expired` —
        // which reads as an expired link and sends you hunting for the wrong
        // bug. Verified against a real GoTrue before this was written.
        req.httpBody = try JSONEncoder().encode(
            ["type": "magiclink", "token_hash": token]
        )

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            throw Self.error(from: data, status: status)
                ?? APIError(
                    status: status,
                    code: "INVALID_LINK",
                    message: "That link did not work. Links expire quickly and can only be used once."
                )
        }

        let session = try JSONDecoder().decode(Session.self, from: data)
        await tokens.store(session)
    }

    /// The `token=` value from a pasted sign-in URL.
    ///
    /// Tolerates `&amp;` because a link copied out of an HTML email carries
    /// the escaped separator — the same trap the e2e suite hit, where
    /// following it literally makes GoTrue read `amp;type` and 400.
    static func token(in link: String) -> String? {
        let cleaned = link
            .replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let range = cleaned.range(of: "token=") else { return nil }
        let rest = cleaned[range.upperBound...]
        let token = rest.prefix { $0 != "&" && !$0.isWhitespace }
        return token.isEmpty ? nil : String(token)
    }

    private static func error(from data: Data, status: Int) -> APIError? {
        struct Body: Decodable {
            let msg: String?
            let error_description: String?
            let error_code: String?
        }
        guard let body = try? JSONDecoder().decode(Body.self, from: data) else { return nil }
        guard let message = body.msg ?? body.error_description else { return nil }
        return APIError(
            status: status,
            code: body.error_code ?? "UNKNOWN",
            message: message
        )
    }
}
