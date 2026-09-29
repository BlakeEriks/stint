Closes #48

# Feature Specification: Reimbursable expenses on the invoice

**Feature Branch**: `f48-expenses`

**Created**: 2026-09-27

**Status**: Draft

**Input**: GitHub issue #48, "Reimbursable expenses on the invoice". Due
30 September 2026: the September invoice to the one client is the first that
has to leave Stint rather than be assembled beside it. A client pre-approved
a cost (tooling, a license, travel) and reimburses it on the invoice. An
expense has an amount and no duration, so it is its own subtotal below
services, never a time entry and never hours × rate. It freezes and locks
when invoiced, as an entry does. The spec decides whether an expense is a
row that waits to be invoiced or is typed onto the invoice at generation,
and whether a receipt attaches.

## Decisions the issue asked for

**An expense is a row that waits to be invoiced**, the way unbilled time
does. The cost is paid on the day it happens, often weeks before the invoice.
Typed at generation, it depends on the contractor remembering it at month end,
and a forgotten reimbursement is money lost. A waiting row is also what "locks
when invoiced, as an entry does" describes: only a stored record can be
locked. The flat **charges** the new-invoice screen already takes
(`docs/design/screens/invoices.html`) stay for what is billed as service: a
fixed fee, a deposit, a retainer. An expense is no longer entered as a charge.

**No receipt attaches.** The contractor sends the invoice from their own
address (`docs/design/principles.md`), so receipts travel in the same email.
Storing files is new infrastructure that the 30 September deadline cannot
carry. Each expense takes an optional free-text note, which can hold a
receipt or order number.

## Clarifications

### Session 2026-09-27

- Q: Should an expense that hasn't been invoiced yet count toward Home's Unbilled figure? → A: No. Unbilled stays work-only; waiting expenses show on the expenses list and in the invoice preview.
- Q: Where should you record and review expenses that are waiting to be invoiced? → A: An Expenses tab on the Invoices screen, beside Open / Paid / All. (Superseded 2026-09-28: the client's page.)
- Q: When you build a client's invoice for a period, which waiting expenses should the preview pick up? → A: Every waiting expense for that client dated on or before the period's end, including earlier months.
- Q: Can an expense recur, so a monthly subscription is not re-entered every month? → A: Yes. (Refined 2026-09-29: a recurring expense is billed on every invoice.)

### Session 2026-09-28

- Q: Where should you record and review expenses, now that they're no longer a filter tab on Invoices? → A: On the client's page, in an Expenses section with Monthly beneath it. Invoices' tabs stay filters over invoices. The new-invoice screen keeps its list of the client's waiting expenses and its way to add one.

### Session 2026-09-29

- Q: Where are expenses added and managed? → A: On each client's card on the Clients screen, and on the new-invoice screen. Nowhere on the Invoices list.
- Q: How does an expense recur? → A: One Recurring checkbox on the expense. A recurring expense is never used up: it stays on the client's card and is ticked on every new invoice for that client. There is no schedule and no separate recurrence form.
- Q: What happens to a one-off expense once billed? → A: It stays on the client's card, muted and tagged with its invoice, until that invoice is paid, then leaves the card.

## Design

The picked design is [`design/expenses.html`](design/expenses.html).

- **Client card, Clients screen**: the card's projects, then an Expenses
  label and the client's expenses, then a **+ Project** and a **+ Expense**
  button side by side. The label and its rows show only when the client has
  an expense. The screen has no Active, Archived or All filter: every client
  and project shows, an archived one with its Archived badge.
- **Card body indent**: the rows, the Expenses label and the two buttons
  start where the client's name does, past its dot, with no bullet; amounts
  and pencils stay on the right edge.
- **Expense row**: one line, name first, then a label, the date and the
  amount, then a pencil. Recurring expenses come first, labeled
  **↻ Recurring** and undated. Waiting one-off expenses follow, dated. A
  one-off on an unpaid invoice comes last, muted and labeled with the
  invoice number, and ends in an arrow instead of the pencil.
- **Clicking a row** opens the expense dialog. A billed one-off opens its
  invoice instead, since it is locked. A one-off leaves the card when its
  invoice is paid.
- **Expense dialog**: one dialog for adding and editing, with a
  description, an amount, the date paid, a **Recurring** checkbox ("Billed
  on every invoice to <client> until unchecked") and a note. Checking
  Recurring hides the date. Editing adds **Delete**.
- **New invoice, inputs card**: client, period, then Expenses listing the
  client's recurring and waiting expenses in the same rows, each ticked,
  with a checkbox in front and no pencil. Unticking leaves one off this
  invoice. **+ Expense** under the list opens the expense dialog with the
  client chosen. Charges and the Preview button follow.
- **New invoice, Preview card**: a separate card below the inputs, headed
  Preview with the period. It holds the services lines, then the Expenses
  lines with their dates, then the Services, Expenses and Total figures and
  **Generate invoice**. A recurring expense is dated the period's last day.
- **Empty**: a client with no expenses shows no Expenses label, only the two
  buttons. New invoice with nothing waiting shows only **+ Expense** under
  Expenses, and the preview has no Expenses section.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bill a pre-approved cost on this month's invoice (Priority: P1)

The contractor bought a license the client approved. They record it as an
expense for that client, with the date and amount. When they build the
month's invoice, the expense appears under its own heading below the time
lines, with its own subtotal, and the invoice total covers both.

**Why this priority**: This is the September invoice. Without it the invoice
is short by the expense or is built outside Stint.

**Independent Test**: Record one expense for a client, dated inside a period
that also has billable time. Preview and generate the invoice for that client
and period. The PDF shows services with their subtotal, then expenses with
theirs, and a total equal to both.

**Acceptance Scenarios**:

1. **Given** an unbilled expense for Acme dated 12 September, **When** the
   contractor previews Acme's invoice for 1–30 September, **Then** the
   expense appears under an expenses heading after the services, with its
   date, description and amount, and no quantity or rate.
2. **Given** that preview, **When** the contractor generates the invoice,
   **Then** the invoice shows a services subtotal, an expenses subtotal and a
   total equal to the services total plus the expenses subtotal.
3. **Given** a period with expenses and no billable time, **When** the
   contractor generates, **Then** the invoice is created with only the
   expenses section.
4. **Given** a period with no expenses, **When** the contractor generates,
   **Then** the invoice has no expenses section and looks as it does today.

---

### User Story 2 - Record an expense when it happens (Priority: P1)

The day the contractor pays for a flight, they record it: client, date,
description, amount, and optionally a note. It waits with the
client's other unbilled expenses until an invoice takes it. They can
correct or delete it while it waits.

**Why this priority**: User Story 1 has nothing to bill without it.

**Independent Test**: Record an expense, see it listed as unbilled for its
client, edit its amount, delete a second one, and confirm the first still
waits.

**Acceptance Scenarios**:

1. **Given** the contractor has a client, **When** they record an expense
   with a date, description and amount from that client's card, **Then** it
   is listed there as waiting.
2. **Given** an unbilled expense, **When** the contractor edits or deletes
   it, **Then** the change is saved.
3. **Given** the new-invoice screen for a client and period, **When** the
   contractor records an expense there, **Then** it is saved as a waiting
   expense and, if it is dated on or before the period's end, joins the
   preview.

---

### User Story 3 - An invoiced expense cannot change under the client (Priority: P2)

Once an invoice is issued, the expenses on it are frozen and locked, the same
as its time entries: the amount the client was asked to reimburse cannot
change. Voiding the invoice releases them to wait again.

**Why this priority**: This follows the trust rules for entries
(`docs/data-model.md`, "Billed entries are immutable"), and the same wrong
number would cost the same credibility.

**Independent Test**: Generate an invoice with an expense, try to edit and
delete the expense and see both refused, void the invoice, then edit the
expense successfully.

**Acceptance Scenarios**:

1. **Given** an expense on a sent or paid invoice, **When** anyone edits or
   deletes it, **Then** the change is refused and the expense is unchanged.
2. **Given** an expense on a draft invoice, **When** the contractor edits it,
   **Then** the edit is allowed and the draft still shows the amount it was
   generated with.
3. **Given** an issued invoice with an expense, **When** the expense record
   is edited after the invoice is voided, **Then** the voided invoice still
   shows the original amount.
4. **Given** a sent invoice with expenses, **When** it is voided, **Then**
   its expenses return to unbilled and a later invoice for that client can take them.

---

### User Story 4 - A subscription the client reimburses on every invoice (Priority: P2)

The contractor pays for a tool every month that the client reimburses. They
record it once and check Recurring. It stays on the client's card and is
ticked on every invoice they build for that client, without being entered
again.

**Why this priority**: It saves re-entering the same line every month, but
the September invoice can be built without it.

**Independent Test**: Record a recurring expense. Generate an invoice for
the client and see it on the invoice. Build the next invoice and see it
ticked again. Uncheck Recurring and see it offered no more after that.

**Acceptance Scenarios**:

1. **Given** a recurring expense for Northwind, **When** the contractor
   previews Northwind's invoice for September, **Then** the expense is on it,
   dated 30 September.
2. **Given** that expense was billed on August's invoice, **When** the
   contractor builds September's, **Then** it is offered and ticked again.
3. **Given** a recurring expense, **When** the contractor changes its amount,
   **Then** later invoices use the new amount and issued ones keep theirs.
4. **Given** a recurring expense, **When** the contractor deletes it, **Then**
   no later invoice offers it and invoices that billed it keep their line.

### Edge Cases

- An unbilled expense from an earlier month joins the next invoice for its
  client, so one missed invoice does not strand it. An expense dated after
  the period's end is not on the preview and keeps waiting.
- The contractor can leave an individual expense off one invoice; it keeps
  waiting and is not lost.
- Adding, editing, removing or excluding an expense on the new-invoice screen
  clears the approved preview, as changing a charge, the client or the period
  does. The same set that was approved is the set that is generated.
- An expense for a client with a different currency is billed in that
  client's currency. Stint does not convert.
- Two invoices generated at once for the same client cannot both take the
  same expense.
- A recurring expense bills once per invoice, not per month. Two invoices
  to one client in a month each offer it, ticked; the contractor unticks it
  on the second.
- Voiding an invoice leaves its recurring expenses as they were: they were
  never used up.
- An archived client's unbilled expenses stay unbilled and still reach an
  invoice for that client.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The contractor MUST be able to record an expense with a client,
  a date, a description and an amount above zero, and optionally a note.
- **FR-002**: An expense MUST NOT carry a duration, a quantity or a rate, and
  MUST NOT count toward hours anywhere in the app.
- **FR-003**: Each client's card on the Clients screen MUST list that
  client's recurring expenses, waiting expenses, and expenses on an unpaid
  invoice with its number, and the contractor MUST be able to add, edit and
  delete them there. The new-invoice screen MUST let the contractor add one.
  The Invoices list has no expenses. No new screen is added.
- **FR-004**: The invoice preview for a client and period MUST include every
  recurring expense for that client and every unbilled expense dated on or
  before the period's end, including ones from earlier months, and the
  contractor MUST be able to leave any of them off that invoice.
- **FR-005**: The invoice MUST show expenses after all service lines, under
  their own heading, with their own subtotal. Each expense line MUST show its
  date, description and amount, and no quantity or rate.
- **FR-006**: The invoice total MUST equal the services total (including any
  tax on services) plus the expenses subtotal. Tax MUST NOT apply to
  expenses.
- **FR-007**: The preview and the generated invoice MUST come from the same
  computation, so what was approved is what gets created
  (`docs/data-model.md`, "Rate resolution").
- **FR-008**: An invoice whose only lines are expenses MUST be allowed.
- **FR-009**: At generation, each expense's date, description and amount MUST
  be frozen onto the invoice, so a later change to the expense record cannot
  alter an issued invoice.
- **FR-010**: An expense on a non-draft invoice MUST be rejected for edit and
  delete by the database, not only by the app. An expense on a draft invoice
  stays editable, but the draft keeps the line frozen at generation. To bill
  the edited figure, the contractor deletes the draft and generates again.
- **FR-011**: Voiding an invoice, or deleting a draft, MUST release its
  expenses back to unbilled.
- **FR-012**: A one-off expense MUST be on at most one invoice at a time,
  including when two invoices are generated at once.
- **FR-013**: One contractor's expenses MUST be invisible to every other
  user.
- **FR-014**: The new-invoice screen's charges MUST no longer describe
  themselves as a place for rebilled expenses.
- **FR-015**: Unbilled expenses MUST NOT count toward Earned or Unbilled
  (`docs/design/principles.md`, "Money"): both are readings about work, and a
  reimbursement is not money earned from work. A waiting expense is seen on
  the expenses list and in the invoice preview.
- **FR-016**: Awaiting payment and Collected MUST include expenses, because
  both are read from the invoice total, which is what the client owes and
  pays.

- **FR-017**: The contractor MUST be able to mark an expense recurring, and
  unmark it, in the same dialog that adds and edits it. A recurring expense
  has no date.
- **FR-018**: A recurring expense MUST be offered on every invoice for its
  client and MUST never be billed away, locked or released. On each invoice
  it is frozen as a line dated the period's last day, under FR-009.
- **FR-019**: Editing or deleting a recurring expense MUST change only
  invoices generated afterward.

### Key Entities

- **Expense**: A cost the contractor paid that a client reimburses. It has a
  client, a description, an amount in the client's currency, an optional
  note, and whether it recurs. A one-off also has a date and the invoice it
  is billed on, if any.
- **Invoice line (expense)**: The frozen copy of an expense on an issued
  invoice: its date, description and amount at generation. It is kept apart
  from service lines so the invoice can subtotal each.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The September 2026 invoice to the one client, including its
  reimbursable expenses, is generated in Stint and sent by 30 September 2026
  with no figure assembled outside Stint.
- **SC-002**: On every invoice with expenses, services subtotal plus tax plus
  expenses subtotal equals the total to the cent.
- **SC-003**: Recording an expense takes under 30 seconds from opening the
  form.
- **SC-004**: No issued invoice's expense amount can be changed by any path.
  Every attempt is refused.

## Assumptions

- Web app only. The macOS app does not record expenses
  (`docs/design/principles.md`, "Platform scope").
- An expense is billed at cost, with no markup.
- An expense always belongs to a client. A cost with no one to reimburse it
  is not an expense this feature tracks.
- The invoice PDF and the invoice screen present expenses the same way.
- Archive, don't delete applies to clients and projects. An unbilled expense
  is referenced by nothing, so deleting it is allowed, as for an unbilled
  entry.
- No import of expenses from other tools, no receipt storage, no mileage or
  per-diem calculation, and no recurrence schedule.
