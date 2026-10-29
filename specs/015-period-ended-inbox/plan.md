# Implementation Plan: Say in the Inbox when billable work is past due to bill

**Branch**: `f482-invoice-due` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-period-ended-inbox/spec.md`

## Summary

`GET /stats` gains `attention.unbilledDue`, one row per active client with
billable work past due to bill. A pure `unbilledDue()` in `@stint/core`
decides it from rows `readStats` already loads (its uninvoiced entries and
its open and issued invoice periods), plus one small read of the active
clients' schedules. The Inbox renders it as a neutral card after stale
drafts with two answers: Create invoice, a link to
`/invoices/new?client=…&from=…&to=…` that New invoice reads into its first
draft, and Billed elsewhere, which sends the row's `entryIds` to the
existing `POST /entries/invoiced-elsewhere`. No migration.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: Zod in `@stint/schema`; `periodContaining()` in `@stint/core`; `useOptimisticMutation` in `@stint/client`

**Storage**: Supabase Postgres, read only but for the existing `time_entries.invoiced_elsewhere`

**Testing**: `packages/core/test` (the rule), `apps/web/test/invoices.test.ts` (`/stats` and Billed elsewhere against real Postgres), `apps/web/test/ui` (the link New invoice reads, the count), dock stories

**Target Platform**: The web app. macOS and the phone show no Inbox and ignore the new key.

**Constraints**: No cron, no service role, no email; nothing stored

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Create invoice creates nothing; Billed elsewhere changes only the entries the row named, on the user's press. |
| II. Logic written twice has a parity test | No | One implementation, in core; `/stats` and the mock both call it. |
| III. Every client through `/api/v1` | Yes | The row comes from `GET /stats`; Billed elsewhere is `POST /entries/invoiced-elsewhere`. |
| IV. `packages/core` does no I/O | Yes | `unbilledDue()` takes rows and returns rows. |
| V. Tests first where a regression is silent | Yes | Core: every ended period, 29/30/31 days unscheduled, covered and void, no double flag with `lateEntries`. Route: due, covered by a draft, back on void, cleared by Billed elsewhere. UI: the link's params, the count. Stories: single period, across months, several periods, unscheduled, Billed elsewhere. |
| VI. Every press answers in the same frame | Yes | Billed elsewhere is pending: it can mark hundreds of entries and is undone an entry at a time, so the button reads "Marking…" and the row leaves on the server's answer; a failure shows in the app-wide notice. It sends at most `MARK_IDS_MAX` ids a request, in order, and one failed request fails the press. Create invoice is a link. |

## Source Code (repository root)

```text
packages/core/src/live-draft.ts                 unbilledDue(), UNBILLED_DUE_DAYS
packages/schema/src/stats.ts                    attention.unbilledDue
apps/web/src/lib/stats.ts                       one read, and the call
apps/web/src/mocks/derive.ts                    the same call for stories
apps/web/src/components/inbox.tsx               the row, its count, both answers
apps/web/src/components/invoice-new.tsx         the first draft from ?client&from&to
apps/web/src/app/(app)/invoices/new/page.tsx    Suspense for useSearchParams
docs/api.md
```
