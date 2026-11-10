Closes #569

# Feature Specification: New invoice offers to include unbilled work dated just before its period

**Feature Branch**: `f569-earlier-work`

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

## Clarifications

### Session 2026-10-29

- Q: How far back does a client's first invoice look? → A: It doesn't. A first invoice has no gap to catch, and she picks its dates. (decided autonomously)
- Q: Which zone dates the work? → A: The zone the invoice bills in, `billingZone()` (#580), so the offer and the period agree on every entry's day. (decided autonomously)
- Q: Does the offer show when a draft is edited (#571)? → A: Yes, on the same screen and by the same rule. The draft being edited neither ends the look-back nor counts as holding the work. (decided autonomously)
- Q: What does "held by a draft" mean now that #596 removed `DRAFT_OVERLAPS`? → A: A draft holds its entries (`draft_id`), and two drafts may share dates, so Include is never refused. Earlier work another draft holds isn't stranded, and the offer leaves it out. A draft can hold work dated outside its period only once a held entry is re-dated, which is that draft's fault to show, not this offer's. (decided autonomously)
- Q: Does Include wait for the server? → A: No. It moves a date she can move back, so the period changes at once and the preview follows (Principle VI). (decided autonomously)
- Q: Do expenses count? → A: No. A one-off expense already shows on the first draft whose period ends on or after its date, so none is left behind by a period's start. (decided autonomously)

## Design

[`design/new-invoice.html`](design/new-invoice.html)

- **The offer** sits above the preview, with its other notices, as one line
  of support text and an **Include it** (one entry) or **Include them**
  (several) button: "1 earlier entry, Sep 30, isn't on any invoice." or
  "3 earlier entries, Sep 28 – Sep 30, aren't on any invoice."
- **None**: nothing shows.
- **After Include**: From reads the earliest entry's date, the preview's
  period and lines follow, and the offer is gone.

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

1. **Given** a client whose latest invoice that isn't void ends before the new
   period starts, with billable, finished, unbilled work dated between,
   **Then** New invoice says how many earlier entries there are and their
   dates, and offers Include.
2. **Given** that offer, **When** she presses Include, **Then** the period's
   start moves back to the earliest of those entries, the end stays, and
   the offer goes away. The invoice she then generates bills that work.
3. **Given** that offer, **When** she doesn't press Include, **Then** the
   period and the invoice stay as they were, and the work stays unbilled.
4. **Given** no earlier invoice for the client, **Then** there is no offer.
5. **Given** non-billable work, a running timer, work billed elsewhere, work
   on a sent or paid invoice, or work another draft holds, **Then** there is
   no offer.

### Edge Cases

- A daylight saving change between the earlier work and the period: each
  entry is dated by its local day, so the start moves to that entry's date,
  not a day either side.
- She edits the start herself after Include: the offer is worked out again
  from the date she typed.
- She edits a draft: the offer shows by the same rule. The draft being
  edited isn't the invoice the look-back starts from, and the work it holds
  counts as free, as the preview's own lines do.
- Earlier work spans several days: the offer reads its first and last
  dates, "3 earlier entries, Sep 28 – Sep 30, aren't on any invoice".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New invoice MUST find a client's billable, finished entries on
  no invoice and not billed elsewhere, dated after the end of its latest
  invoice that isn't void and starts before the period's start, and dated
  before the period's start. When that invoice reaches the period, there
  are none.
- **FR-002**: With no such invoice, there MUST be no offer.
- **FR-003**: When it finds any, New invoice MUST say above the preview how
  many there are and their dates, and offer Include.
- **FR-004**: Include MUST move the period's start back to the earliest
  entry's date and keep its end. Nothing MUST be included without that
  press.
- **FR-005**: FR-001's count MUST leave out work another draft holds.
- **FR-006**: An entry's date MUST be read in the zone the invoice bills in,
  the same zone that decides which entries the period holds.
- **FR-007**: Include MUST change the period at once, with no wait on the
  server; the preview then follows.
- **FR-008**: When a draft is edited, the offer MUST leave that draft out of
  FR-001 and count the work it holds as free in FR-005.

### Key Entities

- **Earlier work**: derived on each preview, never stored. The client's
  entries found by FR-001 and their first and last dates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Stranded work is pointed out on the invoice that would
  otherwise skip it, with no search on her part.
- **SC-002**: One press includes it, and the dates the invoice prints cover
  everything it bills.
- **SC-003**: No invoice bills work dated outside its printed period.

## Assumptions

- The phone and macOS apps make no invoices. They ignore the new field.
