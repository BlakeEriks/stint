# Tasks: Invoices can come from more than one business

**Input**: `specs/020-business-profiles/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md)

## Phase 1: Preparatory refactor

- [ ] T001 The one-default rules into `apps/web/src/lib/profiles.ts`, parameterized by table; `/payment-profiles` onto it, its tests unchanged and passing

## Phase 2: Foundational

- [ ] T002 Core tests first in `packages/core/test/business.test.ts`: `resolveBusiness()` chosen, chosen archived, carried, carried archived, default, none
- [ ] T003 `resolveBusiness()` in `packages/core/src/business.ts`
- [ ] T004 Migrations: `business_profiles` with RLS, the connected-app fence and grants; `invoices.business_profile_id`; `stamp_invoice_parties` and `create_invoice`; the backfill; the drop. `scripts/verify-schema.mjs`
- [ ] T005 Schemas in `packages/schema`: `BusinessProfile`, its create and update; `Settings` minus four fields; `CreateInvoice.businessProfileId`, `Invoice.businessProfileId`

## Phase 3: User Story 2, the list (P1)

- [ ] T006 [US2] Route tests first: the one-default tests in `apps/web/test/invoices.test.ts` and the replay in `routes.test.ts` run for both kinds; a cross-user case in `rls.test.ts`
- [ ] T007 [US2] `/business-profiles` routes and `rows.ts`
- [ ] T008 [US2] Stories first: Settings' Businesses, empty and two; then `profile-list.tsx` shared by both sections, `business-profiles.tsx`, `business-profile-dialog.tsx`; Settings' Business identity section removed

## Phase 4: User Stories 1 and 3, the invoice (P1, P2)

- [ ] T009 [US1] Invoice tests first in `apps/web/test/invoices.test.ts`: stamped from the chosen, carried and default business; an archived pick refused; no business, or one with no email, refused with nothing written
- [ ] T010 [US1] `loadBusiness()` in `apps/web/src/lib/drafts.ts`, the create route
- [ ] T011 [US1] Stories first: New invoice's From menu, and the missing-business notice; then the From menu (shared `ProfileMenu`) and the resolved business on the page in `invoice-new.tsx`
- [ ] T012 The fake API in `apps/web/src/mocks/`, and `scripts/seed-account.mjs`

## Phase 5: Polish

- [ ] T013 `docs/api.md`, `docs/data-model.md`, `docs/voice.md`
- [ ] T014 Verify: doc drift, `pnpm verify:static`, `TT=tt_838 pnpm db:setup && TT=tt_838 pnpm verify:db`, seen in local Stint
