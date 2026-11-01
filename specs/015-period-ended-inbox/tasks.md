# Tasks: Say in the Inbox when a client is ready to invoice

**Input**: `specs/015-period-ended-inbox/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Foundational

- [x] T001 Core tests first in `packages/core/test/live-draft.test.ts`: `unbilledDue()` for the last ended period, not an earlier or open one, no schedule, non-billable and clientless work, the user zone, an overlapping invoice, whole or partial, at each bound
- [x] T002 `unbilledDue()` in `packages/core/src/live-draft.ts`
- [x] T003 `attention.unbilledDue` in `packages/schema/src/stats.ts`

## Phase 2: User Story 1 (P1)

- [x] T004 [US1] Route test first in `apps/web/test/invoices.test.ts`: the row; archived clears it; a draft covers it; void brings it back; a paid invoice stops it
- [x] T005 [US1] The read and the call in `apps/web/src/lib/stats.ts` and `apps/web/src/mocks/derive.ts`
- [x] T006 [US1] UI tests first: what `linkedDraft()` ignores in `apps/web/test/ui/invoice-new.test.tsx`
- [x] T007 [US1] The row in `apps/web/src/components/inbox.tsx`
- [x] T008 [US1] `linkedDraft()` in `apps/web/src/components/invoice-new.tsx`, with Suspense in its page
- [x] T009 [US1] Stories in `dock.stories.tsx`: one period with the count, a calendar month, across months; `invoice-new.stories.tsx` FromInboxLink and PressedFromTheInbox

## Phase 3: Polish

- [x] T010 `docs/api.md`
- [x] T011 Verify: doc drift, `pnpm verify:static`, `TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`, seen in local Stint
