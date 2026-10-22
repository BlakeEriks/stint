Closes #433

# Feature Specification: Drafts collect their period's work until sent

**Feature Branch**: `f433-live-drafts`

**Created**: 2026-10-22

**Status**: Draft

**Input**: Issue #433. A draft invoice can exist before all of its period's
work is logged: drafted on the 15th for October 1–15, or with an entry logged
late. Today a draft freezes its lines when it's generated, so work logged
afterwards is missing until the contractor deletes and regenerates it. A
draft should be a client and a period that keeps collecting that period's
unbilled work until it's marked sent; marking it sent is what freezes it.
What the contractor chose on New invoice survives every rebuild. An entry
dated in a period that's already been sent goes to the inbox, never onto the
next invoice silently. Auto-drafting (#434) depends on this. Builds on the
billing schedule (#432), and must also work for a client with no schedule.

## Clarifications

### Session 2026-10-22

- Q: What happens when a new invoice's dates overlap an open draft for the same client? → A: New invoice says a draft already covers those dates, links to it, and Generate stays disabled until they no longer overlap.
- Q: What does Mark sent do when the draft changed since its last download? → A: It warns, shows what changed (hours and total), and asks for the new PDF to be downloaded before the draft can be marked sent.

## Design

[draft.html](design/draft.html) · [new-invoice.html](design/new-invoice.html) · [inbox.html](design/inbox.html)

- **Draft, up to date**: the header keeps Delete draft, Mark sent and Download PDF (primary). The hint under it says the draft keeps collecting its period until it's marked sent.
- **Draft, changed since download**: a banner under the header, edged in the warning color, says it changed since you downloaded it, with the hours added and the old total struck through beside the new one. Mark sent is disabled until Download PDF is pressed; the banner has no button of its own. Lines added since the download are tinted on the invoice.
- **Draft, never downloaded**: as up to date; Mark sent works as today.
- **New invoice, overlapping a draft**: a line under the dates, in the warning color, names the draft's period and links to it; Generate invoice is disabled.
- **Inbox, late work**: an item per late entry — task, hours, client, date, and that it's in the named sent invoice's period; its action opens the entry, where it can be marked not billable.
- **Invoices list**: unchanged in layout; a draft's total and the outstanding total are the draft's current total. No badge for a changed draft.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A draft picks up work logged after it was made (Priority: P1)

The contractor generates a draft for Oct 1–15 on the 15th, keeps working that
afternoon, and logs a forgotten entry from the 9th the next morning. When
they open or download the draft, both entries are on it, priced as any
billed work is.

**Why this priority**: It's the problem the issue names, and auto-drafting
can't work without it.

**Independent Test**: Generate a draft, log an entry inside its period, and
see the draft's lines, hours and total include it.

**Acceptance Scenarios**:

1. **Given** a draft for Oct 1–15, **When** an entry dated Oct 15 is logged
   after the draft was made, **Then** the draft's lines, hours and total
   include it the next time it's viewed or downloaded.
2. **Given** a draft, **When** an entry on it is edited (hours, project,
   billable), **Then** the draft shows the edit.
3. **Given** a draft, **When** an entry on it is deleted or made
   non-billable, **Then** it leaves the draft.
4. **Given** a draft, **When** an unbilled expense dated on or before the
   period's end is added for that client, **Then** the draft includes it,
   unless the contractor left that expense off on New invoice.
5. **Given** a draft, **When** an entry dated outside its period is logged,
   **Then** the draft doesn't change.
6. **Given** an open draft for Oct 1–15, **When** New invoice is set to the
   same client and Oct 10–31, **Then** it says a draft already covers those
   dates, links to it, and Generate is disabled.

---

### User Story 2 - Marking sent freezes it (Priority: P1)

When the contractor marks a draft sent, its lines, rates, totals, payment
details and supporting detail are fixed for good, exactly as an issued
invoice is today.

**Why this priority**: An invoice that was sent must never change; this is
where that guarantee now begins.

**Independent Test**: Mark a draft sent, then log and edit entries in its
period, and see the invoice unchanged.

**Acceptance Scenarios**:

1. **Given** a draft, **When** it is marked sent, **Then** its contents are
   exactly what the contractor last saw, and nothing logged afterwards
   changes it.
2. **Given** a draft downloaded before an entry was logged in its period,
   **When** the contractor presses Mark sent, **Then** it says the draft
   changed, shows the added hours and the new total, and marks it sent only
   after the new PDF is downloaded.
3. **Given** a sent invoice, **When** an entry it bills is opened, **Then**
   the entry is read-only, as today.
4. **Given** a sent invoice is voided, **Then** its entries and expenses are
   unbilled again, as today.

---

### User Story 3 - What the contractor chose survives (Priority: P1)

Every choice made on New invoice — grouping, summary text, supporting detail,
reference, added charges, expenses left off, payment details, due date and
notes — stays on the draft however often it rebuilds.

**Why this priority**: A rebuild that undoes a choice would change the
contractor's data on their behalf (Principle I).

**Independent Test**: Generate a draft with a summary line, a reference and a
charge; log an entry; see all three unchanged and the entry's hours added.

**Acceptance Scenarios**:

1. **Given** a draft with one summary line, **When** an entry is logged in
   its period, **Then** the summary line's text stays and its hours and
   amount grow.
2. **Given** a draft with an added charge, **When** it rebuilds, **Then** the
   charge is still there once.
3. **Given** a draft that left an expense off, **When** it rebuilds, **Then**
   that expense stays off.

---

### User Story 4 - Late work for a sent period is surfaced (Priority: P2)

An entry logged for a client on a date an already-sent invoice covered isn't
billed anywhere. The inbox says so, so the contractor can bill it on a later
invoice, reissue, or leave it.

**Why this priority**: Without it, late work is either lost or lands on the
next invoice unannounced.

**Independent Test**: Send an invoice for Oct 1–15, log an entry on Oct 10,
and see it in the inbox.

**Acceptance Scenarios**:

1. **Given** a sent invoice for Oct 1–15, **When** an unbilled entry dated
   Oct 10 exists for that client, **Then** the inbox lists it as work in a
   period already invoiced.
2. **Given** that inbox item, **When** the contractor bills it on a new
   invoice or marks it not billable, **Then** it leaves the inbox.

### Edge Cases

- A draft whose period has no work left (every entry deleted) still opens and
  shows its charges and expenses, or nothing to bill; it's never deleted on
  its own.
- A running timer inside a draft's period isn't on the draft until it stops,
  as today.
- Rates change while a draft is open: the draft shows the current rates
  until it's sent.
- Archiving a client or project with an open draft leaves the draft as is.
- Two devices open the same draft: both show the same contents, since the
  contents come from the same entries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A draft MUST hold a client, a period and the contractor's New
  invoice choices; its time lines and expense lines MUST be computed from that
  client's unbilled billable entries and expenses in the period each time it
  is viewed, downloaded or marked sent.
- **FR-002**: A draft's lines MUST come from the same computation as New
  invoice's preview, so the two always agree.
- **FR-003**: Marking a draft sent MUST freeze its lines, rates, totals,
  payment details, parties and supporting detail, and attach the entries and
  expenses it bills; afterwards nothing about it changes but its status.
- **FR-004**: A rebuild MUST NOT change any choice the contractor made on New
  invoice.
- **FR-005**: An entry or expense MUST belong to at most one invoice once
  sent; a draft never takes work another sent invoice bills.
- **FR-006**: A client MUST have at most one open draft covering any date.
  When New invoice's dates overlap an open draft for the chosen client, it
  MUST say so, link to that draft, and keep Generate disabled until the
  dates no longer overlap; the server MUST refuse an overlapping draft too.
- **FR-007**: An unbilled billable entry dated inside a sent invoice's period
  for the same client MUST appear in the inbox.
- **FR-008**: The draft's number MUST stay the one it was given when created.
- **FR-009**: If the draft's contents changed after the contractor last
  downloaded it, Mark sent MUST say so, show the change in hours and total,
  and require the new PDF to be downloaded before the draft can be marked
  sent, so the frozen invoice is the one the client received. A draft never
  downloaded can be marked sent as today.
- **FR-011**: The invoices list MUST show each draft's current total, and its
  outstanding total MUST count drafts at their current totals.
- **FR-010**: Every client (web and macOS) MUST read drafts and mark them
  sent through the same API.

### Key Entities

- **Draft invoice**: a client, a period, a number, and the contractor's New
  invoice choices; its lines are recomputed from its period's work each time
  it is read, until sent.
- **Sent invoice**: today's issued invoice — lines, rates and details frozen,
  entries and expenses attached.
- **Late entry**: an unbilled billable entry dated inside a sent invoice's
  period for that invoice's client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Work logged in a draft's period appears on the draft the next
  time it's opened, with no delete or regenerate.
- **SC-002**: A sent invoice's total never changes after it's marked sent.
- **SC-003**: Every choice made on New invoice is unchanged after any number
  of rebuilds.
- **SC-004**: Every unbilled entry dated in an already-sent period appears in
  the inbox.

## Assumptions

- Drafts keep the number they get when generated, as today; deleting a draft
  is still allowed and leaves its number unused, as today.
- A draft is still made from New invoice; auto-drafting is #434.
- Entries in a draft's period aren't locked while it's a draft; they lock
  when it's sent, as today's draft entries are editable.
- Existing drafts become live drafts on release: their choices are kept and
  their lines are recomputed from their period's work.
