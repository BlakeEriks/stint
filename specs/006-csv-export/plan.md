# Implementation Plan: Export your records

**Branch**: `f58-csv-export` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-csv-export/spec.md`

## Summary

Two read-only routes, `GET /api/v1/exports/entries` and
`GET /api/v1/exports/invoices`, each answer a CSV attachment for the signed-in
user, dated and timed in the `tz` the client sends. The route handlers read
rows; two pure functions in `packages/core` turn them into CSV text, resolving
each entry's rate with `resolveRate()` and pricing it with the invoice's own
hundredths arithmetic, so the export bills exactly what an invoice would. The
Settings screen gains an Export section beside Import with two buttons. Each
press fetches its file, shows a pending state on that button while the server
works, saves the file, and says so in the section when the download fails.
No migration.

## Technical Context

**Language/Version**: TypeScript 5, Next.js route handlers, React 19

**Primary Dependencies**: `@stint/core` (`resolveRate`, the invoice's
hundredths pricing, `localDateKey`, `formatLocalTime`), Zod in
`@stint/schema` for the query, the existing `Section` and `ui/button`

**Storage**: Supabase Postgres, read only. No new table, column or function.

**Testing**: `packages/core/test/export.test.ts` for the CSV text (rates
including `0` and none, quoting, formula cells, US formats, time zones);
`routes.test.ts` against real Postgres for both routes (headers, every
status, invoice numbers, cross-user isolation); `apps/web/test/ui` for the
download hook; `export-section` stories in the Settings stories for idle,
downloading and failed

**Target Platform**: The web app. The routes serve macOS too when it wants
them.

**Project Type**: A web service and a web client in the existing monorepo

**Performance Goals**: Five years of daily entries (about 10,000 rows)
export in under ten seconds (SC-004): a paged read of a few tables and a
string join

**Constraints**: No new fixed cost, no migration, nothing written

**Scale/Scope**: One account's rows, read in full

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Read only. Values export as stored; the formula guard is applied to the file's text, never to a stored row. |
| II. Logic written twice has a parity test | Yes | Not written twice: the rate comes from `resolveRate()` and the amount from the invoice builder's own pricing, exported from `invoice.ts`. No SQL is added. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Both files come from `/api/v1/exports/*`; the web saves what the server sends. No Server Action. |
| IV. `packages/core` does no I/O | Yes | `export.ts` takes plain records and returns a string. The routes read. |
| V. Tests first where a regression is silent, in one suite per kind of code | Yes | Money and rates: core tests first, `0` included. The routes: `routes.test.ts`, including another user's rows staying out. The hook: `test/ui`. Each visible state: a story. No table, so no RLS case. |
| VI. Every press answers in the same frame | Yes | A download is decided by the server, so its button shows a pending spinner at once, and a failure says why in the section. It's a read, so `useOptimisticMutation` (for writes) doesn't apply. |

Additional constraints: nothing writes, so the timer index, frozen invoices
and client ids are untouched. Archived clients and projects export by name.
No fixed cost. US formats and USD, per positioning.

## Project Structure

### Documentation (this feature)

```text
specs/006-csv-export/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/exports.md
├── quickstart.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
packages/core/src/export.ts                       # entriesCsv(), invoicesCsv(), toCsv()
packages/core/src/invoice.ts                      # exports billedAmount()
packages/core/src/index.ts
packages/core/test/export.test.ts
packages/schema/src/index.ts                      # ExportQuery
apps/web/src/lib/exports.ts                       # loadExportData(), csvResponse()
apps/web/src/app/api/v1/exports/entries/route.ts
apps/web/src/app/api/v1/exports/invoices/route.ts
apps/web/src/lib/client/api.ts                    # exportCsv()
apps/web/src/lib/client/use-download.ts           # pending, failed, save
apps/web/src/components/export-section.tsx        # the Settings section
apps/web/src/components/settings-page.tsx         # mounts it after Import
apps/web/src/components/settings-page.stories.tsx # downloading, failed
apps/web/src/mocks/handlers.ts                    # exportEntries, exportInvoices
apps/web/test/routes.test.ts
apps/web/test/ui/use-download.test.tsx
```

**Structure Decision**: Everything lives in the existing core, schema and
web packages. Nothing changes in the database or macOS.

## Complexity Tracking

No principle is broken.
