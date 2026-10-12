Closes #290

# Feature Specification: The calendar marks its own suspect entries

**Feature Branch**: `f290-cal-suspect`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Issue #290, "Calendar marks its own suspect entries": the calendar
is a workspace, so an Inbox item made by a calendar edit (an overlap from a
drag) goes unseen until the contractor leaves the calendar, and a suspect
entry sits unnoticed while they keep editing the week around it. A block
with an Inbox item shows it in place. Depends on #207, the folded dock,
whose Inbox icon carries the count.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a suspect entry where it is (Priority: P1)

A contractor drags a block on the calendar so it runs into the next one.
The block they moved is marked at once as suspect, in place on the grid,
and saying why: it overlaps the other entry. They drag it back, and the mark
goes.

**Why this priority**: It's the whole issue: the overlap a drag makes is
seen where it was made, not after leaving the calendar.

**Independent Test**: On the calendar, make two entries overlap and confirm
the entry the Inbox lists is marked on the grid; separate them and confirm
the mark goes.

**Acceptance Scenarios**:

1. **Given** an entry the Inbox lists as overlapping another, **When** the
   calendar shows its day, **Then** its block is marked as suspect, and the
   mark says in words that it overlaps.
2. **Given** an entry the Inbox lists as unusually short or long, **When**
   the calendar shows its day, **Then** its block is marked, and the mark
   says which.
3. **Given** a block was moved so it overlaps another, **When** the move is
   saved, **Then** the block is marked without leaving the calendar or
   reloading.
4. **Given** a marked block, **When** the edit that clears its Inbox item is
   saved, **Then** the mark goes.
5. **Given** a marked block, **When** the user presses it, **Then** its
   editor opens, as for any block; nothing about the entry has been changed
   on their behalf.

---

### Edge Cases

- An entry is both unusually long and overlapping: one mark, naming both.
- An entry runs past midnight: each of its blocks is marked.
- The Inbox's data fails to load: the calendar draws as it does today, with
  no marks and no error of its own; the folded dock already says the Inbox
  could not load.
- A running entry: never marked, as the Inbox never lists one.
- An entry on an issued invoice: never marked, as the Inbox never lists one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A calendar block whose entry has an overlap or an
  unusual-length item in the Inbox MUST be marked as suspect.
- **FR-002**: The mark MUST NOT rely on color alone: it carries a glyph,
  and its reason in words is in the block's accessible name and tooltip.
- **FR-003**: Which entries are suspect, and why, MUST be the Inbox's own
  answer, never a second judgment the calendar makes.
- **FR-004**: The mark MUST appear and clear after a calendar edit without
  a reload or leaving the screen.
- **FR-005**: Marking MUST NOT change any entry (Constitution I): the user
  resolves it by editing the entry, or from the Inbox.
- **FR-006**: A failure to load the Inbox's data MUST leave the calendar
  usable and unmarked.

### Key Entities

- **Suspect entry**: a time entry the Inbox lists as overlapping another or
  as unusually short or long, with the reasons the Inbox gives.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every entry the Inbox lists as overlapping or unusual in
  length, and on screen in the calendar, is marked; no other block is.
- **SC-002**: An overlap made by a drag is marked on the grid without the
  user leaving the calendar.
- **SC-003**: A screen reader user can tell a suspect block, and why, from
  its name alone.

## Assumptions

- The Inbox's existing judgment of overlaps and lengths is the one used;
  nothing new is detected.
- The folded dock's count (#207) is how the rest of the Inbox stays in view
  from the calendar; this feature marks blocks only.
