# Feature Specification: Live figures while a timer runs

**Feature Branch**: `live-earned`

**Created**: 2026-10-02

**Status**: Draft

**Input**: The go decision in `.specify/assessments/live-earned/decision.md`,
from Today showing `$0.00` beside `22m` with a timer running, and Blake's
direction to refresh only while the app is in view

## Design

No design review: no screen changes its layout; existing figures only
refresh while a timer runs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Today's money moves with today's time (Priority: P1)

Blake starts a timer on a rated project and leaves the home screen open.
Every minute, Today's Earned and the running task's row grow together, and
they never disagree. When he stops the timer, nothing jumps.

**Why this priority**: This is the screen and the contradiction that started
the work: time grew while money sat at `$0.00`.

**Independent Test**: Run a timer on a $100.00/h project for 30 minutes with
the home screen open; Earned rises by $50.00 across that time, in step with
the duration, and stopping changes no figure.

**Acceptance Scenarios**:

1. **Given** a timer running on a $100.00/h project with the home screen in
   view, **When** a minute passes, **Then** Today's duration, the running
   task's row and Earned all reflect the same elapsed time, from one answer.
2. **Given** a timer that has run 30 minutes, **When** Blake stops it,
   **Then** Today's Earned and duration are unchanged by the stop.
3. **Given** a timer running on a project with no rate, **When** a minute
   passes, **Then** the duration grows and Earned does not.
4. **Given** earlier entries today and a running timer, **When** Blake reads
   Earned, **Then** it is the closed entries plus the running session, priced
   the way the invoice will price it.

---

### User Story 2 - The week and the month move too (Priority: P2)

With the timer still running, today's bar in the week chart, the month's
Earned and its projection, and the dock's Today all include the running
session and move with it.

**Why this priority**: Fixing Today alone moves the contradiction to the
figures beside it on the same screen.

**Independent Test**: With a timer running, today's week bar, the month's
Earned and the dock's Earned rise by the same amount as Today's Earned over
the same minutes.

**Acceptance Scenarios**:

1. **Given** a running timer, **When** a minute passes, **Then** today's week
   bar, the month's Earned, the month's projection and the dock's Earned
   take in the running session alongside Today.
2. **Given** a running timer, **When** Blake compares Today's Earned with the
   growth of the month's Earned since the timer started, **Then** they
   agree.

---

### User Story 3 - Unbilled, on web and in the menu bar (Priority: P3)

Unbilled on web and in the macOS menu bar panel include the running session,
because it is work done and not yet invoiced.

**Why this priority**: The menu bar is where Blake glances mid-session, and
it shows Unbilled, not Earned.

**Independent Test**: With a timer running, open the menu bar panel and the
web home screen at the same moment; both show the same Unbilled, and it
includes the running session.

**Acceptance Scenarios**:

1. **Given** a running timer, **When** Blake opens the menu bar panel,
   **Then** Unbilled includes the session so far.
2. **Given** the panel stays open, **When** a minute passes, **Then**
   Unbilled grows with the session.
3. **Given** a running timer, **When** Blake creates an invoice, **Then** the
   running entry is not on it.

---

### User Story 4 - Refresh only while in view (Priority: P4)

The figures refresh each minute only while a timer runs and someone is
looking: a visible web tab, or an open menu bar panel. Coming back to the app
refreshes at once.

**Why this priority**: Live figures nobody is looking at cost requests and
buy nothing.

**Independent Test**: With a timer running, hide the web tab and close the
panel for five minutes; no refresh happens. Show the tab; the figures are
current at once.

**Acceptance Scenarios**:

1. **Given** a timer running and the web tab hidden, **When** minutes pass,
   **Then** the web app does not refresh.
2. **Given** the tab becomes visible again, **When** it shows, **Then** the
   figures refresh at once and every minute after.
3. **Given** a timer running and the menu bar panel closed, **When** minutes
   pass, **Then** the macOS app does not refresh.
4. **Given** the panel opens, **When** it shows, **Then** the figures refresh
   at once and every minute it stays open.
5. **Given** no timer is running, **When** minutes pass with the app in
   view, **Then** nothing refreshes on a schedule.

---

### Edge Cases

- A session that crosses midnight counts on the day it started, as By day on
  an invoice does; likewise across a week or a month.
- A refresh that fails leaves every figure at the last answer, together; the
  next one catches up. A failure the user should know of shows as other
  failed loads do.
- The running entry's rate changes mid-session (its project's rate edited):
  the next refresh prices the whole session at the new rate, as the invoice
  would.
- The running timer is stopped or started from the other app: the next
  refresh, or the return to view, shows it.
- The running timer's own seconds clock keeps ticking on its own between
  refreshes; Today's `h:mm` can trail it by under a minute.
- A timer running more than a day keeps counting from where it started, as
  the duration does.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every time and money figure the home screen, the dock and the
  menu bar panel show MUST include a running entry's session up to the moment
  of the answer: Today's Earned, duration and task rows; the week's bars; the
  month's Earned and projection; and Unbilled.
- **FR-002**: The server MUST be the only place a running session is measured
  and priced. Clients MUST show the figures they are given and MUST NOT
  compute time or money for a running entry, except the running timer's own
  seconds clock.
- **FR-003**: A running session MUST be priced by the same rule as the
  invoice: its hours to two decimals, times its resolved rate.
- **FR-004**: A running session MUST NOT become billable: no invoice, draft
  or preview MAY include a running entry.
- **FR-005**: A running entry with no resolvable rate MUST add time and no
  money.
- **FR-006**: Stopping a timer MUST NOT change any figure beyond what the
  last refresh showed, other than time elapsed since it.
- **FR-007**: While a timer runs, the web app MUST refresh these figures each
  minute only while its tab is visible, and MUST refresh at once when the tab
  becomes visible.
- **FR-008**: While a timer runs, the macOS app MUST refresh these figures
  when the menu bar panel opens and each minute only while it stays open.
- **FR-009**: With no timer running, the apps MUST NOT refresh on a
  schedule.
- **FR-010**: Figures that appear together MUST come from the same refresh,
  so none can show a different moment from another.
- **FR-011**: A session MUST count toward the day, week and month it
  started in.

### Key Entities

- **Running entry**: the one open time entry a user may have. Its session so
  far is measured and priced by the server at the moment it answers, for
  display only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a timer running and the app in view, no money figure
  trails its duration by more than one minute.
- **SC-002**: Stopping a timer changes no money figure by more than one
  minute's earnings.
- **SC-003**: Web and the menu bar panel show the same Unbilled for the same
  moment.
- **SC-004**: With the app out of view for an hour while a timer runs, the
  app makes no scheduled refreshes.
- **SC-005**: No invoice ever bills a running entry.

## Assumptions

- Unbilled includes the running session: it is work done and not yet
  invoiced, and the menu bar shows it.
- A session counts where it started, matching how an invoice buckets entries
  by day.
- One refresh a minute per visible client is negligible cost for one user,
  and adds no fixed cost.
- The `$0.00` for 22m that started this work is checked separately; a
  missing rate or a rate bug is out of scope.
- The running timer's seconds clock and how often it ticks are unchanged.
