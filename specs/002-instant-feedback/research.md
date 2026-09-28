# Phase 0 Research: Every press answers at once

No NEEDS CLARIFICATION markers remain in the spec (all five clarification
questions resolved 2026-09-28). Research here settles the technical
approach, not product behavior.

## Decision: web optimistic mechanism is TanStack Query's `onMutate`

**Decision**: Build `useOptimisticMutation` as a thin wrapper over
`useMutation` from `@tanstack/react-query` v5 (already the project's only
client data layer), using `onMutate` to write the predicted value into the
query cache via `queryClient.setQueryData`, `onError` to roll back to the
snapshot taken in `onMutate`, and `onSettled` to invalidate via the
existing `invalidateEntryData()` (`query-keys.ts`).

**Rationale**: TanStack Query's optimistic-update pattern is documented,
battle-tested, and already the library every mutation in the app uses for
its non-optimistic form (`use-timer.ts`, `use-calendar.ts`, and 15+
components). Adopting its built-in mechanism satisfies the user's own
instruction to prefer an existing mechanism over hand-rolling one, and
means the "shared helper" is a thin policy layer (predicted vs. pending
mode, timeout, supersession) rather than a new state-management system.

**Alternatives considered**: A hand-rolled reducer/context store for
predicted state — rejected, duplicates what `onMutate`/`setQueryData`
already does and would be a second cache the real one has to agree with.
Jotai/Zustand for optimistic slices — rejected, no such dependency exists
in the project today and none of FR-001 through FR-015 needs cross-tree
state beyond what the query cache already models.

## Decision: pending mode is the same helper, `predictFn` omitted

**Decision**: `useOptimisticMutation` takes an optional `predict` callback.
When present, the helper runs predicted mode (`onMutate` writes
`predict(variables)` into the cache). When absent, the helper runs pending
mode: `onMutate` only flips an `isPending`-shaped flag the caller renders
(TanStack Query's own `mutation.isPending` already provides this — pending
mode needs no extra state, only the discipline of routing through the same
call so FR-009's lint has one thing to allow).

**Rationale**: One function, one lint rule, two behaviors — this is what
"the shared helper offers both modes... no opt-out" (Blake's clarification)
requires structurally: a developer cannot bypass the timeout/rollback/
supersession machinery by omitting `predict`, they only opt out of showing
a prediction.

**Alternatives considered**: Two separate helpers
(`useOptimisticMutation` / `usePendingMutation`) — rejected, it doubles the
lint surface (two modules to allow-list) for no behavioral gain, and the
spec explicitly frames this as one mechanism with two modes, not two
mechanisms.

## Decision: 10s timeout via `AbortController` inside the helper

**Decision**: The helper starts a 10s timer in `onMutate`; if `onSettled`
hasn't fired by then, it forces rollback with reason "No response — try
again" and lets the real request's eventual settlement (success or error)
be a no-op if it arrives late (guarded by the supersession token below).

**Rationale**: Matches FR-013 exactly; `setTimeout` + a guard flag is the
standard pattern for this in TanStack Query, no new dependency.

**Alternatives considered**: An `AbortSignal.timeout(10_000)` passed into
the `mutationFn`'s `fetch` — rejected as the sole mechanism, because
aborting the *request* is a different guarantee than rolling back the
*display*; a slow-but-not-dead server response arriving at 11s must still
be discarded from the display (already rolled back) without also needing
the network layer to have canceled it. The display-side timer is what the
requirement is about.

## Decision: supersession via a per-entity mutation token

**Decision**: The helper keys in-flight predictions by the same query key
the mutation targets (e.g. `keys.summary()`, `keys.entry(id)`) and stamps
each `onMutate` call with an incrementing token stored alongside the
prediction. `onError`/`onSuccess`/the timeout only apply their effect if
their token is still the latest one recorded for that key — an earlier
mutation's late response is dropped rather than overwriting a newer
prediction or confirmed state.

**Rationale**: This is the direct mechanism for FR-008/FR-014 and the two
#118 races in SC-003 — "latest press wins on screen," and a stale response
arriving after a newer state is a no-op by construction, not by a
component remembering to check.

**Alternatives considered**: Request cancellation (`AbortController` per
mutation) — insufficient alone, since the race is about a stale *response*
that already left the server (e.g. a rename response landing after a stop
response for the same entity), not just about canceling a pending request;
the token check is needed regardless of whether the request itself was
cancellable.

## Decision: macOS mechanism is a protocol, not a base class

**Decision**: `OptimisticAction` is a `protocol` with an associated
`Prediction` type and default (`extension`) implementations of the
timeout/rollback/supersession bookkeeping, matching the spec's clarified
answer ("a shared protocol/base type that models conform to, so the
compiler enforces the conformance shape"). `TimerModel`'s four action
methods (`toggle`, `resume`, `rename`, the private `patch`) are
reimplemented as calls into the protocol's `perform(predicting:apply:)`.

**Rationale**: Swift protocols with default implementations give the
"compiler enforces the conformance shape" property the clarification
calls for without inheritance, which `@Observable` classes in this
codebase don't currently use for this purpose. `TimerModel` stays a single
`@Observable final class`; it gains protocol conformance, not a new
superclass.

**Alternatives considered**: A generic `OptimisticStore<T>` wrapper class
that `TimerModel` composes — rejected as heavier than needed for one
model; the protocol approach is the minimal shared shape and matches what
was already decided in clarification, not a new design question for this
plan to reopen.

## Decision: navigation loading/prefetch uses Next's own primitives

**Decision**: `loading.tsx` per route segment under `apps/web/src/app/(app)/`
that lacks one, and `router.prefetch()` (from `next/navigation`) called on
the tab-bar's hover/mount for adjacent tabs — both are Next.js App Router
built-ins, no new dependency.

**Rationale**: Directly named as the mechanism to adopt in the task
instructions, and is already how the App Router models "answer with a
layout at once" — no research risk here.

**Alternatives considered**: None — this is a documented framework
primitive already in use elsewhere in the App Router migration, not an
open design question.
