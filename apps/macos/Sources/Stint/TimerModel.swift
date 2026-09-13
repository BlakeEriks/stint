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
        projects = []
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
