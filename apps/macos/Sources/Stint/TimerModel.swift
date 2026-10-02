import AppKit
import Foundation
import Observation

/// The app's whole state. The server owns timer truth: the readout ticks
/// locally from `startedAt`, and `GET /summary` decides every 60s whether a
/// timer is actually running.
@MainActor
@Observable
final class TimerModel: Optimistic {
    private(set) var summary: Summary?
    /// Nil until the first fetch; the row omits the number rather than
    /// showing a zero that would read as "nothing owed".
    private(set) var stats: Stats?
    /// The last five names worked on, newest first. The running one is the
    /// readout, not a row, and is dropped here rather than at fetch time,
    /// since the readout reconciles more often than the list.
    var recent: [TaskName] {
        let running = running?.taskName.lowercased()
        return Array(taskNames.filter { $0.id != running }.prefix(Self.recentCount))
    }
    private static let recentCount = 5
    private var taskNames: [TaskName] = []
    private(set) var clients: [Client] = []
    private(set) var projects: [Project] = []
    private(set) var email: String?
    private(set) var isSignedIn = false
    private(set) var errorMessage: String?
    /// Why a preview build's launch sign-in failed; shown on the sign-in panel.
    private(set) var previewSignInError: String?
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
    @ObservationIgnored var inFlight: [String: Int] = [:]
    @ObservationIgnored var lanes: [String: Task<Void, Never>] = [:]
    /// Bumped by every prediction, so a fetch that began before one knows
    /// its answer is older than the screen.
    @ObservationIgnored private var predictions = 0

    init(api: API, auth: Auth, tokens: TokenStore) {
        self.api = api
        self.auth = auth
        self.tokens = tokens
    }

    // MARK: Derived

    var running: TimeEntry? { summary?.running }
    var isRunning: Bool { summary?.running != nil }

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
            Task { await refresh(recent: false) }
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

    /// `Optimistic` requires a bare `refresh()`; a defaulted parameter does
    /// not satisfy it.
    func refresh() async { await refresh(recent: true) }

    /// `recent: false` on an open: the readout reconciles then, but a list
    /// of past names can wait for the poll or the next start or stop.
    func refresh(recent: Bool) async {
        guard await tokens.isSignedIn else { return }
        do {
            let fetchedAt = Date()
            let generation = predictions
            let summary = try await api.summary()
            // A press landed while this was in flight; its own refresh follows.
            guard generation == predictions, inFlight["timer", default: 0] == 0 else { return }
            skew = fetchedAt.timeIntervalSince(summary.serverTime)
            self.summary = summary
            errorMessage = nil
            // Every refresh, so a project added, renamed or archived on the
            // web reaches the panel on its next open. A failed fetch keeps
            // the list it had rather than emptying the picker.
            if let fetched = try? await api.projects() {
                projects = fetched
                // A draft project archived on the web would read "No project"
                // yet still be sent on start, so the draft drops it too.
                if let id = draftProjectID, !fetched.contains(where: { $0.id == id }) {
                    draftProjectID = nil
                }
            }
            if let fetched = try? await api.clients() { clients = fetched }
            // `try?`: a failure here hides one number rather than surfacing an
            // error over a working timer.
            if let fetched = try? await api.stats() { stats = fetched }
            // One more than is shown, so dropping the running name still
            // leaves five.
            if recent, let fetched = try? await api.taskNames(limit: Self.recentCount + 1) {
                taskNames = fetched
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

    // MARK: Actions

    func toggle() async {
        errorMessage = nil
        if isRunning {
            await stop()
        } else {
            let name = draftTaskName.trimmingCharacters(in: .whitespacesAndNewlines)
            let draft = draftTaskName
            await begin(taskName: name, projectId: draftProjectID) {
                self.draftTaskName = ""
                return { self.draftTaskName = draft }
            }
        }
    }

    /// Start fresh work under a name used before, on the project it was last
    /// used on — the same start the Start button makes.
    ///
    /// **Says so rather than doing nothing while a timer runs.** One running
    /// timer is the database's invariant, and a row that highlights and takes
    /// focus but silently ignores a click reads as broken. The message is the
    /// same fact the 409 carries.
    func resume(_ name: TaskName) async {
        guard !isRunning else {
            errorMessage = "A timer is already running. Stop it before starting another."
            return
        }
        errorMessage = nil
        await begin(taskName: name.taskName, projectId: name.projectId)
    }

    func rename(to name: String) async {
        guard isRunning else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != running?.taskName else { return }
        await patch(.init(taskName: trimmed, projectId: nil))
    }

    /// Every timer press shares the `timer` scope: they all change the one
    /// running entry, so the latest of them wins.
    private func begin(
        taskName: String,
        projectId: String?,
        alongside: () -> (() -> Void) = { {} }
    ) async {
        let id = uuidv7()
        let api = api
        // Shown from the press; the server's own `startedAt` replaces it on
        // the refresh that follows.
        let entry = TimeEntry(
            id: id,
            projectId: projectId,
            taskName: taskName,
            startedAt: Date().addingTimeInterval(-skew),
            endedAt: nil,
            isBillable: projects.first { $0.id == projectId }?.isBillableDefault ?? true,
            rateOverride: nil,
            durationSeconds: nil,
            durationOk: true,
            invoiceId: nil
        )
        await press("timer") {
            let undoSummary = show(running: entry)
            let undoAlongside = alongside()
            return {
                undoSummary()
                undoAlongside()
            }
        } perform: {
            try await api.startTimer(id: id, taskName: taskName, projectId: projectId)
        }
    }

    private func stop() async {
        let api = api
        let stopped = await press("timer") {
            show(running: nil)
        } perform: {
            try await api.stopTimer()
        }
        // The server counts the stopped entry into Unbilled.
        if let stopped { stats = stopped }
    }

    private func patch(_ update: API.UpdateTimer) async {
        guard let current = running else { return }
        let api = api
        let changed = TimeEntry(
            id: current.id,
            projectId: update.projectId ?? current.projectId,
            taskName: update.taskName ?? current.taskName,
            startedAt: current.startedAt,
            endedAt: current.endedAt,
            isBillable: current.isBillable,
            rateOverride: current.rateOverride,
            durationSeconds: current.durationSeconds,
            durationOk: current.durationOk,
            invoiceId: current.invoiceId
        )
        await press("timer") {
            show(running: changed)
        } perform: {
            try await api.updateTimer(update)
        }
    }

    /// Replaces the running entry in the summary and returns how to put it
    /// back. Today's total freezes at its live value, so the readout neither
    /// jumps nor double counts.
    private func show(running: TimeEntry?) -> () -> Void {
        let before = summary
        predictions += 1
        summary = Summary(
            running: running,
            todaySeconds: todaySeconds,
            weekSeconds: summary?.weekSeconds ?? 0,
            serverTime: Date().addingTimeInterval(-skew)
        )
        return { self.summary = before }
    }

    func report(_ reason: String) {
        errorMessage = reason
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
        taskNames = []
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
