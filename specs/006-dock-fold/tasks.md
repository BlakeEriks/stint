# Tasks: The dock folds on workspace screens

**Input**: `specs/006-dock-fold/` (spec.md, plan.md, research.md, quickstart.md)

Tests: Constitution V. The hook is client logic, tested first in
`apps/web/test/ui`; each visible state is a story.

## Phase 1: Foundational

- [ ] T001 Export `inboxCount(attention)` (sum of the five attention lists) from `apps/web/src/components/inbox.tsx` and use it for the Inbox header's count
- [ ] T002 Write `apps/web/test/ui/use-dock-fold.test.tsx` first: toggling a region opens it, pressing it again closes it, the other region swaps, a pathname change closes it, and `XL` not matching closes it
- [ ] T003 Implement `useDockFold()` in `apps/web/src/lib/client/use-dock-fold.ts`: stores `{ region, path }`, derives the open region from `usePathname()` and `useMediaQuery(XL)`; T002 passes

## Phase 2: User Story 1 - Check the Inbox without leaving the workspace (P1)

**Independent test**: On New invoice at `xl`, choose a client, open the Inbox from the strip, press Escape; focus is on the Inbox icon and the client is still chosen.

- [ ] T004 [US1] Create `apps/web/src/components/dock-strip.tsx`: a 44px `aside` ("Inbox and Today"), hidden except `xl:group-has-[[data-workspace]]/app:flex`, with an Inbox ghost icon button carrying the `inboxCount` pill when above zero, `aria-label` "Inbox" or "Inbox, N items", a `title`, and a non-modal Radix `Popover` (`side="left"`, `align="start"`, 286px, elevated surface, scrolls within the available height) holding `<Inbox stats>`; open state from `useDockFold()`
- [ ] T005 [US1] In `apps/web/src/components/app-shell.tsx`, give a workspace at `xl` a 44px third column and mount `DockStrip` beside `Dock`; in `apps/web/src/components/dock.tsx`, hide the full dock on a workspace at `xl` only, so below `xl` the band shows
- [ ] T006 [P] [US1] `apps/web/src/components/dock-strip.stories.tsx`: Strip (count shown), Clear (no count), InboxOpen (opens, Escape closes, focus returns), StatsFailed (no count, the open Inbox says it couldn't load) — inside a workspace frame
- [ ] T007 [US1] Update `apps/web/src/components/app-shell.stories.tsx` Workspace story: at `wide` the strip shows and the full dock doesn't; add WorkspacePhone, where the band shows and the strip doesn't

## Phase 3: User Story 2 - Glance at Today from a workspace (P2)

**Independent test**: On a workspace at `xl`, open Today from the strip; it lists today's entries and earnings; an entry opens its editor over the fold.

- [ ] T008 [US2] Add the Today icon and popover to `apps/web/src/components/dock-strip.tsx`, holding `EntryList` with the same props the dock passes
- [ ] T009 [P] [US2] Stories in `apps/web/src/components/dock-strip.stories.tsx`: TodayOpen; EditFromToday (the editor opens over the fold, closing it leaves Today open)

## Phase 4: Polish

- [ ] T010 Update `.claude/rules/web-ui.md`: the folded dock's strip as a third icon-only exception, and the workspace line in Layout
- [ ] T011 Update comments that say a workspace has no dock: `apps/web/src/components/page.tsx`, `app-shell.tsx`, `dock.tsx`, and the Workspace stories in `invoice-new.stories.tsx` and `calendar.stories.tsx`
- [ ] T012 Run `test:ui`, `test:stories`, lint, typecheck; verify `quickstart.md` in the dev server at desktop and phone widths

## Dependencies

T001 and T002–T003 before US1. US2 builds on T004's component. T006/T009 can be written alongside the component they render.
