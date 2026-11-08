# Implementation Plan: Leaving New invoice with changes offers to save the draft

**Branch**: `draft-leave-guard` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-draft-leave-guard/spec.md`

## Summary

The invoice form compares its fields with what it opened with. While they
differ, a hook holds in-app link presses and opens a `ConfirmDialog` with
Save draft, Discard and Keep editing, and asks the browser to prompt on
unload. Save draft is the form's Generate press. The server stops refusing
a draft with nothing to bill; Mark sent's own refusal stays.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router

**Primary Dependencies**: React Query, `useOptimisticMutation`, Radix dialog

**Storage**: None new. No migration: `create_invoice` and `update_draft`
never checked for lines.

**Testing**: `packages/core/test`, `apps/web/test/invoices.test.ts` (real
Postgres), `apps/web/test/ui`, stories

**Target Platform**: Web only

**Project Type**: Web app

**Performance Goals**: N/A

**Constraints**: The App Router has no navigation-blocking API
([research.md](research.md))

**Scale/Scope**: One form, one route rule

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Nothing is saved unless Save draft is pressed; nothing is stored on the device |
| II. Logic written twice has a parity test | Yes | The route and the mock handlers call the same `pricedInvoiceRefusal` |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Save draft is `POST /invoices` or `PATCH /invoices/:id`, as today |
| IV. `packages/core` does no I/O | Yes | `pricedInvoiceRefusal` stays pure |
| V. Tests first where a regression is silent | Yes | Route: an empty draft is created and Mark sent refuses it. Client logic: which clicks the hook holds. Stories: the dialog's scenarios |
| VI. Every press answers in the same frame | Yes | Save draft shows "Saving…" while the server decides; a refusal shows in the dialog |
| VII. A feature names what it removes | Yes | The "Nothing to invoice" refusal on create and save, the form's one-line minimum for Generate, and their tests |

Additional Constraints: an empty draft holds no work, so one running timer,
immutability and client-generated ids are untouched.

## Project Structure

### Documentation (this feature)

```text
specs/017-draft-leave-guard/
├── plan.md
├── research.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/core/src/refusals.ts                 # pricedInvoiceRefusal drops the empty case
packages/core/test/refusals.test.ts
apps/web/src/app/api/v1/invoices/route.ts     # caller
apps/web/src/app/api/v1/invoices/[id]/route.ts
apps/web/src/mocks/handlers.ts                # same rule in the fake
apps/web/src/lib/client/use-leave-guard.ts    # new: holds link presses, asks on unload
apps/web/src/components/confirm-dialog.tsx    # a secondary action and a disabled confirm
apps/web/src/components/invoice-new.tsx       # changed state, the dialog, the comment
apps/web/src/components/invoice-new.stories.tsx
apps/web/test/invoices.test.ts
apps/web/test/ui/use-leave-guard.test.tsx     # new
docs/api.md
```

**Structure Decision**: The hook is client logic beside the other hooks in
`lib/client`. The dialog is `ConfirmDialog` with one more slot, per
`.claude/rules/web-ui.md`, rather than a second dialog that would copy its
pending and refusal handling.

No data model: nothing stored changes.
