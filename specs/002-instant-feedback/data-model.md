# Phase 1 Data Model: Every press answers at once

No database schema changes. These are client-side types shared by the web
helper and the macOS protocol — the shapes each platform's mutation state
takes, not persisted entities.

## `MutationState<TPrediction>` (web, TypeScript)

The state `useOptimisticMutation` tracks per in-flight call, layered on top
of (not replacing) TanStack Query's own `mutation.status`.

| Field | Type | Notes |
| --- | --- | --- |
| `token` | `number` | Incrementing, per query key. The supersession guard: an effect only applies if its token is still the latest recorded for that key (research.md). |
| `queryKey` | `QueryKey` | The cache entry this prediction writes to and rolls back from. |
| `snapshot` | `TPrediction \| undefined` | The cache value captured in `onMutate` before the predicted write, restored verbatim on rollback. |
| `predicted` | `TPrediction \| undefined` | Present only in predicted mode; `undefined` in pending mode (research.md's "predict omitted"). |
| `rollbackReason` | `string \| null` | Populated before every visible revert (server rejection message, or "No response — try again" on the 10s timeout). Never reverts with this `null` (Constitution I / FR-002). |
| `startedAt` | `number` (epoch ms) | Set in `onMutate`; the 10s timeout is measured from here. |

**Validation rules**: `token` MUST be assigned atomically with the cache
write in `onMutate` (no `await` between them) so FR-001's same-frame
requirement holds by construction. `rollbackReason` MUST be set before
`setQueryData` restores `snapshot` — never a bare revert.

**State transitions**: `pending` → (`confirmed` | `rolledBack`). A
superseded mutation's own eventual settlement is a no-op transition (stays
wherever it was, does not re-enter `confirmed`/`rolledBack`) once its
token is stale.

## `Timer entry` (existing entity, one new client-only field)

Per spec's Key Entities: gains `startedAtPredicted` — a client-stamped
timestamp set at the moment of the Start/Resume press (FR-012), used only
for the immediate elapsed-time readout before the server's `summary`
response arrives. The server's `started_at` is unchanged and remains what
`resolveRate()`/billing and every persisted read use; `startedAtPredicted`
is never sent to the server and is discarded once the real `started_at`
lands.

## `OptimisticAction` protocol (macOS, Swift)

```swift
protocol OptimisticAction {
    associatedtype Prediction
    associatedtype Result

    /// Predicted mode: returns the value to show immediately.
    /// Pending mode: return nil — only `isBusy` flips.
    func predict() -> Prediction?

    /// Applies `prediction` to the model's published state; returns the
    /// snapshot needed to undo it.
    func apply(_ prediction: Prediction) -> Prediction

    /// The actual network call.
    func perform() async throws -> Result

    /// Reconciles a successful `Result` into published state.
    func reconcile(_ result: Result)

    /// Restores `snapshot`, setting `errorMessage` to `reason`.
    func rollback(_ snapshot: Prediction?, reason: String)
}

extension OptimisticAction {
    /// Default implementation: predict-or-not, apply, race the call
    /// against a 10s timeout, reconcile or roll back. `TimerModel`'s
    /// action methods call this instead of hand-writing do/await/catch.
    func run() async { /* timeout + rollback bookkeeping, shared */ }
}
```

**Validation rules**: Mirrors the web token/supersession guard —
`TimerModel` (the sole conformer for this feature) tracks a monotonic
counter per action kind (start/stop/rename/resume all target the same
`running` entry) so a superseded call's late result is dropped, matching
FR-008/FR-014 on macOS.

**Key Entities cross-reference**: `Prediction` for `TimerModel`'s
start/stop/resume/rename is a `TimeEntry?` (predicted mode); no macOS
surface in this feature needs pending mode (invoice generation/sending is
web-only per `docs/architecture.md`), so pending mode is implemented on
the protocol for parity with the web helper but has no macOS call site
yet.

## `Mutation` (existing spec entity — mapped to the above)

No new persisted shape. `Mutation`'s "predicted-display and
rollback-with-reason lifecycle" from spec.md's Key Entities is exactly
`MutationState` (web) / `OptimisticAction.run()` (macOS) above — this
section exists so a reader can trace the spec entity to its concrete
representation, not to introduce a third shape.
