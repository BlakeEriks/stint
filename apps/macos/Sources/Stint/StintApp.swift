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

    /// The panel in an ordinary window instead of the menu bar, for QA that
    /// never opens the menu bar. `./qa.sh` sets it.
    static let windowed = ProcessInfo.processInfo.environment["STINT_WINDOW"] != nil

    private static func url(_ key: String, default fallback: String) -> URL {
        URL(string: ProcessInfo.processInfo.environment[key] ?? fallback)!
    }
}

@main
enum Launch {
    static func main() {
        Config.windowed ? WindowedApp.main() : StintApp.main()
    }

    @MainActor static func model() -> TimerModel {
        let tokens = TokenStore(supabaseURL: Config.supabaseURL, anonKey: Config.anonKey)
        let api = API(baseURL: Config.appURL, tokens: tokens)
        let auth = Auth(supabaseURL: Config.supabaseURL, anonKey: Config.anonKey, tokens: tokens)
        return TimerModel(api: api, auth: auth, tokens: tokens)
    }
}

/// The same panel in an ordinary window, so QA never has to open the menu bar.
struct WindowedApp: App {
    @State private var model = Launch.model()

    var body: some Scene {
        Window("Stint", id: "panel") {
            ContentView(model: model)
                .task { model.start() }
        }
        .windowResizability(.contentSize)
    }
}

struct StintApp: App {
    @State private var model = Launch.model()

    private var pipFill: Color {
        model.isRunning ? Tokens.Dark.accentDefault : Tokens.Dark.timerIdle
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView(model: model)
                .task { model.start() }
        } label: {
            // The label exists from launch; the panel's content does not
            // exist until first opened, so the loops start here.
            Image(nsImage: barImage(fill: NSColor(pipFill), clock: model.menuBarTitle))
                .task { model.start() }
        }
        .menuBarExtraStyle(.window)
    }
}
