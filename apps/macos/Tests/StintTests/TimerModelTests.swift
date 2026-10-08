import Foundation
import Testing
@testable import Stint

/// Serialized: every test answers requests through one stub.
@MainActor
@Suite(.serialized)
struct TimerModelTests {
    @Test func refreshPicksUpProjectAndClientChanges() async throws {
        let model = try await signedInModel()
        APIStub.routes["/projects"] = (200, projects([("p1", "Website")]))
        APIStub.routes["/clients"] = (200, clients([("c1", "Acme")]))
        await model.refresh()
        #expect(model.projects.map(\.name) == ["Website"])
        #expect(model.clients.map(\.name) == ["Acme"])

        APIStub.routes["/projects"] = (200, projects([("p1", "Website redesign"), ("p2", "Audit")]))
        APIStub.routes["/clients"] = (200, clients([("c1", "Acme"), ("c2", "Globex")]))
        await model.refresh()
        #expect(model.projects.map(\.name) == ["Website redesign", "Audit"])
        #expect(model.clients.map(\.name) == ["Acme", "Globex"])

        APIStub.routes["/projects"] = (200, projects([("p1", "Website redesign"), ("p2", "Audit")], archived: ["p1"]))
        await model.refresh()
        #expect(model.projects.map(\.name) == ["Audit"])
        await model.signOut()
    }

    @Test func archivingTheDraftProjectClearsIt() async throws {
        let model = try await signedInModel()
        APIStub.routes["/projects"] = (200, projects([("p1", "Website"), ("p2", "Audit")]))
        APIStub.routes["/clients"] = (200, clients([]))
        await model.refresh()
        model.draftProjectID = "p1"

        APIStub.routes["/projects"] = (200, projects([("p1", "Website"), ("p2", "Audit")], archived: ["p2"]))
        await model.refresh()
        #expect(model.draftProjectID == "p1")

        APIStub.routes["/projects"] = (200, projects([("p1", "Website"), ("p2", "Audit")], archived: ["p1", "p2"]))
        await model.refresh()
        #expect(model.draftProjectID == nil)
        #expect(model.projectName == "No project")
        await model.signOut()
    }

    @Test func failedFetchKeepsTheLists() async throws {
        let model = try await signedInModel()
        APIStub.routes["/projects"] = (200, projects([("p1", "Website")]))
        APIStub.routes["/clients"] = (200, clients([("c1", "Acme")]))
        await model.refresh()

        APIStub.routes["/projects"] = (500, Data())
        APIStub.routes["/clients"] = (500, Data())
        await model.refresh()
        #expect(model.projects.map(\.name) == ["Website"])
        #expect(model.clients.map(\.name) == ["Acme"])
        await model.signOut()
    }

    @Test func aClosedPanelPollsTheTimerAlone() async throws {
        let model = try await signedInModel()
        APIStub.routes["/projects"] = (200, projects([("p1", "Website")]))
        APIStub.routes["/clients"] = (200, clients([]))
        APIStub.requested = []
        await model.poll()
        #expect(APIStub.requested == ["/summary"])

        model.panel(open: true)
        APIStub.requested = []
        await model.poll()
        #expect(Set(APIStub.requested) == ["/summary", "/projects", "/clients", "/stats", "/entries/task-names"])

        model.panel(open: false)
        APIStub.requested = []
        await model.poll()
        #expect(APIStub.requested == ["/summary"])
        await model.signOut()
    }

    @Test func recentIsTheServersNamesLessTheRunningOne() async throws {
        let model = try await signedInModel()
        APIStub.routes["/summary"] = (200, summary(running: "standup"))
        APIStub.routes["/entries/task-names"] = (200, taskNames(["Standup", "Design review", "Invoice chase", "Staging deploy", "Q4 scoping", "Audit"]))
        await model.refresh()
        #expect(model.recent.map(\.taskName) == ["Design review", "Invoice chase", "Staging deploy", "Q4 scoping", "Audit"])

        APIStub.routes["/summary"] = (200, summary(running: nil))
        await model.refresh()
        #expect(model.recent.map(\.taskName) == ["Standup", "Design review", "Invoice chase", "Staging deploy", "Q4 scoping"])
        await model.signOut()
    }

    @Test func anOpenKeepsTheRecentListItHas() async throws {
        let model = try await signedInModel()
        APIStub.routes["/entries/task-names"] = (200, taskNames(["Design review"]))
        await model.refresh()

        APIStub.routes["/entries/task-names"] = (200, taskNames(["Audit"]))
        await model.refresh(recent: false)
        #expect(model.recent.map(\.taskName) == ["Design review"])
        await model.refresh()
        #expect(model.recent.map(\.taskName) == ["Audit"])
        await model.signOut()
    }

    @Test func aRestartCarriesTheNameAndProject() async throws {
        let model = try await signedInModel()
        APIStub.routes["/entries/task-names"] = (200, taskNames(["Internal planning"], project: "p1"))
        APIStub.routes["/timer/start"] = (200, Data(#"{"id":"e1","projectId":"p1","taskName":"Internal planning","startedAt":"2026-09-28T12:00:00Z","endedAt":null,"isBillable":true,"rateOverride":null,"durationSeconds":null,"durationOk":true,"invoiceId":null}"#.utf8))
        await model.refresh()
        await model.resume(try #require(model.recent.first))

        let body = try #require(APIStub.bodies["/timer/start"])
        let sent = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(sent?["taskName"] as? String == "Internal planning")
        #expect(sent?["projectId"] as? String == "p1")
        await model.signOut()
    }

    /// A model over a stubbed backend, signed in with a token that needs no
    /// refresh. Its own Keychain account, cleared by `signOut()`.
    private func signedInModel() async throws -> TimerModel {
        APIStub.routes = [
            "/summary": (200, Data(#"{"running":null,"todaySeconds":0,"weekSeconds":0,"serverTime":"2026-09-28T12:00:00Z"}"#.utf8)),
            "/stats": (200, Data(#"{"currency":"USD","unbilled":{"total":0}}"#.utf8)),
            "/entries/task-names": (200, Data(#"{"taskNames":[]}"#.utf8)),
        ]
        APIStub.bodies = [:]
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [APIStub.self]
        let session = URLSession(configuration: config)
        let host = URL(string: "http://timermodel.test")!
        let tokens = TokenStore(supabaseURL: host, anonKey: "anon", urlSession: session)
        let at = Date().addingTimeInterval(3600).timeIntervalSince1970
        let json = Data(#"{"access_token":"a","refresh_token":"r","expires_at":\#(at)}"#.utf8)
        await tokens.store(try JSONDecoder().decode(Session.self, from: json))
        return TimerModel(
            api: API(baseURL: host, tokens: tokens, session: session),
            auth: Auth(supabaseURL: host, anonKey: "anon", tokens: tokens),
            tokens: tokens
        )
    }

    private func summary(running name: String?) -> Data {
        let running = name.map {
            #"{"id":"r1","projectId":null,"taskName":"\#($0)","startedAt":"2026-09-28T11:00:00Z","endedAt":null,"isBillable":true,"rateOverride":null,"durationSeconds":null,"durationOk":true,"invoiceId":null}"#
        } ?? "null"
        return Data(#"{"running":\#(running),"todaySeconds":0,"weekSeconds":0,"serverTime":"2026-09-28T12:00:00Z"}"#.utf8)
    }

    private func taskNames(_ names: [String], project: String? = nil) -> Data {
        let projectId = project.map { #""\#($0)""# } ?? "null"
        let items = names.map { #"{"taskName":"\#($0)","projectId":\#(projectId),"lastUsedAt":"2026-09-28T10:00:00Z"}"# }
        return Data(#"{"taskNames":[\#(items.joined(separator: ","))]}"#.utf8)
    }

    private func projects(_ rows: [(String, String)], archived: Set<String> = []) -> Data {
        let items = rows.map { id, name in
            let archivedAt = archived.contains(id) ? #""2026-09-28T12:00:00Z""# : "null"
            return #"{"id":"\#(id)","clientId":null,"name":"\#(name)","hourlyRate":null,"isBillableDefault":true,"archivedAt":\#(archivedAt)}"#
        }
        return Data(#"{"projects":[\#(items.joined(separator: ","))]}"#.utf8)
    }

    private func clients(_ rows: [(String, String)]) -> Data {
        let items = rows.map { id, name in #"{"id":"\#(id)","name":"\#(name)","color":null}"# }
        return Data(#"{"clients":[\#(items.joined(separator: ","))]}"#.utf8)
    }
}

/// Answers by path, ignoring the `/api/v1` prefix and the query string.
private final class APIStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var routes: [String: (Int, Data)] = [:]
    nonisolated(unsafe) static var requested: [String] = []
    /// The last body sent to each path.
    nonisolated(unsafe) static var bodies: [String: Data] = [:]

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let path = request.url!.path().replacingOccurrences(of: "/api/v1", with: "")
        Self.requested.append(path)
        if let body = request.httpBody ?? request.httpBodyStream.map(Self.read) { Self.bodies[path] = body }
        let (status, data) = Self.routes[path] ?? (404, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    /// URLSession hands a protocol its body as a stream, not `httpBody`.
    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            guard n > 0 else { break }
            data.append(buffer, count: n)
        }
        return data
    }
}
