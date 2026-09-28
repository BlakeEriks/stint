# Implementation Plan: Reimbursable expenses on the invoice

**Branch**: `f48-expenses` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-reimbursable-expenses/spec.md`

## Summary

A contractor records costs a client reimburses as **expenses**: stored rows
that wait to be invoiced, one-off or produced monthly by a recurrence. The
invoice preview takes every unbilled expense for the client dated on or
before the period's end, minus any the contractor excludes. It prints them
after the services, under their own heading and subtotal, untaxed. At
generation they are frozen onto line items and locked by a trigger, as
entries are. Voiding releases them. Earned and Unbilled never see them.

## Technical Context

**Language/Version**: TypeScript 6 (Next.js App Router, Node 24) and SQL
(Postgres, Supabase)

**Primary Dependencies**: Next.js Route Handlers, Supabase JS, Zod
(`@stint/schema`), `@react-pdf/renderer` (`invoice-pdf.tsx`)

**Storage**: Postgres. Two new tables, two widened tables, one function
(`data-model.md`)

**Testing**: `node --test` against real Postgres (`invoices.test.ts`,
`rls.test.ts`), `@stint/core`'s tests, Vitest UI tests, `verify:schema`

**Target Platform**: The web app only. The macOS app does not read line items.

**Project Type**: Web application (monorepo: `apps/web`, `packages/core`,
`packages/schema`, `supabase/`)

**Performance Goals**: One contractor with a handful of expenses a month.
Nothing beyond the existing routes.

**Constraints**: The September invoice must go out by 30 September 2026.
One-off expenses ship first (`research.md` R12). All migrations are additive.

**Scale/Scope**: About 5 routes, 2 migrations, 1 new list view, and changes
to the new-invoice screen, the invoice detail and the PDF.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status |
| --- | --- |
| I. Timer invariant | Untouched. Expenses are not time entries (R1). |
| II. Schema invariants | Both tables enable RLS with a policy. `create_invoice` and `produce_recurring_expenses` get an explicit `grant execute`. `verify:schema` checks all of them. |
| III. Server boundary | Everything goes through `/api/v1/*` with `requireSession()` and `ApiError`. No Server Actions. |
| IV. Parity test for dual-written logic | Not triggered. Expense money is computed only in `buildLineItems`. Recurrence production is only in SQL (R4, R5). |
| V. No silent modification | A recurrence creates the rows the contractor asked for, and they are visible and editable. Nothing is corrected on their behalf. A double attach fails loudly (R9). |
| VI. `packages/core` has no I/O | The expense lines and totals are added to the pure `buildLineItems`. |
| VII. RLS verified correct | `rls.test.ts` gains cross-user read, update, delete and forged-insert cases for both tables. |
| VIII. Secrets and errors | No secrets. New failures use `ApiError` codes. |
| IX. Additive migration | New tables, nullable or defaulted columns, and a widened check. Nothing is dropped or narrowed. |
| Conventions | UUIDv7 ids, `numeric(12,2)` money, archive don't delete (a recurrence is stopped, not deleted), US and USD defaults. |

**Result**: Passes, before and after design. No complexity to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-reimbursable-expenses/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/expenses-api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/00000000000023_expenses.sql      # new: expenses, lock, line-item and invoice columns, create_invoice
supabase/migrations/00000000000024_recurring_expenses.sql  # new: recurring_expenses, producer
packages/schema/src/index.ts                          # Expense, RecurringExpense, excludedExpenseIds, expense line fields
packages/core/src/invoice.ts                          # expenses in buildLineItems; split totals
packages/core/test/invoice.test.ts
apps/web/src/lib/errors.ts                            # EXPENSE_LOCKED, EXPENSE_ALREADY_INVOICED
apps/web/src/lib/invoicing.ts                         # loadUnbilledExpenses, produce call
apps/web/src/lib/rows.ts                              # expense row mapping, expensesSubtotal
apps/web/src/app/api/v1/expenses/route.ts             # new: GET, POST
apps/web/src/app/api/v1/expenses/[id]/route.ts        # new: PATCH, DELETE
apps/web/src/app/api/v1/recurring-expenses/route.ts   # new: GET, POST
apps/web/src/app/api/v1/recurring-expenses/[id]/route.ts  # new: PATCH
apps/web/src/app/api/v1/invoices/route.ts             # writes through create_invoice, expenses_subtotal
apps/web/src/app/api/v1/invoices/preview/route.ts     # expenses in, excluded out
apps/web/src/app/api/v1/invoices/[id]/route.ts        # release on draft delete
apps/web/src/app/api/v1/invoices/[id]/status/route.ts # release on void
apps/web/src/components/invoice-list.tsx              # Expenses tab
apps/web/src/components/expense-list.tsx              # new: list, add, edit, delete, recurrences
apps/web/src/components/invoice-new.tsx               # expenses in preview, exclude, add, charges copy (FR-014)
apps/web/src/components/invoice-detail.tsx            # expenses section
apps/web/src/lib/invoice-pdf.tsx                      # expenses section
apps/web/test/invoices.test.ts, rls.test.ts, ui/*     # tests
docs/api.md, docs/data-model.md, docs/design/screens/invoices.html  # the docs that own these claims
```

**Structure Decision**: This follows the existing monorepo layout. The
Expenses tab is a component the Invoices screen renders under its own tab,
so there is no new route in the navigation (spec FR-003).

## Complexity Tracking

None.
