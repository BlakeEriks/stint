# Implementation Plan: Say in the Inbox when a scheduled period has ended with no invoice

**Branch**: `f482-invoice-due` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-period-ended-inbox/spec.md`

## Summary

`GET /stats` gains `attention.periodsDue`: one row per active scheduled
client whose `lastEndedPeriod()` bills something and has no draft, sent or
paid invoice sharing a day with it. A pure `periodsDue()` in
`@stint/core` decides it from rows `readStats` already loads (its uninvoiced
entries and its open and issued invoice periods), plus two small reads: the
scheduled clients and the unbilled one-off expenses. The Inbox renders it as
a neutral card after stale drafts whose action links to
`/invoices/new?client=…&from=…&to=…`, and New invoice reads those three into
its first draft. No migration.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: Zod in `@stint/schema`; `lastEndedPeriod()` in `@stint/core`

**Storage**: Supabase Postgres, read only: `clients.billing_period`, `period_anchor`, `expenses`, `invoices`

**Testing**: `packages/core/test` (the rule), `apps/web/test/routes.test.ts` (`/stats` against real Postgres), `apps/web/test/ui` (the link New invoice reads, the row), dock stories

**Target Platform**: The web app. macOS and the phone show no Inbox and ignore the new key.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: Two more reads in `/stats`' existing parallel batch, no extra round trip

**Constraints**: No cron, no service role, no email; nothing stored

**Scale/Scope**: One core function, one stats field, one Inbox row, one link

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The row creates nothing; New invoice is filled in and the user creates the draft. |
| II. Logic written twice has a parity test | No | One implementation, in core; `/stats` and the mock both call it. |
| III. Every client through `/api/v1` | Yes | The row comes from `GET /stats`; the invoice from `POST /invoices` as today. |
| IV. `packages/core` does no I/O | Yes | `periodsDue()` takes rows and returns rows. |
| V. Tests first where a regression is silent | Yes | Core: each condition of FR-001/002/006. Route: `/stats` raises the row from real rows and clears it on an invoice, not on a void one. UI: the link's params parse, bad ones ignored; the row links there. Stories: one per scenario the screen shows. |
| VI. Every press answers in the same frame | Yes | The action is a link; navigation answers at once and `(app)/loading.tsx` covers it. |

## Project Structure

### Documentation (this feature)

```text
specs/015-period-ended-inbox/
├── plan.md, research.md, data-model.md, quickstart.md
└── contracts/api.md
```

### Source Code (repository root)

```text
packages/core/src/live-draft.ts                 periodsDue(), beside lateEntries()
packages/schema/src/stats.ts                    attention.periodsDue
apps/web/src/lib/stats.ts                       two reads, and the call
apps/web/src/mocks/derive.ts                    the same call for stories
apps/web/src/components/inbox.tsx               the row, its count, a link Action
apps/web/src/components/invoice-new.tsx         the first draft from ?client&from&to
apps/web/src/app/(app)/invoices/new/page.tsx    Suspense for useSearchParams
docs/api.md
```

**Structure Decision**: Existing layout; nothing new but the function.
