# Tasks: New invoice offers to include unbilled work dated just before its period

**Input**: `specs/016-earlier-unbilled/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Foundational

- [ ] T001 Core tests first in `packages/core/test/billable.test.ts`: `earlierWorkFrom()` after the last invoice, 30 days with none, an invoice ending after the start ignored; `earlierWork()` none, one, several, all held, part held, a DST change
- [ ] T002 `earlierWorkFrom()` and `earlierWork()` in `packages/core/src/billable.ts`
- [ ] T003 `earlierWork` in `InvoicePreview`, `packages/schema/src/invoicing.ts`

## Phase 2: User Story 1 (P1)

- [ ] T004 [US1] Route test first in `apps/web/test/invoices.test.ts`: the preview's `earlierWork` (one entry after a sent invoice, a non-billable one left out, a void invoice ignored, the edited draft left out, another draft holding it), and the invoice generated from the moved start bills it
- [ ] T005 [US1] The reads and the call in `apps/web/src/app/api/v1/invoices/preview/route.ts` and `apps/web/src/mocks/derive.ts`
- [ ] T006 [US1] Stories first in `apps/web/src/components/invoice-new.stories.tsx`: one entry, several, held by a draft, and Include's `play`
- [ ] T007 [US1] The offer and Include in `apps/web/src/components/invoice-new.tsx`

## Phase 3: Polish

- [ ] T008 `docs/api.md`
- [ ] T009 Verify: doc drift, `pnpm verify:static`, `TT=tt_569 pnpm db:setup && TT=tt_569 pnpm verify:db`, seen in local Stint
