# Implementation Plan: Payment terms are a number of days, per client

**Branch**: `f438-payment-terms-days` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-payment-terms-days/spec.md`

## Summary

Terms become an integer: `user_settings.payment_terms_days` (0–365, default
30) and an optional `clients.payment_terms_days`. `POST /invoices` owns the
due date: the body's `dueDate`, else the issue date plus the client's days,
else the user's; a due date before the issue date is `422`. The printed text
is generated from the two dates by `paymentTermsText()` in core ("Net N", or
"Due on receipt") and frozen into `invoices.payment_terms` as today, so
issued invoices and open drafts keep theirs. `paymentTerms` leaves the create
body and `dueDateForTerms()` leaves core. A backfill reads each user's old
text once with the current rule, as a SQL function a test calls; text it
can't read becomes 30 and is kept in `legacy_payment_terms`, which Home's
inbox shows as a notice until the user saves their terms.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL migrations

**Primary Dependencies**: `addDays` and `daysBetweenKeys` in `@stint/core`; Zod in `@stint/schema`

**Storage**: Supabase Postgres: two columns on `user_settings`, one on `clients`; `default_payment_terms` dropped

**Testing**: `packages/core/test`, `apps/web/test/invoices.test.ts` and `routes.test.ts` (private DB via `scripts/ci-db.sh`), `apps/web/test/ui`, Settings / client form / New invoice / inbox stories

**Target Platform**: The web app. The macOS app shows no terms; its stats and clients fixtures gain keys it ignores.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: None new; one extra column read per invoice creation

**Constraints**: Issued invoices never change; no fixed cost; backfill separate from DDL (`.claude/rules/migrations.md`)

**Scale/Scope**: Settings, the client dialog, New invoice, `POST /invoices`, Home's inbox

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Text the old rule reads keeps its meaning. Text it can't read becomes 30, the due date it already gave, and is kept and shown in the inbox until the user saves. Issued invoices and drafts keep their frozen terms. |
| II. Logic written twice has a parity test | Yes, briefly | The old text rule lives only in SQL now (`legacy_payment_terms_days()`), since `dueDateForTerms()` goes. Its cases move from the core test to a test against real Postgres, so nothing is written twice. |
| III. Every client through `/api/v1` | Yes | The server fills a missing due date and rejects an early one; New invoice's default and error are predictions the server's answer settles. |
| IV. `packages/core` does no I/O | Yes | `paymentTermsText()` is pure. |
| V. Tests first where a regression is silent | Yes | Core: terms text for 0, N, month and year ends. Routes: settings and client days round-trip and reject out-of-range; the server fills the due date from client then user days; early due date 422; frozen text; the notice clears on save. SQL: the backfill function's cases. UI: New invoice's default due date and error. Stories per scenario. |
| VI. Every press answers in the same frame | Yes | Saving is `useOptimisticMutation` as today; the inbox notice's Save leaves like the rate row's. Generate is disabled while the due date is early. |

Additional constraints: issued invoices immutable (no write to `invoices`);
client ids unchanged; no new fixed cost.

## Project Structure

### Documentation (this feature)

```text
specs/010-payment-terms-days/
├── plan.md, research.md, data-model.md, quickstart.md
└── contracts/api.md
```

### Source Code (repository root)

```text
packages/core/src/invoice.ts          paymentTermsText(); dueDateForTerms() removed; PAYMENT_TERMS_MAX_DAYS
packages/schema/src/index.ts          Settings.paymentTermsDays, Client.paymentTermsDays, attention.paymentTermsToCheck; CreateInvoice loses paymentTerms
supabase/migrations/                  add columns → backfill (+ legacy_payment_terms_days) → drop default_payment_terms
apps/web/src/lib/rows.ts              settings and client mapping
apps/web/src/lib/invoicing.ts         loadSettings reads days
apps/web/src/lib/stats.ts             attention.paymentTermsToCheck
apps/web/src/app/api/v1/invoices/route.ts   due date and generated terms
apps/web/src/app/api/v1/settings, clients   write days; settings save clears legacy text
apps/web/src/components/              settings-form, client-form, invoice-new, invoice-preview-card, inbox
apps/web/src/mocks/                   fixtures, handlers, derive
docs/api.md, docs/data-model.md
```

**Structure Decision**: Existing monorepo layout; no new package or route.

## Complexity Tracking

| Choice | Why | Simpler alternative rejected because |
| --- | --- | --- |
| `legacy_payment_terms_days()` stays after the backfill | The issue asks for the migration's parsing tested against real Postgres; a function is the one thing a test can call | Inline SQL in the backfill can't be run again once the old column is dropped |
| Dropping `default_payment_terms` in this PR | Precedent (`20261019081847_drop_tax_id.sql`); the column has no reader once this ships | Keeping it leaves a second source of terms that disagrees with the first |
