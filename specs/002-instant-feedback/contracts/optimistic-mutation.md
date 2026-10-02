# Contract: `useOptimisticMutation` (web) / `OptimisticAction` (macOS)

Not an HTTP contract — this feature adds no route. The contract is the one
seam every mutation on each platform must go through (FR-005/FR-006), and
what FR-009's lint enforces.

## `useOptimisticMutation` — `apps/web/src/lib/client/mutations.ts`

```ts
function useOptimisticMutation<TVariables, TData, TCache>(opts: {
  mutationFn: (vars: TVariables) => Promise<TData>;
  queryKey: (vars: TVariables) => QueryKey;
  /** Predicted mode when present; pending mode when omitted. */
  predict?: (vars: TVariables, current: TCache | undefined) => TCache;
  onSettled?: (data: TData | undefined, vars: TVariables) => void; // e.g. invalidateEntryData
  timeoutMs?: number; // default 10_000, FR-013
}): UseMutationResult<TData, ApiError, TVariables> & { isPredicted: boolean };
```

**Behavior**:
- `predict` present → `onMutate` snapshots the current cache value at
  `queryKey(vars)`, writes `predict(vars, current)`, stamps a token.
  `onError` and the 10s timeout both restore the snapshot via
  `setQueryData` and surface `rollbackReason` (FR-002/FR-013).
- `predict` absent → no cache write; caller reads the returned
  `isPending`/`isPredicted` flag to render the pending-state UI (FR-004).
- Every path — success, error, timeout — calls `onSettled` exactly once
  per call, guarded by the token so a superseded call's settlement never
  fires after a newer one already has (FR-008/FR-014).

**Lint contract** (`apps/web/scripts/check-mutation-usage.mjs`, run in
`pretest`/CI same as `check-type-roles.mjs`): any file under
`apps/web/src/**` other than `lib/client/mutations.ts` itself that imports
`useMutation` from `@tanstack/react-query` fails the check (FR-009, no
opt-out). Message names the offending file/line and points at
`useOptimisticMutation`.

## `OptimisticAction` — `apps/macos/Sources/Stint/OptimisticAction.swift`

Protocol shape is in `data-model.md`. **Review-checklist contract**
(FR-006's non-automatable half, per the spec's clarified answer): the PR
template / review checklist gains one item —
*"A new mutating action on a model conforms to `OptimisticAction` rather
than hand-writing do/await/catch."* Location: wherever
`docs/CLAUDE.md`'s existing review-time checklist items live (macOS PR
checklist).

## Reused, not introduced

Both the web helper and the macOS protocol call the **existing**
`/api/v1/*` route handlers unchanged — `api.startTimer`, `api.stopTimer`,
`api.updateRunning`/`api.updateTimer`, `api.inbox*`, `api.invoices*`,
`api.clients*`, `api.paymentProfiles*`, `api.calendar*`. No request/response
shape in `@stint/schema` changes. This contract governs the client-side
call path only.
