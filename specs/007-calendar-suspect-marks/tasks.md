# Tasks: The calendar marks its own suspect entries

**Input**: `specs/007-calendar-suspect-marks/` (spec.md, plan.md, research.md, quickstart.md)

Tests: Constitution V. The helper is client logic, tested first in
`apps/web/test/ui`; each visible state is a story.

## Phase 1: Foundational

- [X] T001 Write `apps/web/test/ui/suspects.test.tsx` first: an overlap marks only its `entryId`, with "overlaps <other>" ("another entry" when untitled, "on <invoice>" when billed); a strange duration gives "unusually short" or "unusually long"; one entry with both gets both reasons in that order; an unprojected entry gives none; empty attention gives an empty map
- [X] T002 Implement `suspectEntries(attention)` in `apps/web/src/lib/client/suspects.ts`, returning `Map<entryId, string[]>` from `attention.overlaps` and `attention.strangeDurations`, worded as `apps/web/src/components/inbox.tsx` words them; T001 passes

## Phase 2: User Story 1 - See a suspect entry where it is (P1)

**Independent test**: On the calendar, an entry overlapping another is marked with a warning border and glyph, its name ends with "overlaps <other>", and the other entry is not marked.

- [X] T003 [US1] In `apps/web/src/components/calendar.tsx`, read `keys.stats(tz)` / `api.stats(tz)` in `Calendar`, build `suspectEntries(...)` (empty when the query has no data), pass each block its reasons through `DayColumn` to `EntryBlock`; a marked block uses `border-timer-warning` in place of `border-edge-subtle`, shows a 12px `TriangleAlert` in `text-warning` in its top-right corner (`aria-hidden`), and appends the reasons to its `aria-label` and `title`; it still opens the editor when pressed (FR-007)
- [X] T004 [P] [US1] Stories in `apps/web/src/components/calendar.stories.tsx`, each from the account (`account((db) => …)`): SuspectOverlap (a block moved into its neighbor: the later one is marked "overlaps …", the other isn't), SuspectLong (a block past the long threshold: "unusually long"), SuspectBoth (one block with both reasons, one glyph), SuspectPhone (the day view marks the same block), StatsFailed (`failing('stats')`: the grid draws, nothing is marked, no error on the calendar), MarkFollowsEdit (scenarios 3 and 4: in the editor, move an entry's start into its neighbor and save — the mark appears without a reload; move it back and save — the mark goes), EditSuspect (scenario 5: pressing a marked block opens Edit entry)

## Phase 3: Polish

- [ ] T005 Run `test:ui`, `test:stories` for the calendar, lint, typecheck; verify `quickstart.md` in the dev server at desktop and phone widths

## Dependencies

T001 → T002 → T003. T004 can be written alongside T003 and passes once T003 lands.

## Implementation Strategy

One story; it ships whole. MVP is T001–T004.
