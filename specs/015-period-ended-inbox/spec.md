Closes #482

# Feature Specification: Say in the Inbox when a scheduled period has ended with no invoice

**Feature Branch**: `f482-invoice-due`

**Created**: 2026-10-28

**Status**: Draft

**Input**: Issue #482. A contractor on a fixed billing schedule has to
remember each period's end and create the invoice. When she forgets, the
invoice goes out late and so does the payment. Her clients' schedules are
already in Stint, so the Inbox can say when a period has ended with work in
it and no invoice, and open New invoice ready for it. No cron, no email, and
nothing leaves the app: the row is derived when the Inbox is read.

## Clarifications

### Session 2026-10-28

- Q: What counts as "bills something"? → A: Billable, finished work on no invoice and not billed elsewhere, dated in the period, or an unbilled one-off expense spent in the period. A recurring expense alone raises no row: it bills on every invoice, so it would raise one for every period of a client she has stopped working for. (decided autonomously)
- Q: What counts as an invoice covering the period? → A: Any draft, sent or paid invoice for that client whose period shares a day with it. A void one doesn't count. Work left outside a partial invoice is not this row's question: a sent invoice's period already raises the late-entry row. (decided autonomously)
- Q: Only the last ended period, or every missed one? → A: Only the last ended one, as the issue asks. An older missed period is out of scope. (decided autonomously)
- Q: What does the row say? → A: The client's name, the period's billable time, and "September ended with no invoice" for a monthly client, or the dates for any other schedule: "Oct 1 – 15 ended with no invoice". (decided autonomously)
- Q: Where does it sort? → A: After stale drafts, with the other invoice rows. Its tone is neutral: a chore, like a stale draft, not money already late. (decided autonomously)
- Q: How does New invoice receive the client and period? → A: In its address, so the link works from anywhere and survives a reload. A client it doesn't know or dates that aren't a period are ignored, and the form opens as it does today. (decided autonomously)
- Q: Archived clients? → A: No row. Archiving says she no longer bills them. (decided autonomously)

## Design

No design review (decided autonomously): the row is one more Inbox card in
the pattern every row already follows (title, figure, qualifier, one
action), and New invoice is unchanged but for what it opens with. The dock's
stories show each state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See that a period has ended with no invoice (Priority: P1)

Her client Northwind is billed monthly. On October 3 she opens Stint, and
the Inbox says Northwind's September has ended with no invoice. She presses
Create invoice, and New invoice opens with Northwind and September 1–30
filled in. She creates the draft, and the row is gone.

**Why this priority**: It is the whole feature.

**Independent Test**: Give a client a monthly schedule, log billable work
for it last month, and see the row; create an invoice for last month and see
it clear.

**Acceptance Scenarios**:

1. **Given** a monthly client with unbilled work last month and no invoice
   for it, **Then** the Inbox shows a row naming the client, last month's
   billable time and "September ended with no invoice".
2. **Given** a semi-monthly, weekly or biweekly client in the same state,
   **Then** the row names the period by its dates.
3. **Given** the row, **When** she presses Create invoice, **Then** New
   invoice opens with that client and period filled in, and nothing is
   created until she creates it.
4. **Given** she creates the invoice, **Then** the row is gone the next time
   the Inbox is read.
5. **Given** the period's only invoice was voided, **Then** the row is back.
6. **Given** the period holds no billable unbilled work and no one-off
   expense, **Then** there is no row.
7. **Given** a client with no schedule, or an archived one, **Then** there
   is no row.

### Edge Cases

- Today is the period's last day: the period hasn't ended, so the row is
  about the period before it.
- The only work in the period is non-billable or billed elsewhere: no row.
- A running timer started in the period: it isn't finished, so it doesn't
  count.
- A draft covers only part of the period: it covers the period, so no row.
- Two scheduled clients both owe an invoice: one row each.
- A link to New invoice naming a client that doesn't exist, or dates that
  aren't a period: the form opens empty, as it does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Inbox MUST show one row per active client with a billing
  schedule whose last ended period, on today's date in the user's zone,
  bills something and has no invoice but a void one sharing a day with it.
- **FR-002**: "Bills something" MUST mean billable, finished work on no
  invoice and not billed elsewhere, dated in the user's zone inside the
  period, or an unbilled one-off expense spent inside it.
- **FR-003**: The row MUST name the client, show the period's billable time,
  and say the period ended with no invoice: by month name for a monthly
  client, by its dates for any other schedule.
- **FR-004**: The row's action MUST open New invoice with that client and
  period filled in, and create nothing itself.
- **FR-005**: New invoice MUST ignore a client it doesn't know, and dates
  that aren't valid or run backwards, opening as it does without them.
- **FR-006**: The row MUST clear once a draft, sent or paid invoice for that
  client shares a day with the period, with no job, schedule or email.
- **FR-007**: The Inbox's count MUST include these rows.

### Key Entities

- **Period due**: derived, never stored. A client, its last ended period,
  and the billable time in it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the first day after a scheduled period ends with work in
  it, the Inbox says so without her doing anything.
- **SC-002**: From the row, an invoice for the period is two presses away:
  Create invoice, then create.
- **SC-003**: Once an invoice covers the period, no row about it remains.

## Assumptions

- The user's zone decides which day it is, as it does for every other Inbox
  row.
- The phone and macOS apps show no Inbox, so they change nothing; they
  ignore the new field.
