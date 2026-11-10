# Implementation Plan: New invoice offers to include unbilled work dated just before its period

**Branch**: `f569-earlier-work` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-earlier-unbilled/spec.md`

## Summary

`POST /invoices/preview` gains `earlierWork`: the client's billable, finished,
unbilled entries no draft holds, dated from the day after its last non-void
invoice ending before the period up to the period's start, read in the
billing zone. Two pure functions in `@stint/core` decide it,
`earlierWorkFrom()` (where the look-back starts, or nowhere) and
`earlierWork()` (the count and the first and last dates). The route and the
fake API both call them. New invoice shows it above
the preview with Include, which sets From to the first date in the same
frame. No migration.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: Zod in `@stint/schema`; `billingWindow()`, `localDateKey()`, `addDays()` in `@stint/core`

**Storage**: Supabase Postgres, read only

**Testing**: `packages/core/test` (the rule, DST), `apps/web/test/invoices.test.ts` (the preview against real Postgres, and a generated invoice billing the included entry), `invoice-new.stories.tsx` (each state, Include's `play`)

**Target Platform**: The web app. macOS and the phone make no invoices and ignore the new key.

**Constraints**: Nothing stored; one more read of the client's invoices and one of the look-back's entries per preview

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The offer writes nothing; only Include moves the start, and only on the form. |
| II. Logic written twice has a parity test | No | One implementation, in core; the route and the mock both call it. |
| III. Every client through `/api/v1` | Yes | The offer comes from the preview's answer. |
| IV. `packages/core` does no I/O | Yes | Both functions take rows and dates. |
| V. Tests first where a regression is silent | Yes | Core: the look-back after an invoice, spanning the start, with none; none, one, several, DST. Route: the preview's `earlierWork` and the invoice generated after Include billing the entry. Stories: one per state, with a `play` pressing Include. |
| VI. Every press answers in the same frame | Yes | Include sets From at once; the preview follows. |
| VII. A feature names what it removes | Yes | Nothing: no state, setting or path covers stranded work today. The spec cut the held case: #596 removed `DRAFT_OVERLAPS`, and a draft holding work outside its period is that draft's fault to show. |

## Source Code (repository root)

```text
packages/core/src/billable.ts                   earlierWorkFrom(), earlierWork()
packages/schema/src/invoicing.ts                InvoicePreview.earlierWork
apps/web/src/app/api/v1/invoices/preview/route.ts  the reads, and the call
apps/web/src/mocks/derive.ts                    the same call for stories
apps/web/src/components/invoice-new.tsx         the offer and Include
apps/web/src/components/invoice-new.stories.tsx
docs/api.md
```
