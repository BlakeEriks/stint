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
        let model = TimerModel(api: api, auth: auth, tokens: tokens)
        _model = State(initialValue: model)

    }

    /// Amber outranks green: a runaway is still running, and the whole point
    /// of surfacing it on the bar is that it reaches someone whose panel is
    /// shut.
    private var pipFill: Color {
        guard model.isRunning else { return Tokens.Dark.timerIdle }
        return model.exceedsThreshold ? Tokens.Dark.warning : Tokens.Dark.accentDefault
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView(model: model)
                /* Re-reconciles on each open; the ticker and poller are
                   already running by then. `start()` is idempotent, so this
                   is "the panel was just opened, check now" rather than a
                   second set of loops. */
                .task { model.start() }
        } label: {
            // The menu bar shows the elapsed timer when one runs and today's
            // total when none does — the toggle `/summary` exists to serve,
            // answered from one request rather than two.
            //
            // The pip carries the state and the readout carries the number.
            // `menubar.html` is the spec; the fills are its three.
            //
            // The accent here is the DARK value. On a light menu bar #52FC43
            // is ~1.6:1, which is why the light palette drops it to #1F7E17 —
            // if the pip ever looks washed out on a light bar, that swap is
            // the fix, not a brighter green.
            //
            // `timerIdle` stopped rather than a template image: a template is
            // a mask that takes the bar's own foreground, so the stopped pip
            // would be as loud as a running one.
            /* 7pt, not 4. The clock beside it is mono and the pip is small,
               so a tight gap reads as a prefix on the number rather than an
               icon of its own. */
            /* `task` on the LABEL, not on the panel's content.
               `MenuBarExtra` does not build its content until the panel is
               first opened, so starting there left the menu bar stale until
               it was clicked — a running timer did not count, and one stopped
               on another device still read as running. The label is built at
               launch, which is when the readout needs to start being right.

               `init()` was tried first and is worse than it looks: a `Task`
               spawned there may never run, because SwiftUI can initialise an
               App before the run loop is ready. It failed silently, with zero
               network connections, which is exactly how it was found. */
            HStack(spacing: 7) {
                Image(nsImage: pipImage(fill: NSColor(pipFill)))
                /* Right-aligned in a fixed slot, so the MARK never moves.
                   `MenuBarExtra` centres its whole label, so a clock that
                   grows from 9:59:59 to 10:00:00 re-centres everything and
                   slides the icon left — small, constant, and exactly the
                   kind of drift that makes a menu bar feel unsettled.
                   `monospacedDigit` does not help: the digit COUNT changes,
                   not the glyph widths.

                   57pt is measured, not guessed: at the menu bar's 13pt font
                   `9:59:59` is 48.1pt and `10:00:00` is 56.2pt, which is the
                   8pt slide you can see. The slot holds the wider of the two,
                   so the only jump left is past 100 hours. */
                Text(model.menuBarTitle)
                    .monospacedDigit()
                    .frame(width: 57, alignment: .trailing)
            }
            .task { model.start() }
        }
        .menuBarExtraStyle(.window)
    }
}
