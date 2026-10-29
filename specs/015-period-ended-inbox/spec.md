Closes #482

# Feature Specification: Say in the Inbox when billable work is past due to bill

**Feature Branch**: `f482-invoice-due`

**Created**: 2026-10-28

**Status**: Draft

**Input**: Issue #482, widened by the owner's review of PR #548. A
contractor has to remember when work is due to bill and make the invoice.
When she forgets, the invoice goes out late and so does the payment, and a
missed period is forgotten for good once the next one ends. The Inbox says,
one row per client, when billable work is past due to bill, and answers it
either with an invoice or by marking that work billed outside Stint. No
cron, no email, and nothing leaves the app: the row is derived when the
Inbox is read.

## Clarifications

### Session 2026-10-28

- Q: What counts as having work in it? → A: Billable, finished work on no invoice and not billed elsewhere. Expenses don't raise the row: they can't be marked billed elsewhere, so the row couldn't be answered for them. (decided autonomously)
- Q: Where does it sort? → A: After stale drafts, with the other invoice rows. Its tone is neutral: a chore, not money already late. (decided autonomously)
- Q: How does New invoice receive the client and dates? → A: In its address, so the link works from anywhere and survives a reload. A client it doesn't know or dates that aren't a range are ignored, and the form opens as it does today. (decided autonomously)
- Q: Archived clients? → A: No row. Archiving says she no longer bills them. (decided autonomously)

### Session 2026-10-29 (owner review on PR #548)

- Q: Which work is due? → A: For a scheduled client, work in any ended period, not only the latest, so a missed September doesn't drop out once October ends. For a client with no schedule, work more than 30 days old (`UNBILLED_DUE_DAYS`). (reviewer)
- Q: One row per what? → A: One per client, never one per period. A single period reads "September ended with no invoice", or its dates for another schedule; work across several reads "14h · unbilled since Aug 1". (reviewer)
- Q: How is it answered? → A: Create invoice, opening New invoice with the client and dates spanning the work, or Billed elsewhere, which marks that work billed outside Stint and clears the row. No snooze; a wrong billable flag is fixed on the entry. (reviewer)
- Q: Is Billed elsewhere predicted? → A: No, pending: it can mark hundreds of entries and is undone an entry at a time, so the button says it is marking and the row leaves on the server's answer. (review)
- Q: What dates does Create invoice fill in, when the due work has an invoice between? → A: Only the oldest run: adjacent due periods for a scheduled client, days with no invoice between them otherwise. A span across an invoice would be refused over a draft, or sweep in work the row never named over a sent one. (review)
- Q: What covers work? → A: Any draft, sent or paid invoice for that client whose period holds its day. A void one doesn't. Work inside a sent or paid period is already the late-entry row's, so no entry is in both rows. (reviewer, reconciled autonomously)
- Q: Is 30 days old "due" at 30? → A: No, once it is more than 30 days old: 31. (decided autonomously)

## Design

No design review (decided autonomously): the row is one more Inbox card in
the pattern every row already follows (title, figure, qualifier, actions), and New invoice is unchanged but for what it opens with. The dock's
stories show each state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See work past due to bill, and answer it (Priority: P1)

Her client Northwind is billed monthly. On October 3 the Inbox says
Northwind's September ended with no invoice. She presses Create invoice,
New invoice opens with Northwind and September filled in, and once she
creates the draft the row is gone. Had she billed September from her old
tool, she'd press Billed elsewhere instead, and the row would leave at once.

**Why this priority**: It is the whole feature.

**Independent Test**: Give a client a monthly schedule and billable work
last month; see the row; mark it billed elsewhere and see it go.

**Acceptance Scenarios**:

1. **Given** a monthly client with unbilled work last month and no invoice
   for it, **Then** one row names the client, the time and "September
   ended with no invoice"; another schedule names its dates.
2. **Given** that client also has unbilled work from August, **Then** it is
   still one row, reading "unbilled since" the first day of that work.
3. **Given** a client with no schedule, **Then** its work is due once it is
   more than 30 days old, and not at 29 or 30.
4. **Given** the row, **When** she presses Create invoice, **Then** New
   invoice opens with the client and the oldest run of that work no invoice
   interrupts, and nothing is created until she creates it.
5. **Given** the row, **When** she presses Billed elsewhere, **Then** the
   button says it is marking until the server answers, then the row
   leaves; a refusal keeps it and says why.
6. **Given** an invoice that isn't void now holds that work, **Then** the
   row is gone; voided, it is back.
7. **Given** work inside a sent invoice's period, **Then** only the
   late-entry row names it.
8. **Given** non-billable work, an archived client, or work in a period not
   yet ended, **Then** there is no row.

### Edge Cases

- Today is a period's last day: that period hasn't ended.
- A running timer: not finished, so not due.
- A link to New invoice naming a client that doesn't exist, or dates that
  aren't a range: the form opens empty, as it does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Inbox MUST show one row per active client with billable,
  finished work on no invoice and not billed elsewhere that is past due:
  in an ended period of the client's schedule, or more than 30 days old
  when it has none.
- **FR-002**: Work dated, in the user's zone, inside a draft, sent or paid
  invoice's period for its client MUST NOT be due; work inside a sent or
  paid one stays the late-entry row's alone.
- **FR-003**: The row MUST name the client and show the work's time; it MUST
  say "<period> ended with no invoice" when the work is one period of a
  schedule, and "unbilled since <first day>" otherwise.
- **FR-004**: Create invoice MUST open New invoice with the client and the
  dates of the oldest run of that work no invoice interrupts, and create
  nothing itself.
- **FR-005**: Billed elsewhere MUST mark exactly that row's entries billed
  elsewhere through the API, however many there are, showing it is pending
  until the server answers and removing the row only then; a refusal keeps
  the row and says why.
- **FR-006**: New invoice MUST ignore a client it doesn't know, and dates
  that aren't valid or run backwards.
- **FR-007**: The Inbox's count MUST include these rows.

### Key Entities

- **Work due**: derived, never stored. A client, its entries past due, their
  time, the first day, and the dates spanning them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The first day work is past due, the Inbox says so without her
  doing anything, and keeps saying so until she answers.
- **SC-002**: From the row, either answer is at most two presses away.
- **SC-003**: No entry is named by two Inbox rows for the same reason.

## Assumptions

- The user's zone decides which day it is, as it does for every other Inbox
  row.
- The phone and macOS apps show no Inbox; they ignore the new field.
