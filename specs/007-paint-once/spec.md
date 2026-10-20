Closes #383

# Feature Specification: Every screen paints once, with all its data

**Feature Branch**: `f383-paint-once`

**Created**: 2026-10-19

**Status**: Draft

**Input**: Issue #383, "Every screen paints once, with all its data": a
contractor opening Stint watches the screen assemble itself. On a home page
refresh the week's bars draw gray, then turn client colors; the macOS menu bar
panel repaints several times as each piece of its data arrives. For a tool
whose job is money the user will invoice, half-drawn figures read as wrong
figures.

## Clarifications

### Session 2026-10-19

- Q: Which screens get the treatment? → A: Every web screen that loads data,
  plus the menu bar panel. A loading rule only some screens keep is not one a
  user can rely on.
- Q: Per-screen skeletons, or one shared loader? → A: One shared loader,
  centered in the content area. With last known data
  on reopen and the delay before it shows, it is seen only on a first load or
  a slow connection, so a skeleton per screen is upkeep that rarely pays.

## Design

[design/loader.html](design/loader.html), in the app frame and the menu bar
panel.

- **Under 800ms**: the content area stays blank. The rail, header and dock
  are drawn and never move.
- **Loading**: the word "Loading" (`type-label`, `text-subtle`) fades in at
  the center of the content area, starting at 600ms over `motion-count`, so
  it's fully in by about 1.5s. Once in, it breathes between full and 40%
  opacity on a 2.4s cycle, so a long wait still reads as alive. It's a
  `status` region for screen readers.
- **Loaded**: the word fades out over `motion-quick` from wherever its
  breath is, then the content rises in once (`motion-rise`,
  `ease-decelerate`).
- **Menu bar panel**: the same word in the same place, at the panel's
  center.
- **Reduced motion**: the word fades in and holds still; nothing breathes,
  and the content fades in without the rise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The home panel appears whole (Priority: P1)

A contractor refreshes the home page. Until everything the panel draws has
arrived they see a loader; then the whole
panel appears at once: today's figure, the week's bars in their client colors,
the month, and the legend. Nothing on it changes color, size or position
after it appears.

**Why this priority**: This is the jank the issue names, on the screen every
session opens to.

**Independent Test**: Load the home page with slowed responses and confirm the
panel goes from the loader (or blank) to complete in one step, with no
intermediate state where bars are uncolored, the legend is empty, or rows
shift.

**Acceptance Scenarios**:

1. **Given** a contractor with entries for three clients this week, **When**
   they refresh the home page, **Then** the week's bars first appear already
   in their client colors and the legend names all three clients.
2. **Given** a slow connection, **When** the home page loads, **Then** the
   loader shows in the content area until the panel appears; the rail,
   header and dock stay in place throughout.
3. **Given** a fast connection, **When** the home page loads, **Then** no
   loader flashes; the panel appears directly.
4. **Given** a contractor with no entries yet, **When** the home page loads,
   **Then** the panel appears in its empty state, never stuck on the
   loader.

---

### User Story 2 - The menu bar panel appears whole (Priority: P1)

A contractor launches the macOS app and opens the menu bar panel. The timer,
the recent tasks, the projects and the figures appear together, not one after
another.

**Why this priority**: The same jank on the client the contractor touches most
often, and it is independently fixable.

**Independent Test**: Launch the app with slowed responses and open the panel;
confirm it changes from loading to complete in one step, and that the total
wait is no longer than the slowest single piece of data.

**Acceptance Scenarios**:

1. **Given** a fresh launch, **When** the contractor opens the panel, **Then**
   the timer, recent tasks, project picker and figures appear in the same
   frame.
2. **Given** one secondary piece of data fails to load (for example the
   figures), **When** the panel opens, **Then** everything else appears and
   the failed piece shows its own unavailable state; the timer still works.

---

### User Story 3 - Reopening shows the last known numbers at once (Priority: P2)

A contractor who has used Stint before refreshes the home page or relaunches
the menu bar app. The screen shows the numbers it showed last time
immediately, then quietly updates any that changed once the server answers.

**Why this priority**: Turns every reload after the first from a wait into an
instant paint. It builds on stories 1 and 2 but is not needed for them.

**Independent Test**: Load the home page once, reload it with the network
slowed, and confirm the previous panel appears immediately and only values
that actually changed update when the server answers.

**Acceptance Scenarios**:

1. **Given** a contractor who loaded the home page earlier, **When** they
   reload it, **Then** the previous panel appears with no loader.
2. **Given** an entry was added from another device since the last visit,
   **When** the contractor reloads, **Then** the last known panel shows first
   and the affected figures update once the server answers; the rest stay
   still.
3. **Given** a contractor signs out, **When** a different account signs in on
   the same browser or Mac, **Then** none of the first account's numbers are
   ever shown.

---

### Edge Cases

- A request in a region fails: the region shows the existing error state, not
  a loader that never ends.
- The last known data is from an earlier day or week: it may show only for
  the moment before the server answers, and the server's answer replaces it.
- The last known data was saved by an older app version with a different
  shape: it is discarded and the screen loads as on first visit.
- A timer is running in the last known data but was stopped elsewhere: the
  server's answer wins (Constitution III).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each region of a screen MUST appear in a single step, with all
  of the data it draws; it MUST NOT render with part of its data and fill in
  the rest later.
- **FR-002**: The home panel's weekly per-client breakdown MUST arrive with
  the rest of the panel's figures, so the panel no longer waits on two
  requests in series.
- **FR-003**: While a screen waits, it MUST show one shared loader, the word
  "Loading", centered in the content area. The app's frame (rail, header,
  dock) MUST stay in place; only the content area changes.
- **FR-004**: The loader MUST NOT resemble data: no partial content, zero or
  empty row is ever drawn in its place.
- **FR-005**: The loader MUST appear only when loading takes longer than
  800ms; a faster load goes from blank straight to the content.
- **FR-006**: The menu bar panel MUST request its data in parallel and update
  in one step once the data it needs has arrived.
- **FR-007**: A failure in one secondary piece of the menu bar panel MUST NOT
  hold back the rest; the timer stays usable.
- **FR-008**: On reopen, the web app and the macOS app MUST show the last
  known data at once and replace it with the server's answer when it arrives.
- **FR-009**: Last known data MUST be cleared on sign-out and MUST never be
  shown to a different account.
- **FR-010**: The treatment MUST cover every web screen that loads data
  (home, clients, invoices, calendar, settings, and the dock) and the macOS
  menu bar panel.

### Key Entities

- **Region**: a part of a screen that appears as a unit (on home: the panel;
  on macOS: the menu bar panel). Appears in a single paint, behind the shared
  loader until then.
- **Last known data**: the most recent server answer for a region, kept on
  the device per account, shown on reopen until the server answers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a home page load, the panel goes from loading to complete in
  exactly one visible step, with zero intermediate states.
- **SC-002**: On a menu bar panel open after launch, the panel updates once,
  down from one update per piece of data.
- **SC-003**: The home panel's time to complete drops by at least the length
  of one server round trip, since it no longer waits on two requests in
  series.
- **SC-004**: A reload after the first visit shows the panel's content with
  no loader.
- **SC-005**: Zero cases of one account's numbers appearing for another
  account on a shared browser or Mac.

## Assumptions

- The data shown on reopen is shown without a "stale" marker; it is replaced
  within a moment and only values that changed move.
- Errors keep the existing error states; this feature changes loading, not
  failure handling.
