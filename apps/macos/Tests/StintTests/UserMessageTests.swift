import Foundation
import Testing
@testable import Stint

/// Foundation's own text for a dropped connection reads as a fault in the
/// app, and nothing fails when a new error site forgets the mapping.
struct UserMessageTests {
    @Test(arguments: [
        URLError.Code.notConnectedToInternet, .cannotFindHost, .cannotConnectToHost,
        .networkConnectionLost, .timedOut, .dnsLookupFailed,
    ])
    func saysTheConnectionIsDown(code: URLError.Code) {
        #expect(userMessage(for: URLError(code)) == "Can’t reach Stint. Check your internet connection.")
    }

    @Test func keepsTheServersOwnWords() {
        let error = APIError(status: 409, code: "TIMER_ALREADY_RUNNING", message: "A timer is already running.")
        #expect(userMessage(for: error) == "A timer is already running.")
        #expect(userMessage(for: PressTimeout()) == PressTimeout().localizedDescription)
    }

    @Test func passesAnyOtherURLErrorThrough() {
        let error = URLError(.badServerResponse)
        #expect(userMessage(for: error) == error.localizedDescription)
    }
}
