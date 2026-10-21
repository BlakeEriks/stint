import Foundation
import Testing
@testable import Stint

/// The last known lists on disk: what the panel shows at once on launch,
/// and what sign-out takes away. Serialized: every test answers requests
/// through one stub.
@MainActor
@Suite(.serialized)
struct SnapshotTests {
    private let directory = FileManager.default.temporaryDirectory.appending(path: uuidv7())

    @Test func aSnapshotRoundTrips() {
        let store = SnapshotStore(directory: directory, version: "1.0.0 (abc)")
        let snapshot = sample(version: store.version)
        store.write(snapshot)
        #expect(store.read() == snapshot)
    }

    @Test func anotherVersionReadsAsNothing() {
        SnapshotStore(directory: directory, version: "1.0.0 (abc)").write(sample(version: "1.0.0 (abc)"))
        #expect(SnapshotStore(directory: directory, version: "1.1.0 (def)").read() == nil)
    }

    @Test func startShowsTheSnapshotBeforeTheFirstFetch() async throws {
        let (model, store) = try await signedInModel()
        store.write(sample(version: store.version))
        // Held long enough that no runner reaches the answer first.
        SnapshotStub.delays["/summary"] = 5

        model.start()
        // Waited for, not slept for: how long `start` takes to reach the
        // snapshot depends on the machine.
        for _ in 0..<100 where model.projects.isEmpty {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(model.summary == nil)
        #expect(model.projects.map(\.name) == ["Website"])
        #expect(model.clients.map(\.name) == ["Acme"])
        #expect(model.stats?.earnedToday == 12)
        #expect(model.recent.map(\.taskName) == ["Audit"])
        await model.signOut()
    }

    @Test func aFullFetchWritesIt() async throws {
        let (model, store) = try await signedInModel()
        await model.refresh()
        let written = try #require(store.read())
        #expect(written.projects.map(\.name) == ["Redesign"])
        #expect(written.clients.map(\.name) == ["Globex"])
        #expect(written.stats?.earnedToday == 40)
        #expect(written.taskNames.map(\.taskName) == ["Standup"])
        await model.signOut()
    }

    @Test func signingOutDeletesIt() async throws {
        let (model, store) = try await signedInModel()
        model.start()
        try await waitForTheFirstFetch(store)
        #expect(store.read() != nil)
        await model.signOut()
        #expect(store.read() == nil)
    }

    @Test func aRejectedTokenDeletesIt() async throws {
        let (model, store) = try await signedInModel()
        model.start()
        try await waitForTheFirstFetch(store)
        #expect(store.read() != nil)

        SnapshotStub.routes["/summary"] = (401, Data(#"{"code":"UNAUTHORIZED","message":"Session expired"}"#.utf8))
        await model.refresh()
        #expect(store.read() == nil)
    }

    private func sample(version: String) -> Snapshot {
        Snapshot(
            version: version,
            projects: [Project(id: "p1", clientId: "c1", name: "Website", hourlyRate: 150, isBillableDefault: true, archivedAt: nil)],
            clients: [Client(id: "c1", name: "Acme", color: "#3366FF")],
            stats: Stats(currency: "USD", earnedToday: 12),
            taskNames: [TaskName(taskName: "Audit", projectId: "p1", lastUsedAt: Date(timeIntervalSince1970: 1_790_000_000))]
        )
    }

    /// Waited for, not slept for: how long the first fetch takes to write the
    /// snapshot depends on the machine.
    private func waitForTheFirstFetch(_ store: SnapshotStore) async throws {
        for _ in 0..<100 where store.read() == nil {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    /// A model over a stubbed backend, signed in, with its snapshot in a
    /// directory of its own.
    private func signedInModel() async throws -> (TimerModel, SnapshotStore) {
        SnapshotStub.delays = [:]
        SnapshotStub.routes = [
            "/summary": (200, Data(#"{"running":null,"todaySeconds":0,"weekSeconds":0,"serverTime":"2026-09-28T12:00:00Z"}"#.utf8)),
            "/projects": (200, Data(#"{"projects":[{"id":"p2","clientId":null,"name":"Redesign","hourlyRate":null,"isBillableDefault":true,"archivedAt":null}]}"#.utf8)),
            "/clients": (200, Data(#"{"clients":[{"id":"c2","name":"Globex","color":null}]}"#.utf8)),
            "/stats": (200, Data(#"{"currency":"USD","earnedToday":40}"#.utf8)),
            "/entries/task-names": (200, Data(#"{"taskNames":[{"taskName":"Standup","projectId":null,"lastUsedAt":"2026-09-28T10:00:00Z"}]}"#.utf8)),
        ]
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SnapshotStub.self]
        let session = URLSession(configuration: config)
        let host = URL(string: "http://snapshot.test")!
        let tokens = TokenStore(supabaseURL: host, anonKey: "anon", urlSession: session)
        let at = Date().addingTimeInterval(3600).timeIntervalSince1970
        let json = Data(#"{"access_token":"a","refresh_token":"r","expires_at":\#(at)}"#.utf8)
        await tokens.store(try JSONDecoder().decode(Session.self, from: json))
        let store = SnapshotStore(directory: directory)
        let model = TimerModel(
            api: API(baseURL: host, tokens: tokens, session: session),
            auth: Auth(supabaseURL: host, anonKey: "anon", tokens: tokens),
            tokens: tokens,
            snapshots: store
        )
        return (model, store)
    }
}

/// Answers by path, ignoring the `/api/v1` prefix and the query string.
private final class SnapshotStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var routes: [String: (Int, Data)] = [:]
    /// Seconds to hold each path's answer.
    nonisolated(unsafe) static var delays: [String: Double] = [:]

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let path = request.url!.path().replacingOccurrences(of: "/api/v1", with: "")
        let (status, data) = Self.routes[path] ?? (404, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        let answer: @Sendable () -> Void = { [self] in
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
        guard let delay = Self.delays[path] else { return answer() }
        DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: answer)
    }
}
