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
        /* A struct, not a dictionary. `["email": …, "create_user": "false"]`
           is a [String: String], so the bool went over the wire quoted and
           GoTrue answered "cannot unmarshal string into Go struct field
           OtpParams.create_user of type bool". Swift will not mix value types
           in a literal, and a struct is the fix rather than [String: Any]. */
        /* No `redirect_to`: nothing is being redirected anywhere. The same
           request produces both a link and a six-digit code, and this app
           uses the code — so where a browser would land is not its concern. */
        struct Body: Encodable {
            let email: String
            let create_user: Bool
        }
        req.httpBody = try JSONEncoder().encode(
            Body(email: email, create_user: false)
        )

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            let reported = Self.error(from: data, status: status)

            /* `otp_disabled` is what GoTrue answers when `create_user` is
               false and the address has no account — but its message is
               "Signups not allowed for otp", which describes a server setting
               rather than the thing that went wrong, and leaves nowhere to
               go. The account not existing is the fact; the web app is the
               remedy. */
            if reported?.code == "otp_disabled" {
                throw APIError(
                    status: status,
                    code: "NO_ACCOUNT",
                    message: "No Stint account for that email. Create one in the app first, then sign in here."
                )
            }

            throw reported
                ?? APIError(
                    status: status,
                    code: "UNKNOWN",
                    message: "Could not send the sign-in email."
                )
        }
    }

    /**
     Turn the emailed six-digit code into a session.

     A CODE, not a link, and that is the whole reason this is tolerable on the
     desktop. A magic link has to reach a different application than the one
     that opened it: pasting it puts a bearer credential through the
     clipboard, and a custom URL scheme is refused by browsers when it is the
     target of a *redirect* — silently, so the failure surfaces as "Bad
     request" from a fallback request rather than as anything true.

     A code is typed by a person. Nothing has to hand anything to anything.

     GoTrue generates one for every magic link whether the email shows it or
     not; `supabase/templates/magic_link.html` is what puts it in front of the
     user, and `{{ .Token }}` is the field.
     */
    func signIn(withCode code: String, email: String) async throws {
        let digits = code.filter(\.isNumber)
        guard digits.count == 6 else {
            throw APIError(
                status: 400,
                code: "INVALID_CODE",
                message: "A sign-in code is six digits."
            )
        }

        var req = URLRequest(url: supabaseURL.appending(path: "/auth/v1/verify"))
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // `type: "email"` — NOT "magiclink", which is the type for the hashed
        // token in a link and rejects a typed code.
        req.httpBody = try JSONEncoder().encode(
            ["type": "email", "email": email, "token": digits]
        )

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            throw Self.error(from: data, status: status)
                ?? APIError(
                    status: status,
                    code: "INVALID_CODE",
                    message: "That code did not work. Codes expire quickly and can only be used once."
                )
        }

        let session = try JSONDecoder().decode(Session.self, from: data)
        await tokens.store(session)
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
