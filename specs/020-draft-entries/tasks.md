# Tasks: A draft lists the entries it bills, each one editable in place

**Input**: [plan.md](plan.md), [spec.md](spec.md)

## Phase 1: The read (foundational)

- [ ] T001 Write `entryAmount` cases (billable, non-billable, unrated) in `packages/core/test/invoice.test.ts`; see them fail
- [ ] T002 Add `entryAmount` to `packages/core/src/invoice.ts`
- [ ] T003 Write the route test in `apps/web/test/invoices.test.ts`: a draft's `entries` carry amounts, null for a non-billable one; a sent invoice's carry none; see it fail
- [ ] T004 Add `InvoiceEntry` to `packages/schema/src/invoicing.ts`; write `apps/web/src/lib/invoice-entries.ts`; return `entries` from `apps/web/src/app/api/v1/invoices/[id]/route.ts`
- [ ] T005 Return `entries` from the mock (`apps/web/src/mocks/derive.ts`, `handlers.ts`, `respond.ts`) and type it in `apps/web/src/lib/client/api.ts`

## Phase 2: The section (User Stories 1, 2 and 3)

- [ ] T006 [US1] [US2] [US3] Stories in `apps/web/src/components/invoice-detail.stories.tsx`: a draft lists its entries; a row opens the dialog and a save refreshes the draft; unrated and non-billable rows say why; a sent invoice lists hours and no button; a void one has no section; phone
- [ ] T007 [US1] [US2] [US3] Write `apps/web/src/components/invoice-entries.tsx` and render it from `invoice-detail.tsx`
- [ ] T008 Drop the names from the no-rate notice in `invoice-detail.tsx` (Constitution VII)
- [ ] T009 Update `docs/api.md` for `GET /invoices/:id`

## Phase 3: Verify

- [ ] T010 Doc drift, `pnpm verify:static`, `TT=tt_793 pnpm verify:db`, seen in the running app per [quickstart.md](quickstart.md)
