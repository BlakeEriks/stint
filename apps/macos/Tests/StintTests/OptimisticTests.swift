import Foundation
import Testing
@testable import Stint

/// A model with one value, so each rule of `press` shows on its own.
@MainActor
private final class Model: Optimistic {
    var inFlight: [String: Int] = [:]
    var lanes: [String: Task<Void, Never>] = [:]
    var value = "original"
    var reasons: [String] = []
    var refreshes = 0

    func report(_ reason: String) { reasons.append(reason) }
    func refresh() async { refreshes += 1 }

    /// The real 10s bound unless a test is about the bound itself: a slow CI
    /// runner otherwise times out presses that were meant to answer.
    func set(
        _ new: String,
        timeout: Duration = .seconds(10),
        perform: @escaping @Sendable () async throws -> String
    ) async -> String? {
        await press("value", timeout: timeout) {
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
        let answer = await model.set("predicted", timeout: .milliseconds(100)) {
            await gate.wait()
            return "ok"
        }
        #expect(answer == nil)
        #expect(model.value == "original")
        #expect(model.reasons == [PressTimeout().localizedDescription])
        let refreshesAfterTimeout = model.refreshes

        await gate.release()
        for _ in 0..<200 where model.refreshes == refreshesAfterTimeout {
            try? await Task.sleep(for: .milliseconds(10))
        }
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

    @Test func pressesInOneScopeReachTheServerInOrder() async {
        let model = Model()
        let first = Gate()
        let log = Log()
        let a = Task {
            await model.set("start") {
                await log.add("start began")
                await first.wait()
                return "ok"
            }
        }
        while await log.entries.isEmpty { await Task.yield() }
        let b = Task {
            await model.set("stop") {
                await log.add("stop began")
                return "ok"
            }
        }
        await Task.yield()
        #expect(model.value == "stop")
        try? await Task.sleep(for: .milliseconds(50))
        #expect(await log.entries == ["start began"])

        await first.release()
        _ = await a.value
        _ = await b.value
        #expect(await log.entries == ["start began", "stop began"])
    }
}

private actor Log {
    private(set) var entries: [String] = []
    func add(_ entry: String) { entries.append(entry) }
}
