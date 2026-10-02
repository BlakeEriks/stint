# Tasks: Every press answers at once

**Input**: Design documents from `/specs/002-instant-feedback/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/optimistic-mutation.md, quickstart.md

**Tests**: Required (project rule: new behavior ships with its own tests).
Each user story gets the suites Constitution V names for the code it
touches, plus `.stories.tsx` for each changed screen state.

**Organization**: Tasks are grouped by user story (P1, P2, P3) so each can
ship and be verified independently.

## Path Conventions

Per plan.md's Project Structure: `apps/web/src/lib/client/`,
`apps/web/src/components/`, `apps/web/scripts/`, `apps/web/src/app/(app)/`,
`apps/web/test/ui/`, `apps/web/e2e/`, `apps/macos/Sources/Stint/`,
`apps/macos/Tests/StintTests/`.

---

## Phase 1: Setup

**Purpose**: Nothing to scaffold — both platforms already have the single
dependency this feature needs (TanStack Query v5, Next App Router). This
phase only confirms the seam that later phases build inside.

- [X] T001 Confirm `apps/web/src/lib/client/mutations.ts` does not yet
      exist and `apps/web/src/lib/client/query-keys.ts`'s
      `invalidateEntryData()` is the invalidation entry point every helper
      call will reuse (research.md's decision) — no file change, a
      pre-check for T002.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The shared mechanism both platforms' mutations route through.
No user story can start until its platform's mechanism exists.

**CRITICAL**: US1–US3 all depend on this phase.

- [X] T002 Implement `useOptimisticMutation` in
      `apps/web/src/lib/client/mutations.ts` per
      `contracts/optimistic-mutation.md`'s signature: `mutationFn`,
      `queryKey(vars)`, optional `predict(vars, current)`, optional
      `onSettled`, `timeoutMs` defaulting to `10_000`. `onMutate` MUST
      snapshot the current cache value at `queryKey(vars)`, write
      `predict(vars, current)` when `predict` is present, and stamp an
      incrementing per-`queryKey` token atomically with the cache write (no
      `await` between them — data-model.md's validation rule, FR-001).
      When `predict` is absent, `onMutate` writes nothing to the cache;
      callers render the mutation's own `isPending` for the pending-state
      UI (FR-004). Return type adds `isPredicted: boolean` to
      `UseMutationResult`.
- [X] T003 In the same file, implement rollback: `onError` sets
      `rollbackReason` (the server's error message) and restores
      `snapshot` via `setQueryData`, guarded so it only applies if its
      token is still the latest recorded for that `queryKey` (FR-002,
      FR-008, FR-014, research.md's supersession decision).
- [X] T004 In the same file, implement the 10s timeout: a timer started in
      `onMutate` that, if unresolved by `timeoutMs`, forces the same
      rollback path with reason `"No response — try again"` (FR-013); the
      real request's late settlement becomes a no-op once its token is
      stale (data-model.md's transition rule: superseded settlement never
      re-enters `confirmed`/`rolledBack`).
- [X] T005 In the same file, ensure every path (success, error, timeout)
      calls `onSettled` exactly once per call, guarded by the same token,
      per the contract's "Every path... calls `onSettled` exactly once"
      clause.
- [X] T006 [P] Write `apps/web/scripts/check-mutation-usage.mjs`, same
      shape as `apps/web/scripts/check-type-roles.mjs` (glob the source,
      regex/AST-scan for `useMutation` imports from
      `@tanstack/react-query`): fail with the offending file/line and a
      message pointing at `useOptimisticMutation` for any file under
      `apps/web/src/**` other than `lib/client/mutations.ts` itself
      (FR-009, no opt-out, SC-005).
- [X] T007 Add `"check:mutation-usage": "node scripts/check-mutation-usage.mjs 'src/**/*.ts' 'src/**/*.tsx'"`
      to `apps/web/package.json` `scripts`, following `check:type`'s
      pattern, and wire it into `pretest` (or CI) alongside `check:type` so
      it runs on every check per quickstart.md's automated-coverage list.
- [X] T008 [P] Create `apps/macos/Sources/Stint/OptimisticAction.swift`:
      the `OptimisticAction` protocol from data-model.md
      (`associatedtype Prediction`, `associatedtype Result`, `predict()`,
      `apply(_:)`, `perform() async throws`, `reconcile(_:)`,
      `rollback(_:reason:)`) plus the `extension`'s default `run()`
      covering the 10s timeout, rollback-with-reason bookkeeping, and a
      monotonic per-action-kind counter so a superseded call's late result
      is dropped (mirrors T003/T004's web guard, FR-006, FR-008, FR-013,
      FR-014).
- [X] T009 [P] Vitest: `apps/web/test/ui/mutations.test.ts` covering
      `useOptimisticMutation` — rollback on error restores snapshot and
      sets `rollbackReason`; rollback on 10s timeout with reason
      `"No response — try again"`; supersession (a stale response after a
      newer token is a no-op, latest-press-wins); pending mode (`predict`
      omitted) writes nothing to the cache and only flips `isPending`.
- [X] T010 [P] Swift XCTest: `apps/macos/Tests/StintTests/OptimisticActionTests.swift`
      covering `OptimisticAction.run()` — rollback on thrown error,
      rollback on 10s timeout, supersession (stale result dropped),
      mirroring T009.

**Checkpoint**: Both platforms' shared mechanisms exist, are tested, and
the web lint blocks bypass. User story work can begin.

---

## Phase 3: User Story 1 — Timer actions answer at the press (P1) 🎯 MVP

**Goal**: Start, Stop, rename, and macOS menu-bar resume all show their
predicted result immediately, roll back visibly on rejection, and resolve
the two #118 races to the server's truth.

**Independent Test**: At ~1s/~3s injected latency, press Start, Stop,
rename, and (macOS) resume; each shows the predicted result immediately.
Force a rejection and confirm a visible rollback with a reason. Run the
rename-then-stop and stale-summary-refetch races and confirm the final
state matches the server's.

- [X] T011 [US1] Add `startedAtPredicted` handling to
      `apps/web/src/lib/client/use-timer.ts`: on Start, stamp it at the
      moment of the press (client-side, FR-012) and use it for the
      immediate elapsed-time readout until the server's `summary` response
      replaces it with the real `started_at`; `startedAtPredicted` is
      never sent to the server (data-model.md's Timer entry field).
- [X] T012 [US1] Rewrite `start` in `use-timer.ts` onto
      `useOptimisticMutation`: `predict` writes a running `Summary.running`
      entry (accent-green display per FR-003 — the predicted and
      server-confirmed running timer are the same displayed element, not
      two) with `startedAtPredicted` from T011; `queryKey` is
      `keys.summary()`; `onSettled` calls `invalidateEntryData()`
      (Acceptance Scenario 1).
- [X] T013 [US1] Rewrite `stop` in `use-timer.ts` onto
      `useOptimisticMutation`: `predict` writes `running: null` on
      `keys.summary()`; keep the existing timer-conflict reconciliation
      behavior on error (Acceptance Scenario 2).
- [X] T014 [US1] Rewrite `update` (rename/project-reassign) in
      `use-timer.ts` onto `useOptimisticMutation`: `predict` writes the new
      `taskName`/`projectId` onto the running entry in `keys.summary()`
      (Acceptance Scenario 3).
- [X] T015 [US1] In `apps/macos/Sources/Stint/TimerModel.swift`, conform
      `TimerModel` to `OptimisticAction` and reimplement `toggle`,
      `resume`, `rename`, and the private `patch` as calls into the
      protocol's `run()` (per data-model.md: `Prediction` is `TimeEntry?`),
      replacing their current hand-written do/await/catch bodies. `resume`
      MUST predict a running state immediately, closing the gap named in
      SC-006 and Acceptance Scenario 4 — it did not optimistically update
      before this task.
- [X] T016 [US1] [P] Extend
      `apps/web/e2e/instant-feedback.spec.ts` (new) with route-level
      latency injection (per plan.md's Testing section) covering: Start
      shows predicted running state before the network response resolves;
      Stop shows predicted stopped state; rename shows the new name
      immediately; a forced rejection (stop an already-server-stopped
      timer) shows a visible rollback with a reason (Acceptance Scenarios
      1, 2, 3, 5).
- [X] T017 [US1] [P] In the same spec file, add the two #118 race
      scenarios: (a) rename a running timer then immediately Stop it —
      once both responses land, the final displayed state matches the
      server's, not response arrival order (Acceptance Scenario 6,
      SC-003); (b) trigger a stale `keys.summary()` refetch (e.g. window
      focus) immediately after a fresh Start press — the stale refetch
      must not overwrite the newer predicted/confirmed state (Acceptance
      Scenario 7, SC-003).
- [X] T018 [US1] [P] `.stories.tsx` for each changed timer display state
      (Constitution V): running-predicted (accent green, matches
      server-confirmed per FR-003), rolled-back-with-reason. Add stories
      to whichever component under `apps/web/src/components/` renders the
      running timer (find via `useTimer()` usage).
- [X] T019 [US1] Add the macOS PR-checklist item to
      `.github/pull_request_template.md`'s "Checks CI cannot make" list:
      *"A new mutating action on a model conforms to `OptimisticAction`
      rather than hand-writing do/await/catch."* (contracts/
      optimistic-mutation.md's review-checklist contract, FR-006's
      non-automatable half).

**Checkpoint**: User Story 1 is independently shippable — the timer, the
highest-priority surface, answers at the press on both platforms, with
races resolved.

---

## Phase 4: User Story 2 — Every other mutation answers at the press (P2)

**Goal**: Inbox actions, invoice-paid marking, client edits, payment
profile edits, and calendar drag show their predicted result immediately;
invoice generation and sending show an immediate pending state.

**Independent Test**: At ~1s/~3s injected latency, exercise one mutation
per surface (inbox action, invoice action, client edit, payment profile
edit, calendar drag) and confirm each shows its result immediately, or —
for invoice generation — an immediate in-progress acknowledgment.

- [X] T020 [P] [US2] Rewrite the inbox action mutation(s) in
      `apps/web/src/components/inbox.tsx` onto `useOptimisticMutation`
      (predicted mode): `predict` reflects the resolved/dismissed state on
      the affected item immediately (Acceptance Scenario 1). Principle I
      still applies unchanged — this only speeds up reflecting the user's
      own action, not the suspect-record surfacing itself.
- [X] T021 [P] [US2] In `apps/web/src/components/invoice-detail.tsx`,
      rewrite mark-paid onto `useOptimisticMutation` (predicted mode:
      `predict` writes the paid status immediately) and generate/send onto
      `useOptimisticMutation` with `predict` omitted (pending mode: the
      pressed control shows an immediate in-progress state, no predicted
      invoice number or document — FR-004, Acceptance Scenario 4).
- [X] T022 [P] [US2] In `apps/web/src/components/invoice-new.tsx`, rewrite
      the generate-invoice mutation onto `useOptimisticMutation` with
      `predict` omitted (pending mode, same as T021's generate path).
- [X] T023 [P] [US2] Rewrite the edit mutation(s) in
      `apps/web/src/components/client-form.tsx` and
      `apps/web/src/components/edit-client.tsx` onto
      `useOptimisticMutation` (predicted mode): `predict` writes the edited
      field(s) immediately onto the client record (Acceptance Scenario 2).
- [X] T024 [P] [US2] Rewrite the edit mutation(s) in
      `apps/web/src/components/payment-profile-dialog.tsx` onto
      `useOptimisticMutation` (predicted mode): `predict` writes the edited
      field(s) immediately (Acceptance Scenario 2).
- [X] T025 [US2] Rewrite the drag-to-reschedule mutation in
      `apps/web/src/lib/client/use-calendar.ts` and
      `apps/web/src/components/calendar.tsx` onto `useOptimisticMutation`
      (predicted mode): the dragged entry MUST follow the cursor live for
      the duration of the drag (FR-015), not only snap to its new time on
      drop, and `predict` writes the new time on drop (Acceptance Scenario
      3).
- [ ] T026 [US2] [P] Extend `apps/web/e2e/instant-feedback.spec.ts` with
      one scenario per US2 surface at injected latency: inbox action,
      client edit, payment-profile edit, calendar drag (dragged entry
      visibly follows the cursor), invoice generate/send (pending state,
      no predicted number/document) — and a forced-rejection case showing
      visible rollback with a reason on at least one predicted-mode
      mutation (Acceptance Scenarios 1–5).
- [X] T027 [US2] [P] `.stories.tsx` for each changed screen state
      (Constitution V): inbox item predicted-resolved, client/payment-
      profile field predicted-edited, invoice pending-in-progress,
      rolled-back-with-reason for at least one US2 surface.

**Checkpoint**: User Stories 1 and 2 both independently shippable — every
mutation site named in FR-001 now answers at the press.

---

## Phase 5: User Story 3 — Tab switches render without waiting on the server (P3)

**Goal**: Every web tab shows a loading boundary or already-fetched
content immediately on switch, never blank or stale, with prefetch
shortening the wait for likely-next tabs.

**Independent Test**: At ~1s/~3s injected latency, switch between the
app's tabs and confirm each shows a loading boundary or prefetched content
immediately, never blank or the previous tab's stale content.

- [X] T028 [P] [US3] Audit `apps/web/src/app/(app)/**` for route segments
      lacking a `loading.tsx` (none exist today per the current tree —
      `clients`, `clients/new`, `clients/[id]`, `settings`,
      `settings/import`, `calendar`, `invoices`, `invoices/new`,
      `invoices/[id]`, `projects`) and add one per segment that fetches
      data, so navigation shows a loading boundary immediately instead of
      blank (FR-007, Acceptance Scenario 1, SC-004).
- [ ] T029 [US3] Add `router.prefetch()` (from `next/navigation`) calls on
      the tab bar's hover/mount for adjacent/likely-next tabs, in whichever
      component under `apps/web/src/components/` renders the app's primary
      tab navigation (FR-007, Acceptance Scenario 2).
- [ ] T030 [US3] [P] Extend `apps/web/e2e/instant-feedback.spec.ts` with a
      navigation scenario at ~3s injected latency: switching to a tab with
      uncached data shows a loading boundary immediately (never blank);
      switching toward a tab Next has prefetched shows a shortened or
      eliminated loading boundary (SC-004).

**Checkpoint**: All three user stories independently shippable.

---

## Phase 6: Polish & cross-cutting concerns

**Purpose**: Documentation the plan names, and the manual verification
pass across every surface at real injected latency.

- [X] T031 [P] Add the standing responsiveness note to
      `docs/design/principles.md` per plan.md's Project Structure ("note
      the standing responsiveness principle") — create the file if it does
      not yet exist, stating the same constraint as constitution.md's
      Principle VI, in the design-docs' final-form voice (no options or
      decision log).
- [X] T032 Run `pnpm check:mutation-usage` (T007) against the full
      `apps/web/src` tree and confirm it passes with zero bypasses — every
      mutation site touched in Phases 3–5 routes through
      `useOptimisticMutation` (SC-005).
- [X] T033 In local Stint (`pnpm dev`, signed in per
      `docs/local-dev.md`), with latency injected at ~1s and then ~3s,
      manually walk every mutation and tab switch touched by this feature
      per `quickstart.md`'s numbered steps 1–13: web Start/Stop/rename,
      the rename-then-stop race, the stale-summary-refetch race, inbox
      action, client edit, payment-profile edit, calendar drag (live
      cursor-follow), invoice generate/send (pending state), every tab
      switch (loading boundary, prefetch), and macOS menu-bar resume plus
      rename/stop under injected latency (`pnpm try-mac`, per memory
      note). Confirm each answers at the press and note any surface that
      does not before calling the feature done.

---

## Dependencies & execution order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: blocks everything.
- **Phase 2** → **Phase 3 (US1)**, **Phase 4 (US2)**, **Phase 5 (US3)**:
  all three stories depend on the shared web helper (T002–T007) and, for
  US1's macOS half, `OptimisticAction` (T008).
- **US1, US2, US3** are independent of each other once Phase 2 is done —
  can be built and shipped in any order, in parallel across engineers.
- **Phase 6 (Polish)** depends on whichever of US1–US3 are in scope for
  the release; T032/T033 should run last, after all targeted stories land.

## Parallel execution examples

- Phase 2: T006 (lint script), T008 (Swift protocol), T009 (Vitest),
  T010 (XCTest) can all run in parallel once T002–T005 (the helper body)
  land, since they touch different files.
- Phase 4 (US2): T020, T021, T022, T023, T024 each touch a different
  component file and can run in parallel; T025 (calendar) and T026/T027
  (tests/stories) can trail them.
- Phase 3 (US1) macOS (T015) and web (T011–T014) can run in parallel —
  different languages, different files, both depend only on Phase 2.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1)**: the timer — web
Start/Stop/rename plus macOS menu-bar resume — answering at the press with
both #118 races resolved is independently shippable and is the
highest-priority surface named in the spec. User Stories 2 and 3 are
additive increments on the same shared mechanism.
