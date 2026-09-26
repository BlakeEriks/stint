import AppKit
import Foundation
import Observation

/// The app's whole state. The server owns timer truth: the readout ticks
/// locally from `startedAt`, and `GET /summary` decides every 60s whether a
/// timer is actually running.
@MainActor
@Observable
final class TimerModel {
    private(set) var summary: Summary?
    /// Nil until the first fetch; the row omits the number rather than
    /// showing a zero that would read as "nothing owed".
    private(set) var stats: Stats?
    /// The last five distinct things worked on, newest first. The running
    /// one is the readout, not a row.
    private(set) var recent: [TimeEntry] = []
    private(set) var clients: [Client] = []
    private(set) var projects: [Project] = []
    private(set) var email: String?
    private(set) var isSignedIn = false
    private(set) var errorMessage: String?
    /// Why a preview build's launch sign-in failed; shown on the sign-in panel.
    private(set) var previewSignInError: String?
    private(set) var isBusy = false
    /// Ticks once a second so the readout redraws.
    private(set) var now = Date()

    var draftTaskName = ""
    var draftProjectID: String?

    private let api: API
    private let auth: Auth
    private let tokens: TokenStore

    /// Device clock minus server clock, from the last reconcile. Applied to
    /// every calculation rather than to the stored dates, so a later poll
    /// can move it.
    private var skew: TimeInterval = 0
    private var ticker: Task<Void, Never>?
    private var poller: Task<Void, Never>?
    private var started = false

    init(api: API, auth: Auth, tokens: TokenStore) {
        self.api = api
        self.auth = auth
        self.tokens = tokens
    }

    // MARK: Derived

    var running: TimeEntry? { summary?.running }
    var isRunning: Bool { summary?.running != nil }
    var exceedsThreshold: Bool { summary?.exceedsThreshold ?? false }

    var elapsedSeconds: Int {
        guard let running = summary?.running else { return 0 }
        return max(0, Int(now.addingTimeInterval(-skew).timeIntervalSince(running.startedAt)))
    }

    /// `/summary` already folded the running entry in as of the fetch, so
    /// the live count is added from `serverTime`, not from `startedAt`.
    var todaySeconds: Int {
        guard let summary else { return 0 }
        guard summary.running != nil else { return summary.todaySeconds }
        let sinceFetch = max(0, Int(now.addingTimeInterval(-skew).timeIntervalSince(summary.serverTime)))
        return summary.todaySeconds + sinceFetch
    }

    /// Text only. Whether a timer is running is the pip's to say, in both
    /// modes, which is why running-ness is not folded in here.
    var menuBarTitle: String {
        switch Prefs.shared.barReadout {
        case .runningTimer: isRunning ? format(elapsedSeconds) : format(todaySeconds)
        case .todaysTotal: format(todaySeconds)
        }
    }

    /// The running entry's project, or the draft's. Setting it reassigns the
    /// running entry or updates the draft.
    var projectID: String? {
        get { isRunning ? running?.projectId : draftProjectID }
        set {
            if isRunning {
                Task { await patch(.init(taskName: nil, projectId: newValue)) }
            } else {
                draftProjectID = newValue
            }
        }
    }

    var projectName: String {
        guard let id = projectID, let project = projects.first(where: { $0.id == id })
        else { return "No project" }
        return project.name
    }

    /// Project id → its client's color, the resolution `useProjectColors()`
    /// does on the web. A project with no client has none.
    var projectColors: [String: String] {
        let byClient = Dictionary(
            clients.compactMap { c in c.color.map { (c.id, $0) } },
            uniquingKeysWith: { a, _ in a }
        )
        return Dictionary(
            projects.compactMap { p in
                guard let clientID = p.clientId, let hex = byClient[clientID] else { return nil }
                return (p.id, hex)
            },
            uniquingKeysWith: { a, _ in a }
        )
    }

    // MARK: Lifecycle

    /// Idempotent: the panel's content is rebuilt on every open, so a second
    /// call is "reconcile now" rather than a second set of loops.
    func start() {
        guard !started else {
            Task { await refresh() }
            return
        }
        started = true

        Task {
            await tokens.setOnChange { [weak self] session in
                Task { @MainActor in
                    self?.isSignedIn = session != nil
                    if session != nil { self?.previewSignInError = nil }
                    self?.email = session?.email
                }
            }
            if let account = Config.previewAccount {
                do {
                    try await auth.signIn(email: account.email, password: account.password)
                } catch {
                    previewSignInError = "Could not sign in as \(account.email): \(error.localizedDescription) "
                        + "Re-run the PR's preview-db check, which seeds it."
                }
            }
            if await tokens.isSignedIn { await refresh() }
        }

        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                await MainActor.run { self?.now = Date() }
            }
        }
        poller = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard let self, self.isSignedIn else { continue }
                await self.refresh()
            }
        }
        // A laptop shut overnight would otherwise show a stale readout for up
        // to a minute at the moment it is most likely to be looked at.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    func refresh() async {
        guard await tokens.isSignedIn else { return }
        do {
            let fetchedAt = Date()
            let summary = try await api.summary()
            skew = fetchedAt.timeIntervalSince(summary.serverTime)
            self.summary = summary
            errorMessage = nil
            if projects.isEmpty { projects = (try? await api.projects()) ?? [] }
            if clients.isEmpty { clients = (try? await api.clients()) ?? [] }
            // `try?`: a failure here hides one number rather than surfacing an
            // error over a working timer.
            if let fetched = try? await api.stats() { stats = fetched }
            // Two weeks back so Monday still offers Friday's work; a window
            // this wide does not care where a DST boundary falls.
            let windowStart = Date(timeIntervalSinceNow: -14 * 86_400)
            if let fetched = try? await api.entries(from: windowStart, limit: 200) {
                recent = Self.distinctTasks(in: fetched.filter { $0.endedAt != nil }, limit: 5)
            }
        } catch let error as APIError where error.isUnauthorized {
            await tokens.signOut()
        } catch let error as URLError where error.code == .cancelled {
            // A request we abandoned throws `URLError(.cancelled)`, not
            // `CancellationError`, and its description is the bare word
            // "cancelled" — never the user's business.
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// One row per task name. The server orders newest first, so the
    /// occurrence that survives is the most recent one.
    private static func distinctTasks(in entries: [TimeEntry], limit: Int) -> [TimeEntry] {
        var seen = Set<String>()
        var kept: [TimeEntry] = []
        for entry in entries where seen.insert(entry.taskName).inserted {
            kept.append(entry)
            if kept.count == limit { break }
        }
        return kept
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
            // Another device won the race; show what is running.
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Start fresh work with a past entry's name, project and billable
    /// answer.
    ///
    /// **Says so rather than doing nothing while a timer runs.** One running
    /// timer is the database's invariant, and a row that highlights and takes
    /// focus but silently ignores a click reads as broken. The message is the
    /// same fact the 409 carries.
    func resume(_ entry: TimeEntry) async {
        guard !isBusy else { return }
        guard !isRunning else {
            errorMessage = "A timer is already running. Stop it before starting another."
            return
        }
        isBusy = true
        defer { isBusy = false }
        errorMessage = nil
        do {
            _ = try await api.startTimer(
                taskName: entry.taskName,
                projectId: entry.projectId,
                isBillable: entry.isBillable
            )
            await refresh()
        } catch let error as APIError where error.isTimerConflict {
            // Another device won the race; the invariant held either way.
            errorMessage = error.message
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rename(to name: String) async {
        guard isRunning else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != running?.taskName else { return }
        await patch(.init(taskName: trimmed, projectId: nil))
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
        stats = nil
        recent = []
        projects = []
        clients = []
    }
}

/// `H:MM:SS`, matching `formatClock` in `@stint/core`.
func format(_ seconds: Int) -> String {
    let s = max(0, seconds)
    return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
}

/// `$1,462.50`, matching `money()` on the web — `en_US` regardless of the
/// device locale, so the same figure never reads `1.462,50 $` in one app.
func money(_ amount: Double, code: String) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.locale = Locale(identifier: "en_US")
    f.currencyCode = code
    return f.string(from: NSNumber(value: amount)) ?? "\(amount)"
}
