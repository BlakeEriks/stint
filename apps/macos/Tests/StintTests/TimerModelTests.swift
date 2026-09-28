import Foundation
import Testing
@testable import Stint

/// Serialized: every test answers through one stub.
@MainActor
@Suite(.serialized)
struct TimerModelTests {
    @Test func startIsShownAtOnceButNotLive() async throws {
        let model = try await signedIn(running: nil)
        TimerStub.hold("/api/v1/timer/start")
        model.draftTaskName = "  Writing "

        let press = Task { await model.toggle() }
        try await until { model.pending != nil }

        #expect(model.showsRunning)
        #expect(!model.isLive)
        #expect(model.shownTaskName == "Writing")

        TimerStub.summary = summaryJSON(running: entryJSON)
        TimerStub.release("/api/v1/timer/start")
        await press.value
        #expect(model.isLive)
        #expect(model.draftTaskName == "")
        await model.signOut()
    }

    /// The clunk this guards: the start answered, then the panel sat idle
    /// until the refresh after it came back too.
    @Test func startRunsOnItsAnswerWithoutTheRefresh() async throws {
        let model = try await signedIn(running: nil)
        TimerStub.hold("/api/v1/summary")

        let press = Task { await model.toggle() }
        try await until { model.isLive }
        #expect(model.running?.id == "e1")

        TimerStub.release("/api/v1/summary")
        await press.value
        await model.signOut()
    }

    @Test func failedStartIsTakenBack() async throws {
        let model = try await signedIn(running: nil)
        TimerStub.status["/api/v1/timer/start"] = 500
        model.draftTaskName = "Writing"

        await model.toggle()

        #expect(model.pending == nil)
        #expect(!model.showsRunning)
        #expect(model.draftTaskName == "Writing")
        #expect(model.errorMessage != nil)
        await model.signOut()
    }

    @Test func stopIsShownAtOnce() async throws {
        let model = try await signedIn(running: entryJSON)
        TimerStub.hold("/api/v1/timer/stop")

        let press = Task { await model.toggle() }
        try await until { model.pending != nil }
        #expect(!model.isLive)
        #expect(!model.showsRunning)

        TimerStub.summary = summaryJSON(running: nil)
        TimerStub.release("/api/v1/timer/stop")
        await press.value
        #expect(!model.isRunning)
        await model.signOut()
    }

    /// Pressing Stop mid-rename commits the rename: both go out, and the
    /// rename can answer last.
    @Test func renameAnsweringAfterAStopLeavesItStopped() async throws {
        let model = try await signedIn(running: entryJSON)
        TimerStub.hold("/api/v1/timer/current")

        let rename = Task { await model.rename(to: "Editing") }
        try await until { TimerStub.isWaiting("/api/v1/timer/current") }
        TimerStub.summary = summaryJSON(running: nil)
        await model.toggle()
        #expect(!model.isRunning)

        // Held, so what shows is the rename's answer and not a refresh after it.
        TimerStub.hold("/api/v1/summary")
        TimerStub.release("/api/v1/timer/current")
        try await until { TimerStub.isWaiting("/api/v1/summary") }
        #expect(!model.isRunning)

        TimerStub.release("/api/v1/summary")
        await rename.value
        await model.signOut()
    }

    @Test func pickingAProjectWhileStoppingLeavesTheEntryAlone() async throws {
        let model = try await signedIn(running: entryJSON)
        TimerStub.hold("/api/v1/timer/stop")

        let press = Task { await model.toggle() }
        try await until { model.pending != nil }
        model.projectID = "p1"
        #expect(model.draftProjectID == "p1")

        TimerStub.summary = summaryJSON(running: nil)
        TimerStub.release("/api/v1/timer/stop")
        await press.value
        #expect(!TimerStub.requested.contains("PATCH /api/v1/timer/current"))
        await model.signOut()
    }

    /// A model signed in to its own Keychain account, having fetched a
    /// summary with `running`. `signOut()` clears the account.
    private func signedIn(running: String?) async throws -> TimerModel {
        TimerStub.reset()
        TimerStub.summary = summaryJSON(running: running)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TimerStub.self]
        let session = URLSession(configuration: config)
        let supabase = URL(string: "http://timermodel.test")!
        let tokens = TokenStore(supabaseURL: supabase, anonKey: "anon", urlSession: session)
        let expires = Date().addingTimeInterval(3600).timeIntervalSince1970
        await tokens.store(try JSONDecoder().decode(
            Session.self,
            from: Data(#"{"access_token":"a","refresh_token":"r","expires_at":\#(expires)}"#.utf8)
        ))
        let model = TimerModel(
            api: API(baseURL: URL(string: "http://app.test")!, tokens: tokens, session: session),
            auth: Auth(supabaseURL: supabase, anonKey: "anon", tokens: tokens),
            tokens: tokens
        )
        await model.refresh()
        return model
    }

    private func until(_ condition: @MainActor () -> Bool) async throws {
        for _ in 0..<200 where !condition() {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(condition())
    }
}

private let entryJSON = #"""
{"id":"e1","projectId":null,"taskName":"Writing","startedAt":"2026-09-11T09:00:00Z",
"endedAt":null,"isBillable":true,"rateOverride":null,"durationSeconds":null,
"durationOk":true,"invoiceId":null}
"""#

private func summaryJSON(running: String?) -> Data {
    let now = ISO8601DateFormatter().string(from: Date())
    return Data(#"{"running":\#(running ?? "null"),"todaySeconds":0,"weekSeconds":0,"serverTime":"\#(now)"}"#.utf8)
}

/// Answers `/api/v1` by path. A held path waits until released, which is
/// how a test sees what the model shows between a press and its answer.
private final class TimerStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var summary = Data()
    nonisolated(unsafe) static var status: [String: Int] = [:]
    nonisolated(unsafe) static var requested: [String] = []
    nonisolated(unsafe) private static var held: Set<String> = []
    nonisolated(unsafe) private static var waiting: [String: TimerStub] = [:]
    private static let lock = NSLock()

    static func reset() {
        lock.withLock { held = []; waiting = [:]; status = [:]; requested = [] }
    }

    static func isWaiting(_ path: String) -> Bool { lock.withLock { waiting[path] != nil } }

    static func hold(_ path: String) { lock.withLock { _ = held.insert(path) } }

    static func release(_ path: String) {
        let stub = lock.withLock { () -> TimerStub? in
            held.remove(path)
            return waiting.removeValue(forKey: path)
        }
        stub?.answer()
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let path = request.url!.path
        let wait = Self.lock.withLock { () -> Bool in
            Self.requested.append("\(request.httpMethod ?? "GET") \(path)")
            guard Self.held.contains(path) else { return false }
            Self.waiting[path] = self
            return true
        }
        if !wait { answer() }
    }

    private func answer() {
        let path = request.url!.path
        let status = Self.lock.withLock { Self.status[path] } ?? 200
        let body: Data = switch path {
        case _ where status >= 400: Data(#"{"code":"INTERNAL","message":"Down"}"#.utf8)
        case "/api/v1/summary": Self.summary
        case "/api/v1/timer/start", "/api/v1/timer/current": Data(entryJSON.utf8)
        case "/api/v1/timer/stop", "/api/v1/stats": Data(#"{"currency":"USD","unbilled":{"total":0}}"#.utf8)
        case "/api/v1/projects": Data(#"{"projects":[]}"#.utf8)
        case "/api/v1/clients": Data(#"{"clients":[]}"#.utf8)
        default: Data(#"{"entries":[]}"#.utf8)
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}
