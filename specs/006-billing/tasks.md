# Tasks: Subscribe, and know who has

**Input**: `specs/006-billing/` (plan, spec, research, data-model, contracts/billing.md)

**Tests**: Required by Constitution V (money, writes, routes, a policy). Each
test task goes before the code it covers and must fail first.

## Phase 1: Setup

- [ ] T001 Add `stripe@22.6.2` to `apps/web/package.json` dependencies and install
- [ ] T002 [P] Stub a `service_role` role (nologin, bypassrls) beside `anon` and `authenticated` in `scripts/ci-db.sh`
- [ ] T003 [P] Build private test databases `tt_f60` and `tt_f60_rls` with `PGPORT=54322 bash scripts/ci-db.sh` (memory: private test databases)

## Phase 2: Foundational

- [ ] T004 [P] Test `planOf` and `paymentFailed` in `packages/core/test/billing.test.ts`: paid for `active`, `trialing`, `past_due`; free for `incomplete`, `incomplete_expired`, `unpaid`, `canceled`, `paused` and null; failed for `past_due`, `unpaid`
- [ ] T005 Implement `packages/core/src/billing.ts` (`SubscriptionStatus`, `planOf`, `paymentFailed`) and export it from `packages/core/src/index.ts`
- [ ] T006 Write migration `supabase/migrations/00000000000036_subscriptions.sql`: table per data-model.md ("`user_id` uuid PK references auth.users on delete cascade", "`stripe_customer_id` text not null unique", "`stripe_subscription_id` text not null", "`status` text not null, check in the eight Stripe values", "`current_period_end` timestamptz not null", "`cancel_at_period_end` boolean not null default false", "`updated_at` timestamptz not null default now()"), RLS on, `select_own_subscription`, grant select to `authenticated`, select/insert/update to `service_role`, revoke all from `anon`
- [ ] T007 [P] Add `subscriptions` to `EXPECTED` in `scripts/verify-schema.mjs`
- [ ] T008 [P] Add `Billing`, `BillingSync`, `BillingRedirect` and the codes `ALREADY_SUBSCRIBED`, `NOT_SUBSCRIBED`, `CHECKOUT_NOT_FOUND`, `BILLING_UNAVAILABLE` to `packages/schema/src/index.ts`; mirror the codes and statuses (409, 409, 404, 503) in `apps/web/src/lib/errors.ts`
- [ ] T009 Add `serviceClient()` to `apps/web/src/lib/supabase.ts` (test seam first, then `SUPABASE_SECRET_KEY`)
- [ ] T010 Add `apps/web/src/lib/stripe.ts`: `billingConfig()` (null unless all three Stripe env vars), `stripe()` returning `__TEST_STRIPE__` or a real client, and the narrow `StripeApi` interface
- [ ] T011 Add `apps/web/test/fake-stripe.ts` implementing `StripeApi` in memory, and wire it plus the env vars into `apps/web/test/routes.test.ts` setup; clear `subscriptions` in `beforeEach`

## Phase 3: User Story 2 - Know who has paid (P1)

**Goal**: one server answer to "is this user paid", following Stripe.
**Independent test**: deliver signed webhook events and read `GET /billing`.

- [ ] T012 [US2] Route tests in `apps/web/test/routes.test.ts`: `GET /billing` free with no row and `available` from config; webhook rejects a bad or missing signature (400) and changes nothing; a signed `customer.subscription.updated` stores the fake's current state; the same event twice leaves one identical row; an old event after a newer state still leaves the current state; an unknown customer is acknowledged with 200; unconfigured webhook answers 503
- [ ] T013 [P] [US2] RLS tests in `apps/web/test/rls.test.ts`: a user reads their own subscription and not another's; `authenticated` cannot insert, update or delete a subscription; add the table to the every-table checks
- [ ] T014 [US2] Implement `apps/web/src/lib/billing.ts`: `syncCustomer(customerId)` (list the customer's subscriptions, prefer a paid one, read `user_id` from metadata and period end from the first item, upsert through `serviceClient()`, report a second paid subscription to Sentry) and `entitlement(db)` (own row → `Billing`)
- [ ] T015 [US2] Implement `GET` in `apps/web/src/app/api/v1/billing/route.ts`
- [ ] T016 [US2] Implement `POST` in `apps/web/src/app/api/v1/billing/webhook/route.ts`: raw body, `constructEventAsync`, sync for the events in research R3, acknowledge the rest

## Phase 4: User Story 1 - Subscribe (P1)

**Goal**: Settings → Checkout → paid.
**Independent test**: with the fake Stripe, checkout returns a URL; sync after return reports paid.

- [ ] T017 [US1] Route tests: checkout returns the fake's URL with the price, `client_reference_id`, metadata, renewal text, required terms consent, no `automatic_tax` (FR-015) and return URLs; reuses a stored customer; 409 when paid; 503 when unconfigured; sync with the user's session stores and returns paid; sync with another user's session is 404
- [ ] T018 [US1] Implement `apps/web/src/app/api/v1/billing/checkout/route.ts`
- [ ] T019 [US1] Implement `apps/web/src/app/api/v1/billing/sync/route.ts`
- [ ] T020 [P] [US1] Add `billing`, `checkout`, `syncCheckout` to `apps/web/src/lib/client/api.ts` and `billing()` to `apps/web/src/lib/client/query-keys.ts`
- [ ] T021 [P] [US1] Add billing handlers and a `billing` field on the fake account in `apps/web/src/mocks/handlers.ts` and `apps/web/src/mocks/fixtures.ts`
- [ ] T022 [US1] Stories in `apps/web/src/components/plan-section.stories.tsx`: Free, Subscribing (pending), Confirming (asserts sync ran and `?checkout=` was removed), Paid, Unavailable (not rendered), Checkout failed
- [ ] T023 [US1] Implement `apps/web/src/components/plan-section.tsx` (free, subscribing, confirming, paid) and mount it in `apps/web/src/components/settings-page.tsx`

## Phase 5: User Story 3 - Cancel and update a card (P2)

- [ ] T024 [US3] Route tests: portal returns the fake's URL for the stored customer; 409 with no customer; `DELETE /account` cancels an active subscription before deleting, and does not delete when Stripe fails
- [ ] T025 [US3] Implement `apps/web/src/app/api/v1/billing/portal/route.ts`
- [ ] T026 [US3] Cancel first in `apps/web/src/app/api/v1/account/route.ts`
- [ ] T027 [US3] Stories Canceling and Manage-billing pending; implement Manage billing and "Paid until {date}" in `plan-section.tsx`; add `portal` to `api.ts`

## Phase 6: User Story 4 - Failed card (P2)

- [ ] T028 [US4] Route test: a `past_due` sync reports `plan: paid, paymentFailed: true`
- [ ] T029 [US4] Story PaymentFailed; implement the failed line and Update card in `plan-section.tsx`

## Phase 7: Polish

- [ ] T030 [P] Billing clause in `apps/web/src/app/terms/page.tsx` per FR-016, marked for legal review; Stripe as payment processor in `apps/web/src/app/privacy/page.tsx`
- [ ] T031 [P] Stripe and `SUPABASE_SECRET_KEY` env vars, and the Stripe dashboard settings (research R9, plus the terms URL Checkout's consent links), in `docs/deploying.md`
- [ ] T032 Run `pnpm verify:static`, the private-DB halves of `verify:db`, `verify:schema`, and the story suite; view Settings signed in locally
- [ ] T033 Standards review (`.claude/skills/standards-review/SKILL.md`), fix findings

## Dependencies

Setup → Foundational → US2 → US1 → US3 → US4 → Polish. US1's sync and US3's
portal use US2's `syncCustomer`. Within a story, tests come first.

## Parallel

T002/T003; T004 with T006–T008; T013 with T012; T020/T021 with T018–T019;
T030/T031.

## Strategy

US2 + US1 are the MVP: a user can pay and the server knows. US3 and US4 are
built in the same PR since the section stays dark until Blake configures it.
