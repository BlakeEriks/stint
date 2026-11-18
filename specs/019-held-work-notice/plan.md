# Implementation Plan: New invoice says when a draft holds this period's work

**Branch**: `held-work-notice` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-held-work-notice/spec.md`

## Summary

`POST /invoices/preview` gains `heldWork`: the client's billable, finished,
unbilled entries in the period that a draft other than the edited one
holds, as `{ entryCount, drafts: [{ id, invoiceNumber, entryCount }] }`, or
null. One pure function in `@stint/core`, `heldWork()`, counts them by
draft; the route and the fake API both call it. New invoice shows one line
per draft above the page, the number linking to it. No migration.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: Zod in `@stint/schema`; `billingWindow()` in `@stint/core`

**Storage**: Supabase Postgres, read only

**Testing**: `packages/core/test/billable.test.ts` (none, one draft, two, the edited draft left out), `apps/web/test/invoices.test.ts` (the preview against real Postgres), `invoice-new.stories.tsx` (the notice with a `play`, and a period no draft holds)

**Target Platform**: The web app. macOS and the phone make no invoices and ignore the new key.

**Constraints**: Nothing stored; one more read of the period's held entries and one of their drafts per preview

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The point of it: an emptied period is surfaced. The notice writes nothing. |
| II. Logic written twice has a parity test | No | One implementation, in core; the route and the mock both call it. |
| III. Every client through `/api/v1` | Yes | The notice comes from the preview's answer. |
| IV. `packages/core` does no I/O | Yes | `heldWork()` takes rows. |
| V. Tests first where a regression is silent | Yes | Core: none, one draft, two, the edited draft left out. Route: the preview names the holder and its count, and not the edited draft. Stories: the notice with a `play`, and a period no draft holds. |
| VI. Every press answers in the same frame | Yes | The only press is a link; the notice goes at once when the client or From changes. |
| VII. A feature names what it removes | Yes | Nothing: no state, setting or path says a draft holds the period's work today. |

## Source Code (repository root)

```text
packages/core/src/billable.ts                       heldWork()
packages/schema/src/invoicing.ts                    InvoicePreview.heldWork
apps/web/src/app/api/v1/invoices/preview/route.ts   the reads, and the call
apps/web/src/mocks/derive.ts                        the same call for stories
apps/web/src/components/invoice-new.tsx             the notice
apps/web/src/components/invoice-new.stories.tsx
docs/api.md
```
