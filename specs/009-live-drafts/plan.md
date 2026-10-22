# Implementation Plan: Drafts collect their period's work until sent

**Branch**: `f433-live-drafts` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-live-drafts/spec.md`

## Summary

A draft stays a stored invoice row with stored lines and attached entries, as
today, but every read of it first **refreshes** it: one RPC,
`refresh_draft()`, releases what it holds, writes the lines `buildLineItems`
computes from its client and period now, and attaches the entries and
expenses those lines bill, in one transaction. Detail, PDF and list reads
refresh; Mark sent refreshes and flips the status in the same call, so what
freezes is exactly the current draft. The contractor's choices are columns on
the draft (grouping, summary text, reference, notes, terms, due date, payment
details, supporting-detail kinds, manual charges as `fixed` lines), plus two
new ones a rebuild needs: `tz` and `excluded_expense_ids`. Rendering a
draft's PDF records a `downloaded_snapshot`; Mark sent refuses with
`DRAFT_CHANGED` while the current lines differ from it. New invoice and
`POST /invoices` refuse a period overlapping an open draft for the client.
Home's attention gains `lateEntries`: unbilled billable work dated inside a
sent or paid invoice's period for its client.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL migration

**Primary Dependencies**: `buildLineItems`, `buildSchedules`, `pickSchedules` in `@stint/core`; Zod in `@stint/schema`

**Storage**: Supabase Postgres: three columns on `invoices`, one RPC

**Testing**: `packages/core/test`, `apps/web/test/invoices.test.ts` (private DB via `scripts/ci-db.sh`), `rls.test.ts` for the RPC, invoice-detail / invoice-new / inbox / invoice-list stories

**Target Platform**: The web app. The macOS app doesn't read invoices; its stats fixture gains a key it ignores.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: One refresh per draft read; a user has a handful of drafts

**Constraints**: Issued invoices never change; no fixed cost; the refresh is one transaction

**Scale/Scope**: Every draft, New invoice, Home's inbox

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | A refresh rewrites only derived lines; every choice the user made is a column it reads and never writes. Late work is surfaced in the inbox, never moved onto an invoice. Existing drafts' unattached expenses become `excluded`, so nothing the user didn't pick is added. |
| II. Logic written twice has a parity test | No | Lines are computed only by `buildLineItems`; SQL writes what it is given, as `create_invoice` does. |
| III. Every client through `/api/v1` | Yes | Refresh, the overlap refusal and `DRAFT_CHANGED` are server answers; New invoice's overlap line reflects the draft list the server returns. |
| IV. `packages/core` does no I/O | Yes | `draftSnapshot()`, `snapshotChanged()` and `lateEntries()` are pure. |
| V. Tests first where a regression is silent | Yes | Route tests for refresh after log, edit, delete; choices surviving; Mark sent freezing; `DRAFT_CHANGED`; overlap 409; late entries. RLS test that `refresh_draft` can't touch another user's draft or a sent invoice. Core tests for the pure functions. A story per acceptance scenario. |
| VI. Every press answers in the same frame | Yes | Mark sent is a server-decided press, so it shows its pending state; a `DRAFT_CHANGED` refusal is said in the banner, which is already there. |

Additional constraints: an issued invoice is immutable — `refresh_draft`
raises on any status but `draft`, and the existing guards hold; record ids
are unchanged; no new fixed cost.

## Project Structure

### Documentation (this feature)

```text
specs/009-live-drafts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/invoices.md
└── tasks.md
```

### Source Code

```text
supabase/migrations/<ts>_live_drafts.sql            # columns, refresh_draft(), backfill
packages/core/src/live-draft.ts                     # snapshot + late entries
packages/core/test/live-draft.test.ts
packages/schema/src/index.ts                        # tz on reads, DRAFT_CHANGED, DRAFT_OVERLAPS, lateEntries
apps/web/src/lib/invoicing.ts                       # refreshDraft()
apps/web/src/lib/rows.ts
apps/web/src/lib/errors.ts                          # 409s
apps/web/src/app/api/v1/invoices/route.ts           # list refresh, overlap refusal, store choices
apps/web/src/app/api/v1/invoices/[id]/route.ts      # detail refresh, changedSinceDownload
apps/web/src/app/api/v1/invoices/[id]/pdf/route.ts  # refresh, record snapshot
apps/web/src/app/api/v1/invoices/[id]/status/route.ts  # draft→sent through refresh_draft
apps/web/src/lib/stats.ts                           # lateEntries
apps/web/src/lib/client/api.ts                      # tz on invoice reads
apps/web/src/components/invoice-detail.tsx (+ stories)
apps/web/src/components/invoice-new.tsx (+ stories)
apps/web/src/components/inbox.tsx (+ stories)
apps/web/src/mocks/*
apps/web/test/invoices.test.ts, rls.test.ts
docs/data-model.md, docs/api.md
```

**Structure Decision**: Existing layout; one new core module, one RPC.

## Complexity Tracking

None.
