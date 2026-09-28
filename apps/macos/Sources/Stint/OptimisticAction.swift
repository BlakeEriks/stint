import Foundation

/// The one seam every mutating model action goes through (Constitution VI),
/// mirroring `useOptimisticMutation` on web.
///
/// Predicted mode: `predict()` returns a value, `apply(_:)` writes it to
/// published state immediately and returns the snapshot to undo it with.
/// Pending mode: `predict()` returns `nil` — only `isBusy`-shaped state
/// flips; nothing is applied or rolled back.
///
/// `run()` races `perform()` against a 10s timeout (FR-013) and rolls back
/// with a reason on either a thrown error or the timeout, never silently
/// (Constitution I). A monotonic per-action-kind counter drops a superseded
/// call's late result rather than letting it re-enter `reconcile`/`rollback`
/// after a newer call already has (FR-008/FR-014).
@MainActor
protocol OptimisticAction {
    associatedtype Prediction: Sendable
    associatedtype ActionResult: Sendable

    /// Predicted mode: the value to show immediately. Pending mode: `nil`.
    func predict() -> Prediction?

    /// Applies `prediction` to published state; returns the snapshot needed
    /// to undo it.
    func apply(_ prediction: Prediction) -> Prediction

    /// The actual network call.
    func perform() async throws -> ActionResult

    /// Reconciles a successful result into published state.
    func reconcile(_ result: ActionResult)

    /// Restores `snapshot` (if any), setting the model's error to `reason`.
    func rollback(_ snapshot: Prediction?, reason: String)
}

/// Shared bookkeeping so `TimerModel`'s action methods call `run()` instead
/// of hand-writing do/await/catch (contracts/optimistic-mutation.md).
actor OptimisticActionSupersession {
    static let shared = OptimisticActionSupersession()

    /// One counter per action kind (start/stop/rename/resume all target the
    /// same `running` entry, so they share a kind).
    private var tokens: [String: Int] = [:]

    func next(_ kind: String) -> Int {
        let token = (tokens[kind] ?? 0) + 1
        tokens[kind] = token
        return token
    }

    func isLatest(_ kind: String, _ token: Int) -> Bool {
        tokens[kind] == token
    }
}

extension OptimisticAction {
    /// Runs the predict/apply/perform/reconcile-or-rollback cycle with a
    /// 10s timeout and supersession guard. `kind` groups actions that target
    /// the same entity (e.g. `"timer"` for start/stop/rename/resume), so a
    /// stale result from one is dropped once a newer one of any of them has
    /// landed.
    func run(kind: String, timeoutMs: UInt64 = 10_000) async {
        let token = await OptimisticActionSupersession.shared.next(kind)
        let snapshot: Prediction?
        if let prediction = predict() {
            snapshot = apply(prediction)
        } else {
            snapshot = nil
        }

        let settled = Settled()

        let timeoutTask = Task {
            try? await Task.sleep(nanoseconds: timeoutMs * 1_000_000)
            guard !Task.isCancelled else { return }
            guard await settled.markIfFirst() else { return }
            guard await OptimisticActionSupersession.shared.isLatest(kind, token) else { return }
            rollback(snapshot, reason: "No response — try again")
        }

        do {
            let result = try await perform()
            timeoutTask.cancel()
            guard await settled.markIfFirst() else { return }
            guard await OptimisticActionSupersession.shared.isLatest(kind, token) else { return }
            reconcile(result)
        } catch {
            timeoutTask.cancel()
            guard await settled.markIfFirst() else { return }
            guard await OptimisticActionSupersession.shared.isLatest(kind, token) else { return }
            rollback(snapshot, reason: error.localizedDescription)
        }
    }
}

/// One-shot latch so the timeout and the real response can race without
/// both applying their effect.
private actor Settled {
    private var done = false

    func markIfFirst() -> Bool {
        guard !done else { return false }
        done = true
        return true
    }
}
