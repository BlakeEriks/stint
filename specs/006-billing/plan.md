# Implementation Plan: Subscribe, and know who has

**Branch**: `f60-billing` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-billing/spec.md`

## Summary

Stripe in test mode, hosted end to end. A Plan section in Settings reads
`GET /api/v1/billing`. Subscribe posts `/billing/checkout`, which returns a
Stripe Checkout URL for the one yearly price; Manage billing posts
`/billing/portal`, which returns a Customer Portal URL for cancel, resume,
card and receipts. The webhook `/billing/webhook` verifies Stripe's
signature, then re-reads the customer's subscription from Stripe and writes
it to a new `subscriptions` table, so a duplicate or out-of-order event
changes nothing. Back from Checkout, `/billing/sync` runs the same re-read
for the session the user just paid, so Settings confirms without waiting on
the webhook. Whether a user is paid is one pure function in
`packages/core` over the stored status, and one server helper that #61's
gate will call. Deleting an account cancels its subscription first. Every
billing write answers 503 until the Stripe env vars are set, and the Plan
section isn't rendered, so merging changes nothing a user sees.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: `stripe` (Node SDK, 22.6.2), TanStack Query via `useOptimisticMutation`, Zod in `@stint/schema`

**Storage**: Supabase Postgres: one new table, `subscriptions`, RLS select-own, written only by the server through the Supabase secret key

**Testing**: `routes.test.ts` against real Postgres with a fake Stripe client and real offline signatures; `rls.test.ts`; `packages/core/test`; stories per Plan state

**Target Platform**: The web app. macOS shows no plan.

**Project Type**: Web service and web client in the existing monorepo

**Performance Goals**: Settings confirms a payment within 10s (SC-002)

**Constraints**: Test mode only, keys from env; no fixed cost; no app mail; never touch production

**Scale/Scope**: Launch: the bet is 15 subscribers

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Billing writes only the subscription mirror, which is Stripe's record, not user data. Canceling locks nothing. Account deletion cancels the subscription only because the user asked to delete. |
| II. Logic written twice has a parity test | No | The paid rule exists once, in `packages/core` (`planOf`). SQL stores status only and decides nothing. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Five routes under `/api/v1/billing`. No Server Action. The client never claims a plan; the server answers from Stripe's record. |
| IV. `packages/core` does no I/O | Yes | `billing.ts` in core is pure: status in, plan out. Stripe calls live in `apps/web/src/lib/billing.ts`. |
| V. Tests first where a regression is silent | Yes | Routes (checkout, portal, sync, webhook signature, idempotence, out-of-order, delete cancels) in `routes.test.ts`; the table in `rls.test.ts` (select own, no client writes, cross-user); `planOf` in `packages/core/test`; one story per Plan state. |
| VI. Every press answers in the same frame | Yes | Subscribe and Manage billing are pending presses (`useOptimisticMutation` without `predict`): the server decides the URL. Confirming shows a pending state. A rejection shows in the app-wide notice. |

Additional constraints: no new fixed cost (Stripe is per transaction); the
subscription row cascades with the account; US-only, USD.

**New secret in the app server**: `SUPABASE_SECRET_KEY`. The webhook has no
user session, so it writes through a service-role client. It is server-only
(never `NEXT_PUBLIC_`), used by `lib/billing.ts` alone, and the table grants
`authenticated` select only, so the publishable key still cannot write a
plan. See research R2.

## Project Structure

### Documentation (this feature)

```text
specs/006-billing/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/billing.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
supabase/migrations/20261012173556_subscriptions.sql  # table, RLS select-own, service_role grant
scripts/ci-db.sh                                      # stub service_role role
scripts/verify-schema.mjs                             # expects subscriptions
packages/core/src/billing.ts                          # planOf(), paymentFailed()
packages/core/test/billing.test.ts
packages/schema/src/index.ts                          # Billing, BillingSync, BillingRedirect, error codes
apps/web/src/lib/errors.ts                            # new codes
apps/web/src/lib/supabase.ts                          # serviceClient()
apps/web/src/lib/stripe.ts                            # stripe() seam, billingConfig()
apps/web/src/lib/billing.ts                           # syncCustomer(), entitlement()
apps/web/src/app/api/v1/billing/route.ts              # GET
apps/web/src/app/api/v1/billing/checkout/route.ts     # POST
apps/web/src/app/api/v1/billing/portal/route.ts       # POST
apps/web/src/app/api/v1/billing/sync/route.ts         # POST
apps/web/src/app/api/v1/billing/webhook/route.ts      # POST, Stripe-signed
apps/web/src/app/api/v1/account/route.ts              # DELETE cancels first
apps/web/src/lib/client/api.ts, query-keys.ts         # billing calls
apps/web/src/components/plan-section.tsx              # the Plan section
apps/web/src/components/plan-section.stories.tsx      # one story per state
apps/web/src/components/settings-page.tsx             # mounts it
apps/web/src/mocks/handlers.ts                        # billing handlers
apps/web/src/app/terms/page.tsx                       # Billing clause
apps/web/src/app/privacy/page.tsx                     # Stripe as processor
apps/web/test/routes.test.ts, rls.test.ts, fake-stripe.ts
docs/deploying.md                                     # Stripe env vars
```

**Structure Decision**: Everything lives in the existing web app, schema,
core and migrations. Nothing changes in macOS.

## Complexity Tracking

No principle is broken. The one new risk, a privileged key in the app
server, is recorded above and in research R2.
