# Implementation Plan: Say in the Inbox when a client is ready to invoice

**Branch**: `f482-invoice-due` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-period-ended-inbox/spec.md`

## Summary

`GET /stats` gains `attention.unbilledDue`, one row per active client with a
schedule whose most recent ended period holds unbilled billable work and
overlaps no non-void invoice. A pure
`unbilledDue()` in `@stint/core`, using `lastEndedPeriod()`, decides it from
rows `readStats` already loads, plus one small read of the active clients'
schedules. The Inbox renders it as a neutral card after stale drafts, linking
to `/invoices/new?client=…&from=…&to=…`, which New invoice reads into its
first draft. No migration.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: Zod in `@stint/schema`; `lastEndedPeriod()` in `@stint/core`

**Storage**: Supabase Postgres, read only

**Testing**: `packages/core/test` (the rule), `apps/web/test/invoices.test.ts` (`/stats` against real Postgres), `apps/web/test/ui` (what New invoice ignores, the count), dock and New invoice stories

**Target Platform**: The web app. macOS and the phone show no Inbox and ignore the new key.

**Constraints**: No cron, no service role, no email; nothing stored

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The row writes nothing; the link creates nothing. |
| II. Logic written twice has a parity test | No | One implementation, in core; `/stats` and the mock both call it. |
| III. Every client through `/api/v1` | Yes | The row comes from `GET /stats`. |
| IV. `packages/core` does no I/O | Yes | `unbilledDue()` takes rows and returns rows. |
| V. Tests first where a regression is silent | Yes | Core: one table of the rule's cases. Route: the row's shape, archived clients, a draft covering it. UI: what New invoice ignores. Stories: each reading, the count, New invoice opened from the link, and a row pressed on New invoice. |
| VI. Every press answers in the same frame | Yes | The row's only press is a link. |
| VII. A feature names what it removes | Yes | It removes nothing that exists. The rescope cut rows for unscheduled clients and `UNBILLED_DUE_DAYS`, rows across several periods, "unbilled since", the run-joining, and Billed elsewhere on this row with its batching and pending state. |

## Source Code (repository root)

```text
packages/core/src/live-draft.ts                 unbilledDue()
packages/schema/src/stats.ts                    attention.unbilledDue
apps/web/src/lib/stats.ts                       one read, and the call
apps/web/src/mocks/derive.ts                    the same call for stories
apps/web/src/components/inbox.tsx               the row and its count
apps/web/src/components/invoice-new.tsx         the first draft from ?client&from&to
apps/web/src/app/(app)/invoices/new/page.tsx    Suspense for useSearchParams
docs/api.md
```
