# Implementation Plan: Mark entries as billed outside Stint

**Branch**: `f478-billed-elsewhere` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-billed-elsewhere/spec.md`

## Summary

`time_entries.invoiced_elsewhere` exists and every unbilled read skips it, so
this adds only ways to set it. `POST /entries/invoiced-elsewhere` takes
`{ ids, invoicedElsewhere }` and updates the user's entries among `ids` that
are finished and on no invoice, returning the ids it changed. The entry gains
`invoicedElsewhere` in its shape and in `PATCH /entries/:id`, which refuses
to mark an entry on an invoice with `409 ENTRY_ALREADY_INVOICED`. New invoice
gains a Billed elsewhere button that sends the card's entry ids (its time
lines' `entryIds`) and answers with an Undo toast; the edit-entry dialog
gains a checkbox for an entry on no invoice. One migration adds the check
constraint `entry_billed_once`, so an entry is never both.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19

**Primary Dependencies**: Zod in `@stint/schema`; `useOptimisticMutation` in `@stint/client`

**Storage**: Supabase Postgres, the existing `time_entries.invoiced_elsewhere`, and one check constraint

**Testing**: `apps/web/test/routes.test.ts` (real Postgres), `apps/web/test/rls.test.ts`, `apps/web/test/ui`, New invoice and entry dialog stories

**Target Platform**: The web app. macOS and phone decode the entry and ignore the new key.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: One update statement per press

**Constraints**: Issued invoices and their entries never change; no fixed cost

**Scale/Scope**: One route, one PATCH field, two controls

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Only the ids the user pressed on change; the toast says how many, and Undo restores exactly those. |
| II. Logic written twice has a parity test | No | Nothing new is written twice; the unbilled exclusion is unchanged. |
| III. Every client through `/api/v1` | Yes | Both controls call the API; the server decides which ids change. |
| IV. `packages/core` does no I/O | No | Core is untouched. |
| V. Tests first where a regression is silent | Yes | Routes: marks only finished, uninvoiced ids and returns them; clears; leaves Unbilled and generation; earned unchanged; PATCH refuses a mark on an invoiced entry. RLS: another user's ids change nothing. UI: the dialog sends the flag only for an entry on no invoice. Stories per scenario. |
| VI. Every press answers in the same frame | Yes | Pending mode: the button reads "Marking…", Undo "Undoing…"; the dialog's Save is pending as today. A failure shows in `MutationNotice`, or in the dialog. |

## Project Structure

### Documentation (this feature)

```text
specs/013-billed-elsewhere/
├── plan.md, research.md, data-model.md, quickstart.md
└── contracts/api.md
```

### Source Code (repository root)

```text
packages/schema/src/index.ts                       TimeEntry and UpdateTimeEntry gain invoicedElsewhere; MarkInvoicedElsewhere
apps/web/src/lib/rows.ts                           ENTRY_COLUMNS, toEntry, ENTRY_FIELDS
apps/web/src/app/api/v1/entries/invoiced-elsewhere/route.ts   POST
apps/web/src/app/api/v1/entries/[id]/route.ts      the 409 on a mark of an invoiced entry
apps/web/src/lib/client/api.ts                     markInvoicedElsewhere()
apps/web/src/components/invoice-new.tsx            Billed elsewhere button and Undo toast
apps/web/src/components/entry-dialog.tsx           Billed elsewhere checkbox
apps/web/src/mocks/                                fixtures and handler
docs/api.md, docs/data-model.md
```

**Structure Decision**: Existing layout; one new route beside `entries/task-names`.
