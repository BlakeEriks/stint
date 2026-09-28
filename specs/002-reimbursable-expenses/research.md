# Research: Reimbursable expenses on the invoice

Every open question in the plan's Technical Context is settled here. The spec
settled what the contractor sees. This file settles how it is stored and
computed.

## R1. An expense is its own table, not a time entry

**Decision**: A new `expenses` table.

**Rationale**: `time_entries` carries the timer index, a generated
`duration_seconds`, the rate chain and every earned and unbilled rollup. An
expense with a null duration would have to be excluded from each of them,
and one rollup that forgets counts a reimbursement as work. A separate table
keeps FR-002 and FR-015 true by construction, because no rollup reads it.

**Alternatives considered**: A `kind` column on `time_entries`. Rejected for
the reason above.

## R2. Expense lines live in `invoice_line_items`, as a third unit

**Decision**: Widen `unit` to `('hour', 'fixed', 'expense')` and add a
nullable `spent_on date` to `invoice_line_items`. An expense line has
`quantity = 1`, `unit_price = amount`, and a `spent_on`. No other line has a
`spent_on`.

**Rationale**: One table keeps one frozen-read path and one `sort_order` for
the invoice screen and the PDF. The existing `quantity x unit_price = amount`
arithmetic holds unchanged. Widening a check constraint is additive
(Principle IX): no shipped client writes line items, and the macOS app does
not read them.

**Alternatives considered**: A separate `invoice_expense_lines` table. That
means two reads, and ordering across two tables for one document. Rejected.

## R3. The invoice stores the expenses subtotal beside the services subtotal

**Decision**: Add `invoices.expenses_subtotal numeric(12,2) not null default
0`. `subtotal` keeps its meaning, which is the services subtotal and the
taxed base. `total = subtotal + tax_amount + expenses_subtotal`.

**Rationale**: Every existing invoice is correct with the default of 0, and
every current reader of `subtotal` and `tax_amount` keeps its meaning. Tax
stays off expenses (FR-006) without a second tax field. `total` stays the one
figure that `collected_by_month` and awaiting payment read, so FR-016 needs no
rollup change.

**Alternatives considered**: Deriving the expenses subtotal from line items on
read. That makes the PDF and the list compute a figure the invoice row should
state, which is the drift that freezing exists to prevent.

## R4. `buildLineItems` takes expenses and returns the split totals

**Decision**: `buildLineItems(entries, { ..., expenses })` in
`packages/core/src/invoice.ts` returns expense lines after all service lines,
ordered by `spentOn` and then by `id`. It also returns `servicesSubtotal`
(the existing `subtotal`), `expensesSubtotal`, `expenseIds` and `total`. The
preview and `POST /invoices` both call it (FR-007).

**Rationale**: The preview and the issued invoice already share this one pure
function (Principle VI). Nothing in SQL computes expense money, so there is
no second implementation and Principle IV does not apply.

## R5. Recurring expenses are produced when read, by one SQL function

**Decision**: `produce_recurring_expenses(p_user_id uuid, p_through date)`,
`security invoker` with a pinned `search_path`. Under a `for update` lock on
each live recurrence, it inserts one expense for every month after the
recurrence's `produced_through` and up to `least(p_through,
stopped_on)`, then advances `produced_through`. It is called by `GET
/expenses`, `POST /invoices/preview` and `POST /invoices`, with `p_through`
set to today in the request's time zone.

**Rationale**: Nothing needs a produced row before someone opens the
Expenses tab or previews an invoice, and both of those call the function
first. A scheduled job would be new infrastructure (Vercel Cron or pg_cron)
and would still need the same idempotent insert. The row lock serializes two
tabs producing at once. A unique index on `(recurring_expense_id,
recurrence_month)` backs the lock, so a double insert fails rather than bills
twice.

**Alternatives considered**: A daily cron. Rejected as more infrastructure
for the same guarantee. Producing in TypeScript. Rejected because its
check-then-insert is a race that the row lock does not have.

## R6. A deleted occurrence stays deleted

**Decision**: The `produced_through` watermark, not the presence of a row,
decides what is produced (FR-019).

**Rationale**: Deleting a produced expense removes its row but not the
watermark, so the month is never produced again. Without the watermark, the
unique index alone would let a deleted month come back.

## R7. The day of the month comes from `starts_on`, clamped to the month

**Decision**: An occurrence falls on `starts_on`'s day, or on the month's
last day when that day does not exist. For example, a 31 January start
produces 28 February. `starts_on` cannot be edited once anything has been
produced.

**Rationale**: Changing the anchor after production would make the watermark
refer to days that moved. A contractor who wants a different day stops the
recurrence and starts a new one.

## R8. Invoiced expenses are locked by a trigger, as entries are

**Decision**: `guard_billed_expense()` runs before update and before delete.
It mirrors `guard_billed_entry()` in `00000000000002_integrity.sql`: while an
expense's invoice is not a draft, changes to `spent_on`, `description`,
`amount`, `client_id` and `project_id` are rejected, and so is delete.
Detaching (`invoice_id` set to null) stays allowed, because voiding and
deleting a draft depend on it (FR-010, FR-011).

The route maps the trigger's `check_violation` to `409 EXPENSE_LOCKED`, the
way entries map it to `ENTRY_LOCKED`.

## R9. Two generations cannot take one expense

**Decision**: `POST /invoices` attaches expenses with `update ... where id in
(...) and invoice_id is null returning id`. If fewer rows come back than it
billed, it rolls back the invoice, as it already does when attaching fails,
and returns `409 EXPENSE_ALREADY_INVOICED` (FR-012).

**Rationale**: The existing entry attach skips a claimed row without
noticing, which would leave that expense's line on two invoices. Counting the
returned rows makes the conflict visible.

## R10. The contractor leaves an expense off by excluding it

**Decision**: The preview and create requests carry `excludedExpenseIds`.
The server loads every eligible expense and drops the excluded ones.

**Rationale**: The server re-derives the set rather than trusting a list the
client sent back, the same approach the import's `excluded` takes. A new
expense recorded after the preview still reaches the next preview, and
recording one clears the approval (spec, Edge Cases).

## R11. Project ownership uses the composite key the entries use

**Decision**: `expenses (project_id, user_id)` and `recurring_expenses
(project_id, user_id)` reference `projects (id, user_id)`, with `on delete
set null (project_id)` and `on update restrict`, as
`00000000000016_entry_project_same_owner.sql` does. A trigger rejects a
project whose `client_id` is not the expense's `client_id`.

## R12. Build order for the 30 September deadline

**Decision**: Ship one-off expenses first: the table, the lock, the invoice
and PDF changes, and the Expenses tab (User Stories 1 to 3). Recurring
expenses (User Story 4) follow as a second change on the same branch, or on
a follow-up branch if the first has to merge before the 30th.

**Rationale**: The September invoice needs only the first slice (spec,
User Story 4, "Why this priority").
