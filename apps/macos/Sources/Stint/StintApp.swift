import SwiftUI

/// Where this build points. Read from the environment, defaulting to the
/// local stack: this tool starts and stops billable timers.
enum Config {
    static let appURL = url("STINT_APP_URL", default: "http://localhost:3100")
    static let supabaseURL = url("STINT_SUPABASE_URL", default: "http://localhost:54321")
    /// Public by design; RLS protects the data.
    static let anonKey = ProcessInfo.processInfo.environment["STINT_SUPABASE_ANON_KEY"]
        ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

    /// What the panel calls this backend. Nil for local, which needs no
    /// marking: it is the default, and a local timer bills nobody.
    static let environmentName: String? = {
        guard let host = supabaseURL.host(), host != "localhost" else { return nil }
        return ProcessInfo.processInfo.environment["STINT_ENV"] ?? "prod"
    }()

    /// A preview build's seeded account, signed in on launch. `try-mac` bakes
    /// it in; every other build signs in by emailed code.
    static let previewAccount: (email: String, password: String)? = {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["STINT_PREVIEW_EMAIL"], let password = env["STINT_PREVIEW_PASSWORD"]
        else { return nil }
        return (email, password)
    }()

    /// Vercel's protection bypass, which a preview deployment asks of every request.
    static let vercelBypass = ProcessInfo.processInfo.environment["STINT_VERCEL_BYPASS"]

    private static func url(_ key: String, default fallback: String) -> URL {
        URL(string: ProcessInfo.processInfo.environment[key] ?? fallback)!
    }
}

@main
struct StintApp: App {
    @State private var model: TimerModel

    init() {
        let tokens = TokenStore(supabaseURL: Config.supabaseURL, anonKey: Config.anonKey)
        let api = API(baseURL: Config.appURL, tokens: tokens)
        let auth = Auth(supabaseURL: Config.supabaseURL, anonKey: Config.anonKey, tokens: tokens)
        _model = State(initialValue: TimerModel(api: api, auth: auth, tokens: tokens))
    }

    /// Amber outranks green: a runaway is still running, and the bar is how
    /// it reaches someone whose panel is shut.
    private var pipFill: Color {
        guard model.isRunning else { return Tokens.Dark.timerIdle }
        return model.exceedsThreshold ? Tokens.Dark.warning : Tokens.Dark.accentDefault
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView(model: model)
                .task { model.start() }
        } label: {
            // The label exists from launch; the panel's content does not
            // exist until first opened, so the loops start here.
            HStack(spacing: 7) {
                Image(nsImage: pipImage(fill: NSColor(pipFill)))
                // A fixed slot, so the count of digits changing from 9:59:59
                // to 10:00:00 does not slide the pip. 57pt holds the wider.
                Text(model.menuBarTitle)
                    .monospacedDigit()
                    .frame(width: 57, alignment: .trailing)
            }
            .task { model.start() }
        }
        .menuBarExtraStyle(.window)
    }
}
