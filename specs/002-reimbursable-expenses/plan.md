# Implementation Plan: Reimbursable expenses on the invoice

**Branch**: `f48-expenses` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-reimbursable-expenses/spec.md`,
and its design, [`design/expenses.html`](design/expenses.html)

## Summary

A contractor records costs a client reimburses as **expenses** on the
client's card on Clients, or from New invoice. A one-off waits until an
invoice takes it. A **recurring** one is offered, ticked, on every invoice for
its client. The preview takes every recurring expense and every unbilled
one-off dated on or before the period's end, less any the contractor unticks.
It prints them after the services, under their own heading and subtotal,
untaxed. At generation they are frozen onto line items; one-offs are also
attached and locked by a trigger, as entries are. Voiding releases them.
Earned and Unbilled never see them. New invoice shows its preview in its own
card, and Clients loses its archived filter.

## Technical Context

**Language/Version**: TypeScript 6 (Next.js App Router, Node 24) and SQL
(Postgres, Supabase)

**Primary Dependencies**: Next.js Route Handlers, Supabase JS, Zod
(`@stint/schema`), `@react-pdf/renderer` (`invoice-pdf.tsx`), TanStack Query
through `useOptimisticMutation`, Storybook with the in-memory `/api/v1`
(`apps/web/src/mocks/`)

**Storage**: Postgres. One new table, two widened tables, one function
(`data-model.md`)

**Testing**: `node --test` against real Postgres (`invoices.test.ts`,
`rls.test.ts`, `mocks-parity.test.ts`), `@stint/core`'s tests, stories (one
per acceptance scenario), Vitest UI tests, `verify:schema`

**Target Platform**: The web app only. The macOS app does not read line
items.

**Project Type**: Web application (monorepo: `apps/web`, `packages/core`,
`packages/schema`, `supabase/`)

**Performance Goals**: One contractor with a handful of expenses a month.
One extra `GET /expenses` on Clients.

**Constraints**: The September invoice must go out by 30 September 2026.
Migration 25 has not shipped, so it is edited in place (`research.md` R11).

**Scale/Scope**: Four expense routes (the two recurring routes removed), one
migration, three components, and changes to Clients, New invoice, invoice
detail and the PDF.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status |
| --- | --- |
| I. No silent modification | A recurring expense bills only while ticked, visibly, on every preview. A double attach fails loudly (R9). Nothing is corrected on the contractor's behalf. |
| II. Parity test for dual-written logic | Not triggered. Expense money is computed only in `buildLineItems` (R4). The mock `/api/v1` keeps its parity test, extended for `recurring` and `status=open`. |
| III. Everything through `/api/v1` | `/expenses` routes with `requireSession()` and `ApiError`. No Server Actions. |
| IV. `packages/core` does no I/O | Expense lines and split totals are in the pure `buildLineItems`. The loader dates a recurring expense before passing it in (R6). |
| V. Tests first, one suite per kind | Routes and the lock in `invoices.test.ts`; `expenses` in `rls.test.ts`; core in `packages/core/test`; one story per acceptance scenario on `client-list`, `invoice-new` and `invoice-detail`. |
| VI. Every press answers in the same frame | Every write through `useOptimisticMutation`: delete predicts removal; add and edit predict the row; generate shows a pending state, as today. |
| Constraints | Issued invoices and their expenses immutable (R8); `numeric(12,2)`; UUIDv7 ids; no new fixed cost; US and USD defaults. |

**Result**: Passes, before and after design. No complexity to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-reimbursable-expenses/
├── spec.md
├── design/expenses.html
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/expenses-api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/00000000000025_expenses.sql       # edited: recurring, no project
supabase/migrations/00000000000026_recurring_expenses.sql  # deleted
scripts/verify-schema.mjs                             # drop recurring_expenses from EXPECTED
packages/schema/src/index.ts                          # Expense.recurring, spentOn nullable, invoice ref; recurring schemas removed
packages/core/src/invoice.ts                          # unchanged shape; expenses arrive dated
apps/web/src/lib/expenses.ts, invoicing.ts, rows.ts   # status=open, recurring loader, one-offs only attached
apps/web/src/app/api/v1/expenses/route.ts, [id]/route.ts
apps/web/src/app/api/v1/recurring-expenses/           # deleted
apps/web/src/app/api/v1/invoices/route.ts, preview/route.ts
apps/web/src/lib/client/api.ts, query-keys.ts         # recurring client calls removed
apps/web/src/mocks/{fixtures,derive,handlers,respond}.ts  # recurring flag, status=open
apps/web/src/components/expense-row.tsx               # new: ExpenseRow
apps/web/src/components/expense-dialog.tsx            # new: ExpenseDialog
apps/web/src/components/client-expenses.tsx           # new: a card's Expenses
apps/web/src/components/expense-list.tsx              # deleted
apps/web/src/components/client-list.tsx               # no FilterTabs; Expenses; + Project + Expense footer
apps/web/src/components/invoice-list.tsx              # Expenses tab removed
apps/web/src/components/invoice-new.tsx               # expense checklist; preview in its own card
apps/web/src/components/*.stories.tsx                 # one story per acceptance scenario
apps/web/test/invoices.test.ts, rls.test.ts, mocks-parity.test.ts, ui/*
docs/api.md, docs/data-model.md
```

**Structure Decision**: The existing monorepo layout. Expenses sit on the
client's card, since every expense belongs to one client, and on New invoice,
where they are billed. The Invoices list stays a list of invoices.

## Complexity Tracking

None.
