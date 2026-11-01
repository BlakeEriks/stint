Closes #596, #583, #591

# Feature Specification: A draft changes only when you change it

**Feature Branch**: `f596-snapshot-drafts`

**Created**: 2026-11-01

**Status**: Draft

**Input**: Issue #596, with #583 and #591 folded in. Today a draft reads its
period's unbilled work every time it is opened (#467). Work logged later
joins it without the owner doing anything. Mark sent then freezes the lines,
attaches the entries and stops collecting. When a draft changes after its PDF
was downloaded, a banner warns and Mark sent is disabled until a new PDF is
downloaded. The owner wants the draft to do only what they ask: it holds the
lines they built, new work in its period is offered and not absorbed, and Mark
sent says what it locks. #583 makes the New invoice form the draft itself,
saved as it is typed, so leaving loses nothing. #591 removes "Already billed
this?" from that form.

## Clarifications

### Session 2026-11-01

- Q: When does a draft take its work, so two drafts never bill the same
  entry? → A: When it is built. Building is Generate today, and every save of
  the form under #583. The draft holds those entries and one-off expenses, so
  no other draft offers them. Sending locks them, as today. (decided
  autonomously: this was Stint's model before #467, and it is how Harvest and
  FreshBooks treat time on a draft invoice.)
- Q: What happens to work a draft holds when the owner edits, deletes, or
  unbills that entry? → A: The draft's lines follow the edit, at the moment
  of the edit. Editing an entry is the owner changing the draft. A draft that
  kept the old hours would send an invoice that disagrees with its own
  entries. (decided autonomously)
- Q: Does a rate change move a draft? → A: No. The draft keeps the rates it
  was built at. Its next build prices at the rates in force then. (decided
  autonomously)
- Q: Does a client keep at most one open draft per date? → A: No. That rule
  existed because two drafts over one date would both show its work. A draft
  that holds its work cannot, so the rule and its warning on New invoice are
  cut. (decided autonomously; Constitution VII)
- Q: Is "new work" offered one entry at a time? → A: No. One action adds all
  of it (the reviewer's answer on #596).
- Q: What does Mark sent date a sent invoice as? → A: Its last PDF's issue
  and due dates, else the day it is sent, as today. The PDF is still what the
  client holds. No check that the PDF is current remains. (decided
  autonomously)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A draft holds what you built (Priority: P1)

The owner builds a draft for Northwind for Oct 1–15. They log another
Northwind entry dated Oct 9. The draft opens, downloads and is sent with
exactly the lines they built. Nothing joined it on its own.

**Why this priority**: It is the problem #596 names.

**Independent Test**: Build a draft, log an entry inside its period, and see
its lines, hours and total unchanged.

**Acceptance Scenarios**:

1. **Given** a draft for Oct 1–15, **When** an entry dated Oct 9 is logged,
   **Then** the draft's lines, hours and total are unchanged on every read and
   on its PDF.
2. **Given** a draft, **When** the client's or project's rate changes,
   **Then** the draft's lines are unchanged.
3. **Given** a draft holding an entry, **When** the owner edits that entry's
   hours, task or project, **Then** the draft's lines show the edit.
4. **Given** a draft holding an entry, **When** the owner deletes it, marks it
   non-billable or marks it billed elsewhere, **Then** it leaves the draft.
5. **Given** a draft holding an entry, **When** another draft over the same
   dates is built, **Then** that entry is not on the second draft.
6. **Given** a draft, **When** the owner deletes it, **Then** its work is
   unbilled again and can go on another invoice.

---

### User Story 2 - New work in the period is offered (Priority: P1)

Unbilled work dated in a draft's period is offered on the draft, with the
count and hours. One press adds all of it. The owner decides.

**Why this priority**: Without it, User Story 1 would leave late work
unnoticed until the period is sent.

**Independent Test**: Build a draft, log two entries in its period, see the
draft say "2 new entries, 2.5h, in this period", press its action, and see
both added.

**Acceptance Scenarios**:

1. **Given** a draft for Oct 1–15, **When** two billable entries totaling
   2.5h dated in that period are logged, **Then** the draft says so with
   their count, hours and amount, and an action that adds them.
2. **Given** that notice, **When** the owner presses its action, **Then**
   both entries join the draft, priced at the current rates, and the notice
   goes.
3. **Given** a one-off expense for the client, dated on or before the
   period's end, that no invoice holds and the draft did not leave off,
   **When** the draft opens, **Then** the notice counts it too.
4. **Given** new work in the period, **When** the owner never presses the
   action and marks the draft sent, **Then** the invoice is sent without that
   work. The Inbox lists it as work in a sent period, as today.
5. **Given** a running timer in the period, **Then** it is not new work until
   it stops.

---

### User Story 3 - Mark sent says what it locks (Priority: P1)

Mark sent asks before it commits, naming how many entries it locks and the
total. Confirmed, it records that the PDF was sent, and locks the entries
and expenses.

**Why this priority**: Sending locks entries for good. A press that does that
says so first (Constitution VI: it cannot be taken back).

**Independent Test**: Press Mark sent on a draft of 14 entries totaling
$3,150.00, read the confirmation, confirm, and see it sent with its entries
read-only.

**Acceptance Scenarios**:

1. **Given** a draft of 14 entries totaling $3,150.00, **When** Mark sent is
   pressed, **Then** it asks to lock 14 entries at $3,150.00, with a way to
   keep it a draft.
2. **Given** the confirmation, **When** it is confirmed, **Then** the invoice
   is sent with exactly the draft's lines, and the entries it bills are
   read-only.
3. **Given** a draft edited after its PDF was downloaded, **Then** Mark sent
   is not disabled and no banner says it changed.
4. **Given** a draft with unpriced work or nothing to bill, **Then** Mark
   sent is refused for that reason, as today.

---

### User Story 4 - The form is the draft (Priority: P2)

Picking a client on New invoice creates the draft. Every change saves on its
own with a quiet "Saved". Leaving or refreshing loses nothing: the draft is in
the Invoices list, and opening it opens the same form. (#583)

**Why this priority**: A first-time user rebuilt one invoice several times
after leaving the page. A draft that holds its work makes saving each change
the same act as building it.

**Independent Test**: Pick a client, type a reference, refresh, and find the
draft in the list with the reference kept.

**Acceptance Scenarios**:

1. **Given** New invoice, **When** a client is picked, **Then** a draft is
   created with a number and the period's work.
2. **Given** a draft's form, **When** any field changes, **Then** it saves and
   says "Saved"; the preview and the draft agree.
3. **Given** a draft's form, **When** the owner leaves and opens the draft
   from the list, **Then** every choice is as they left it.
4. **Given** an untouched draft, **When** the client changes, **Then** it is
   replaced by one for the new client. One the owner typed in is never
   replaced or deleted on its own.
5. **Given** a draft's form, **When** "Discard draft" is confirmed, **Then**
   the draft is deleted and its work unbilled.
6. **Given** a draft with nothing to bill, **Then** it saves; Mark sent and
   Download PDF refuse it.

---

### User Story 5 - The form has no "Already billed this?" (Priority: P3)

The form bills work. Marking work billed elsewhere is one entry at a time, in
the entry dialog. (#591)

**Why this priority**: A cut. It is small and it removes a press that empties
a draft.

**Independent Test**: Open a draft's form and find no "Already billed this?";
mark one entry billed elsewhere from its dialog and see it leave the draft.

**Acceptance Scenarios**:

1. **Given** a draft's form, **Then** no line offers "Already billed this?".
2. **Given** an entry on a draft, **When** it is marked billed elsewhere in
   the entry dialog, **Then** it leaves the draft.

### Edge Cases

- An entry dated in two drafts' periods is held by whichever was built
  first; the other never offers it.
- A draft built while an entry ran: the entry is new work once it stops.
- An entry on a draft moved to a date outside the draft's period stays on the
  draft. The owner moved it; the draft follows its edit.
- An entry on a draft moved to another client's project leaves the draft.
- A draft whose work is all deleted still opens, with its charges, or nothing
  to bill. It is never deleted on its own.
- A voided invoice releases its work, as today; it is then new work for any
  draft whose period covers it.
- Two devices open one draft: both show what it holds.
- A draft built before this ships holds no work yet. It is built once, from
  its period, when this ships. That is the last time it changes on its own.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A draft MUST store its lines and hold the entries and one-off
  expenses they bill. A read, a PDF and Mark sent MUST use what it stores,
  never recompute it from its period.
- **FR-002**: Building a draft (creating it, saving its form, adding new
  work) MUST compute its lines from its choices, the work it holds, and its
  period's unheld billable work, as the preview does. It MUST then hold that
  work, in one transaction.
- **FR-003**: Work held by one invoice MUST NOT be offered to or built into
  another.
- **FR-004**: An edit, delete, non-billable or billed-elsewhere mark to an
  entry a draft holds MUST rebuild that draft's lines from the work it still
  holds, in the same write. A rate change MUST NOT rebuild a draft.
- **FR-005**: A draft MUST show its period's unheld billable work — ended
  entries, and one-off expenses dated on or before its end that it didn't
  leave off — as one notice with the count, hours and amount. The notice MUST
  have one action that adds all of it (FR-002).
- **FR-006**: Mark sent MUST confirm before it commits, naming the number of
  entries it locks and the total. Confirmed, it MUST send exactly the stored
  lines, locking the held work as a sent invoice does today.
- **FR-007**: Mark sent MUST NOT depend on whether the latest PDF was
  downloaded. The "changed since you downloaded it" banner, its disabled
  Mark sent, and `DRAFT_CHANGED` MUST be removed.
- **FR-008**: A sent invoice MUST be dated as its last PDF, else as the day it
  is sent, as today.
- **FR-009**: The one-open-draft-per-date rule (`DRAFT_OVERLAPS`) and its
  warning on New invoice MUST be removed.
- **FR-010**: Picking a client on New invoice MUST create the draft; each
  later change MUST save it (FR-002) and show "Saved". New invoice and a
  draft's edit MUST be one screen. Generate MUST be removed.
- **FR-011**: An untouched draft MUST be replaced when its client changes. A
  draft the owner typed in MUST never be deleted except by Discard draft or
  Delete draft.
- **FR-012**: A draft MUST be allowed to hold nothing; Download PDF and Mark
  sent MUST refuse it, as today.
- **FR-013**: "Already billed this?" MUST be removed from the form, with its
  undo notice. `POST /entries/invoiced-elsewhere` MUST be removed if nothing
  else calls it.
- **FR-014**: Every draft open when this ships MUST be built once from its
  period, and then hold that work.

### Removes (Constitution VII)

- Deriving a draft's lines on every read (`deriveDraft`'s computation) and
  assigning unbilled expenses among open drafts on read (`assignExpenses`).
- The download snapshot's comparison: `snapshotChanged`, `newLines`, the
  tinted new lines, `changedSinceDownload`, `DRAFT_CHANGED`, the "Changed
  since you downloaded it" and "Edited since you downloaded it" banners, and
  the disabled Mark sent. Only the printed dates stay (FR-008).
- The one-open-draft-per-date rule, its check in `create_invoice` and
  `update_draft`, and New invoice's "A draft already covers" warning.
- The Generate step, and New invoice and edit as two modes.
- "Already billed this?" on the form, its undo notice and `marked` state,
  and `POST /entries/invoiced-elsewhere` if nothing else calls it.
- The tests and stories that assert each of these.

### Key Entities

- **Draft**: a client, a period, a number, the owner's choices, its stored
  lines, and the work it holds. It changes only when the owner builds it or
  edits work it holds.
- **New work**: a client's billable work in a draft's period that no invoice
  holds. It is computed on read and never stored.
- **Sent invoice**: unchanged. Its lines, rates and details are frozen, and
  its work is locked.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No entry or rate change the owner makes outside a draft's own
  work changes any draft's total.
- **SC-002**: The owner adds every piece of new work in a period with one
  press.
- **SC-003**: Mark sent is never disabled because of a download.
- **SC-004**: Leaving or refreshing New invoice after picking a client loses
  no choice the owner made.

## Assumptions

- The phone and Mac apps have no invoice screens, so only the web changes.
- New work is counted on each read of a draft. That count is a read, and it
  never changes the draft.
- An expense is still billed by its date as today: a one-off on or before the
  period's end. A recurring expense is on every invoice and never held.
