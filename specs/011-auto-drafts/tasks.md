# Tasks: automatic drafts and numbering at first render

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md). Tests first in each phase.

## Phase 1: Setup

- [x] T001 Migrations in supabase/migrations/: nullable `invoice_number`, `sequence_no`, `issue_date` with check `status = 'draft' or all three not null`; `invoices.auto`, `invoices.ready_emailed_at`; `user_settings.time_zone`, `auto_drafts` (default true), `ready_email` (default true); unique index on auto drafts' `(user_id, client_id, period_start, period_end) where auto and status = 'draft'`; `create_invoice` without allocation or payment reference; `number_invoice()`
- [x] T002 Build private DBs `tt_f434`, `tt_f434_rls` with `scripts/ci-db.sh`

## Phase 2: Foundational

- [x] T003 [P] Core tests then code: `draftDates(today, pickedDue, days)` in packages/core/src/invoice.ts; `duePeriods(today, schedule)` in packages/core/src/auto-draft.ts (current period, last ended)
- [x] T004 Schema (packages/schema/src/index.ts): `Invoice.invoiceNumber`, `sequenceNo`, `issueDate` nullable, `wouldBe`; settings `timeZone`, `autoDrafts`, `readyEmail`; `attention.autoDraftsBlocked`, `staleDrafts[].invoiceNumber` nullable; `DRAFT_NOT_DOWNLOADED` error (apps/web/src/lib/errors.ts, 409)
- [x] T005 rows.ts mappings; stats.ts and billed-spans.ts: unbilled is "no invoice", not "no number"; stale drafts aged by `created_at`

## Phase 3: US3 — numbered at first render (P1)

- [x] T006 [US3] Tests first in apps/web/test/invoices.test.ts: POST /invoices returns no number/issue date/terms; first PDF render numbers it with today's dates and the payment reference; second render keeps them; deleting an unnumbered draft leaves next_invoice_number; Mark sent unnumbered → 409 DRAFT_NOT_DOWNLOADED; picked due date kept; existing numbered drafts untouched; RLS: `number_invoice` can't reach another user's draft (apps/web/test/rls.test.ts)
- [x] T007 [US3] POST /invoices via `createDraft()` in apps/web/src/lib/invoicing.ts; pdf route calls `number_invoice` before rendering; status route refuses unnumbered; detail/list add `wouldBe`
- [x] T008 [US3] UI: invoice-list, invoice-detail (Mark sent disabled + hint), inbox, entry-dialog, expense-row, invoice-new ("Numbered when you first open its PDF"; overlap line names the draft by period); label helper for an unnumbered draft; UI tests and stories

## Phase 4: US1 — the draft is waiting (P1)

- [x] T009 [US1] Tests first: the job with an unscoped (service-role) shim and two users: creates current-period drafts for scheduled active clients only; idempotent; catches up the last ended period; skips covered dates, archived/unscheduled clients, `auto_drafts` off, missing sender; deletes an ended, empty, unnumbered auto draft; never touches a user-made draft; 401 without the secret
- [x] T010 [US1] apps/web/src/lib/auto-drafts.ts `runDrafts()`; explicit `user_id` filters in the invoicing helpers it calls; apps/web/src/app/api/v1/cron/drafts/route.ts; apps/web/vercel.json cron
- [x] T011 [US1] Settings: switches for automatic drafts and the ready email (settings-form.tsx); time zone recorded by the app shell; `attention.autoDraftsBlocked` row in the inbox; tests and stories

## Phase 5: US2 — the ready email (P2)

- [x] T012 [US2] Tests first: one email per ended auto draft with client, period, total and link; none when `ready_email` off, when sent/deleted, or on a second run; a failed send is retried next run; no payment details in the body
- [x] T013 [US2] apps/web/src/lib/mail.ts `sendMail()` (Resend, Mailpit locally); the claim and release in `runDrafts()`

## Phase 6: Polish

- [x] T014 docs/positioning.md reworded; docs/api.md, docs/data-model.md, docs/setup.md (RESEND_API_KEY, MAIL_FROM, CRON_SECRET), docs/local-dev.md if needed
- [x] T015 Mocks (fixtures, handlers, derive) and mocks-parity; macOS fixtures re-recorded, new keys only
- [x] T016 verify:static, verify:schema, every suite, every story; look at it signed in locally
