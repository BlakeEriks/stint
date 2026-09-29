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

## R5. Recurring is a flag on the expense, not a second table

**Decision**: `expenses.recurring boolean not null default false`. A recurring
expense has no `spent_on` and never takes an `invoice_id`. Every preview and
invoice for its client offers it. On the invoice it is frozen as an expense
line dated the period's last day. It stays on the client's card until the
contractor deletes it.

**Rationale**: The spec's 2026-09-29 clarification makes a recurring expense
"billed on every invoice", with no schedule. Nothing has to be produced ahead
of time, so there is no producer function, watermark, month key or
recurrence table. Because the row is never attached, it is never locked or
released. Editing it changes the next invoice; issued invoices hold frozen
copies (FR-009, FR-019).

**Alternatives considered**: A `recurring_expenses` table that produces one
expense per month when read. Rejected: it adds a table, a function, a
watermark and a second dialog, and bills by calendar where the contractor
thinks in invoices.

## R6. A recurring expense is dated the period's last day on the invoice

**Decision**: The loader gives a recurring expense `spentOn = periodEnd` when
it hands it to `buildLineItems`. The frozen line's `spent_on` is that date.

**Rationale**: `expense_line_has_date` keeps every expense line dated, and the
PDF's date column needs one. The period's end is the date the invoice claims
to cover.

## R7. The client card lists what is still open

**Decision**: `GET /expenses?status=open` returns recurring expenses, unbilled
one-offs, and one-offs on a draft or sent invoice, each with its invoice's
number and status. A one-off on a paid invoice is left out. The Clients
screen loads it once and groups by client.

**Rationale**: The design keeps a billed one-off on the card until its
invoice is paid, then drops it. Void releases the expense, so it comes back
as unbilled.

## R8. Invoiced expenses are locked by a trigger, as entries are

**Decision**: `guard_billed_expense()` runs before update and before delete.
It mirrors `guard_billed_entry()` in `00000000000002_integrity.sql`: while an
expense's invoice is not a draft, changes to `spent_on`, `description`,
`amount`, `client_id` and `recurring` are rejected, and so is delete.
Detaching (`invoice_id` set to null) stays allowed, because voiding and
deleting a draft depend on it (FR-010, FR-011).

The route maps the trigger's `check_violation` to `409 EXPENSE_LOCKED`, the
way entries map it to `ENTRY_LOCKED`.

## R9. Generation writes in one transaction

**Decision**: `POST /invoices` still computes everything with
`buildLineItems`, then makes one call to a new SQL function,
`create_invoice(p_user_id uuid, p_invoice jsonb, p_entry_ids uuid[],
p_expense_ids uuid[])`, where `p_invoice` carries the invoice's columns and its
`lines`. In one transaction, the function:

1. allocates the number;
2. inserts the invoice and its lines, appending the payment reference to the
   frozen payment block, since the number exists only from step 1;
3. attaches the entries, as today, with `invoice_id is null`;
4. attaches the one-off expenses with `invoice_id is null`. The route passes
   only one-off ids; recurring expenses are billed without being attached
   (R5).

If fewer expenses attach than were billed, it raises. The whole transaction
rolls back, including the number, and the route returns
`409 EXPENSE_ALREADY_INVOICED` (FR-012).

The function is `security invoker` with a pinned `search_path`, and has
`grant execute` to `authenticated`.

**Rationale**: `allocate_invoice_number` commits in its own PostgREST call.
Any failure after it, deleting the invoice to compensate, leaves a gap in a
sequence that `docs/data-model.md` guarantees has none. A race for an expense
would make that failure reachable. One transaction makes the number, the
lines and the claims succeed or fail together. It also closes the same gap
on today's line-item and attach failures.

**Alternatives considered**:
- Counting attached rows after the fact and deleting the invoice: leaves the
  gap.
- Claiming expenses before allocating: impossible, because `invoice_id`
  needs the invoice row, and the invoice row needs its number.

Entries keep today's attach rule. Making a claimed entry fail generation too
is a separate fault, filed as its own issue if wanted.

## R10. The contractor leaves an expense off by excluding it

**Decision**: The preview and create requests carry `excludedExpenseIds`.
The server loads every eligible expense and drops the excluded ones.

**Rationale**: It covers recurring expenses too, so the
contractor can leave one off an invoice (spec, Edge Cases). The server
re-derives the set rather than trusting a list the client sent back, the same approach the import's `excluded` takes. A new
expense recorded after the preview still reaches the next preview, and
recording one clears the approval (spec, Edge Cases).

## R11. Migration 25 is edited in place; 26 is deleted

**Decision**: `00000000000025_expenses.sql` gains `recurring` and loses
`project_id`, its foreign key and `check_expense_project()`.
`00000000000026_recurring_expenses.sql` is deleted.

**Rationale**: Neither has reached production, so both are still new tables
to it and Principle IX holds. `scripts/migrate.mjs` applies every file not in
`schema_migrations`, so 25 still applies after main's 27. The spec dropped
the project (FR-001), since the dialog has none and the card already sits
under its client.

## R12. One slice, recurring included

**Decision**: One-off and recurring expenses ship together.

**Rationale**: R5 makes recurring a column and one branch in the loader, not
a second slice. The September invoice (due 30 September) needs User Stories 1
to 3; recurring adds almost nothing to them.

## R13. The Clients screen drops its archived filter

**Decision**: `client-list.tsx` loses `FilterTabs` and the `status` search
param. It loads every client and project, archived included. An archived one
keeps its Archived badge. The card's footer holds **+ Project** and
**+ Expense** side by side. "No client" has no expenses and keeps only
**+ Project**.

**Rationale**: The design (spec, Design). How archiving affects expenses is
not decided, so the filter goes rather than guess.

## R14. The UI is three components

**Decision**:

- `ExpenseRow`: one line, as in the design. Used on the card and, with a
  checkbox in front and no pencil, on New invoice.
- `ExpenseDialog`: add and edit, with the Recurring checkbox. It hides the
  date when checked. Editing adds Delete.
- `ClientExpenses`: a card's Expenses label and rows.

`invoice-list.tsx` loses its Expenses tab, and `expense-list.tsx` is replaced
by the three above. `invoice-new.tsx` moves the preview into its own `Panel`
below the inputs (spec, Design).

**Rationale**: The design has one row shape in two places, and one dialog.
