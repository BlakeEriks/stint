Closes #756

# Feature Specification: New invoice says when a draft holds this period's work

**Feature Branch**: `held-work-notice`

**Created**: 2026-11-17

**Status**: Draft

**Input**: Issue #756. New invoice for a client over a period another draft
already holds prints "0 entries" and whatever expenses apply, and nothing
says where the time went. On the seeded account that is Northwind over
October: a stale draft holds the month, so the new invoice is $200 of
expenses and no hours. Since #596 a draft holds its entries and two drafts
may share dates, so nothing is billed twice, but a user who doesn't
remember the draft reads the empty page as lost work (Constitution I: a
suspect state is surfaced, never silent). New invoice names the draft and
how many of the period's entries it holds, with a link to it.

## Clarifications

### Session 2026-11-17

- Q: Which entries count? → A: The client's billable, finished entries in the period, on no invoice and not billed elsewhere, that another draft holds: those this invoice would bill if no draft held them. Non-billable ones a draft holds don't count, since they would bill nothing here. (decided autonomously)
- Q: Does the notice show when a draft is edited? → A: Yes, by the same rule. The draft being edited is never one of the holders: what it holds is its own lines. (decided autonomously)
- Q: Two drafts hold work in the period? → A: One line per draft, oldest number first, each with its own count and link. (decided autonomously)
- Q: Does it offer to move the work? → A: No. The work is that draft's; she opens it to add to it or let it go. Nothing is prevented: two drafts may share dates (#596). (decided autonomously, as the issue says)
- Q: Do expenses count? → A: No. A one-off another draft holds isn't offered (#707), so it isn't missing from this page. (decided autonomously, as the issue says)

## Design

No design review: one line of support text per draft, in the notices above
the page where the earlier-work offer already sits, with the draft's number
as a link. There is no choice of layout or hierarchy to see first.
(decided autonomously)

- **The notice**: "INV-0012 holds 6 entries in this period." The number
  links to that draft. With one entry: "holds 1 entry".
- **None**: nothing shows.
- **Client or period changed**: the notice goes at once, as the earlier-work
  offer does, until the next answer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which draft holds the period's work (Priority: P1)

She saved a draft for Northwind over October weeks ago and forgot it. She
opens New invoice for Northwind over October. The page shows no hours, and
above it: "INV-0012 holds 6 entries in this period." She clicks INV-0012 and
lands on that draft.

**Why this priority**: It is the whole feature.

**Independent Test**: Save a draft for a client over a month with billable
work. Open New invoice for the same client and month.

**Acceptance Scenarios**:

1. **Given** another draft for the client holds billable, finished entries
   in the period, **Then** New invoice says which draft and how many, with
   the draft's number linking to it.
2. **Given** two drafts hold entries in the period, **Then** each is named
   with its own count.
3. **Given** no draft holds work in the period, **Then** there is no notice.
4. **Given** she edits a draft, **Then** that draft is never named, and other
   drafts holding work in its period are.

### Edge Cases

- A draft holds only non-billable entries in the period: no notice.
- A draft holds only expenses in the period: no notice.
- She changes the client or the period: the notice goes until the next
  answer names the holders of the new one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The preview MUST find the client's billable, finished entries
  in the period, on no invoice and not billed elsewhere, that a draft other
  than the one edited holds.
- **FR-002**: For each such draft, New invoice MUST say its number and how
  many of those entries it holds, the number linking to the draft.
- **FR-003**: With none, nothing MUST show.
- **FR-004**: The notice MUST NOT move, release or prevent anything.

### Key Entities

- **Held work**: derived on each preview, never stored. The count of
  FR-001's entries, and for each holding draft its id, number and count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An invoice period emptied by another draft always says which
  draft, with no search on her part.
- **SC-002**: One click reaches that draft.

## Assumptions

- The phone and macOS apps make no invoices. They ignore the new field.
