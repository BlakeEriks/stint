Closes #482

# Feature Specification: Say in the Inbox when a client is ready to invoice

**Feature Branch**: `f482-invoice-due`

**Created**: 2026-10-28

**Status**: Draft

**Input**: Issue #482, rescoped by the owner's review of PR #548. A contractor
has to remember when work is due to bill and make the invoice. When she
forgets, the invoice goes out late and so does the payment. For a client with
a billing schedule, the Inbox says when the period that just ended is ready
to invoice, and its link opens New invoice filled in. No cron, no email, and
nothing leaves the app: the row is derived when the Inbox is read.

## Clarifications

### Session 2026-10-28

- Q: What counts as having work in it? → A: Billable, finished work on no invoice and not billed elsewhere. Expenses don't raise the row. (decided autonomously)
- Q: Where does it sort? → A: After stale drafts, with the other invoice rows. Its tone is neutral: a chore, not money already late. (decided autonomously)
- Q: How does New invoice receive the client and dates? → A: In its address, so the link works from anywhere and survives a reload. A client it doesn't know or dates that aren't a range are ignored, and the form opens as it does today. (decided autonomously)
- Q: Archived clients? → A: No row. Archiving says she no longer bills them. (decided autonomously)

### Session 2026-11-01 (owner review on PR #548)

- Q: Which clients and periods? → A: Only a client with a billing schedule, and only its most recent ended period. (reviewer)
- Q: How does the row read? → A: "<Client> · <hours> · October is ready to invoice"; another schedule names its dates. (reviewer)
- Q: How is it answered? → A: Its link opens New invoice with that client and period. There is no other answer: the row clears when an invoice covers the period or when the next period ends. (reviewer)
- Q: What stops the row? → A: Any draft, sent or paid invoice for that client overlapping the period, even over part of it; a void one doesn't. Work beside a partial invoice is then flagged nowhere, and the link is never refused over a draft or pulled over a sent invoice's late entries. No entry is in both this row and the late-entry row. (reviewer)
- Q: Does the row keep a Create invoice button? → A: No: the row's title is its link, as on the Inbox's other rows, and a button beside it would go to the same place. (decided autonomously)

## Design

No design review (decided autonomously): the row is one more Inbox card in
the pattern every row already follows (title, figure, qualifier), and New
invoice is unchanged but for what it opens with. The dock's stories show each
state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See that a client is ready to invoice (Priority: P1)

Her client Northwind is billed monthly. On November 3 the Inbox says
Northwind's October is ready to invoice. She follows the row's link, New
invoice opens with Northwind and October filled in, and once she creates the
draft the row is gone.

**Why this priority**: It is the whole feature.

**Independent Test**: Give a client a monthly schedule and billable work last
month; see the row; follow it to New invoice.

**Acceptance Scenarios**:

1. **Given** a monthly client with unbilled work last month and no invoice
   for it, **Then** one row names the client, the time and "October is ready
   to invoice"; another schedule names its dates.
2. **Given** the row, **When** she follows its link, **Then** New invoice
   opens with the client and period, and nothing is created until she
   creates it.
3. **Given** an invoice that isn't void overlaps the period, even in part,
   **Then** the row is gone; voided, it is back.
4. **Given** the next period ends, **Then** the row no longer counts the
   earlier period's work.
5. **Given** non-billable work, a client with no schedule, an archived
   client, or work only in a period not yet ended, **Then** there is no row.

### Edge Cases

- Today is a period's last day: that period hasn't ended.
- A running timer: not finished, so not due.
- A link to New invoice naming a client that doesn't exist, or dates that
  aren't a range: the form opens empty, as it does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Inbox MUST show one row per active client with a billing
  schedule whose most recent ended period holds billable, finished work, dated
  in the user's zone, on no invoice and not billed elsewhere.
- **FR-002**: A draft, sent or paid invoice for the client overlapping that
  period, even in part, MUST mean no row.
- **FR-003**: The row MUST name the client, the work's time and "<period> is
  ready to invoice".
- **FR-004**: The row's link MUST open New invoice with the client and
  period, and create nothing itself.
- **FR-005**: New invoice MUST ignore a client it doesn't know, and dates
  that aren't valid or run backwards.
- **FR-006**: The Inbox's count MUST include these rows.

### Key Entities

- **Client ready to invoice**: derived, never stored. A client, its most
  recent ended period, and the time of the work due in it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The first day after a period with unbilled work ends, the Inbox
  says so without her doing anything.
- **SC-002**: From the row, the filled-in New invoice is one press away.
- **SC-003**: No entry is named by two Inbox rows for the same reason.

## Assumptions

- The user's zone decides which day it is, as it does for every other Inbox
  row.
- The phone and macOS apps show no Inbox; they ignore the new field.
