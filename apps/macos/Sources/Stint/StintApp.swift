import SwiftUI

/// Where this build points.
///
/// Read from the environment so the same binary runs against the local stack
/// or production without a rebuild, defaulting to local — the safer default
/// for a tool that starts and stops billable timers, since the cost of
/// accidentally pointing at production is a wrong entry in real data.
enum Config {
    static let appURL = url("STINT_APP_URL", default: "http://localhost:3100")
    static let supabaseURL = url("STINT_SUPABASE_URL", default: "http://localhost:54321")

    /// The publishable key, which is public by design — it ships in the web
    /// bundle too. RLS is what protects the data, not this string.
    static let anonKey = ProcessInfo.processInfo.environment["STINT_SUPABASE_ANON_KEY"]
        ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

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

    var body: some Scene {
        MenuBarExtra {
            ContentView(model: model)
                .task { model.start() }
        } label: {
            // The menu bar shows the elapsed timer when one runs and today's
            // total when none does — the toggle `/summary` exists to serve,
            // answered from one request rather than two.
            //
            // A dot rather than a green title: the accent is a colour the
            // menu bar cannot be trusted to render (it tints for light and
            // dark automatically), and shape survives that where colour does
            // not — the same reason the web app reinforces timer state with
            // form and not colour alone.
            HStack(spacing: 4) {
                Image(systemName: model.isRunning ? "circle.fill" : "timer")
                Text(model.menuBarTitle)
                    .monospacedDigit()
            }
        }
        .menuBarExtraStyle(.window)
    }
}
