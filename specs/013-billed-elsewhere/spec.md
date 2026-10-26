Closes #478

# Feature Specification: Mark entries as billed outside Stint

**Feature Branch**: `f478-billed-elsewhere`

**Created**: 2026-10-26

**Status**: Draft

**Input**: Issue #478. A contractor who tracked time in Stint but billed some
of it before Stint's invoicing existed, or from another tool, still sees that
work as unbilled. The Unbilled figure and the next invoice include work the
client already paid for, so she either bills it twice or deletes real
entries. Stint already has the state she needs: an entry can be "invoiced
elsewhere", which counts as earned and never as unbilled. Today only an
import sets it. This feature lets her set it, and clear it, on entries
already in Stint.

## Clarifications

### Session 2026-10-26

- Q: Which model: an external invoice record, or a flag on the entry? → A: The flag that exists, `invoiced_elsewhere`. Every query that means "unbilled" already skips it and month revenue already counts it as earned, so nothing double-counts or drops. An external invoice record would add a table, a number nobody prints, and a list to keep it out of. (decided autonomously)
- Q: Is an entry billed elsewhere locked, as one on an issued invoice is? → A: No. Stint never told a client what that entry says, so nothing it printed can disagree with an edit. It stays editable, as imported history already is. (decided autonomously)
- Q: How is a mistaken mark undone? → A: Right after marking a range, the confirmation offers Undo, which clears exactly the entries it marked. Later, any one entry is cleared from its edit dialog. (decided autonomously)
- Q: Where does the range selection live? → A: On New invoice, where the client and dates are already picked and the card shows the work. A second action marks that work billed elsewhere instead of generating. (decided autonomously)
- Q: Which entries does a range mark? → A: Exactly the entries the card shows, by id, so nothing logged after she looked is marked. The server marks only those still finished and on no invoice. (decided autonomously)
- Q: Is there a confirm step? → A: No. The mark removes nothing and comes back with Undo, and the app's rules keep a confirm for what removes something saved. The button shows it's pending, then a toast says how many it marked, with Undo. (decided autonomously)
- Q: Expenses? → A: Out of scope. The issue is about tracked time, and expenses have no such flag. (decided autonomously)

## Design

No design review (decided autonomously): each change is a control in a
pattern the app already has. New invoice gains a secondary button beside
Generate, the edit-entry dialog gains a
checkbox under Billable, and the result is a toast with an action. Their
stories show every state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mark a period's work billed elsewhere (Priority: P1)

She opens New invoice, picks the client and the dates she already billed
from her old tool, and sees that work on the card. She presses "Billed
elsewhere", and that work leaves Unbilled and never appears on an invoice.

**Why this priority**: It's the switch-mid-engagement case the issue names,
and every new user is in it.

**Independent Test**: With unbilled work for a client in October, mark
October billed elsewhere on New invoice, then see Home's Unbilled drop by
that amount, the month's Earned unchanged, and a new invoice for October
refuse with nothing to bill.

**Acceptance Scenarios**:

1. **Given** the card shows 3 entries for the chosen client and dates,
   **When** she presses Billed elsewhere, **Then** the button shows it's
   pending until the server answers.
2. **Given** the server answers, **Then** those 3 entries are billed
   elsewhere, Unbilled drops by their amount, Earned is unchanged, the card
   has nothing to bill, and a toast says "3 entries marked billed elsewhere"
   with Undo.
3. **Given** the toast, **When** she presses Undo, **Then** exactly those 3
   entries are unbilled again, and none other.
4. **Given** the dates hold no unbilled billable work, **Then** Billed
   elsewhere is disabled, as Generate is.
5. **Given** an entry the card showed was put on an invoice since, **When**
   she marks, **Then** that entry is left as it is, and the toast counts
   only the ones marked.
6. **Given** the server fails, **Then** nothing is marked and the app-wide
   notice says why.

---

### User Story 2 - Mark or clear one entry (Priority: P2)

From an entry's edit dialog, she ticks "Billed elsewhere" on work she billed
by hand, or unticks it on an entry marked by mistake, and saves.

**Why this priority**: It's the hand-picked set the issue asks for, and the
undo after the toast is gone.

**Independent Test**: Open an unbilled entry, tick Billed elsewhere, save,
and see Unbilled drop; open it again, untick, save, and see it return.

**Acceptance Scenarios**:

1. **Given** an entry on no invoice, **When** she opens it, **Then** the
   dialog shows a Billed elsewhere checkbox, ticked if it is.
2. **Given** she changes it and saves, **Then** the entry is marked or
   cleared, and Unbilled moves to match.
3. **Given** an entry on a draft or issued invoice, **Then** the checkbox
   isn't shown.
4. **Given** the entry was put on an invoice since the dialog opened,
   **When** she saves a mark, **Then** the server refuses, the dialog stays
   open and says the entry is on an invoice.

### Edge Cases

- A timer still running in the range: it isn't finished, so it isn't marked.
- An entry logged in the range after the card loaded: it isn't on the ids
  she pressed with, so it stays unbilled.
- Undo after one of the marked entries was deleted: the rest are cleared.
- Two tabs: a second mark of the same range finds nothing left and marks 0.
- The phone and macOS apps ignore the new field on an entry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The API MUST mark as billed elsewhere a given list of the
  user's entry ids, skipping any running or on an invoice, and return the
  ids it changed.
- **FR-002**: The API MUST clear billed elsewhere on a given list of the
  user's entry ids, and return the ids it changed.
- **FR-003**: The API MUST never set billed elsewhere on an entry that is on
  an invoice, whether draft or issued; one entry asked for by id is refused
  with a conflict naming why.
- **FR-004**: An entry MUST carry whether it is billed elsewhere, and its
  update MUST accept it.
- **FR-005**: Nothing MUST be marked but the entries the user pressed on (Principle I).
- **FR-006**: An entry billed elsewhere MUST count as earned and never as
  unbilled, in every figure and list, as imported history does today.
- **FR-007**: Every write MUST go through `/api/v1` and the app's one
  mutation mechanism, showing a pending state on the control (Principles III
  and VI).
- **FR-008**: One user MUST never mark or clear another user's entries.

### Key Entities

- **Time entry**: gains `invoicedElsewhere` in the API, the column that
  exists.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A period's prior billing is taken out of Unbilled in one
  press, without deleting an entry.
- **SC-002**: After marking, month Earned is unchanged and Unbilled drops by
  exactly the marked work's amount.
- **SC-003**: No marked entry ever appears on a new invoice.

## Assumptions

- No migration: the column, its default and every unbilled query's
  exclusion exist since `00000000000021_invoiced_elsewhere.sql`.
- The macOS and phone apps get no control for it in this feature.
