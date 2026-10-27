# Tasks: Mark entries as billed outside Stint

**Input**: `specs/013-billed-elsewhere/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Foundational

- [x] T001 `invoicedElsewhere` on `TimeEntry` and `UpdateTimeEntry`, and `MarkInvoicedElsewhere` (`{ ids, invoicedElsewhere }`) in `packages/schema/src/index.ts`
- [x] T002 `invoiced_elsewhere` in `ENTRY_COLUMNS`, `toEntry` and `ENTRY_FIELDS` in `apps/web/src/lib/rows.ts`

## Phase 2: User Story 1 - Mark a period's work billed elsewhere (P1)

- [x] T003 [US1] Route tests first in `apps/web/test/routes.test.ts`: marks only the user's finished, uninvoiced ids and returns them; Unbilled and a new invoice skip them, Earned keeps them; clearing restores them; another user's id changes nothing
- [x] T004 [US1] `POST /api/v1/entries/invoiced-elsewhere` in `apps/web/src/app/api/v1/entries/invoiced-elsewhere/route.ts`
- [x] T005 [US1] `api.markInvoicedElsewhere()` in `apps/web/src/lib/client/api.ts`, and its mock in `apps/web/src/mocks/handlers.ts`
- [x] T006 [US1] Billed elsewhere button and Undo toast in `apps/web/src/components/invoice-new.tsx`, with stories in `invoice-new.stories.tsx`

## Phase 3: User Story 2 - Mark or clear one entry (P2)

- [x] T007 [US2] Route test first: `PATCH /entries/:id` with `invoicedElsewhere: true` on an invoiced entry is `409 ENTRY_ALREADY_INVOICED`; on an unbilled one it round-trips
- [x] T008 [US2] The 409 in `apps/web/src/app/api/v1/entries/[id]/route.ts`
- [x] T009 [US2] UI test first in `apps/web/test/ui`: the dialog sends `invoicedElsewhere` only for an entry on no invoice
- [x] T010 [US2] Billed elsewhere checkbox in `apps/web/src/components/entry-dialog.tsx`, with stories

## Phase 4: Polish

- [x] T011 `docs/api.md` and `docs/data-model.md`
- [x] T012 Verify: doc drift, `pnpm verify:static`, `pnpm db:setup && pnpm verify:db`, seen in local Stint

## Dependencies

T001–T002 before both stories. T003 before T004; T007 before T008; T009 before T010.
