Closes #793

# Feature Specification: A draft lists the entries it bills, each one editable in place

**Feature Branch**: `draft-entries`

**Created**: 2026-11-18

**Status**: Draft

**Input**: Issue #793. A contractor checking a draft before sending it spots
a line that looks wrong: a wrong date, an hour too many, an entry that
shouldn't be billable. The draft doesn't say which entries make up that
line, so they leave it to hunt for the entry on Calendar. A draft's page
lists the entries it holds, beside the invoice rather than on the PDF, and a
row opens the entry to fix it there. An issued invoice lists what it billed,
read-only.

## Clarifications

### Session 2026-11-18

- Q: A toggle between the invoice and the entries, or a section below the
  invoice? → A: A section below. Checking a line means reading the line and
  its entries together, which a toggle hides one of; and a toggle is a
  state the page doesn't have today (Constitution VII). (decided
  autonomously)
- Q: How does it lay out on a phone? → A: The same rows, each wrapping to
  two lines: date and task, then project, hours and amount. No horizontal
  scroll. (decided autonomously)
- Q: Does the invoice read already return enough? → A: No. It returns the
  draft's entries with no rate, by name, and nothing about the rest. It adds
  the entries the invoice holds, each with what the list shows. (decided
  autonomously)
- Q: Does an issued invoice show each entry's amount? → A: No, hours only.
  Nothing records the rate an entry was billed at, only the lines; an
  amount worked out from today's rates could differ from what the client
  was sent, which is the one thing this list must not get wrong. (decided
  autonomously)
- Q: Does "Show time as: Every entry" still earn its place? → A: Yes. It
  decides what the client reads on the PDF; this list is the contractor's
  own check and never prints. A client who wants each entry on the invoice
  still needs it. (decided autonomously)
- Q: Which entries does a draft's list show? → A: Every entry it holds,
  the non-billable and the unrated too, since a wrongly non-billable entry
  is one of the mistakes the list is for. Each says why it adds nothing:
  Not billable, or No rate. (decided autonomously)
- Q: Do an issued invoice's rows open the entry? → A: No. Its entries are
  locked, so a row that opens a dialog that can't change it is a press
  with nothing behind it. (decided autonomously)

## Design

No design review: the list is the app's plain record rows under a
heading, below the invoice; there is no choice of layout or hierarchy left
for a reviewer once the toggle is ruled out above (decided autonomously).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A draft lists its entries (Priority: P1)

On a draft's page, below the invoice, a section titled Entries lists every
entry the draft holds, oldest first: date, task, project, hours and amount.

**Why this priority**: Seeing which entries make up the draft is the check
the issue asks for.

**Independent Test**: Open a draft and read its entries below the invoice,
with hours and amounts that add up to its time lines.

**Acceptance Scenarios**:

1. **Given** a draft holding entries, **When** its page opens, **Then** an
   Entries section below the invoice lists each one, oldest first, with its
   date, task, project, hours and amount.
2. **Given** a draft holding a non-billable entry, **Then** its row says
   Not billable where the amount goes.
3. **Given** a draft holding an entry with no rate, **Then** its row says
   No rate where the amount goes.
4. **Given** a draft holding no entries, **Then** no Entries section shows.
5. **Given** a phone, **Then** each row wraps to two lines and nothing
   scrolls sideways.

---

### User Story 2 - A row opens the entry to fix it (Priority: P1)

Pressing a draft's row opens the entry dialog the calendar uses. Saving or
deleting refreshes the draft: its lines, total and list.

**Why this priority**: Without it, the user still leaves to fix what they
found.

**Independent Test**: Press a row, change its end time, save, and see the
row's hours and the draft's total change.

**Acceptance Scenarios**:

1. **Given** a draft's Entries section, **When** a row is pressed, **Then**
   the entry dialog opens on that entry.
2. **Given** the dialog, **When** a change is saved, **Then** the dialog
   closes and the draft's lines, total and list show the change.
3. **Given** the dialog, **When** the entry is re-dated outside the
   draft's period and saved, **Then** it leaves the list and the draft.
4. **Given** the dialog, **When** the entry is deleted, **Then** it leaves
   the list and the draft.

---

### User Story 3 - An issued invoice lists what it billed (Priority: P2)

A sent, overdue or paid invoice lists its entries the same way, with hours
and no amount, and its rows don't open.

**Why this priority**: Seeing exactly what was billed is still useful, and
less often needed than fixing a draft.

**Independent Test**: Open a sent invoice and read its entries, with no
amounts and no row to press.

**Acceptance Scenarios**:

1. **Given** a sent invoice, **When** its page opens, **Then** an Entries
   section lists each entry it billed, with date, task, project and hours.
2. **Given** that list, **Then** no row is a button.
3. **Given** a void invoice, **Then** no Entries section shows: voiding
   released its entries.

### Edge Cases

- An entry with no task reads Untitled, as the draft's notices name it.
- A draft whose list is long scrolls with the page; it isn't paged.
- An entry saved by another tab meanwhile shows on the next read, as the
  draft's lines do.
- A save the server refuses shows in the dialog, which stays open, as it
  does on the calendar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Reading an invoice MUST return the entries it holds, oldest
  first: id, date and time, task, project, duration, billable, and what the
  entry dialog needs to open on it.
- **FR-002**: For a draft, each entry MUST carry its amount as the draft
  prices it, or none when it is non-billable or has no rate. An issued
  invoice's entries MUST carry no amount.
- **FR-003**: A draft's page MUST show an Entries section below the
  invoice listing them, each row's amount reading Not billable or No rate
  when it has none.
- **FR-004**: Pressing a draft's row MUST open the existing entry dialog on
  that entry. Its save or delete MUST refresh the draft.
- **FR-005**: An issued invoice's page MUST list its entries with hours and
  no amount, and its rows MUST NOT open anything.
- **FR-006**: An invoice holding no entries MUST show no Entries section.
- **FR-007**: The PDF MUST NOT change.

### Removes (Constitution VII)

- The draft's no-rate notice no longer lists the unrated entries by name
  and date: the Entries section shows each with No rate, and opens it. The
  notice keeps its count and what to do.
- The response field that carried those names, `unratedEntries`, stays:
  the notice's count reads it.

### Key Entities

- **Invoice entry**: an entry as an invoice holds it — the entry, its
  project's name, and on a draft its amount.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a draft's page, a user reaches the entry behind a line
  and fixes it without leaving the page.
- **SC-002**: Each amount a draft's list shows is what a line billing that
  entry alone would charge, so a draft shown as Every entry matches it line
  for line.

## Assumptions

- The phone and Mac apps have no invoice page that lists lines, so only
  the web changes; the added response field is ignored where unread.
- No migration: everything the list shows is stored or derived today.
