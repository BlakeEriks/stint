# Tasks: New invoice says when a draft holds this period's work

**Input**: `specs/019-held-work-notice/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Foundational

- [x] T001 Core tests first in `packages/core/test/billable.test.ts`: `heldWork()` none, one draft, two drafts, the edited draft left out
- [x] T002 `heldWork()` in `packages/core/src/billable.ts`
- [x] T003 `heldWork` in `InvoicePreview`, `packages/schema/src/invoicing.ts`

## Phase 2: User Story 1 (P1)

- [x] T004 [US1] Route test first in `apps/web/test/invoices.test.ts`: the preview names the holding draft and its count, and not the draft being edited
- [x] T005 [US1] The reads and the call in `apps/web/src/app/api/v1/invoices/preview/route.ts` and `apps/web/src/mocks/derive.ts`
- [x] T006 [US1] Stories first in `apps/web/src/components/invoice-new.stories.tsx`: the notice with a `play`, and a period no draft holds without it
- [x] T007 [US1] The notice in `apps/web/src/components/invoice-new.tsx`

## Phase 3: Polish

- [x] T008 `docs/api.md`
- [x] T009 Verify: doc drift, `pnpm verify:static`, `TT=tt_756 pnpm db:setup && TT=tt_756 pnpm verify:db`, seen in local Stint
