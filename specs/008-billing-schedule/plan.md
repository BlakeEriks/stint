# Implementation Plan: Bill each client on its own schedule

**Branch**: `f432-billing-schedule` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-billing-schedule/spec.md`

## Summary

A client gains an optional billing schedule: two nullable columns,
`billing_period` and `period_anchor`, sent and returned on `/clients` as one
field, `billingSchedule`, so the pair is always replaced together. One pure
module in `packages/core` derives every period from a schedule and a date:
`periodContaining()`, `lastEndedPeriod()` and `isPeriod()`. New invoice
defaults to `lastEndedPeriod()` for a scheduled client and keeps #296's
nearest-month default for one without, and shows a non-blocking hint when
the dates aren't one of the client's periods. PR #423's form wiring (dates
unset until edited) carries over.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL migration

**Primary Dependencies**: Zod in `@stint/schema`; `addDays` and `localDateKey` in `@stint/core`

**Storage**: Supabase Postgres: two nullable columns on `clients`, with a check

**Testing**: `packages/core/test`, `routes.test.ts` (private DB via `scripts/ci-db.sh`), client-list and invoice-new stories

**Target Platform**: The web app. The macOS app doesn't edit clients or create invoices; its decoder ignores the new key.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: None beyond today's; no new request

**Constraints**: No change for a client without a schedule; no fixed cost

**Scale/Scope**: Every client and every new invoice

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The schedule only proposes dates on an unedited form; dates the user edits are never moved, and an off-schedule period is hinted at, never corrected or refused. Existing clients get no schedule. |
| II. Logic written twice has a parity test | No | Periods are computed only in TypeScript; SQL checks the pair's shape, not periods. |
| III. Every client through `/api/v1` | Yes | The schedule is read and written through `/clients`. The default and the hint are presentation of a value the user is free to change; generating is unchanged. |
| IV. `packages/core` does no I/O | Yes | The period functions are pure date math on `YYYY-MM-DD` strings. |
| V. Tests first where a regression is silent | Yes | Core tests for each kind, month ends, leap years, year boundaries and anchors before and after the date; route tests for round-trip, the null default, an omitted field leaving the schedule alone, and a weekly schedule without an anchor refused; one story per acceptance scenario. RLS: no new table or policy, so no test. |
| VI. Every press answers in the same frame | Yes | Saving a client already goes through `useOptimisticMutation`; the hint is local and immediate. |

Additional constraints: an issued invoice never changes, since the schedule
is read only when a new invoice's form opens; no new fixed cost; US-first.

## Project Structure

### Documentation (this feature)

```text
specs/008-billing-schedule/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/clients.md
└── tasks.md
```

### Source Code

```text
supabase/migrations/<timestamp>_client_billing_schedule.sql   # two columns + check
packages/core/src/billing-period.ts                                 # the period rule
packages/core/src/invoice.ts                                  # defaultInvoicePeriod() takes a schedule
packages/core/test/billing-period.test.ts
packages/schema/src/index.ts                                  # BillingSchedule on Client
apps/web/src/lib/rows.ts                                      # columns ↔ billingSchedule
apps/web/src/app/api/v1/clients/route.ts, [id]/route.ts       # write both columns
apps/web/src/components/client-form.tsx                       # schedule select + anchor date
apps/web/src/components/client-list.tsx (+ .stories.tsx)      # schedule on the row
apps/web/src/components/invoice-new.tsx (+ .stories.tsx)      # default + hint
apps/web/src/mocks/fixtures.ts, handlers.ts
apps/web/test/routes.test.ts
docs/data-model.md, docs/api.md
```

**Structure Decision**: Existing monorepo layout; one new core module.

## Complexity Tracking

None.
