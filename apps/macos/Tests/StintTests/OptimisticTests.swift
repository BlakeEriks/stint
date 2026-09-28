import Foundation
import Testing
@testable import Stint

/// A model with one value, so each rule of `press` shows on its own.
@MainActor
private final class Model: Optimistic {
    var inFlight: [String: Int] = [:]
    var value = "original"
    var reasons: [String] = []
    var refreshes = 0

    func report(_ reason: String) { reasons.append(reason) }
    func refresh() async { refreshes += 1 }

    func set(_ new: String, perform: @escaping @Sendable () async throws -> String) async -> String? {
        await press("value", timeout: .milliseconds(100)) {
            let old = value
            value = new
            return { self.value = old }
        } perform: {
            try await perform()
        }
    }
}

private struct Rejected: LocalizedError {
    var errorDescription: String? { "rejected" }
}

/// A server answer the test releases by hand.
private actor Gate {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var open = false
    func wait() async {
        if open { return }
        await withCheckedContinuation { waiters.append($0) }
    }
    func release() {
        open = true
        waiters.forEach { $0.resume() }
        waiters = []
    }
}

@MainActor
struct OptimisticTests {
    @Test func showsThePredictionBeforeTheServerAnswers() async {
        let model = Model()
        let gate = Gate()
        let task = Task { await model.set("predicted") { await gate.wait(); return "ok" } }
        await Task.yield()
        #expect(model.value == "predicted")
        #expect(model.refreshes == 0)
        await gate.release()
        _ = await task.value
        #expect(model.value == "predicted")
        #expect(model.refreshes == 1)
        #expect(model.reasons.isEmpty)
    }

    @Test func undoesAndSaysWhyWhenRejected() async {
        let model = Model()
        let answer = await model.set("predicted") { throw Rejected() }
        #expect(answer == nil)
        #expect(model.value == "original")
        #expect(model.reasons == ["rejected"])
        #expect(model.refreshes == 1)
    }

    @Test func failsAfterSilenceAndRefreshesWhenTheAnswerLandsLate() async {
        let model = Model()
        let gate = Gate()
        let answer = await model.set("predicted") { await gate.wait(); return "ok" }
        #expect(answer == nil)
        #expect(model.value == "original")
        #expect(model.reasons == [PressTimeout().localizedDescription])
        let refreshesAfterTimeout = model.refreshes

        await gate.release()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.refreshes == refreshesAfterTimeout + 1)
    }

    @Test func anEarlierFailureDoesNotUndoANewerPrediction() async {
        let model = Model()
        let first = Gate()
        let second = Gate()
        let a = Task { await model.set("first") { await first.wait(); throw Rejected() } }
        await Task.yield()
        let b = Task { await model.set("second") { await second.wait(); return "ok" } }
        await Task.yield()
        #expect(model.value == "second")

        await first.release()
        _ = await a.value
        #expect(model.value == "second")
        #expect(model.reasons == ["rejected"])
        #expect(model.refreshes == 0)

        await second.release()
        _ = await b.value
        #expect(model.refreshes == 1)
    }
}
