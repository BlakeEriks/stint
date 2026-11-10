import Foundation
import Testing
@testable import Stint

/// Serialized: every test answers refreshes through one stub.
@Suite(.serialized)
struct TokenStoreTests {
    @Test(arguments: [
        (400, true), (401, true), (403, true),
        (0, false), (408, false), (429, false), (500, false), (502, false), (503, false),
    ])
    func onlyARejectionSignsOut(status: Int, signsOut: Bool) {
        #expect(TokenStore.refreshError(status: status).isUnauthorized == signsOut)
    }

    /// Offline or a server fault: the token request fails, the session stays.
    @Test(arguments: [
        Result<(Int, Data), URLError>.failure(URLError(.notConnectedToInternet)),
        .success((503, Data())),
    ])
    func aFailedRefreshKeepsTheSession(answer: Result<(Int, Data), URLError>) async throws {
        let store = try await expiredStore(answer: answer)
        await #expect(throws: (any Error).self) { try await store.accessToken() }
        #expect(await store.isSignedIn)
        await store.signOut()
    }

    @Test func rejectedRefreshSignsOut() async throws {
        let store = try await expiredStore(answer: .success((400, Data(#"{"error":"invalid_grant"}"#.utf8))))
        #expect(try await store.accessToken() == nil)
        #expect(await !store.isSignedIn)
    }

    @Test func refreshedTokenIsReturned() async throws {
        let fresh = sessionJSON(accessToken: "fresh", expiresIn: 3600)
        let store = try await expiredStore(answer: .success((200, fresh)))
        #expect(try await store.accessToken() == "fresh")
        #expect(await store.isSignedIn)
        await store.signOut()
    }

    /// Crash reports carry the user id, read from the session GoTrue
    /// returns and from the copy the Keychain keeps.
    @Test func sessionKeepsTheUserID() throws {
        let json = Data(#"{"access_token":"a","refresh_token":"r","expires_at":1,"user":{"id":"u-1","email":"e@x.test"}}"#.utf8)
        let session = try JSONDecoder().decode(Session.self, from: json)
        #expect(session.userID == "u-1")
        let stored = try JSONDecoder().decode(Session.self, from: JSONEncoder().encode(session))
        #expect(stored.userID == "u-1")
        #expect(stored.email == "e@x.test")
    }

    /// A store whose session is past its headroom, so the next token
    /// request refreshes. Its own Keychain account, cleared by `signOut()`.
    private func expiredStore(answer: Result<(Int, Data), URLError>) async throws -> TokenStore {
        StubProtocol.answer = answer
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let store = TokenStore(
            supabaseURL: URL(string: "http://tokenstore.test")!,
            anonKey: "anon",
            urlSession: URLSession(configuration: config)
        )
        let stale = sessionJSON(accessToken: "stale", expiresIn: -10)
        await store.store(try JSONDecoder().decode(Session.self, from: stale))
        return store
    }

    private func sessionJSON(accessToken: String, expiresIn: TimeInterval) -> Data {
        let at = Date().addingTimeInterval(expiresIn).timeIntervalSince1970
        return Data(#"{"access_token":"\#(accessToken)","refresh_token":"r","expires_at":\#(at)}"#.utf8)
    }
}

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var answer: Result<(Int, Data), URLError> = .success((200, Data()))

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        switch Self.answer {
        case let .success((status, data)):
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        case let .failure(error):
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
}
