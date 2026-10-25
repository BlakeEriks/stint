# Implementation Plan: Draft each scheduled invoice automatically and say when it's ready

**Branch**: `f434-auto-drafts` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-auto-drafts/spec.md`

## Summary

Two parts, one migration set.

**Numbering at first render.** A draft is created with no number, issue
date, due date (unless picked) or terms. `number_invoice()` gives it all
four, and the payment reference, in one transaction the first time its PDF
renders (`/invoices/:id/pdf`, inline or download — both can reach a
client); later renders keep them. Until then reads show the dates it would
get today, computed the same way. Mark sent refuses an unnumbered draft
(`409 DRAFT_NOT_DOWNLOADED`). `invoice_number`, `sequence_no` and
`issue_date` become nullable, with a check that only a draft may lack them.
Existing drafts keep their numbers.

**The daily job.** A Vercel Cron hits `GET /api/v1/cron/drafts` with
`CRON_SECRET`. For each user with `auto_drafts` on, per scheduled active
client, it makes a draft (`auto = true`) for the last period that has ended
in the user's time zone, if it has something to bill and no invoice covers
the dates. Then for each auto draft not yet emailed, if `ready_email` is on:
refresh it, claim it (`ready_emailed_at`) and send one link-only email
through Resend's HTTP API (Mailpit's locally), releasing the claim if
sending fails. Creation goes
through the same `createDraft()` POST /invoices uses.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL migrations

**Primary Dependencies**: `periodContaining`, `lastEndedPeriod`, `paymentTermsText` in `@stint/core`; `computeInvoice`, `refreshDraft` in `apps/web/src/lib/invoicing.ts`; `serviceClient()`; `fetch` to Resend's API (no new package)

**Storage**: Supabase Postgres: nullable number columns; `invoices.auto`, `invoices.ready_emailed_at`; `user_settings.time_zone`, `auto_drafts`, `ready_email`; `number_invoice()`; a unique index on auto drafts' (client, period)

**Testing**: `packages/core/test`, `apps/web/test/invoices.test.ts` (numbering, cron with a service-role shim and two users), `routes.test.ts` (settings), `rls.test.ts` (`number_invoice` on another user's draft), UI tests, stories

**Target Platform**: Web and Vercel Cron. The macOS app reads no invoice numbers.

**Constraints**: No fixed cost (Vercel Hobby runs one cron a day; Resend free tier); never email a client; issued invoices immutable; the job is idempotent

**Scale/Scope**: Invoices list, detail, inbox, New invoice, Settings, the PDF route, the status route, a cron route, an email

## Constitution Check

| Principle | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The job only makes drafts on a schedule the user set and can turn off, and deletes only its own drafts that bill nothing and were never numbered. Drafts the user made are never touched. |
| II. Logic written twice | No | Dates and terms are computed only in TS; SQL writes what it's given. |
| III. Every client through `/api/v1` | Yes | The cron is a route under `/api/v1`, authenticated by its secret; the time zone is recorded through `PATCH /settings`. |
| IV. Core does no I/O | Yes | Which periods are due and the would-be dates are pure functions in core. |
| V. Tests first | Yes | Numbering (first render, idempotent, no gap on delete, Mark sent refused), the job (creation, idempotence, catch-up, empty deletion, one email, failure retry, opt-outs, two users never mixed), settings, RLS on `number_invoice`, UI, stories. |
| VI. Every press answers in the same frame | Yes | Settings switches autosave as today; Mark sent disabled with a hint. |

## Project Structure

```text
packages/core/src/invoice.ts          draftDates(today, picked, days): issue, due, terms
supabase/migrations/                  numbering + auto columns; number_invoice(); backfill none
apps/web/src/lib/invoicing.ts         createDraft() shared by POST /invoices and the job; userId filters where RLS was relied on
apps/web/src/lib/auto-drafts.ts       runDrafts(db, today): the job
apps/web/src/lib/mail.ts              sendMail(): Resend in production, Mailpit locally
apps/web/src/app/api/v1/cron/drafts/route.ts
apps/web/src/app/api/v1/invoices/[id]/pdf, [id]/status, route.ts
apps/web/src/lib/stats.ts, billed-spans.ts   unbilled means no invoice id, not no number
apps/web/src/components/              invoice-list, invoice-detail, inbox, invoice-new, entry-dialog, expense-row, settings-form, app shell (time zone)
apps/web/vercel.json                  crons
docs/positioning.md, api.md, data-model.md, setup.md, deploying.md
```

## Complexity Tracking

| Choice | Why | Simpler alternative rejected because |
| --- | --- | --- |
| The job uses `serviceClient()` with explicit `user_id` filters | No user session exists at 2 p.m. UTC; RLS can't scope it | Minting a user JWT needs a signing secret the project may not expose; a filter per query is checkable in a test with an unscoped shim |
| Numbering moves from creation to first render | A draft deleted before it reached a client otherwise burns a number | Leaving it leaves a gap whenever a draft is deleted |
| A picked due date passed by the first render becomes today, "Due on receipt" (breaks Principle I) | An invoice can't print a due date already past; the draft screen shows today's date before the PDF fixes it | Flagging the draft for the user to pick a new date adds an inbox row, a story and a test for a case the screen already shows |
