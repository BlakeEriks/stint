# Tasks: Invoices can come from more than one business

**Input**: `specs/020-business-profiles/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Preparatory refactor

- [x] T001 The one-default rules into `apps/web/src/lib/profiles.ts`, parameterized by table; `/payment-profiles` onto it, its tests unchanged and passing

## Phase 2: Foundational

- [x] T002 `resolvePaymentProfile()` renamed `resolveProfile()` in `packages/core/src/payment.ts`, its tests in `payment.test.ts` unchanged
- [x] T003 (dropped: no second resolver; T002's serves both kinds)
- [x] T004 Migrations: `business_profiles` with RLS, the connected-app fence and grants; `invoices.business_profile_id`; `stamp_invoice_parties` and `create_invoice`; the backfill (the drop waits for a later PR). `scripts/verify-schema.mjs`
- [x] T005 Schemas in `packages/schema`: `BusinessProfile`, its create and update; `Settings` minus four fields; `CreateInvoice.businessProfileId`, `Invoice.businessProfileId`

## Phase 3: User Story 2, the list (P1)

- [x] T006 [US2] Route tests first: the business kind's wiring in `apps/web/test/invoices.test.ts` (the one-default tests already cover the shared handlers through payment profiles), the replay in `routes.test.ts` for both kinds; a cross-user case in `rls.test.ts`
- [x] T007 [US2] `/business-profiles` routes and `rows.ts`
- [x] T008 [US2] Stories first: Settings' Businesses, empty and two; then `ProfileRows` shared by both sections, `business-profiles.tsx`, `business-dialog.tsx` on profiles; Settings' Business identity section removed

## Phase 4: User Stories 1 and 3, the invoice (P1, P2)

- [x] T009 [US1] Invoice tests first in `apps/web/test/invoices.test.ts`: stamped from the chosen, carried and default business; an archived pick refused; no business, or one with no email, refused with nothing written
- [x] T010 [US1] `loadBusiness()` in `apps/web/src/lib/drafts.ts`, the create route
- [x] T011 [US1] Stories first: New invoice's From menu, and the missing-business notice; then the From menu (shared `ProfileMenu`) and the resolved business on the page in `invoice-new.tsx`
- [x] T012 The fake API in `apps/web/src/mocks/`, and `scripts/seed-account.mjs`

## Phase 5: Polish

- [x] T013 `docs/api.md`, `docs/data-model.md`, `docs/voice.md`
- [ ] T014 Verify: doc drift, `pnpm verify:static`, `TT=tt_838 pnpm db:setup && TT=tt_838 pnpm verify:db`, seen in local Stint
