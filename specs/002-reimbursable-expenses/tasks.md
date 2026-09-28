---
description: "Tasks for reimbursable expenses on the invoice"
---

# Tasks: Reimbursable expenses on the invoice

**Input**: `specs/002-reimbursable-expenses/`: plan.md, spec.md, research.md,
data-model.md, contracts/expenses-api.md, quickstart.md

**Tests**: Included. New behavior ships with its own tests, and Principle VII
requires a cross-user RLS case for every new table.

**Organization**: User Story 2 (record) comes before User Story 1 (bill),
because a bill needs something to bill. Both are P1. User Stories 1 to 3 are
the 30 September slice. User Story 4 can merge after it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task serves

---

## Phase 1: Setup

- [X] T001 Start the local stack and the dev server in the worktree, and sign in to the seeded account (`docs/local-dev.md`). Confirm `pnpm verify:static` and `pnpm verify:db` pass before any change.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 Create `supabase/migrations/00000000000025_expenses.sql` with:
  - `create unique index clients_id_user_idx on clients (id, user_id)`.
  - Table `expenses`: `id uuid primary key default gen_random_uuid()`; `user_id uuid not null references auth.users(id) on delete cascade`; `client_id uuid not null`, with a foreign key `(client_id, user_id) → clients (id, user_id) on update restrict`; `project_id uuid null`, with a foreign key `(project_id, user_id) → projects (id, user_id) on delete set null (project_id) on update restrict`; `spent_on date not null`; `description text not null`, "Non-blank, 200 characters or fewer"; `amount numeric(12,2) not null check (amount > 0)`; `note text null check (char_length(note) <= 500)`; `invoice_id uuid null references invoices(id) on delete set null`; `created_at` and `updated_at timestamptz not null default now()`.
  - A `touch_updated_at` trigger.
  - A trigger rejecting a `project_id` whose project's `client_id` differs from the expense's `client_id` (`research.md` R11).
  - `create index expenses_unbilled_idx on expenses (user_id, client_id, spent_on) where invoice_id is null`.
  - `enable row level security` with a `user_id = auth.uid()` policy for all commands, and `grant select, insert, update, delete on expenses to authenticated`, following `00000000000004_api_grants.sql`.
  - On `invoice_line_items`: replace the `unit` check with `unit in ('hour', 'fixed', 'expense')`; add `spent_on date null`; add `expense_line_is_one check (unit <> 'expense' or quantity = 1)` and `expense_line_has_date check ((unit = 'expense') = (spent_on is not null))`.
  - On `invoices`: add `expenses_subtotal numeric(12,2) not null default 0 check (expenses_subtotal >= 0)`.
  - Function `create_invoice(p_user_id uuid, p_invoice jsonb, p_entry_ids uuid[], p_expense_ids uuid[]) returns invoices`, `language plpgsql security invoker set search_path = public, pg_temp`, with `grant execute` to `authenticated` (`research.md` R9). In one transaction it:
    1. calls `allocate_invoice_number`;
    2. inserts the invoice from `p_invoice` with the allocated number;
    3. inserts `p_invoice.lines` with their `sort_order` and `spent_on`;
    4. attaches `p_entry_ids` where `invoice_id is null`, as today;
    5. attaches `p_expense_ids` where `invoice_id is null`, and raises with a distinct message if fewer rows attach than it was given.
  - Comment each block with its reason, in the style of the existing migrations.
- [X] T003 [P] Add `EXPENSE_LOCKED` and `EXPENSE_ALREADY_INVOICED` to the code union and the status map (both 409) in `apps/web/src/lib/errors.ts`.
- [X] T004 [P] Add to `packages/schema/src/index.ts`, per `contracts/expenses-api.md`:
  - `Expense`, `CreateExpense` and `UpdateExpense` (description trimmed, 1 to 200 characters; `amount` is `money` and above 0; `note` 500 characters or fewer; `spentOn` is `z.iso.date()`), and `ListExpensesQuery` (`tz` via `timeZoneStrict`, `clientId?`, `status` `unbilled|all`, default `unbilled`).
  - `LineUnit` widened with `'expense'`, and `spentOn?: date` on `InvoiceLineItem`.
  - `expenseId?: uuid` on `ComputedLineItem`.
  - `expensesSubtotal: money` on `InvoicePreview` and on the stored invoice shape.
  - `excludedExpenseIds: z.array(uuid).max(200).default([])` on `InvoicePreviewRequest`.
  - Remove "a rebilled expense" from the `manualLines` doc comment (FR-014).
- [X] T005 [P] Map the new columns in `apps/web/src/lib/rows.ts`: an expense row to `Expense`, `expenses_subtotal` to `expensesSubtotal` in `INVOICE_COLUMNS` and `toInvoice`, and `spent_on` on line items.

**Checkpoint**: `pnpm verify:db` still passes, and `verify:schema` accepts the new table.

---

## Phase 3: User Story 2 - Record an expense when it happens (P1)

**Goal**: The contractor can add, list, edit and delete unbilled expenses from an Expenses tab on the Invoices screen.

**Independent Test**: Record an expense, see it listed as unbilled for its client, edit its amount, delete a second one, and see the first still waiting.

### Tests

- [X] T006 [P] [US2] Route tests in `apps/web/test/invoices.test.ts`:
  - `POST /expenses` returns 201, and a retry with the same id returns the same row.
  - A zero or negative amount, a blank description, and a project under another client each return 422.
  - `GET /expenses` lists only unbilled expenses by default, filters by `clientId`, and orders by `spentOn` ascending.
  - `PATCH` and `DELETE` on an unbilled expense succeed.
  - Another user's id returns 404.
- [X] T007 [P] [US2] RLS cases for `expenses` in `apps/web/test/rls.test.ts`: an unfiltered select, a known foreign id, an insert with a forged `user_id`, an update or delete of another user's row, and reassigning a row to another user. Add the table to the "all user-scoped tables isolate" case.
- [X] T008 [P] [US2] UI test `apps/web/test/ui/expense-list.test.tsx`:
  - The Expenses tab lists unbilled expenses with date, client, description and amount in the client's currency.
  - The Add form requires client, date, description, and an amount above 0.
  - Editing and deleting call the API.
  - The client filter narrows the list.

### Implementation

- [X] T009 [P] [US2] `apps/web/src/app/api/v1/expenses/route.ts`: `GET` (`ListExpensesQuery`) and `POST` (`CreateExpense`, upsert-on-conflict-do-nothing by `id`, then return the row), using `requireSession()` and `handle()`.
- [X] T010 [P] [US2] `apps/web/src/app/api/v1/expenses/[id]/route.ts`: `PATCH` (`UpdateExpense`) and `DELETE` (204). `ENTRY_NOT_FOUND` for a missing row. Catch the trigger's `check_violation` (`23514`) and throw `EXPENSE_LOCKED`, as `apps/web/src/app/api/v1/entries/[id]/route.ts` does for `ENTRY_LOCKED`.
- [X] T011 [US2] Add `listExpenses`, `createExpense` (generates `uuidv7()` from `@stint/core`), `updateExpense` and `deleteExpense` to `apps/web/src/lib/client/api.ts`, following the existing invoice methods.
- [X] T012 [US2] Create `apps/web/src/components/expense-list.tsx`:
  - Rows divided by the region rule, per `docs/design/screens/invoices.html`.
  - A client filter, an Add expense form (client, optional project under that client, date defaulting to today, description, amount, optional note), and edit and delete per row.
  - Amounts in mono with `tabular-nums`.
  - An empty state that names the filter, not the account.
- [X] T013 [US2] In `apps/web/src/components/invoice-list.tsx`, add an `expenses` key to the `FilterTabs` after Open, Paid and All. When it is selected, render `ExpenseList` in place of the invoice listing.

**Checkpoint**: Expenses can be recorded and managed. Nothing reaches an invoice yet.

---

## Phase 4: User Story 1 - Bill a pre-approved cost on this month's invoice (P1) 🎯 MVP

**Goal**: The preview and the generated invoice include unbilled expenses after the services, under their own heading and subtotal, untaxed. The PDF matches.

**Independent Test**: Record an expense inside a period that has billable time, preview and generate, and check that the PDF shows the services subtotal, the expenses subtotal, and a total of both.

### Tests

- [X] T014 [P] [US1] Core tests in `packages/core/test/invoice.test.ts`:
  - Expense lines come after service lines and charges, ordered by `spentOn` then `id`.
  - Each has `unit: 'expense'`, `quantity: 1`, `unitPrice = amount`, `spentOn` and `expenseId`.
  - `subtotal` excludes expenses, and tax applies only to `subtotal`.
  - `expensesSubtotal` is rounded once, and `total = subtotal + taxAmount + expensesSubtotal` to the cent.
  - With no expenses, output is identical to today's.
  - Expenses alone produce lines.
- [X] T015 [P] [US1] Route tests in `apps/web/test/invoices.test.ts`:
  - The preview includes the client's unbilled expenses dated on or before `periodEnd`, including an earlier month's, and excludes one dated after it and one in `excludedExpenseIds`.
  - `POST /invoices` writes `expenses_subtotal`, writes expense line items with `spent_on`, sets `invoice_id` on the billed expenses only, and generates with expenses and no time.
  - A second generation racing for the same expense gets `409 EXPENSE_ALREADY_INVOICED`. Nothing from it remains, and `next_invoice_number` is unchanged, so the numbering has no gap.
  - After an invoice with expenses is marked sent, `/stats` Awaiting payment equals its full total, expenses included (FR-016).
  - `GET /invoices/:id` returns `spentOn` and `expensesSubtotal`.
  - Earned and Unbilled from `/stats` are unchanged by an unbilled expense (FR-015).
- [X] T016 [P] [US1] UI tests `apps/web/test/ui/invoice-new.test.tsx` and `apps/web/test/ui/invoice-detail.test.tsx`:
  - The preview's Expenses section and its subtotal.
  - Excluding an expense clears the approved preview and hides Generate.
  - Adding an expense from the screen clears it too.
  - The charges hint no longer mentions expenses.
  - The detail view renders the Expenses section.

### Implementation

- [X] T017 [US1] In `packages/core/src/invoice.ts`:
  - Add an `ExpenseInput` type `{ id, spentOn, description, amount }` and an `expenses` option to `buildLineItems`.
  - Append expense lines after the manual lines (`research.md` R4).
  - Return `expensesSubtotal` and include it in `total`, leaving `subtotal` and `taxAmount` as the services figures.
  - Remove "rebilled expense" from the `LineUnit` and `manualLines` comments. Export the new type from `packages/core/src/index.ts`.
- [X] T018 [US1] Add `loadUnbilledExpenses(db, { clientId, periodEnd, excludedIds })` to `apps/web/src/lib/invoicing.ts`. It selects `invoice_id is null and client_id = … and spent_on <= periodEnd`, drops `excludedIds`, and maps rows to `ExpenseInput`. Have `loadPdfData` return `spentOn` on lines and `expensesSubtotal`.
- [X] T019 [US1] In `apps/web/src/app/api/v1/invoices/preview/route.ts`, load the expenses with T018 and pass them to `buildLineItems`.
- [X] T020 [US1] In `apps/web/src/app/api/v1/invoices/route.ts`:
  - Load the expenses as the preview does.
  - Replace the separate allocate, insert and attach calls and their compensating deletes with one `db.rpc('create_invoice', …)`. Pass the invoice fields (including `expenses_subtotal`), the lines (including `spent_on`), the entry ids and the expense ids from `buildLineItems`.
  - Map the function's expense-claim error to `409 EXPENSE_ALREADY_INVOICED` (`research.md` R9).
  - Update the "Nothing to invoice" message to count expenses.
- [X] T021 [US1] In `apps/web/src/components/invoice-new.tsx`:
  - Show the preview's expense lines under an Expenses heading after the service lines and charges, each as date, description and amount, with no quantity or rate. Follow them with the expenses subtotal, then the total.
  - Add a per-expense "Leave off" toggle that feeds `excludedExpenseIds`, and an inline Add expense that uses `createExpense`.
  - Make excluding, adding and removing clear the approved preview, as changing a charge does.
  - Change the charges hint to "A fixed fee, a deposit, or a retainer" (FR-014).
- [X] T022 [P] [US1] In `apps/web/src/components/invoice-detail.tsx`, render lines with `unit === 'expense'` in their own section after the service lines, with the date, and show the services subtotal, tax, the expenses subtotal, then the total.
- [X] T023 [P] [US1] Make the same split in `apps/web/src/lib/invoice-pdf.tsx`. Services come first with their subtotal and tax, then an "Expenses" heading and its lines (date, description, amount; blank quantity and rate cells), then the expenses subtotal and the total.

**Checkpoint**: The September invoice can be built and sent from Stint.

---

## Phase 5: User Story 3 - An invoiced expense cannot change under the client (P2)

**Goal**: Expenses on an issued invoice are locked by the database. Voiding the invoice or deleting the draft releases them.

**Independent Test**: Generate an invoice with an expense and mark it sent. Editing and deleting the expense are refused. Void the invoice, then edit the expense.

### Tests

- [X] T024 [P] [US3] Route tests in `apps/web/test/invoices.test.ts`:
  - `PATCH` and `DELETE` on an expense billed to a sent or paid invoice return `409 EXPENSE_LOCKED`, and the row is unchanged.
  - The same on a draft succeed, and the draft's line item keeps the amount it was generated with (FR-010).
  - Voiding releases the invoice's expenses to unbilled, and the voided invoice's line items keep the original amount after the expense is edited.
  - Deleting a draft releases its expenses.
  - A direct SQL update of a locked expense's `amount` is rejected, which shows the database enforces the lock.

### Implementation

- [X] T025 [US3] Add `guard_billed_expense()` and `guard_billed_expense_delete()` to `supabase/migrations/00000000000025_expenses.sql`, mirroring `guard_billed_entry` in `00000000000002_integrity.sql`. Detaching stays allowed. The guarded fields are `spent_on`, `description`, `amount`, `client_id` and `project_id`. They raise `check_violation`.
- [X] T026 [P] [US3] In `apps/web/src/app/api/v1/invoices/[id]/status/route.ts`, the void branch also runs `db.from('expenses').update({ invoice_id: null }).eq('invoice_id', id)`.
- [X] T027 [P] [US3] In `apps/web/src/app/api/v1/invoices/[id]/route.ts`, `DELETE` releases expenses before deleting the draft, beside the entry release.
- [X] T028 [US3] In `apps/web/src/components/expense-list.tsx`, add an All filter that shows billed expenses with their invoice number. The edit and delete controls are disabled on an expense whose invoice is not a draft.

**Checkpoint**: Stories 1 to 3 are complete. This is the 30 September slice.

---

## Phase 6: User Story 4 - A monthly subscription the client reimburses (P2)

**Goal**: A recurrence produces one waiting expense a month, from its first date up to today, until stopped.

**Independent Test**: A recurrence starting 5 August shows expenses for 5 August and 5 September. A deleted month does not return. Stopping the recurrence produces nothing further.

### Tests

- [ ] T029 [P] [US4] Route tests in `apps/web/test/invoices.test.ts`:
  - `produce_recurring_expenses` creates one expense per month through `p_through`, with a start on the 31st clamped to the month's last day.
  - Running it twice or concurrently produces no duplicates.
  - A deleted occurrence is not produced again.
  - Nothing is produced after `stopped_on`.
  - Editing the amount changes only later months.
  - `startsOn` cannot be edited after the first production (422), and a stopped recurrence rejects edits (422).
  - `GET /expenses` and `POST /invoices/preview` both produce first.
- [ ] T030 [P] [US4] RLS cases for `recurring_expenses` in `apps/web/test/rls.test.ts`, as in T007.
- [ ] T031 [P] [US4] UI test in `apps/web/test/ui/expense-list.test.tsx` for the recurring section: create, edit amount, stop, and a produced expense marked as recurring.

### Implementation

- [ ] T032 [US4] Create `supabase/migrations/00000000000026_recurring_expenses.sql` with:
  - Table `recurring_expenses` per `data-model.md`: `starts_on date not null`, `stopped_on date null`, `produced_through date null`, and the ownership, project, RLS, grant and `touch_updated_at` setup of `expenses`.
  - On `expenses`: add `recurring_expense_id uuid null references recurring_expenses(id) on delete restrict` and `recurrence_month date null`, the check `(recurring_expense_id is null) = (recurrence_month is null)`, and `unique (recurring_expense_id, recurrence_month)`.
  - `produce_recurring_expenses(p_user_id uuid, p_through date) returns void`, `language plpgsql security invoker set search_path = public, pg_temp`. For each live recurrence of the user, under `for update`, it inserts one expense per month after `produced_through` (or from `starts_on`'s month) through `least(p_through, stopped_on)`. Each falls on `starts_on`'s day, clamped to the month's last day, and only if that date is on or before the limit. The insert uses `on conflict do nothing`, and the function then advances `produced_through` (`research.md` R5 to R7).
  - `grant execute` on the function to `authenticated`.
- [ ] T033 [US4] Add `RecurringExpense`, `CreateRecurringExpense` and `UpdateRecurringExpense` (`stop?: boolean`, `tz` required when `stop`) to `packages/schema/src/index.ts`, and `recurringExpenseId` to `Expense`. Map them in `apps/web/src/lib/rows.ts`.
- [ ] T034 [US4] Add `produceRecurringExpenses(db, userId, tz)` to `apps/web/src/lib/invoicing.ts`. It calls the RPC with today's local date in `tz`. Call it first in `GET /expenses`, `POST /invoices/preview` and `POST /invoices`.
- [ ] T035 [P] [US4] `apps/web/src/app/api/v1/recurring-expenses/route.ts` (`GET`, `POST`) and `apps/web/src/app/api/v1/recurring-expenses/[id]/route.ts` (`PATCH`). `stop: true` produces through today, then sets `stopped_on`. Reject `startsOn` once `produced_through` is set, and any edit to a stopped recurrence, with 422.
- [ ] T036 [US4] Add the recurring-expense methods to `apps/web/src/lib/client/api.ts`, and a Recurring section to `apps/web/src/components/expense-list.tsx`: list live and stopped recurrences, create, edit, and Stop with a confirm step. A produced expense shows a small "monthly" marker.

**Checkpoint**: All four stories work.

---

## Phase 7: Polish

- [X] T037 [P] Document the `/expenses` and `/recurring-expenses` rows and the invoice request and response changes in `docs/api.md`.
- [X] T038 [P] Add `expenses`, `recurring_expenses`, the expense lock, `expenses_subtotal` and the `expense` line unit to `docs/data-model.md`, including why expenses stay out of Earned and Unbilled.
- [X] T039 [P] Update `docs/design/screens/invoices.html`: the Expenses tab, the preview's Expenses section and subtotal, and the charges hint without "an expense you are passing on".
- [ ] T040 Run `pnpm verify:static` and `pnpm verify:db`, walk through `quickstart.md` in the browser while signed in to local Stint, and take screenshots of the preview and the PDF for the PR's Try it section.

---

## Dependencies

- Phase 2 blocks everything.
- US2 (Phase 3) comes before US1 (Phase 4), because US1's UI records and lists expenses through US2's API. US1's route tests can seed rows directly and run in parallel with Phase 3.
- US3 depends on US1, because it locks what generation attaches.
- US4 depends on Phase 2 and US2. It can merge after US1 to US3 as a separate PR.
- Polish comes after the stories it documents. T037 to T039 can run beside the story they describe.

## Parallel examples

- Phase 2: T003, T004 and T005 alongside T002.
- US2: T006, T007 and T008 together, then T009 and T010 together.
- US1: T014, T015 and T016 together. T022 and T023 together after T017.
- US3: T026 and T027 together after T025.
- US4: T029, T030 and T031 together. T035 alongside T034.

## Implementation strategy

1. **MVP for 30 September**: Phases 1 to 5. That covers recording, billing, the lock, and the PDF. Merge it, and the September invoice goes out from Stint.
2. **Then** Phase 6 (recurring) as its own PR, with migration 26.
3. Documentation lands with the PR that makes it true.
