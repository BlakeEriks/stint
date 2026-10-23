# Tasks: Payment terms are a number of days, per client

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

Tests come first in each phase (Constitution V; the spec asks for them).

## Phase 1: Setup

- [ ] T001 Build private test DBs `tt_f438` and `tt_f438_rls` with `PGPORT=54322 bash scripts/ci-db.sh` after the migrations exist (T004–T006)

## Phase 2: Foundational

- [ ] T002 [P] Core tests first in packages/core/test/invoice.test.ts: `paymentTermsText(issue, due)` gives "Due on receipt" for the same day, "Net 30" for Jan 10→Feb 9, "Net 30" across a year end (Dec 20→Jan 19), "Net 30" across a leap February (Jan 31→Mar 1 2028 is 30); remove the `dueDateForTerms` cases
- [ ] T003 [P] Add `PAYMENT_TERMS_MAX_DAYS = 365` and `paymentTermsText()` (using `daysBetweenKeys`), and remove `dueDateForTerms()` in packages/core/src/invoice.ts and its export
- [ ] T004 Migration `payment_terms_days`: `user_settings.payment_terms_days int not null default 30 check (payment_terms_days between 0 and 365)`, `user_settings.legacy_payment_terms text`, `clients.payment_terms_days int check (payment_terms_days between 0 and 365)` in supabase/migrations/
- [ ] T005 Migration backfill: `legacy_payment_terms_days(text) returns int` (immutable; the current rule: `net\s*(\d{1,4})(?!\d)`, then `(?<!\d)(\d{1,4})\s*days`, then `receipt` → 0; null when unreadable or over 365; execute revoked from public, anon, authenticated), then `update user_settings set payment_terms_days = coalesce(f, 30), legacy_payment_terms = case when f is null then default_payment_terms end` in supabase/migrations/
- [ ] T006 Migration dropping `user_settings.default_payment_terms` in supabase/migrations/
- [ ] T007 Schema in packages/schema/src/index.ts: `Settings.paymentTermsDays: z.number().int().min(0).max(PAYMENT_TERMS_MAX_DAYS)` replacing `defaultPaymentTerms`; `Client.paymentTermsDays` the same `.nullable().optional()`; `CreateInvoice` loses `paymentTerms`; `attention.paymentTermsToCheck: z.string().nullable()`
- [ ] T008 Row mapping in apps/web/src/lib/rows.ts (settings columns and mapping, client columns and mapping) and `loadSettings` in apps/web/src/lib/invoicing.ts

## Phase 3: User Story 1 — Due dates follow each client's terms (P1)

**Independent test**: a client with 15 days gets invoices due issue + 15, printing "Net 15".

- [ ] T009 [US1] Route tests first in apps/web/test/invoices.test.ts: no `dueDate` → issue + the client's days, else the user's; `paymentTerms` is generated ("Net 15", "Due on receipt" for 0, "Net 20" for a hand-picked date); `dueDate` before `issueDate` → 422 `VALIDATION_FAILED`; the text is unchanged after the user's days change and the draft is read again
- [ ] T010 [US1] `POST /invoices` in apps/web/src/app/api/v1/invoices/route.ts: resolve the issue date, then `due = body.dueDate ?? addDays(issue, client.payment_terms_days ?? settings.paymentTermsDays)`, reject `due < issue`, write `payment_terms: paymentTermsText(issue, due)`; read `payment_terms_days` with the client
- [ ] T011 [US1] UI test first in apps/web/test/ui/invoice-new.test.tsx: the default due date follows the client's days, then the user's; an early due date shows the message and disables Generate
- [ ] T012 [US1] apps/web/src/components/invoice-new.tsx: `termsDue` from the selected client's days else the settings' days; message under Due and Generate disabled when `due < issued`
- [ ] T013 [US1] apps/web/src/components/invoice-preview-card.tsx: terms shown are `paymentTermsText(issueDate, dueDate)` when not given
- [ ] T014 [US1] Stories: New invoice following a client's terms and with an early due date, in apps/web/src/components/invoice-new.stories.tsx

## Phase 4: User Story 2 — Terms are set as days (P2)

**Independent test**: 45 in Settings and 10 on a client survive a reload.

- [ ] T015 [US2] Route tests first in apps/web/test/routes.test.ts: settings `paymentTermsDays` round-trips and rejects -1, 1.5, 366; client `paymentTermsDays` round-trips, null clears, omitted on PATCH leaves it
- [ ] T016 [US2] Settings and clients routes write the new columns (apps/web/src/app/api/v1/settings, apps/web/src/app/api/v1/clients via rows.ts mappings)
- [ ] T017 [P] [US2] apps/web/src/components/settings-form.tsx: Payment terms is a whole-number field with a "days" suffix and hint "0 is due on receipt"
- [ ] T018 [P] [US2] apps/web/src/components/client-form.tsx: optional Payment terms days field beside the billing schedule, placeholder the user's days, hint that empty uses them
- [ ] T019 [US2] Stories for the Settings field and the client override in their `*.stories.tsx`

## Phase 5: User Story 3 — Existing terms carry over (P3)

**Independent test**: "Net 45", "Due on receipt", "Payment by check" become 45, 0, 30 with a notice for the last.

- [ ] T020 [US3] Test first against real Postgres in apps/web/test/invoices.test.ts: `legacy_payment_terms_days()` on "Net 45", "45 days", "Net 30 upon receipt", "Due on receipt", "Payment by check", "Net 400", ""
- [ ] T021 [US3] Route tests first in apps/web/test/routes.test.ts: `/stats` `attention.paymentTermsToCheck` returns the legacy text; a settings PATCH with `paymentTermsDays` clears it; one without leaves it
- [ ] T022 [US3] apps/web/src/lib/stats.ts reads `legacy_payment_terms` into attention; the settings route nulls `legacy_payment_terms` when `paymentTermsDays` is written
- [ ] T023 [US3] apps/web/src/components/inbox.tsx: a terms row like the rate row: label "Check your payment terms", detail quoting the old text and that invoices now print Net 30, a days field (prefilled 30) and Save; counted in `inboxCount`
- [ ] T024 [US3] Inbox story with the terms notice in apps/web/src/components/inbox.stories.tsx

## Phase 6: Polish

- [ ] T025 Mocks: apps/web/src/mocks/fixtures.ts, handlers.ts, derive.ts; the mocks-parity test passes
- [ ] T026 Re-record the macOS fixtures through the routes suite; restore main's ids, keep only the new keys
- [ ] T027 Docs: docs/api.md (settings, clients, POST /invoices, stats) and docs/data-model.md
- [ ] T028 `pnpm verify:static`, the core, routes, invoices, RLS and UI suites, and the touched stories

## Dependencies

Phase 2 blocks all stories. US1, US2, US3 are independent after it; T026 follows every route change.

## Parallel

T002/T003 with T004–T006; T017 with T018.

## Strategy

MVP is US1. One PR carries all three: the migration drops the old column, so nothing ships half.
