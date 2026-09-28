import Foundation
import Testing
@testable import Stint

/// A minimal conformer: `Prediction`/`ActionResult` are both `String`,
/// `perform` is driven by the test via a continuation so it can control
/// exactly when (or whether) the call settles.
@MainActor
private final class StubAction: OptimisticAction {
    var predicted: String?
    var appliedLog: [String] = []
    var reconciledLog: [String] = []
    var rollbackLog: [(String?, String)] = []
    var performResult: Result<String, Error>?
    var performDelayNanos: UInt64 = 0

    func predict() -> String? { predicted }

    func apply(_ prediction: String) -> String {
        appliedLog.append(prediction)
        return "snapshot"
    }

    func perform() async throws -> String {
        if performDelayNanos > 0 {
            try? await Task.sleep(nanoseconds: performDelayNanos)
        }
        switch performResult {
        case .success(let value): return value
        case .failure(let error): throw error
        case nil: throw StubError.neverResolves
        }
    }

    func reconcile(_ result: String) {
        reconciledLog.append(result)
    }

    func rollback(_ snapshot: String?, reason: String) {
        rollbackLog.append((snapshot, reason))
    }
}

private enum StubError: Error, LocalizedError {
    case boom
    case neverResolves
    var errorDescription: String? {
        switch self {
        case .boom: return "boom"
        case .neverResolves: return "never resolves"
        }
    }
}

@Suite
@MainActor
struct OptimisticActionTests {
    @Test func rollsBackOnThrownError() async {
        let action = StubAction()
        action.predicted = "predicted"
        action.performResult = .failure(StubError.boom)

        await action.run(kind: "test-error-\(UUID())")

        #expect(action.appliedLog == ["predicted"])
        #expect(action.rollbackLog.count == 1)
        #expect(action.rollbackLog.first?.1 == "boom")
        #expect(action.reconciledLog.isEmpty)
    }

    @Test func rollsBackOnTimeout() async {
        let action = StubAction()
        action.predicted = "predicted"
        action.performDelayNanos = 200_000_000 // 200ms, longer than the tiny timeout below
        action.performResult = .success("server")

        await action.run(kind: "test-timeout-\(UUID())", timeoutMs: 10)

        #expect(action.rollbackLog.count == 1)
        #expect(action.rollbackLog.first?.1 == "No response — try again")
        // The late success must not also reconcile.
        #expect(action.reconciledLog.isEmpty)
    }

    @Test func supersededResultIsDropped() async {
        let kind = "test-supersede-\(UUID())"
        let stale = StubAction()
        stale.predicted = "stale"
        stale.performDelayNanos = 100_000_000
        stale.performResult = .success("stale-result")

        let fresh = StubAction()
        fresh.predicted = "fresh"
        fresh.performResult = .success("fresh-result")

        async let staleRun: Void = stale.run(kind: kind)
        // Let the stale run register its token first.
        try? await Task.sleep(nanoseconds: 10_000_000)
        await fresh.run(kind: kind)
        await staleRun

        #expect(fresh.reconciledLog == ["fresh-result"])
        // The stale action's own late success is a no-op: neither reconciled nor rolled back.
        #expect(stale.reconciledLog.isEmpty)
        #expect(stale.rollbackLog.isEmpty)
    }

    @Test func pendingModeAppliesNothing() async {
        let action = StubAction()
        action.predicted = nil
        action.performResult = .success("server")

        await action.run(kind: "test-pending-\(UUID())")

        #expect(action.appliedLog.isEmpty)
        #expect(action.reconciledLog == ["server"])
    }
}
