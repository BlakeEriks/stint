# Implementation Plan: Feedback from inside the app

**Branch**: `f205-feedback-form` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-feedback-form/spec.md`

## Summary

A Feedback button in the web header opens a dialog with one message box.
Sending posts the message to `POST /api/v1/feedback` with the screen's path,
the client (`web`) and the build version. The route stores it in a new
`feedback` table that the user can insert into and read only their own rows
from, and nothing can change. Blake reads the table in the Supabase
dashboard. The send is a pending press: the dialog stays open on failure
with the message intact, and closes into a short "Feedback sent" toast on
success.

## Technical Context

**Language/Version**: TypeScript 5, Next.js route handlers, React 19

**Primary Dependencies**: TanStack Query via `useOptimisticMutation`, Zod in `@stint/schema`, the existing `ui/dialog` and `ui/button`

**Storage**: Supabase Postgres: one new table, `feedback`, with RLS

**Testing**: `routes.test.ts` and `rls.test.ts` against real Postgres, `apps/web/test/ui` for the form's rules, and `feedback-dialog.stories.tsx` for each state

**Target Platform**: The web app only. macOS is out of scope (FR-004).

**Project Type**: A web service and a web client in the existing monorepo

**Performance Goals**: The send button answers in the same frame (Constitution VI)

**Constraints**: No new fixed cost, no third party, and no email (FR-005, FR-008)

**Scale/Scope**: Alpha: about a dozen users and tens of submissions

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The message is stored as typed, trimmed only at its ends. A failed send keeps the text in the open form and says why. |
| II. Logic written twice has a parity test | No | One implementation. The length limit is one Zod schema, shared by the form and the route. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The form posts to `POST /api/v1/feedback`, with no Server Action and no direct table write. |
| IV. `packages/core` does no I/O | No | Nothing goes into core. The rules are a Zod schema in `@stint/schema`. |
| V. Tests first where a regression is silent, in one suite per kind of code | Yes | The route goes in `routes.test.ts` (stores it, rejects empty and too long, a retry makes one row). The table goes in `rls.test.ts` (added to the every-user-scoped-table check, plus no update or delete). The form's rules go in `test/ui`, and there's one story per state. |
| VI. Every press answers in the same frame | Yes | Send is a pending press (`useOptimisticMutation` with no `predict`, `meta.inline`). It shows a spinner on the control, and a rejection shows inside the open form. |

Additional constraints: the record id is client-generated with `uuidv7()`,
so a retry lands on the same row. There's no new fixed cost. The table
cascades on account delete, because feedback is the user's data.

## Project Structure

### Documentation (this feature)

```text
specs/005-feedback-form/
├── spec.md
├── design/feedback.html
├── plan.md
├── research.md
├── data-model.md
├── contracts/feedback.md
├── quickstart.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
supabase/migrations/00000000000034_feedback.sql   # table, RLS: insert and select own
packages/schema/src/index.ts                      # CreateFeedback
apps/web/src/app/api/v1/feedback/route.ts         # POST
apps/web/src/lib/client/api.ts                    # sendFeedback()
apps/web/src/components/feedback.tsx              # header button, dialog, sent toast
apps/web/src/components/feedback.stories.tsx      # open, typing, sending, sent, failed, phone
apps/web/src/components/app-header.tsx            # mounts the button beside AccountMenu
apps/web/src/mocks/handlers.ts                    # POST /feedback for stories
apps/web/src/app/privacy/page.tsx                 # "What you enter" names feedback you send
apps/web/test/routes.test.ts
apps/web/test/rls.test.ts
apps/web/test/ui/feedback.test.tsx
```

**Structure Decision**: Everything lives in the existing web app, schema
package and migrations. Nothing changes in core or macOS.

## Complexity Tracking

No principle is broken.
