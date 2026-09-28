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
    /// A start or stop the server has not answered yet. The panel renders it
    /// at once; a failure takes it back by clearing it.
    private(set) var pending: Pending?
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
    /// Bumped by every press and every answer, so a refresh asked before
    /// either cannot land after it and put the old state back.
    private var writes = 0

    init(api: API, auth: Auth, tokens: TokenStore) {
        self.api = api
        self.auth = auth
        self.tokens = tokens
    }

    // MARK: Derived

    enum Pending: Equatable {
        case starting(taskName: String, projectId: String?)
        case stopping
    }

    var running: TimeEntry? { summary?.running }
    var isRunning: Bool { summary?.running != nil }

    /// A timer the server has confirmed and is not being stopped: the only
    /// state that wears the accent or counts. A start in flight is laid out
    /// as running but is not live, since a 409 can still take it back.
    var isLive: Bool { isRunning && pending == nil }

    /// Whether the panel lays out a running timer: a live one, or a start
    /// awaiting its answer. A stop awaiting its answer is already idle.
    var showsRunning: Bool {
        if case .starting = pending { return true }
        return isLive
    }

    /// The running task's name, or the one being started.
    var shownTaskName: String {
        if case let .starting(name, _) = pending { return name }
        return running?.taskName ?? ""
    }

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
        case .runningTimer: isLive ? format(elapsedSeconds) : format(todaySeconds)
        case .todaysTotal: format(todaySeconds)
        }
    }

    /// The running entry's project, or the draft's. Setting it reassigns the
    /// running entry or updates the draft.
    var projectID: String? {
        // `isLive`: while a stop is pending the idle picker shows, and must
        // not reassign the entry being stopped.
        get { isLive ? running?.projectId : draftProjectID }
        set {
            if isLive {
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
            let asked = writes
            let fetchedAt = Date()
            let summary = try await api.summary()
            // A press or its answer came after this was asked, so this is
            // older than what is shown.
            guard asked == writes else { return }
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

    /// Renders the press at once and settles on the server's answer, one
    /// round trip later — the refresh after it reconciles the rest, but
    /// nothing visible waits on it.
    func toggle() async {
        guard pending == nil else { return }
        errorMessage = nil
        writes += 1
        do {
            if isRunning {
                pending = .stopping
                defer { pending = nil }
                // The server counts the stopped entry into Unbilled, so the
                // row updates now rather than after the refresh below.
                stats = try await api.stopTimer()
                settle(running: nil)
            } else {
                let name = draftTaskName.trimmingCharacters(in: .whitespacesAndNewlines)
                pending = .starting(taskName: name, projectId: draftProjectID)
                defer { pending = nil }
                let entry = try await api.startTimer(taskName: name, projectId: draftProjectID)
                settle(running: entry)
                // Cleared only once started: a failed start hands it back.
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

    /// Puts a start or stop's answer into the summary. `serverTime` moves to
    /// now under the same skew, and today's total is carried at what it
    /// reads now, so it neither jumps nor counts a stopped timer twice.
    private func settle(running: TimeEntry?) {
        guard let old = summary else { return }
        writes += 1
        let serverNow = Date().addingTimeInterval(-skew)
        let today = old.running == nil
            ? old.todaySeconds
            : old.todaySeconds + max(0, Int(serverNow.timeIntervalSince(old.serverTime)))
        summary = Summary(
            running: running,
            todaySeconds: today,
            weekSeconds: old.weekSeconds,
            serverTime: serverNow
        )
    }

    /// Start fresh work with a past entry's name, project and billable
    /// answer.
    ///
    /// **Says so rather than doing nothing while a timer runs.** One running
    /// timer is the database's invariant, and a row that highlights and takes
    /// focus but silently ignores a click reads as broken. The message is the
    /// same fact the 409 carries.
    func resume(_ entry: TimeEntry) async {
        guard !isBusy, pending == nil else { return }
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
            let entry = try await api.updateTimer(update)
            // Only onto the entry it changed: a rename answering after a stop
            // would otherwise put the stopped entry back as running.
            if pending == nil, running?.id == entry.id { settle(running: entry) }
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
