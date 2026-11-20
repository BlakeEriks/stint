# Implementation Plan: Invoices can come from more than one business

**Branch**: `business-profiles` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-business-profiles/spec.md`

## Summary

A `business_profiles` table, shaped and managed like `payment_profiles`:
the same list routes, the same one-default rules, the same Settings list.
An invoice gains `business_profile_id`, and `stamp_invoice_parties` copies
the From block from that row instead of `user_settings`. The route picks
the row with `resolveBusiness()` in `@stint/core`: the one chosen, else the
business of the client's last invoice while it is live, else the default.
New invoice shows the same choice and offers the others from the From
block. A backfill makes each account's Settings fields its first business,
and a last migration drops them.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL

**Primary Dependencies**: Zod in `@stint/schema`; `useOptimisticMutation` in `@stint/client`

**Storage**: Supabase Postgres: one table, one invoice column, three migrations

**Testing**: `packages/core/test/business.test.ts` (resolution); `apps/web/test/routes.test.ts` and `invoices.test.ts` (the profile rules, run for both kinds; the From block stamped from the chosen, carried and default business; an archived pick refused; no business refused); `apps/web/test/rls.test.ts` (cross-user); stories for Settings' list and New invoice's From menu

**Target Platform**: The web app and `/api/v1`. macOS and the phone read no business field.

**Constraints**: One invoice number sequence per account, unchanged

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The migration copies Settings' fields as they are. An archived pick is refused, never swapped. |
| II. Logic written twice has a parity test | No | `resolveBusiness()` is one function the route, the form and the fake API call. |
| III. Every client through `/api/v1` | Yes | Profiles are managed and invoices stamped through the API; the form's choice is a prediction the server's answer replaces. |
| IV. `packages/core` does no I/O | Yes | `resolveBusiness()` takes rows. |
| V. Tests first where a regression is silent | Yes | Core, route, RLS and invoice tests above, before the code; a story per state the user sees. |
| VI. Every press answers in the same frame | Yes | Make default predicts; the dialog's save is server-validated and pending on its button, as payment details' is. |
| VII. A feature names what it removes | Yes | The four business columns on `user_settings` and their `Settings` fields; Settings' Business identity section; `BusinessDialog`, which wrote them. The payment profile list and menu become shared components rather than a second copy. |

## Source Code (repository root)

```text
supabase/migrations/*_business_profiles.sql          table, invoice column, stamp, create_invoice
supabase/migrations/*_backfill_business_profiles.sql one default business per account with a name
supabase/migrations/*_drop_settings_business.sql     the four Settings columns
scripts/verify-schema.mjs                            the new table
packages/core/src/business.ts                        resolveBusiness()
packages/schema/src/business-profiles.ts             BusinessProfile, Create, Update
packages/schema/src/settings.ts                      minus the four fields
packages/schema/src/invoicing.ts                     CreateInvoice.businessProfileId, Invoice.businessProfileId
apps/web/src/lib/profiles.ts                         the one-default rules both kinds share
apps/web/src/app/api/v1/business-profiles/           GET POST, GET PATCH DELETE
apps/web/src/app/api/v1/payment-profiles/            onto lib/profiles.ts
apps/web/src/app/api/v1/invoices/route.ts            resolves and sends the business
apps/web/src/lib/drafts.ts                           loadBusiness() replaces requireSender()
apps/web/src/components/profile-list.tsx             Settings' list, both kinds
apps/web/src/components/business-profiles.tsx        Settings' Businesses
apps/web/src/components/business-profile-dialog.tsx
apps/web/src/components/invoice-new.tsx              From menu, ProfileMenu shared with payment
apps/web/src/mocks/                                  the fake API's businesses
scripts/seed-account.mjs                             the seeded business
docs/api.md, docs/data-model.md, docs/voice.md
```
