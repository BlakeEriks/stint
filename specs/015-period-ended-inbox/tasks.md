# Tasks: Say in the Inbox when billable work is past due to bill

**Input**: `specs/015-period-ended-inbox/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Foundational

- [x] T001 Core tests first in `packages/core/test/live-draft.test.ts`: `unbilledDue()` for the last ended period, every ended period in one row, unscheduled at 29/30/31 days, non-billable and clientless work, the user zone, covered by draft/sent/paid and not by void, no entry in both it and `lateEntries()`, one row per client oldest first
- [x] T002 `unbilledDue()` and `UNBILLED_DUE_DAYS` in `packages/core/src/live-draft.ts`
- [x] T003 `attention.unbilledDue` in `packages/schema/src/stats.ts`

## Phase 2: User Story 1 (P1)

- [x] T004 [US1] Route test first in `apps/web/test/invoices.test.ts`: due; a draft covers it; void brings it back; Billed elsewhere clears it; archived clears it
- [x] T005 [US1] The read and the call in `apps/web/src/lib/stats.ts` and `apps/web/src/mocks/derive.ts`
- [x] T006 [US1] UI tests first: `linkedDraft()` in `apps/web/test/ui/invoice-new.test.tsx`; the count in `apps/web/test/ui/inbox.test.tsx`
- [x] T007 [US1] The row with Create invoice and Billed elsewhere in `apps/web/src/components/inbox.tsx`
- [x] T008 [US1] `linkedDraft()` in `apps/web/src/components/invoice-new.tsx`, with Suspense in its page
- [x] T009 [US1] Stories in `dock.stories.tsx`: one period, across months, a calendar month, several periods, unscheduled, Billed elsewhere; `invoice-new.stories.tsx` FromInboxLink; the Clear stories bill old work elsewhere

## Phase 3: Polish

- [x] T010 `docs/api.md`
- [x] T011 Verify: doc drift, `pnpm verify:static`, `TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`, seen in local Stint
