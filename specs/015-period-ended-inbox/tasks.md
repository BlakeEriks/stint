# Tasks: Say in the Inbox when a scheduled period has ended with no invoice

**Input**: `specs/015-period-ended-inbox/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Foundational

- [x] T001 Core tests first in `packages/core/test/live-draft.test.ts`: `periodsDue()` raises a row for billable unbilled time or a one-off expense in the last ended period; none for non-billable time, a recurring expense alone, or an empty period; none when a draft, sent or paid invoice shares a day with it, one when the only one is void; the period follows today in `tz`, including on a period's last day
- [x] T002 `periodsDue()` in `packages/core/src/live-draft.ts`, exported through `packages/core/src/index.ts`
- [x] T003 `attention.periodsDue` in `packages/schema/src/stats.ts`

## Phase 2: User Story 1 - See that a period has ended with no invoice (P1)

- [x] T004 [US1] Route test first in `apps/web/test/routes.test.ts`: `GET /stats` lists a monthly client with work last month; a draft for that month clears it; voiding the draft brings it back; an archived client gets none
- [x] T005 [US1] Load scheduled clients and unbilled one-off expenses and call `periodsDue()` in `apps/web/src/lib/stats.ts`; the same in `apps/web/src/mocks/derive.ts`
- [x] T006 [US1] UI test first in `apps/web/test/ui`: the row names the client, the time and "September ended with no invoice", or the dates for another schedule, and Create invoice links to `/invoices/new?client=…&from=…&to=…`; `draftFromLink()` takes a known client and valid dates and ignores anything else
- [x] T007 [US1] The row in `apps/web/src/components/inbox.tsx`, counted by `inboxCount`
- [x] T008 [US1] `draftFromLink()` and the first draft in `apps/web/src/components/invoice-new.tsx`, with Suspense in `apps/web/src/app/(app)/invoices/new/page.tsx`
- [x] T009 [US1] Stories in `apps/web/src/components/dock.stories.tsx`: the row for a monthly client; and in `invoice-new.stories.tsx`, the form filled in from the link

## Phase 3: Polish

- [x] T010 `docs/api.md`
- [x] T011 Verify: doc drift, `pnpm verify:static`, `TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`, seen in local Stint

## Dependencies

T001 before T002; T002–T003 before Phase 2. T004 before T005; T006 before T007–T008.
