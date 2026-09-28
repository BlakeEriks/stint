Closes #127

# Feature Specification: Every press answers at once

**Feature Branch**: `f127-instant-feedback`

**Created**: 2026-09-28

**Status**: Draft

**Input**: GitHub issue #127 ("Every press answers at once") plus
`.specify/assessments/instant-feedback/decision.md` (go, Option B)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Timer actions answer at the press (Priority: P1)

Blake presses Start, Stop, rename, or resume-a-recent-task (web or the macOS
menu bar) and the screen shows the expected result in the same frame, before
the server responds. If the server rejects the action, the screen rolls back
visibly and says why.

**Why this priority**: The timer is the one moment the app exists for; a lag
here is the exact failure issue #11 and #118 already named, and menu-bar
resume is the path #118 is known to have missed.

**Independent Test**: On a connection with ~1s and ~3s of added latency,
press Start, Stop, rename, and (macOS) resume a recent task; each shows the
predicted result immediately. Force a rejection (e.g. stop a timer that was
already stopped server-side) and confirm a visible rollback with a reason.

**Acceptance Scenarios**:

1. **Given** no timer is running, **When** Blake presses Start (web or menu
   bar), **Then** the timer shows running, in accent green, immediately, with
   elapsed time counting from the press.
2. **Given** a timer is running, **When** Blake presses Stop, **Then** the
   timer shows stopped immediately.
3. **Given** a running timer, **When** Blake renames it, **Then** the new
   name shows immediately.
4. **Given** a recent task in the macOS menu bar, **When** Blake presses
   resume, **Then** it shows running immediately, matching Start's behavior.
5. **Given** a predicted action the server then rejects, **When** the
   rejection arrives, **Then** the screen rolls back to the prior state and
   shows the reason — never a silent revert.
6. **Given** a rename request answers after a stop request for the same
   timer, **When** both responses arrive, **Then** the final state matches
   the server's, not whichever response landed last (the #118 race test).
7. **Given** a stale summary refresh lands after a fresh press, **When** it
   arrives, **Then** it does not overwrite the newer predicted or confirmed
   state (the #118 race test).

---

### User Story 2 - Every other mutation answers at the press (Priority: P2)

Blake acts on the inbox, invoices, clients, payment profiles, or drags an
entry on the calendar, and the screen reflects the action immediately rather
than after a round trip.

**Why this priority**: Same lag, same mechanism, lower stakes than the
timer — these are the remaining mutation sites research found.

**Independent Test**: At ~1s and ~3s of added latency, exercise one mutation
per surface (inbox action, invoice action, client edit, payment profile edit,
calendar drag) and confirm each shows its result immediately, or — for
invoice generation, whose result can't be predicted — an immediate
in-progress acknowledgment.

**Acceptance Scenarios**:

1. **Given** an inbox item, **When** Blake acts on it, **Then** the inbox
   reflects the action immediately.
2. **Given** a client or payment profile field, **When** Blake edits it,
   **Then** the new value shows immediately.
3. **Given** a calendar entry, **When** Blake drags it to a new time,
   **Then** it shows at the new time immediately.
4. **Given** Blake generates an invoice, **When** he presses generate,
   **Then** the screen immediately shows the action is in progress (no
   predicted invoice number or document — the result can't be predicted
   client-side).
5. **Given** any of the above is rejected by the server, **When** the
   rejection arrives, **Then** the screen rolls back visibly with the reason.

---

### User Story 3 - Tab switches render without waiting on the server (Priority: P3)

Blake switches tabs in the web app and sees a loading state or the already-
fetched content immediately, never a blank or stale screen.

**Why this priority**: Named in the issue as a real but separately-caused
lag; lower priority than mutations because it affects navigation, not data
correctness.

**Independent Test**: At ~1s and ~3s of added latency, switch between the
app's tabs and confirm each shows a loading boundary or prefetched content
immediately, never blank or the previous tab's stale content.

**Acceptance Scenarios**:

1. **Given** Blake switches to a tab whose data isn't cached, **When** the
   tab loads, **Then** a loading boundary shows immediately instead of a
   blank screen.
2. **Given** Blake switches to a tab likely to be visited next, **When** he
   arrives, **Then** prefetching has already started the fetch, shortening
   or eliminating the loading boundary.

### Edge Cases

- A predicted change is left in flight when Blake navigates away or quits:
  the mutation continues, and the screen reconciles to the server's answer
  on return (web: query cache + refetch) or relaunch (macOS: model refresh
  on next foreground) — never silently dropped or left showing a stale
  predicted state.
- Two predicted changes to the same timer overlap (e.g. rename then stop in
  quick succession): the final displayed state matches the server's actual
  final state, not the order responses happen to arrive in.
- A mutation is added later without going through the shared mechanism: a
  lint check catches it on web before merge; on macOS, a checklist item and
  a shared protocol/base type make the non-optimistic path visibly unusual
  at review time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show the predicted result of a user action in
  the same frame the action is taken, for: timer start, stop, rename, and
  resume (including macOS menu-bar resume of a recent task); inbox actions;
  client edits; payment profile edits; calendar drag.
- **FR-002**: The system MUST treat the server's response as the source of
  truth: when it disagrees with the prediction, the displayed state MUST be
  corrected to match the server, visibly and with a stated reason — never
  silently.
- **FR-003**: A predicted timer start MUST display in the accent color
  (the running-timer color), matching a server-confirmed running timer —
  they are the same displayed element, not two distinct ones shown at once.
- **FR-004**: Invoice generation MUST show an immediate in-progress
  acknowledgment on press; it is exempt from showing a predicted result,
  since the result (invoice number, document) cannot be known client-side.
- **FR-005**: Web mutations MUST route through one shared optimistic-mutation
  helper, so a new mutation is instant by default rather than requiring a
  one-off implementation.
- **FR-006**: The macOS model layer MUST have an equivalent shared mechanism
  for the same purpose, used by `TimerModel` including its `resume` path.
- **FR-007**: Web route segments in the app MUST show a loading boundary
  immediately on navigation when data isn't yet available, and MUST prefetch
  data for tabs likely to be visited next.
- **FR-008**: When a stale response (from an action superseded by a later
  one on the same entity) arrives after a newer predicted or confirmed
  state, the system MUST NOT let it overwrite that newer state.
- **FR-009**: A CI/lint check MUST block a new web mutation that bypasses the
  shared optimistic-mutation helper.
- **FR-010**: The project's principles MUST record responsiveness (every
  press answers in the same frame) as a standing constraint, not a
  one-time fix.
- **FR-011**: A predicted change left in flight by navigation (web) or app
  quit (macOS) MUST continue and reconcile to the server's actual result
  when the user returns (web) or the app is next foregrounded (macOS).
- **FR-012**: A timer's predicted `startedAt` MUST be stamped at the moment
  of the press (client-side) for immediate elapsed-time display; the
  server's own `started_at` value remains authoritative once it responds.

### Key Entities

- **Timer entry**: the running/stopped state, name, and `started_at` a user
  sees and can predict from a press; already exists, gains a
  client-stamped-at-press value for optimistic display.
- **Mutation**: any user action that changes server state (timer actions,
  inbox actions, client/payment-profile edits, calendar drag, invoice
  generation); gains a predicted-display and rollback-with-reason lifecycle
  it does not have today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At ~1s and ~3s of added latency, every mutation listed in
  FR-001 shows its predicted result in the same frame as the press, verified
  by manual walkthrough of each surface.
- **SC-002**: At the same added latency, a rejected action always shows a
  visible rollback with a stated reason — never a silent revert — verified
  across all surfaces in FR-001.
- **SC-003**: The two race conditions from #118 (a rename answering after a
  stop; a stale summary refresh landing after a press) resolve to the
  server's correct final state, not the order responses arrive in.
- **SC-004**: Every route segment in the web app's tab navigation shows a
  loading boundary or already-fetched content on switch — none render blank
  or stale.
- **SC-005**: A CI/lint check exists and fails when a new web mutation
  bypasses the shared helper.
- **SC-006**: Resuming a recent task from the macOS menu bar shows a
  predicted running state on press, matching Start's existing behavior gap
  closed.

## Assumptions

- `startedAt` is stamped client-side at the press for optimistic display;
  the server's own value remains authoritative on reconciliation, per
  Principle "server owns timer truth" governing which value wins, not which
  shows first.
- A predicted change left in-flight by navigation or quit continues and
  reconciles on return (web) or next foreground (macOS), rather than being
  cancelled.
- Loading boundaries and prefetching ship first, before measuring whether
  any remaining tab-switch lag is data-fetch/render cost rather than a
  missing boundary — per the settled default in
  `.specify/assessments/instant-feedback/decision.md`.
- Invoice generation and any other mutation with no client-predictable
  result get an immediate in-progress acknowledgment, not a predicted
  result.
- The predicted-green timer display and a server-confirmed running timer are
  the same element, not two simultaneous green things, so this does not
  conflict with the "one accent use per kind" design principle.

### Deferred to plan

- **[NEEDS CLARIFICATION: concrete Swift-side enforcement mechanism]** — no
  CI-equivalent lint exists for Swift in this project. The accepted
  substitute (a review checklist item plus a shared protocol/base type that
  makes the non-optimistic path visibly unusual) is a convention, not an
  automated check; a concrete design is deferred to `/speckit-plan`.
