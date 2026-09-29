---
description: "Tasks for reimbursable expenses on the invoice"
---

# Tasks: Reimbursable expenses on the invoice

**Input**: `specs/002-reimbursable-expenses/`: spec.md (with its Design),
design/expenses.html, plan.md, research.md, data-model.md,
contracts/expenses-api.md, quickstart.md

**Starting point**: the branch already has one-off expenses end to end:
migration 25, `create_invoice`, the lock, the `/expenses` routes, expenses in
`buildLineItems`, the preview, generation, invoice detail and the PDF, and
the in-memory `/api/v1`. It also has a monthly recurrence (migration 26,
`/recurring-expenses`) and an Expenses tab on Invoices, which this plan
replaces. These tasks are the change from there to `plan.md`.

**Tests**: Included, per Principle V: routes and the lock against real
Postgres, a cross-user case for the table, and one story per acceptance
scenario. Each test task comes before the code it covers.

**Organization**: User Story 2 (record) before User Story 1 (bill), since a
bill needs something to bill. Both are P1. User Stories 1 to 3 are the
30 September slice; User Story 4 is small enough to ride with it
(`research.md` R12).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task serves

---

## Phase 1: Setup

- [X] T001 In `/Users/blakeeriks/dev/stint-f48-expenses`, run `pnpm dev:up`, `pnpm db:setup`, the dev server and Storybook (port 6007), and sign in to the seeded account (`docs/local-dev.md`). Confirm `pnpm verify:static` and `pnpm verify:db` pass before any change.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 Edit `supabase/migrations/00000000000025_expenses.sql` in place (`research.md` R11), per `data-model.md`:
  - Remove `project_id`, the `expense_project_same_owner` foreign key, `check_expense_project()` and `t_expenses_project_client`.
  - Add `recurring boolean not null default false`. Make `spent_on date null`.
  - Add `constraint expense_dated check (recurring = (spent_on is null))` and `constraint recurring_never_billed check (not recurring or invoice_id is null)`.
  - Replace the unbilled index with `create index expenses_unbilled_idx on expenses (user_id, client_id) where invoice_id is null`.
  - In `guard_billed_expense`, lock `recurring` with `spent_on`, `description`, `amount` and `client_id`; drop `project_id` from it.
  - Comment each change with its reason, in the file's style.
- [X] T003 Delete `supabase/migrations/00000000000026_recurring_expenses.sql`, and remove `recurring_expenses` and `produce_recurring_expenses` from `EXPECTED` in `scripts/verify-schema.mjs`. Run `pnpm db:setup` and `pnpm verify:schema`.
- [X] T004 [P] In `packages/schema/src/index.ts`: add `recurring: z.boolean()` to `Expense` and `CreateExpense` (default `false`); make `spentOn` nullable on `Expense`, and on `CreateExpense`/`UpdateExpense` required exactly when not recurring and refused when recurring (`contracts/expenses-api.md`); remove `projectId` from all three; change `ListExpensesQuery.status` to `open|unbilled`, default `open`, and drop `tz`; delete the `RecurringExpense`, `CreateRecurringExpense` and `UpdateRecurringExpense` schemas.
- [X] T005 [P] In `apps/web/src/lib/rows.ts`, map `recurring` and drop `project_id` and `recurring_expense_id` from the expense row and `toExpense`; delete the recurring-expense row mapping.
- [X] T006 Delete `apps/web/src/app/api/v1/recurring-expenses/` (both routes), `produceRecurringExpenses` in `apps/web/src/lib/invoicing.ts` and every call to it (`expenses/route.ts`, `invoices/route.ts`, `invoices/preview/route.ts`), and the recurring calls and keys in `apps/web/src/lib/client/api.ts` and `apps/web/src/lib/client/query-keys.ts`.
- [X] T007 In `apps/web/src/mocks/` (`fixtures.ts`, `derive.ts`, `handlers.ts`, `respond.ts`, `db.ts`): remove `recurringExpenses`, `StoredRecurrence`, `produceRecurring` and the recurring handlers; add `recurring` to stored expenses; drop `projectId`. Reseed per the design: Northwind has "Claude Max subscription", $200, recurring, and "Figma license, annual", $180, 20 Aug 2026, waiting; Byrne has "Stock photography", $75, 18 Aug 2026, on draft INV-15. INV-13 keeps its frozen Claude Max line with no expense attached.
- [X] T008 Update `apps/web/test/mocks-parity.test.ts` to write a recurring and a one-off expense and compare `GET /expenses` (`status=open` and `unbilled`) between the mock and the real routes; drop its recurrence steps. In `apps/web/test/rls.test.ts`, remove the `recurring_expenses` cases and keep the `expenses` ones.

**Checkpoint**: `pnpm verify:db` and `pnpm verify:static` pass with no recurring table or route left.

---

## Phase 3: User Story 2 - Record an expense when it happens (P1)

**Goal**: Add, edit and delete expenses from a client's card on Clients, with no archived filter on that screen.

**Independent test**: On Clients, add an expense to a client, see it on the card, click it to change the amount, delete another.

### Tests

- [X] T009 [P] [US2] In `apps/web/test/invoices.test.ts`, beside the other expense route tests,, test `POST /expenses` with `recurring: false` and a `spentOn`, and the `422 VALIDATION_FAILED` cases: no `spentOn` on a one-off, a `spentOn` on a recurring one, amount `0`, blank description. Test `GET /expenses?status=open` returns recurring first, then by `spentOn`.
- [X] T010 [P] [US2] In `apps/web/src/components/client-list.stories.tsx`, one story per scenario, each with a `play` that asserts it:
  - `AddExpense` (US2 scenario 1): press **+ Expense** on Northwind, fill the dialog, save; the row shows under Expenses.
  - `EditExpense` (US2 scenario 2): click Figma, change the amount to 150, save; the row shows $150.00.
  - `DeleteExpense` (US2 scenario 2): click Figma, press Delete; the row is gone.
  - `NoExpenses`: a client with none shows no Expenses label, only **+ Project** and **+ Expense**.
  - Remove the `Archived`, `All` and `ArchivedClientActiveProject` filter stories; add `ArchivedShown`: an archived client and project show with their Archived badges.

### Implementation

- [X] T011 [US2] In `apps/web/src/app/api/v1/expenses/route.ts` and `[id]/route.ts`: accept `recurring`; implement `status=open` (recurring, unbilled, and on a `draft` or `sent` invoice) and `unbilled` (recurring and unbilled), ordered recurring first then `spent_on`, with each row's invoice via `withInvoices` (`research.md` R7); `PATCH` with `recurring: true` clears `spent_on`, and returns `422` when the expense has an invoice.
- [X] T012 [P] [US2] Create `apps/web/src/components/expense-row.tsx`: `ExpenseRow`, one line per the design: name (`type-control text-strong`, truncating), a `type-badge` label (**↻ Recurring**, or the invoice number when billed), the date (`type-meta text-subtle`, blank when recurring), the amount (`type-duration`), then a Pencil, or an arrow when billed. A billed row's name and amount step down to `text-muted`. The row is a button like `client-list.tsx`'s project `Row`; an optional `leading` slot takes New invoice's checkbox and hides the trailing icon.
- [X] T013 [P] [US2] Create `apps/web/src/components/expense-dialog.tsx`: `ExpenseDialog` for add and edit, per the design: Description, Amount and Date paid, a **Recurring** checkbox with "Billed on every invoice to {client} until unchecked.", and Note. Checking Recurring hides Date paid. Editing adds Delete on the left. Writes go through `useOptimisticMutation` (Principle VI): save predicts the row into `keys.expenses()`, delete predicts its removal; errors stay in the open dialog.
- [X] T014 [US2] Create `apps/web/src/components/client-expenses.tsx`: `ClientExpenses`, given a client and its expenses, renders the **Expenses** `type-label` and the rows, or nothing when there are none. A row opens `ExpenseDialog`; a billed row links to `/invoices/{id}`.
- [X] T015 [US2] In `apps/web/src/components/client-list.tsx`: remove `FilterTabs`, the `status` param and its empty-state branches; load clients and projects with archived included; load `GET /expenses?status=open` once and group by `clientId`; render `ClientExpenses` under each card's projects; replace the footer button with **+ Project** and **+ Expense** side by side (ghost, `size="sm"`). "No client" keeps only **+ Project**. Update the doc comment to say what the card holds.
- [X] T016 [US2] Delete `apps/web/src/components/expense-list.tsx` and `apps/web/test/ui/expense-list.test.tsx`. In `apps/web/src/components/invoice-list.tsx`, remove the Expenses tab and its branch, and its story in `invoice-list.stories.tsx`.

**Checkpoint**: T010's stories pass in `pnpm --filter @stint/web test:stories`; on local Stint, Clients matches the design's Clients screen.

---

## Phase 4: User Story 1 - Bill a pre-approved cost on this month's invoice (P1)

**Goal**: New invoice lists the client's expenses as ticked rows, shows its preview in its own card, and bills them.

**Independent test**: New invoice for Northwind, September: Figma is ticked; Preview shows services, then Expenses, then Services, Expenses and Total; generate.

### Tests

- [X] T017 [P] [US1] In `apps/web/src/components/invoice-new.stories.tsx`, one story per scenario with a `play`:
  - `WithExpenses` (US1 scenario 1): the Preview card lists Figma under Expenses with its date and amount, and no quantity or rate.
  - `GenerateWithExpenses` (US1 scenario 2): generating shows Services, Expenses and a Total equal to both.
  - `OnlyExpenses` (US1 scenario 3): a period with no time generates with only Expenses.
  - `NoExpenses` (US1 scenario 4): no Expenses section anywhere.
  - `UntickExpense` (edge case): unticking Figma clears the preview, and the next preview leaves it out.
  - `AddExpenseHere` (US2 scenario 3): **+ Expense** opens the dialog with Northwind chosen; the saved expense joins the list, ticked.
- [X] T018 [P] [US1] In `apps/web/src/components/invoice-detail.stories.tsx`, `WithExpenses`: an issued invoice shows the Expenses section and `expensesSubtotal`.

### Implementation

- [X] T019 [US1] In `apps/web/src/components/invoice-new.tsx`: under Expenses, render the client's `GET /expenses?status=unbilled&clientId` as `ExpenseRow`s with a ticked checkbox in `leading`; unticking adds the id to `excludedExpenseIds` and clears the approved preview; **+ Expense** under the list opens `ExpenseDialog` with the client chosen. Remove `ExpenseRows` and its old markup.
- [X] T020 [US1] In `apps/web/src/components/invoice-new.tsx`, move the preview into its own `Panel` below the inputs, headed **Preview** (`type-section`) with the period on the right (`type-support text-subtle`). The inputs keep the Preview button; **Generate invoice** moves to the preview card, under the totals.

**Checkpoint**: T017 and T018 pass; the September invoice can be built on local Stint.

---

## Phase 5: User Story 3 - An invoiced expense cannot change under the client (P2)

**Goal**: A billed one-off is locked, shown muted on its card with its invoice, and released by void.

**Independent test**: Generate and send; the card shows the expense muted with the invoice number and it opens the invoice; void; it opens its dialog again.

### Tests

- [X] T021 [P] [US3] In `apps/web/test/invoices.test.ts`, keep the lock and void cases and add: `status=open` includes a one-off on a `sent` invoice with its number, and leaves it out once the invoice is `paid`.
- [X] T022 [P] [US3] In `apps/web/src/components/client-list.stories.tsx`: `BilledExpense` (US3 scenario 1): Byrne's Stock photography shows muted with `STINT-0015` and links to the invoice; `PaidExpenseGone`: once INV-15 is paid, the row is gone.

### Implementation

- [X] T023 [US3] Make T021 and T022 pass on the work from T011 and T012, and show `EXPENSE_LOCKED` in `apps/web/src/components/expense-dialog.tsx` when a stale card opens an expense that was just billed.

---

## Phase 6: User Story 4 - A subscription the client reimburses on every invoice (P2)

**Goal**: A recurring expense is offered, ticked, on every invoice for its client, dated the period's end, and never locked.

**Independent test**: Mark Claude Max recurring; generate September (line dated Sep 30); start another invoice: it is ticked again; delete it: later invoices do not offer it, September keeps its line.

### Tests

- [X] T024 [P] [US4] In `apps/web/test/invoices.test.ts`, replace the recurrence cases with:
  - US4 scenario 1: a recurring expense is on the September preview, its line dated `2026-09-30`.
  - US4 scenario 2: after generating September, the October preview includes it again, and the expense's `invoice_id` is still null.
  - US4 scenario 3: changing its amount changes the next preview; September's line keeps the old amount.
  - US4 scenario 4: deleting it removes it from the next preview; September's line stays.
  - Voiding an invoice that billed it leaves the expense unchanged.
  - The database refuses `invoice_id` on a recurring row (`recurring_never_billed`).
- [X] T025 [P] [US4] In `apps/web/src/components/client-list.stories.tsx`, `RecurringExpense`: Northwind's Claude Max shows **↻ Recurring** and no date; clicking it opens the dialog with Recurring checked and no date field. In `apps/web/src/components/invoice-new.stories.tsx`, `RecurringTicked`: Claude Max is ticked and its preview line is dated Sep 30, 2026.

### Implementation

- [X] T026 [US4] In `apps/web/src/lib/invoicing.ts`, rename `loadUnbilledExpenses` to `loadBillableExpenses`: it returns the client's recurring expenses with `spentOn` set to `periodEnd`, plus unbilled one-offs with `spent_on <= periodEnd` (`research.md` R6), minus `excludedExpenseIds`, each marked recurring or not.
- [X] T027 [US4] In `apps/web/src/app/api/v1/invoices/route.ts`, pass only one-off ids as `p_expense_ids` to `create_invoice`; recurring lines are frozen but not attached (`research.md` R5, R9).
- [X] T028 [US4] Mirror T026 and T027 in `apps/web/src/mocks/derive.ts` (`invoicePreview`) and `apps/web/src/mocks/handlers.ts` (create), so `mocks-parity.test.ts` holds.

---

## Phase 7: Polish

- [X] T029 [P] Update `docs/api.md`: `/expenses` with `recurring`, `status=open|unbilled` and the invoice reference; remove `/recurring-expenses`.
- [X] T030 [P] Update `docs/data-model.md`: `expenses.recurring`, its two checks, and recurring lines dated the period's end; remove the recurrence table and producer.
- [X] T031 Run `pnpm verify:static`, `pnpm verify:db` and `pnpm --filter @stint/web test:stories`. Walk `quickstart.md` on local Stint, signed in to the seeded account, in dark and light and at phone width, and compare each screen with `design/expenses.html`. Screenshot Clients, New invoice and the PDF for the PR's Try it.
- [ ] T032 Ask Blake before force-pushing `f48-expenses`; then update the Try it section of BlakeEriks/stint#126 and add `ready-for-qa` once CI is green.

---

## Dependencies

- Phase 2 blocks everything. T002 before T003; T004 and T005 before T006 and T011.
- US2 (Phase 3) before US1 (Phase 4): New invoice reuses `ExpenseRow` and `ExpenseDialog`.
- US3 and US4 depend on Phase 3's route and components, not on each other.
- Polish last.

## Parallel examples

- Phase 2: T004 and T005 together, then T007 beside T006.
- US2: T009 and T010 together; then T012 and T013 together.
- US1: T017 and T018 together.
- US3 and US4 side by side once US1 lands.

## Implementation strategy

The September invoice needs Phases 2 to 4: record on the card, bill on New
invoice. Phase 5 mostly verifies work already built. Phase 6 is three small
changes behind its tests. If time runs short, stop at the Phase 4 checkpoint
and send the September invoice.
