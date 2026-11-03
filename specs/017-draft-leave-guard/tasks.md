# Tasks: Leaving New invoice with changes offers to save the draft

**Input**: [plan.md](plan.md), [spec.md](spec.md)

## Phase 1: A draft may have nothing to bill (User Story 3)

Foundational: Save draft on a half-filled form needs it.

- [ ] T001 [US3] Flip the empty-period case to null in `packages/core/test/refusals.test.ts`, and the route test to "an empty draft is created and Mark sent refuses it" in `apps/web/test/invoices.test.ts`; see both fail
- [ ] T002 [US3] Drop the empty case and the period argument from `pricedInvoiceRefusal` in `packages/core/src/refusals.ts`, and its callers in `apps/web/src/app/api/v1/invoices/route.ts`, `apps/web/src/app/api/v1/invoices/[id]/route.ts` and `apps/web/src/mocks/handlers.ts`
- [ ] T003 [US3] Drop the one-line minimum from `generateState` in `apps/web/src/components/invoice-new.tsx`, and correct the generation comment (FR-008)

## Phase 2: Leaving with changes asks (User Stories 1 and 2)

- [ ] T004 [US1] Write `apps/web/test/ui/use-leave-guard.test.tsx`: which clicks are held (plain same-origin leaving link) and which pass (modifier, new tab, download, same page, other origin, unchanged form), and that unload is prevented only while changed; see it fail
- [ ] T005 [US1] Write `apps/web/src/lib/client/use-leave-guard.ts`
- [ ] T006 [US1] Give `ConfirmDialog` a secondary action and a disabled confirm in `apps/web/src/components/confirm-dialog.tsx`
- [ ] T007 [US1] [US2] Wire the form in `apps/web/src/components/invoice-new.tsx`: changed state, the dialog, the reason Save draft can't save, Save draft as the Generate press
- [ ] T008 [US1] [US2] Stories in `apps/web/src/components/invoice-new.stories.tsx`: leaving untouched doesn't ask; leaving changed asks and Keep editing keeps it; Discard leaves; Save draft creates and opens the draft; a blocked form says why
- [ ] T009 Update `docs/api.md` for `POST /invoices` and `PATCH /invoices/:id`

## Phase 3: Verify

- [ ] T010 Doc drift, `pnpm verify:static`, `TT=tt_583 pnpm verify:db`, seen in the running app per [quickstart.md](quickstart.md)
