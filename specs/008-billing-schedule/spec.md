Closes #432

# Feature Specification: Bill each client on its own schedule

**Feature Branch**: `f432-billing-schedule`

**Created**: 2026-10-21

**Status**: Draft

**Input**: Issue #432. A contractor's contract sets how often each client is
billed: weekly, every two weeks, twice a month or monthly. Stint doesn't know
the schedule, so every invoice's dates are picked by hand, and an
off-schedule invoice (October 1–15 for a monthly client) goes out unnoticed.
The schedule is optional per client; a client without one keeps today's
behavior. One rule decides a client's periods, and the new-invoice default,
the off-schedule hint and later auto-drafting (#434) all derive from it.
Replaces #334 and PR #423, which hard-coded two cadences. Live drafts (#433)
and auto-drafting (#434) build on this and are out of scope here.

## Clarifications

### Session 2026-10-21

- Q: How does the contractor say when a weekly or every-two-weeks period starts? → A: They pick a date one period starts on (the anchor).
- Q: Which period does New invoice default to for a scheduled client? → A: The most recent period that has ended; the contractor can still change either date.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set a client's billing schedule (Priority: P1)

The contractor opens a client and sets how often its contract bills it:
none, weekly, every two weeks, twice a month, or monthly. Stint keeps it, and
the client list shows it.

**Why this priority**: Every other story reads the schedule; without it there
is nothing to default from or check against.

**Independent Test**: Set each schedule on a client, save, reopen it and see
the same schedule; a new client and every existing client has none.

**Acceptance Scenarios**:

1. **Given** an existing client, **When** the contractor opens it, **Then**
   its schedule reads "None".
2. **Given** a client, **When** the contractor sets "Twice a month" and saves,
   **Then** reopening it shows "Twice a month".
3. **Given** a client, **When** the contractor sets "Every two weeks", **Then**
   they must also say which date one period starts on before saving.
4. **Given** a client with a schedule, **When** the contractor sets "None" and
   saves, **Then** the client behaves as it did before this feature.

---

### User Story 2 - A new invoice starts on the client's period (Priority: P1)

Choosing a client on New invoice sets From and To to that client's most
recent period that has ended, so the usual invoice needs no date edits. Both
dates stay editable.

**Why this priority**: It removes the hand-fixing of dates on every invoice,
which is the problem the issue names.

**Independent Test**: For each schedule, choose the client on a known date
and see the expected From and To.

**Acceptance Scenarios**:

1. **Given** a twice-a-month client and today is Oct 21, **When** it is
   chosen, **Then** From is Oct 1 and To is Oct 15.
2. **Given** a monthly client and today is Oct 21, **When** it is chosen,
   **Then** the period is Sep 1–30; on Oct 31 it is still Sep 1–30, and on
   Nov 1 it is Oct 1–31.
3. **Given** a weekly client whose periods start on Mondays and today is
   Wednesday Oct 21, **When** it is chosen, **Then** the period is
   Mon Oct 12 – Sun Oct 18.
4. **Given** a client with no schedule, **When** it is chosen, **Then** the
   dates are the calendar month whose last day is nearest today, as before.
5. **Given** a twice-a-month client and today is Oct 15, **When** it is
   chosen, **Then** the period is Sep 16–30, since Oct 1–15 hasn't ended.
6. **Given** the defaulted dates, **When** the contractor changes either one,
   **Then** the invoice uses their dates.
7. **Given** the contractor has already edited either date, **When** they
   choose a different client, **Then** their dates stay.

---

### User Story 3 - An off-schedule period is pointed out (Priority: P2)

When an invoice's dates aren't exactly one of the chosen client's periods, a
hint under the dates says so and names the schedule. It never blocks
generating the invoice.

**Why this priority**: It catches the mistake that started this issue, but
the default in Story 2 already prevents most of them.

**Independent Test**: Choose a scheduled client, change From to a day off its
schedule, see the hint, and generate the invoice anyway.

**Acceptance Scenarios**:

1. **Given** a monthly client, **When** the dates are Oct 1–15, **Then** a
   hint says the client is billed monthly and this isn't a whole month, and
   Generate invoice still works.
2. **Given** a client with no schedule, **When** any dates are chosen,
   **Then** no hint shows.
3. **Given** either date is empty, **Then** no hint shows.

### Edge Cases

- Twice a month: the second period ends on the month's last day, including
  Feb 28 and Feb 29.
- A period that spans a year boundary (weekly, every two weeks) is one period.
- A period ends after its last day: on that day it is still the current
  period, not the default.
- An anchor date in the future still defines the periods before it.
- Changing a client's schedule never changes an invoice already generated.
- An archived client keeps its schedule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A client MUST have an optional billing schedule: none, weekly,
  every two weeks, twice a month (1st–15th and 16th–last day), or monthly
  (calendar month). Every existing and new client starts with none.
- **FR-002**: A weekly or every-two-weeks schedule MUST carry the date one of
  its periods starts on; the other schedules MUST NOT need one.
- **FR-003**: The contractor MUST be able to set and change a client's
  schedule wherever they edit the client.
- **FR-004**: One rule MUST decide, for any date and schedule, the period that
  contains it; every behavior below uses that rule and no other.
- **FR-005**: Choosing a scheduled client on New invoice MUST set the most
  recent period whose last day is before today, unless the contractor has
  already edited a date. Both dates MUST stay editable.
- **FR-006**: A client with no schedule MUST keep the current default: the
  calendar month whose last day is nearest today.
- **FR-007**: When both dates are set and are not exactly one of the client's
  periods, the form MUST show a hint naming the schedule, and MUST still
  allow generating the invoice.
- **FR-008**: Every client of the web and macOS apps MUST read and write the
  schedule through the same API; an older client that sends no schedule
  MUST leave it unchanged.
- **FR-009**: A schedule MUST be readable and writable only by its owner.

### Key Entities

- **Billing schedule**: belongs to one client. A kind (none, weekly, every two
  weeks, twice a month, monthly) and, for weekly and every two weeks, an
  anchor date that starts one period.
- **Billing period**: a From–To date range derived from a schedule and a
  date; never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a scheduled client, a new invoice for its most recent
  period needs zero date edits.
- **SC-002**: An invoice whose dates aren't one of its client's periods
  always shows the hint before it is generated.
- **SC-003**: A contractor who never sets a schedule sees no change anywhere.
- **SC-004**: Setting a schedule takes one field (two for weekly and every two
  weeks) in the client's editor.

## Assumptions

- Twice a month always splits on the 15th; no contract in scope uses another
  day.
- Monthly is the calendar month; a month that starts on another day is out of
  scope.
- Dates are calendar dates in the user's timezone, as invoice periods are
  today.
- A weekly or every-two-weeks schedule's periods are set by picking a date
  one period starts on; every period repeats from it, before and after.
- The macOS app doesn't edit clients today; if it does, FR-008 keeps it
  working without change.
- Live drafts (#433) and auto-drafting with a "ready" email (#434) are out of
  scope and use FR-004's rule.
