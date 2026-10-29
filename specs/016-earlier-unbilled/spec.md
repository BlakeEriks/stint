Closes #569

# Feature Specification: New invoice offers to include unbilled work dated just before its period

**Feature Branch**: `f569-earlier-work`, stacked on `f482-invoice-due` (#548), which merges first

**Created**: 2026-10-29

**Status**: Draft

**Input**: Issue #569. Billable work can be left unbilled just before an
invoice's period. It happens when an entry is logged late, or when a change
of time zone between two invoices moves an entry near midnight out of both.
If the next invoice quietly bills that work, its dates are wrong. A second
invoice for a month already billed is worse. New invoice notices the work,
says so, and moves its period's start back only when she presses Include.
#568 (PR #580) stops new work being stranded by a time zone change. This
feature finds what is already stranded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See earlier unbilled work and include it (Priority: P1)

Her client Northwind is billed monthly, and the September invoice she sent
covered Sep 1 – Sep 29 because of a time zone shift. She opens New invoice
for October. Above the preview it says "1 earlier entry, Sep 30, isn't on
any invoice", with Include it. She presses it, and the period reads
Sep 30 – Oct 31. The preview bills the entry, and the invoice she generates
bills it too.

**Why this priority**: It is the whole feature.

**Independent Test**: Send an invoice for a client that ends a day before
the next period starts. Log billable work on the day between. Open New
invoice for the next period, then press Include it.

**Acceptance Scenarios**:

1. **Given** a client whose last invoice that isn't void ends before the new
   period starts, with billable, finished, unbilled work dated between,
   **Then** New invoice says how many earlier entries there are and their
   dates, and offers Include.
2. **Given** that offer, **When** she presses Include, **Then** the period's
   start moves back to the earliest of those entries, the end stays, and
   the offer goes away. The invoice she then generates bills that work.
3. **Given** that offer, **When** she doesn't press Include, **Then** the
   period and the invoice stay as they were, and the work stays unbilled.
4. **Given** no earlier invoice for the client, **Then** the offer looks
   back only 30 days before the period starts.
5. **Given** earlier work that falls inside an open draft's period,
   **Then** the offer doesn't offer Include. It names the draft that holds
   that work and links to it.
6. **Given** non-billable work, a running timer, work billed elsewhere, or
   work on a sent or paid invoice, **Then** there is no offer.

### Edge Cases

- A daylight saving change between the earlier work and the period: each
  entry is dated by its local day, so the start moves to that entry's date,
  not a day either side.
- She edits the start herself after Include: the offer is worked out again
  from the date she typed.
- Earlier work spans several days: the offer reads its first and last
  dates, "3 earlier entries, Sep 28 – Sep 30, aren't on any invoice".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New invoice MUST find a client's billable, finished entries on
  no invoice and not billed elsewhere, dated after the end of its last
  invoice that isn't void and ends before the period's start, and dated
  before the period's start.
- **FR-002**: With no such invoice, FR-001 MUST look back no more than 30
  days before the period's start.
- **FR-003**: When it finds any, New invoice MUST say above the preview how
  many there are and their dates, and offer Include.
- **FR-004**: Include MUST move the period's start back to the earliest
  entry's date and keep its end. Nothing MUST be included without that
  press.
- **FR-005**: When an open draft's period holds that work, the offer MUST
  name the draft and link to it instead of offering Include.
- **FR-006**: An entry's date MUST be read in the zone the invoice bills in,
  the same zone that decides which entries the period holds.

### Key Entities

- **Earlier work**: derived on each preview, never stored. The client's
  entries found by FR-001, their first and last dates, and the open draft
  holding them, if any.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Stranded work is pointed out on the invoice that would
  otherwise skip it, with no search on her part.
- **SC-002**: One press includes it, and the dates the invoice prints cover
  everything it bills.
- **SC-003**: No invoice bills work dated outside its printed period.

## Assumptions

- The phone and macOS apps make no invoices. They ignore the new field.
