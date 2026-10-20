# Tasks: Gate the invoice document

**Input**: `specs/007-invoice-gate/` (plan, spec, research, data-model, contracts/invoice-document.md)

**Tests**: Required by Constitution V (a route, a policy, money). Each test
task goes before the code it covers and must fail first. Invoicing route
tests live in `apps/web/test/invoices.test.ts`, the invoicing half of the
route suite (same harness as `routes.test.ts`, real Postgres).

## Phase 1: Setup

- [X] T001 Build private test databases `tt_f61` and `tt_f61_rls` with `PGPORT=54322 bash scripts/ci-db.sh` (never the shared `tt`/`tt_rls`)

## Phase 2: Foundational

- [X] T002 [P] Test `documentOpens` in `packages/core/test/billing.test.ts`: open when billing is unavailable whatever the plans; open for a paid plan with a null issued status; open for a free plan with an issued status of `active`, `trialing` or `past_due`; closed for a free plan with an issued status of null, `canceled`, `unpaid` or `incomplete`
- [X] T003 Implement `documentOpens(billingAvailable, plan, issuedStatus)` in `packages/core/src/billing.ts` (exported through `packages/core/src/index.ts`)
- [X] T004 Write migration `supabase/migrations/<timestamp>_invoice_issued_plan.sql` (name via `date -u +%Y%m%d%H%M%S`): add `invoices.issued_subscription_status` "`text`, null" (no check of its own: it copies the checked `subscriptions.status`); a `before insert` trigger sets it from the inserting user's `subscriptions.status` (null when none) "whatever the insert supplied"; a `before update` trigger raises `check_violation` when it changes
- [X] T005 [P] Add `PAYMENT_REQUIRED` to `ErrorCode` in `packages/schema/src/index.ts` and to `Code`/`STATUS` (402) in `apps/web/src/lib/errors.ts`
- [X] T006 [P] Add `issued_subscription_status` to `InvoiceRow` and `INVOICE_COLUMNS` in `apps/web/src/lib/rows.ts` (not to the `Invoice` the API returns)
- [X] T007 In `apps/web/test/invoices.test.ts`, clear `subscriptions` and the Stripe env vars in `beforeEach`, and add `configureBilling()` and `subscribe(status)` helpers

## Phase 3: User Story 1 + 2 - Free users meet the gate; paying users pass (P1)

**Goal**: The server refuses the document to a free user, in both dispositions, and serves a paying one.
**Independent test**: with billing configured, the PDF route answers 402 for a free user and 200 for an active one.

- [X] T008 [US1] Route tests in `apps/web/test/invoices.test.ts`: billing configured and no subscription → `GET /invoices/:id/pdf` 402 `PAYMENT_REQUIRED` with and without `?download=1`; another user's or a missing invoice → 404, not 402; `POST /invoices/preview` and `POST /invoices` still succeed for that user; `GET /invoices/:id` returns `canDownload: false`
- [X] T009 [US2] Route tests in `apps/web/test/invoices.test.ts`: an `active` and a `past_due` subscriber get 200 for an invoice generated before subscribing, both dispositions, and `canDownload: true`
- [X] T010 [US1] Gate `GET` in `apps/web/src/app/api/v1/invoices/[id]/pdf/route.ts`: after `loadPdfData`, `entitlement(db)`, then `documentOpens(...)`, else throw `ApiError('PAYMENT_REQUIRED', …)` before rendering
- [X] T011 [US1] Add `canDownload` to `GET` in `apps/web/src/app/api/v1/invoices/[id]/route.ts` with the same call (one helper in `apps/web/src/lib/invoicing.ts` both routes use)

## Phase 4: User Story 3 - Canceling never locks what was generated while paying (P1)

**Independent test**: generate while active, set the subscription `canceled`, the PDF still opens; an invoice generated after it's refused.

- [X] T012 [US3] Route tests in `apps/web/test/invoices.test.ts`: generated while `active` then subscription `canceled` → 200 and `canDownload: true`; generated while `canceled` → 402; generated while free, then subscribed, then `canceled` → 402
- [X] T013 [P] [US3] RLS tests in `apps/web/test/rls.test.ts`: a free user inserting an invoice with `issued_subscription_status = 'active'` gets null stored; a user's update changing it on their own draft is refused; an insert while their subscription is `active` stores `active`
- [X] T014 [US3] Make T012–T013 pass (the trigger from T004; fix anything they reveal)

## Phase 5: User Story 4 - Nothing changes until billing is set up (P1)

- [X] T015 [US4] Route test in `apps/web/test/invoices.test.ts`: billing unconfigured, no subscription → PDF 200 both dispositions, `canDownload: true`. The existing PDF tests pass unchanged.

## Phase 6: The screen

- [X] T016 Add `canDownload: boolean` to the invoice detail type in `apps/web/src/lib/client/api.ts`, to `invoiceDetail` in `apps/web/src/mocks/respond.ts`, and compute it in the `invoice` handler in `apps/web/src/mocks/handlers.ts` with `documentOpens(db.billing.available, db.billing.plan, null)`
- [X] T017 [US1] Story in `apps/web/src/components/invoice-detail.stories.tsx`: `Locked` (free account) shows "Subscribe to download" linking to `/settings`, the paid-plan line with the price and that records and their export stay free, and no Download PDF or Preview; existing stories run on a paid account so they're unchanged; `LockedPhone`
- [X] T018 [US1] Implement the locked header in `apps/web/src/components/invoice-detail.tsx` per the spec's Design section; take the price from one place shared with `apps/web/src/components/plan-section.tsx`
- [X] T019 [P] Plan section free description in `apps/web/src/components/plan-section.tsx` adds that records and their export stay free; update the `Free` story's assertion in `apps/web/src/components/plan-section.stories.tsx`

- [X] T023 [US1] Inbox (found while verifying): `apps/web/src/components/inbox.tsx` hides it by `documentOpens(billing.available, billing.plan, null)`; `InvoiceDownloads` and `InvoiceDownloadsFree` stories in `apps/web/src/components/dock.stories.tsx`

## Phase 7: Polish

- [X] T020 [P] `docs/api.md`: the PDF row names the 402 and the rule; the `GET /invoices/:id` row names `canDownload`; `PAYMENT_REQUIRED` in the errors table
- [X] T021 Run `pnpm --filter @stint/core test`, the web route, RLS and stories suites against the private databases, `pnpm lint`, `pnpm typecheck`, `pnpm verify:schema`
- [X] T022 Verify in the local dev server signed in: an invoice opens as before with billing dark

## Dependencies

T001 → T008+. T002 → T003. T004–T007 before the story phases. US1/US2 share
the route (T010–T011); US3 and US4 are tests on the same rule. The screen
(T016–T019) needs T011.

## Implementation strategy

One PR, since the gate is useless without the record that keeps it fair
(US3) and invisible until billing is configured (US4). Server first, then
the screen.
