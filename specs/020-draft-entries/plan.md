# Implementation Plan: A draft lists the entries it bills, each one editable in place

**Branch**: `draft-entries` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-draft-entries/spec.md`

## Summary

`GET /invoices/:id` adds `entries`: the entries the invoice holds, oldest
first, each a `TimeEntry` with its project's name and, on a draft, its
amount from core's `entryAmount`. The invoice page renders them in an
Entries section below the sheet. A draft's row opens `EntryDialog`, whose
save or delete refetches the invoice. An issued invoice's rows are plain
text with hours and no amount. The no-rate notice drops its list of names.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router

**Primary Dependencies**: React Query, `EntryDialog`, `useDialog`

**Storage**: None new. No migration: a draft's entries are `draft_id`, an
issued invoice's `invoice_id`.

**Testing**: `packages/core/test/invoice.test.ts`,
`apps/web/test/invoices.test.ts` (real Postgres), stories

**Target Platform**: Web; the response field is additive for the Mac and
phone apps

**Project Type**: Web app

**Performance Goals**: One more select per invoice read

**Constraints**: An issued entry's billed rate isn't stored
([research.md](research.md))

**Scale/Scope**: One route, one screen

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The list writes nothing; edits go through the entry dialog the user presses Save in |
| II. Logic written twice has a parity test | No | The amount is core's `billedAmount` at core's `resolveRate`, called once; the mock calls the same function |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The list is the invoice read's; edits are `PATCH`/`DELETE /entries/:id`, as today |
| IV. `packages/core` does no I/O | Yes | `entryAmount` is pure |
| V. Tests first where a regression is silent | Yes | Core: `entryAmount` for billable, non-billable and unrated. Route: a draft's and a sent invoice's `entries`. Stories: each scenario |
| VI. Every press answers in the same frame | Yes | The dialog's save is pending on its button, as everywhere it opens |
| VII. A feature names what it removes | Yes | The no-rate notice's list of names, and the story assertion on it |

Additional Constraints: immutability holds, since an issued invoice's rows
don't open.

## Project Structure

### Documentation (this feature)

```text
specs/020-draft-entries/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/core/src/invoice.ts                 entryAmount
packages/schema/src/invoicing.ts             InvoiceEntry
apps/web/src/lib/invoice-entries.ts          the read
apps/web/src/app/api/v1/invoices/[id]/route.ts
apps/web/src/lib/client/api.ts
apps/web/src/mocks/{derive,handlers,respond}.ts
apps/web/src/components/invoice-entries.tsx  the section
apps/web/src/components/invoice-detail.tsx
apps/web/src/components/invoice-detail.stories.tsx
docs/api.md
```

**Structure Decision**: The section is its own file: `invoice-detail.tsx`
is near 500 lines, and the section owns its dialog.

## Complexity Tracking

None.
