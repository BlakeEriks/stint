import AppKit
import Foundation
import Observation

/// The app's whole state: who is signed in, what is running, what to show.
///
/// **The server owns timer truth; this owns responsiveness.** The readout
/// ticks locally from `startedAt` so the seconds are smooth and cost nothing,
/// and `GET /summary` decides every 60s whether a timer is actually running.
/// Starting is never arbitrated here — the database's partial unique index
/// does that, and this only translates its 409.
@MainActor
@Observable
final class TimerModel {
    // MARK: Presented state

    private(set) var summary: Summary?
    /// Only the Unbilled figure is read from this. Nil until the first fetch,
    /// and the row simply omits the number rather than showing a zero that
    /// would read as "nothing owed".
    private(set) var stats: Stats?

    /// Today's finished entries, newest first. The running one is excluded —
    /// it is the readout at the top of the panel, and listing it twice would
    /// make the same work look like two records.
    private(set) var today: [TimeEntry] = []

    private(set) var clients: [Client] = []

    /// Project id → its client's colour, the same resolution
    /// `useProjectColors()` does on the web.
    ///
    /// **Here rather than in the view**, so one place decides what a colour
    /// means. A project with no client has none — internal work is a real
    /// state, not a missing one, and it renders with no dot rather than a
    /// grey stand-in.
    var projectColors: [String: String] {
        let byClient = Dictionary(
            clients.compactMap { c in c.color.map { (c.id, $0) } },
            uniquingKeysWith: { a, _ in a }
        )
        return Dictionary(
            projects.compactMap { p in
                guard let clientID = p.clientId, let hex = byClient[clientID]
                else { return nil }
                return (p.id, hex)
            },
            uniquingKeysWith: { a, _ in a }
        )
    }
    private(set) var projects: [Project] = []
    private(set) var email: String?
    private(set) var isSignedIn = false
    private(set) var errorMessage: String?
    private(set) var isBusy = false

    /// Ticks once a second so the readout redraws. Held rather than derived
    /// so a SwiftUI view observes exactly one changing value.
    private(set) var now = Date()

    /// What the user is composing before a timer exists.
    var draftTaskName = ""
    var draftProjectID: String?

    // MARK: Collaborators

    private let api: API
    private let auth: Auth
    private let tokens: TokenStore

    /// The device clock minus the server's, from the last reconcile.
    ///
    /// A laptop several minutes off would otherwise render an elapsed time
    /// that disagrees with every other client. Applied to every calculation
    /// rather than to the stored dates, so the correction moves when a later
    /// poll measures a different skew.
    private var skew: TimeInterval = 0

    private var ticker: Task<Void, Never>?
    private var poller: Task<Void, Never>?

    init(api: API, auth: Auth, tokens: TokenStore) {
        self.api = api
        self.auth = auth
        self.tokens = tokens
    }

    // MARK: Derived

    var running: TimeEntry? { summary?.running }
    var isRunning: Bool { summary?.running != nil }

    /// Seconds on the running timer, counted locally and skew-corrected.
    var elapsedSeconds: Int {
        guard let running = summary?.running else { return 0 }
        return max(0, Int(now.addingTimeInterval(-skew).timeIntervalSince(running.startedAt)))
    }

    /// Today's total, including the live timer.
    ///
    /// `/summary` already folded the running entry in as of the fetch, so the
    /// live count is added from THAT moment rather than from `startedAt` —
    /// adding the full elapsed time again would double-count it.
    var todaySeconds: Int {
        guard let summary else { return 0 }
        guard summary.running != nil else { return summary.todaySeconds }
        let sinceFetch = max(0, Int(now.addingTimeInterval(-skew).timeIntervalSince(summary.serverTime)))
        return summary.todaySeconds + sinceFetch
    }

    /// What the menu bar itself shows.
    var menuBarTitle: String {
        isRunning ? format(elapsedSeconds) : format(todaySeconds)
    }

    /// Past `max_timer_hours`. Surfaced, never acted on: the app does not
    /// trim a timer, it says something looks wrong and leaves the choice.
    var exceedsThreshold: Bool { summary?.exceedsThreshold ?? false }

    var runningProject: Project? {
        guard let id = summary?.running?.projectId else { return nil }
        return projects.first { $0.id == id }
    }

    // MARK: Lifecycle

    /// Whether `start()` has already run. `MenuBarExtra(.window)` rebuilds
    /// its content view every time the panel is opened, so the `.task` that
    /// calls this fires on each open — and restarting the ticker and poller
    /// each time cancelled whatever request was in flight, which surfaced as
    /// a red "cancelled" that appeared and vanished as the panel opened.
    private var started = false

    func start() {
        guard !started else {
            // Already running; a fresh open is still a good moment to
            // reconcile, since the panel may have been shut for hours.
            Task { await refresh() }
            return
        }
        started = true

        Task {
            await tokens.setOnChange { [weak self] session in
                Task { @MainActor in
                    self?.isSignedIn = session != nil
                    self?.email = session?.email
                }
            }
            if await tokens.isSignedIn { await refresh() }
        }
        startTicking()
        startPolling()
    }

    private func startTicking() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                await MainActor.run { self?.now = Date() }
            }
        }
    }

    /// Reconcile every 60s. The interval is not about smoothness — the local
    /// tick handles that — it is about noticing a timer started or stopped on
    /// another device.
    private func startPolling() {
        poller?.cancel()
        poller = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard let self, self.isSignedIn else { continue }
                await self.refresh()
            }
        }
        watchWake()
    }

    /**
     Reconcile when the Mac wakes.

     Polling alone is wrong across sleep: a laptop shut overnight comes back
     with a readout fourteen hours stale and keeps it for up to a minute,
     which is the moment it is most likely to be looked at and most likely to
     be wrong. The timer may also have been stopped from a phone in between.

     This is why a 60s interval is enough rather than a compromise — the gaps
     that matter are closed by events, not by polling faster. A WebSocket
     would answer the same question with a connection held open all day, and
     `realtime` is deliberately not in the local stack.
     */
    private func watchWake() {
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    func refresh() async {
        guard await tokens.isSignedIn else { return }
        do {
            let fetchedAt = Date()
            let summary = try await api.summary()
            self.skew = fetchedAt.timeIntervalSince(summary.serverTime)
            self.summary = summary
            self.errorMessage = nil
            if projects.isEmpty { projects = (try? await api.projects()) ?? [] }
            // Colours change about as often as projects do, so they load on
            // the same terms rather than on every poll.
            if clients.isEmpty { clients = (try? await api.clients()) ?? [] }
            /* `try?`, deliberately. Unbilled and the entry list sit beside the
               clock, and the clock is what this app is for — a failure hides
               one number rather than surfacing an error over a working timer.
               Stale values stay up until the next poll replaces them. */
            if let fetched = try? await api.stats() { stats = fetched }

            /* `Calendar.startOfDay` rather than subtracting 86,400: a day
                containing a DST transition is 23 or 25 hours, and fixed
                arithmetic would drop or double-count entries at its edge —
                the same trap `startOfLocalDayOffset` exists for on the web. */
            let dayStart = Calendar.current.startOfDay(for: Date())
            if let fetched = try? await api.entries(from: dayStart) {
                // The running entry is the readout above; listing it here as
                // well would show one piece of work as two records.
                today = fetched.filter { $0.endedAt != nil }
            }
        } catch let error as APIError where error.isUnauthorized {
            // The session is gone; saying "signed out" is the useful message,
            // not "401".
            await tokens.signOut()
        } catch let error as URLError where error.code == .cancelled {
            /* The one that actually fires. A cancelled `URLSession` request
               throws `URLError(.cancelled)` — NOT `CancellationError`, which
               is what you would reach for first — and its
               `localizedDescription` is the bare string "cancelled", which is
               precisely what appeared in red as the panel opened.

               Never the user's business either way: a cancelled request is
               one we abandoned. */
        } catch is CancellationError {
            // Kept for a cancellation raised by structured concurrency itself
            // rather than by URLSession.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Actions

    func toggle() async {
        isBusy = true
        defer { isBusy = false }
        errorMessage = nil

        do {
            if isRunning {
                _ = try await api.stopTimer()
            } else {
                _ = try await api.startTimer(
                    taskName: draftTaskName.trimmingCharacters(in: .whitespacesAndNewlines),
                    projectId: draftProjectID
                )
                draftTaskName = ""
            }
            await refresh()
        } catch let error as APIError where error.isTimerConflict {
            // Another device won the race. Showing what IS running is more
            // use than reporting the conflict, and the invariant held.
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Retitle the running entry. Called on commit, not per keystroke.
    func rename(to name: String) async {
        guard isRunning else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != running?.taskName else { return }
        await patch(.init(taskName: trimmed, projectId: nil))
    }

    /// Reassign the running entry to a project.
    func assign(projectID: String?) async {
        if isRunning {
            await patch(.init(taskName: nil, projectId: projectID))
        } else {
            draftProjectID = projectID
        }
    }

    private func patch(_ update: API.UpdateTimer) async {
        do {
            _ = try await api.updateTimer(update)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Auth

    func requestLink(email: String) async throws {
        try await auth.requestLink(email: email)
    }

    func signIn(withCode code: String, email: String) async throws {
        try await auth.signIn(withCode: code, email: email)
        await refresh()
    }

    func signOut() async {
        await tokens.signOut()
        summary = nil
        // Money especially: the next account's panel must not open showing
        // the last one's unbilled total, or its work.
        stats = nil
        today = []
        projects = []
        clients = []
    }
}

/// `H:MM:SS`, matching `formatClock` in `@stint/core`.
///
/// Hours are not zero-padded and minutes and seconds always are, so the
/// readout keeps a stable width as it counts.
func format(_ seconds: Int) -> String {
    let s = max(0, seconds)
    return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
}

/// `$1,462.50`, matching `money()` in the web app.
///
/// **`en_US` regardless of the device's locale**, because the web formatter is
/// pinned to `en-US` and the same figure must not read as `1.462,50 $` in one
/// app and `$1,462.50` in the other. The product is US-first; the currency
/// CODE varies, its presentation does not.
func money(_ amount: Double, code: String) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.locale = Locale(identifier: "en_US")
    f.currencyCode = code
    return f.string(from: NSNumber(value: amount)) ?? "\(amount)"
}
