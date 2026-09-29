import Foundation
import Testing
@testable import Stint

/// The timer's presses against a stubbed server, including the two races
/// from #118 and the menu bar's "start again", which it missed.
@MainActor
@Suite(.serialized)
struct TimerPressTests {
    init() async { await FakeServer.shared.reset() }

    @Test func startAgainShowsTheTimerBeforeTheServerAnswers() async throws {
        let model = try await signedInModel()
        await FakeServer.shared.hold("POST /timer/start")

        let press = Task { await model.resume(entry("Design")) }
        await Task.yield()
        #expect(model.running?.taskName == "Design")

        await FakeServer.shared.setRunning(entry("Design"))
        await FakeServer.shared.release("POST /timer/start")
        await press.value
        #expect(model.running?.taskName == "Design")
        #expect(model.errorMessage == nil)
    }

    @Test func aRejectedStartPutsTheBarBackAndSaysWhy() async throws {
        let model = try await signedInModel()
        await FakeServer.shared.reject("POST /timer/start", status: 409, message: "A timer is already running.")

        await model.resume(entry("Design"))
        #expect(model.running == nil)
        #expect(model.errorMessage == "A timer is already running.")
    }

    @Test func aRenameAnsweringAfterAStopDoesNotRestartTheTimer() async throws {
        await FakeServer.shared.setRunning(entry("Writing"))
        let model = try await signedInModel()
        await FakeServer.shared.hold("PATCH /timer/current")

        let rename = Task { await model.rename(to: "Editing") }
        await Task.yield()
        #expect(model.running?.taskName == "Editing")

        await FakeServer.shared.setRunning(nil)
        let stop = Task { await model.toggle() }
        await Task.yield()
        // Stopped at once, though the stop waits in the lane behind the rename.
        #expect(model.running == nil)

        await FakeServer.shared.release("PATCH /timer/current")
        await rename.value
        await stop.value
        #expect(model.running == nil)
        #expect(model.errorMessage == nil)
    }

    @Test func aRefreshFromBeforeAPressDoesNotUndoIt() async throws {
        let model = try await signedInModel()
        await FakeServer.shared.holdNext("GET /summary")
        let stale = Task { await model.refresh() }
        try await Task.sleep(for: .milliseconds(20))

        await FakeServer.shared.setRunning(entry("Design"))
        await model.resume(entry("Design"))
        #expect(model.running?.taskName == "Design")

        await FakeServer.shared.release("GET /summary")
        await stale.value
        #expect(model.running?.taskName == "Design")
    }
}

private func entry(_ name: String) -> TimeEntry {
    TimeEntry(
        id: "e-\(name)", projectId: nil, taskName: name,
        startedAt: Date(timeIntervalSince1970: 1_790_000_000), endedAt: nil,
        isBillable: true, rateOverride: nil, durationSeconds: nil,
        durationOk: true, invoiceId: nil
    )
}

@MainActor
private func signedInModel() async throws -> TimerModel {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [FakeProtocol.self]
    let session = URLSession(configuration: config)
    let supabase = URL(string: "https://timer-model-tests.test")!
    let tokens = TokenStore(supabaseURL: supabase, anonKey: "anon", urlSession: session)
    let at = Date().addingTimeInterval(3600).timeIntervalSince1970
    await tokens.store(try JSONDecoder().decode(
        Session.self,
        from: Data(#"{"access_token":"a","refresh_token":"r","expires_at":\#(at)}"#.utf8)
    ))
    let model = TimerModel(
        api: API(baseURL: URL(string: "https://api.test")!, tokens: tokens, session: session),
        auth: Auth(supabaseURL: supabase, anonKey: "anon", tokens: tokens),
        tokens: tokens
    )
    await model.refresh()
    return model
}

/// One server for the suite: what's running, and which routes to hold,
/// release or reject.
private actor FakeServer {
    static let shared = FakeServer()

    private var running: TimeEntry?
    private var held: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var holding: Set<String> = []
    private var rejections: [String: (Int, String)] = [:]
    private var holdOnlyFirst: Set<String> = []

    func reset() {
        running = nil
        holding = []
        rejections = [:]
        holdOnlyFirst = []
    }

    func setRunning(_ entry: TimeEntry?) { running = entry }
    func hold(_ route: String) { holding.insert(route) }
    func reject(_ route: String, status: Int, message: String) { rejections[route] = (status, message) }

    func release(_ route: String) {
        holding.remove(route)
        held.removeValue(forKey: route)?.forEach { $0.resume() }
    }

    /// Holds only the next call; later ones answer at once.
    func holdNext(_ route: String) {
        holding.insert(route)
        holdOnlyFirst.insert(route)
    }

    /// Answers with the state as of the request, however long it's held,
    /// the way a real response is already decided when it's delayed.
    func answer(_ route: String) async -> (Int, Data) {
        let response = respond(route)
        if holding.contains(route) {
            if holdOnlyFirst.remove(route) != nil { holding.remove(route) }
            await withCheckedContinuation { held[route, default: []].append($0) }
        }
        return response
    }

    private func respond(_ route: String) -> (Int, Data) {
        if let (status, message) = rejections.removeValue(forKey: route) {
            return (status, Data(#"{"code":"TIMER_ALREADY_RUNNING","message":"\#(message)"}"#.utf8))
        }
        switch route {
        case "GET /summary":
            return (200, json(Summary(running: running, todaySeconds: 0, weekSeconds: 0, serverTime: Date())))
        case "POST /timer/start", "PATCH /timer/current":
            return (200, json(running ?? entry("unknown")))
        case "POST /timer/stop":
            return (200, Data(#"{"currency":"USD","unbilled":{"total":0}}"#.utf8))
        default:
            return (404, Data(#"{"code":"NOT_FOUND","message":"not found"}"#.utf8))
        }
    }

    private func json<T: Encodable>(_ value: T) -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try! encoder.encode(value)
    }
}

private final class FakeProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let url = request.url!
        let path = url.path().replacingOccurrences(of: "/api/v1", with: "")
        let route = "\(request.httpMethod ?? "GET") \(path)"
        let reply = Reply(to: self)
        Task {
            let (status, data) = await FakeServer.shared.answer(route)
            reply.send(url: url, status: status, data: data)
        }
    }
}

/// Carries the protocol into the task that answers it later, which a held
/// response needs. URLProtocol isn't Sendable; URLSession keeps it alive and
/// expects its client called once, which `send` does.
private struct Reply: @unchecked Sendable {
    let to: FakeProtocol

    func send(url: URL, status: Int, data: Data) {
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        to.client?.urlProtocol(to, didReceive: response, cacheStoragePolicy: .notAllowed)
        to.client?.urlProtocol(to, didLoad: data)
        to.client?.urlProtocolDidFinishLoading(to)
    }
}
