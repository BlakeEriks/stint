import Foundation

/// The one way the macOS app writes (Constitution VI), the same rules as
/// `useOptimisticMutation` on the web. Every press answers in the same frame:
///
/// - **Predicted**: `apply` changes published state before anything is
///   awaited and returns how to undo it.
/// - **Pending**: `apply` returns nil, for a result the app cannot know or
///   cannot take back; the caller shows that it is waiting.
///
/// **Latest press wins.** Presses in one `scope` can overlap; only the last
/// to settle undoes or refetches, so an earlier answer never overwrites a
/// newer prediction, and the refetch shows the server's truth.
///
/// **A 10s bound.** A silent server fails the press like a rejection. The
/// request is not abandoned: if it lands late, `refresh()` runs, so a change
/// the server did make is never hidden.
///
/// A failure is never silent (Constitution I): its reason goes to `report`.
@MainActor
protocol Optimistic: AnyObject {
    /// Presses still in flight, per scope. Only `press` touches it.
    var inFlight: [String: Int] { get set }
    func report(_ reason: String)
    /// Fetches the server's truth.
    func refresh() async
}

struct PressTimeout: LocalizedError {
    var errorDescription: String? { "The server didn’t answer. Try again." }
}

extension Optimistic {
    /// Returns the server's answer, or nil when the press failed.
    @discardableResult
    func press<T: Sendable>(
        _ scope: String,
        timeout: Duration = .seconds(10),
        apply: () -> (() -> Void)?,
        perform: @escaping @Sendable () async throws -> T
    ) async -> T? {
        let undo = apply()
        inFlight[scope, default: 0] += 1
        let result = await race(perform, timeout: timeout) { [weak self] in
            await self?.refresh()
        }
        let isLast = inFlight[scope] == 1
        inFlight[scope, default: 1] -= 1

        switch result {
        case .success(let value):
            if isLast { await refresh() }
            return value
        case .failure(let error):
            if isLast {
                undo?()
                await refresh()
            }
            // After the refresh, which clears the model's last error.
            report(error.localizedDescription)
            return nil
        }
    }
}

/// `perform`'s result, or a `PressTimeout` after `timeout`. A late result
/// runs `late` instead of being dropped.
@MainActor
private func race<T: Sendable>(
    _ perform: @escaping @Sendable () async throws -> T,
    timeout: Duration,
    late: @escaping @MainActor () async -> Void
) async -> Result<T, Error> {
    await withCheckedContinuation { continuation in
        let once = Once()
        let timer = Task { @MainActor in
            do { try await Task.sleep(for: timeout) } catch { return }
            if once.claim() { continuation.resume(returning: .failure(PressTimeout())) }
        }
        Task { @MainActor in
            let result: Result<T, Error>
            do { result = .success(try await perform()) } catch { result = .failure(error) }
            timer.cancel()
            if once.claim() {
                continuation.resume(returning: result)
            } else {
                await late()
            }
        }
    }
}

@MainActor
private final class Once {
    private var claimed = false
    func claim() -> Bool {
        defer { claimed = true }
        return !claimed
    }
}
