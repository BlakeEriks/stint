# Implementation Plan: A draft changes only when you change it

**Branch**: `f596-snapshot-drafts` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

## Summary

A draft holds the work it was built with, through a new `draft_id` on
`time_entries` and `expenses`, and is priced on read from that work alone.
Its period's unheld work is counted on read and offered as "new work", which
`POST /invoices/:id/work` holds in one press. Mark sent confirms with the
entry count and total, and no longer checks the download. The
one-draft-per-date rule and the bulk "Already billed this?" go. User Story 4
(#583) is the next PR, stacked on this one.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js route handlers, React), SQL (Postgres 15)

**Primary Dependencies**: Supabase, TanStack Query, `@stint/core`, `@stint/client`

**Storage**: Postgres: one DDL migration, one backfill migration

**Testing**: `apps/web/test/invoices.test.ts` and `routes.test.ts` (real Postgres), `rls.test.ts`, `packages/core/test`, stories

**Target Platform**: Web only. The Mac and phone apps read no invoices.

**Project Type**: web service + web app

**Scale/Scope**: one account's drafts; a draft's read prices two work sets (held, and held plus new)

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The point of the feature: new work is surfaced on the draft and joins only by the owner's press. |
| II. Logic written twice has a parity test | Yes | Which work a build takes is one TS query (`loadBillableEntries`' scopes). The backfill mirrors it once in SQL and runs once; it is checked by hand against a seeded draft, not kept as logic. |
| III. Every client through `/api/v1` | Yes | Add to draft is `POST /invoices/:id/work`. |
| IV. `packages/core` does no I/O | Yes | Nothing new in core does I/O. |
| V. Tests first where a regression is silent | Yes | Route tests: a draft ignores later work; Add holds it; another draft can't take held work; Mark sent sends held work only; moving an entry to another client releases it. RLS: a cross-user `draft_id` is refused. Stories: the new-work notice and Mark sent's confirm. |
| VI. Every press answers in the same frame | Yes | Add to draft and Mark sent are decided by the server: each shows a pending state on its control. Mark sent's first press answers at once with the confirm. |
| VII. A feature names what it removes | Yes | The spec's Removes: the download comparison and banners, `DRAFT_CHANGED`, `DRAFT_OVERLAPS` and its warning, `assignExpenses`, the bulk invoiced-elsewhere route and its form control, and their tests and stories. |

Additional constraints: one running timer and immutable issued invoices are
untouched; ids stay client-generated; no new fixed cost.

## Project Structure

```text
specs/016-snapshot-drafts/   plan.md research.md data-model.md quickstart.md contracts/api.md tasks.md
supabase/migrations/         <ts>_draft_holds_work.sql, <ts>_backfill_draft_work.sql
packages/core/src/           live-draft.ts, billable.ts
packages/schema/src/         invoicing.ts, errors.ts, entries.ts
apps/web/src/lib/            drafts.ts, issued.ts, rows.ts, client/api.ts
apps/web/src/app/api/v1/     invoices/**, invoices/[id]/work/route.ts (new), entries/invoiced-elsewhere (removed)
apps/web/src/components/     invoice-detail.tsx, invoice-new.tsx, confirm-action.tsx, their stories
apps/web/src/mocks/          fixtures.ts, handlers.ts, derive.ts
apps/web/test/               invoices.test.ts, routes.test.ts, rls.test.ts, mocks-parity.test.ts
docs/                        api.md, data-model.md; .claude/rules/invoicing.md
```

**Structure Decision**: the existing web app and API; no new package.

## Complexity Tracking

None.
