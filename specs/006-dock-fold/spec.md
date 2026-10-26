Closes #207

# Feature Specification: The dock folds on workspace screens

**Feature Branch**: `f207-dock-fold`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Issue #207, "Dock folds to a strip of icons on full-window
screens": New invoice and Calendar are workspaces with no dock, so the Inbox
and Today are out of sight while the contractor invoices or plans their week.
To check the Inbox they leave New invoice, and the draft is lost.

## Clarifications

### Session 2026-10-12

- Q: Is folding per-screen (workspace screens only) or a toggle the user sets
  once? → A: Per-screen. Every workspace screen folds the dock on its own; no
  setting. A toggle would be a preference to store and a choice nobody needs
  to make, since a screen is a workspace because it needs the room. (decided
  autonomously)
- Q: How does an open fold close, and does it trap focus like a dialog? → A:
  It's a non-modal popover. It closes on a press outside it, Escape, its icon
  pressed again, focus leaving it, and navigation; pressing the other icon
  swaps to that region. Focus moves into it on open and back to the icon on
  close. It doesn't trap focus or dim the screen, because it's a glance at
  something beside the work, not a step the work waits on. (decided
  autonomously)
- Q: Does the Inbox earn the strip alone, with Today waiting? → A: Both, as
  option B draws them. Today costs one icon and no new content, and the
  strip with Today keeps the folded dock a fold of the whole dock rather
  than a second, smaller one. Only the Inbox carries a count. (decided
  autonomously)
- Q: What does a workspace screen show below laptop width, where the dock is
  a band beneath the content rather than a side column? → A: The full dock
  band, as on every other screen. Below laptop width the dock takes height
  under the content, not width beside it, so there's no room to win by
  hiding it. The strip shows only where the full dock would be a side
  column. (decided autonomously)
- Q: Can the strip's icons go without a visible label, against the
  convention that every action carries one? → A: Yes, as a third exception
  in `.claude/rules/web-ui.md`: each icon has an accessible name and a
  tooltip, and the strip is 44px by design. (decided autonomously)

## Design

Design review: skipped in autonomous run; follows option B from the
workspace review
([invoice-workspace.html](../003-invoice-summary-detail/design/invoice-workspace.html))
and `.claude/rules/web-ui.md`.

- **The strip**: a 44px column where the full dock would be, painted onto
  the ground like the dock, holding two 36px ghost icon buttons stacked from
  the top: Inbox, then Today.
- **The count**: a small pill on the Inbox icon's corner, on the same fill
  the dock's Inbox count uses; none at zero.
- **Open**: the region opens over the panel, to the strip's left, aligned to
  the top, as wide as the full dock (286px), on the ground the dock is
  painted on, with a hairline border and the floating shadow; on the
  elevated surface the Inbox's own row fill would vanish. It holds the same Inbox or Today the full dock shows,
  and scrolls inside itself up to the window's height. The icon whose
  region is open shows the pressed state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check the Inbox without leaving the workspace (Priority: P1)

A contractor is halfway through a new invoice on a laptop. They see the
Inbox count beside the panel, open the Inbox over the panel, see an overdue
invoice, close the Inbox and carry on with the draft as they left it.

**Why this priority**: It's the loss the issue names: leaving New invoice
throws away the draft.

**Independent Test**: On New invoice at laptop width, fill part of the form,
open the Inbox from the folded dock, close it, and confirm the form still
holds what was entered.

**Acceptance Scenarios**:

1. **Given** a workspace screen at laptop width, **When** it renders,
   **Then** the dock shows as a narrow strip of icons beside the panel, and
   the panel keeps nearly all of the dock's room.
2. **Given** items in the Inbox, **When** the strip renders, **Then** the
   Inbox icon shows their count; with none, it shows no count.
3. **Given** the strip, **When** the user presses the Inbox icon, **Then**
   the Inbox opens over the panel with the same rows and actions as the full
   dock, and the screen underneath keeps its state.
4. **Given** an open Inbox, **When** the user closes it, **Then** it closes
   and focus returns to the Inbox icon.
5. **Given** an open Inbox, **When** the user acts on a row (marks an
   invoice paid, assigns a project), **Then** the action behaves exactly as
   in the full dock.

---

### User Story 2 - Glance at Today from a workspace (Priority: P2)

While planning the week on Calendar, the contractor opens Today from the
strip to see what they've logged and earned today, then closes it.

**Why this priority**: Useful, but Today's entries are also on the calendar
itself, so it matters less than the Inbox.

**Independent Test**: On a workspace screen, open Today from the strip and
confirm it lists today's entries and earnings as the full dock does.

**Acceptance Scenarios**:

1. **Given** the strip, **When** the user presses the Today icon, **Then**
   Today opens over the panel with today's entries and earnings.
2. **Given** an open Today, **When** the user presses an entry, **Then** its
   editor opens as it does from the full dock.

---

### Edge Cases

- The window narrows below laptop width while a fold is open: the fold
  closes and the full dock band shows beneath the content.
- An entry's editor is opened from Today in a fold: the editor opens over
  it, and closing the editor returns to the open fold.
- An Inbox row that links to an invoice is pressed: the app navigates, and
  the fold closes.
- Many Inbox items: the open fold scrolls inside itself and never runs past
  the window.
- The stats fail to load: the strip still shows, the Inbox icon has no
  count, and the open Inbox says it couldn't load, as the full dock does.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a workspace screen, where the full dock would be a side
  column, the dock MUST show as a strip of icons no wider than 44px instead of
  being hidden. Folding is per-screen and automatic, with no setting. Where
  the dock is a band beneath the content, a workspace screen MUST show the
  full band, as every other screen does.
- **FR-002**: The strip MUST hold an Inbox icon, showing the Inbox count
  when it's above zero, and a Today icon with no count.
- **FR-003**: Pressing a strip icon MUST open its region over the panel,
  with the same content and actions as the full dock, without resizing the
  panel or changing the screen underneath.
- **FR-004**: An open fold MUST close on a press outside it, Escape, its
  icon pressed again, focus leaving it, and navigation. Focus MUST move into
  it on open and return to its icon on close. It MUST NOT trap focus or dim
  the screen. One fold is open at a time. A dialog opened from inside a fold
  (an entry's editor) MUST NOT close the fold beneath it.
- **FR-005**: Each strip icon MUST have an accessible name, including the
  Inbox count, a tooltip naming it, and say whether its region is open.
- **FR-006**: Screens that aren't workspaces MUST keep the full dock as it
  is today.
- **FR-007**: Opening and closing a fold MUST answer in the same frame, with
  no server round trip (Constitution VI).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a workspace screen, the Inbox is one press away, and the
  count of things needing the user is visible without any press.
- **SC-002**: Checking the Inbox from New invoice loses nothing already
  entered in the form.
- **SC-003**: The workspace panel loses no more than 60px of width to the
  strip, against the 286px the full dock takes.
- **SC-004**: Every strip action can be done with the keyboard alone, and a
  screen reader announces each icon's name, count and open state.

## Assumptions

- The workspace screens are the ones that exist today, New invoice and
  Calendar; any screen that becomes a workspace later gets the strip with no
  further work.
- The fold shows the existing Inbox and Today regions; nothing new is added
  to them.
- No data or server change is needed: the Inbox count comes from what the
  dock already loads.
