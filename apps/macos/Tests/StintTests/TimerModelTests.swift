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
        #expect(Set(APIStub.requested) == ["/summary", "/projects", "/clients", "/stats", "/entries"])

        model.panel(open: false)
        APIStub.requested = []
        await model.poll()
        #expect(APIStub.requested == ["/summary"])
        await model.signOut()
    }

    /// A model over a stubbed backend, signed in with a token that needs no
    /// refresh. Its own Keychain account, cleared by `signOut()`.
    private func signedInModel() async throws -> TimerModel {
        APIStub.routes = [
            "/summary": (200, Data(#"{"running":null,"todaySeconds":0,"weekSeconds":0,"serverTime":"2026-09-28T12:00:00Z"}"#.utf8)),
            "/stats": (200, Data(#"{"currency":"USD","unbilled":{"total":0}}"#.utf8)),
            "/entries": (200, Data(#"{"entries":[]}"#.utf8)),
        ]
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

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let path = request.url!.path().replacingOccurrences(of: "/api/v1", with: "")
        Self.requested.append(path)
        let (status, data) = Self.routes[path] ?? (404, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
