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

## Clarifications

### Session 2026-10-12

- Q: Which Inbox items mark a block? → A: Overlaps and unusual lengths, the
  Inbox's two warning rows: each asks whether the record is right. An entry
  with no project isn't marked; the Inbox treats it as a chore, not a doubt
  about the record, and the block already shows no client color. (decided
  autonomously — Blake to review)
- Q: When two entries overlap, which blocks are marked? → A: Only the entry
  the Inbox row is about, the one its Edit entry opens: the unbilled one,
  the later when both are. The mark names the other entry in words, and the
  grid already draws the pair side by side. Marking the other too would mark
  a billed, locked entry the user can't change. (decided autonomously —
  Blake to review)
- Q: What does the mark look like? → A: The block's border takes the
  Inbox's warning color and a small warning glyph sits in its top-right
  corner; the client's color stays the left edge. The reason, in the Inbox's
  own words, is appended to the block's accessible name and tooltip. A
  glyph rather than color alone, because color never carries a meaning
  alone. (decided autonomously — Blake to review)
- Q: Does the block offer a way to resolve the item, like the Inbox's
  "It's correct"? → A: No new action. Pressing a marked block opens its
  editor, as for any block; "It's correct" stays in the Inbox, one press
  away in the folded dock. One place answers the question. (decided
  autonomously — Blake to review)
- Q: Does a drag predict the mark before the server answers? → A: No. The
  drag's moved block is the predicted result (Constitution VI); the mark
  follows the Inbox's answer, which refreshes with the save. A predicted
  mark would be a second judgment of overlap (FR-003). (decided
  autonomously — Blake to review)

## Design

Design review: skipped in autonomous run; follows the existing calendar,
inbox and `.claude/rules/web-ui.md`.

- **A marked block**: its 1px border in the Inbox's warning color in place
  of the subtle one, and a 12px warning glyph in its top-right corner in the
  same color, `aria-hidden`. The client's left edge and the block's fill are
  unchanged.
- **Its name and tooltip** gain the reason after the times, in the Inbox's
  wording: "overlaps Code review", "unusually long".
- **Constitution I**: a suspect block is surfaced in place for the user to
  resolve, never auto-corrected.

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
- An entry with no project and nothing else wrong: not marked.
- The other entry of an overlap: not marked; the marked one names it.
- A running entry: never marked, as the Inbox never lists one.
- An entry on an issued invoice: never marked, as the Inbox never lists one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A calendar block whose entry has an overlap or an
  unusual-length item in the Inbox MUST be marked as suspect.
- **FR-002**: The mark MUST NOT rely on color alone: it carries a glyph,
  and its reason in words is in the block's accessible name and tooltip.
  For an overlap, only the entry the Inbox row is about is marked, and the
  reason names the other entry.
- **FR-003**: Which entries are suspect, and why, MUST be the Inbox's own
  answer, never a second judgment the calendar makes.
- **FR-004**: The mark MUST appear and clear after a calendar edit without
  a reload or leaving the screen.
- **FR-005**: Marking MUST NOT change any entry (Constitution I): the user
  resolves it by editing the entry, or from the Inbox.
- **FR-006**: A failure to load the Inbox's data MUST leave the calendar
  usable and unmarked.
- **FR-007**: A marked block MUST open its editor when pressed, like any
  block, and offer no action of its own.
- **FR-008**: A drag MUST NOT predict the mark; the mark follows the
  Inbox's answer after the save.

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
