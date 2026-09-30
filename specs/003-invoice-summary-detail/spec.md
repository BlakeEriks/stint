Closes #188

# Feature Specification: Invoice summary with supporting detail

**Feature Branch**: `f188-invoice-summary`

**Created**: 2026-09-30

**Status**: Draft

**Input**: GitHub issue #188 ("Invoice: a one-line summary with supporting
detail below the total"), and invoice 2026-001 to SystemSphere, which Blake
built by hand because Stint could not produce it

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One summary line and a clean total (Priority: P1)

Blake bills one client by the hour at one rate across eight workstreams. On
the new-invoice screen he picks the "Summary" grouping and types a
description, "Software consulting services". The invoice shows one line: that
description, the service period beneath it, the total hours, the rate and the
amount. The total sits directly under it.

**Why this priority**: Accounts payable reads the total, not the work. Every
grouping today puts a line per task, project or day in the summed table, so
the total is buried. This story alone makes page one presentable.

**Independent Test**: Generate an invoice over a month of entries at one rate
with Summary grouping; the document has exactly one time line, and its hours
and amount equal the month's billable total.

**Acceptance Scenarios**:

1. **Given** billable entries in the period all at $80.00, **When** Blake
   picks Summary and previews, **Then** the preview shows one time line with
   the period's total hours, $80.00 and the summed amount.
2. **Given** Summary is picked and the description is left untouched,
   **When** the invoice is generated, **Then** the line reads "Professional
   services" with the service period beneath it.
3. **Given** entries at $80.00 and others at $120.00, **When** Blake picks
   Summary, **Then** there are two lines, one per rate, each with the same
   description and its own hours and amount.
4. **Given** Summary is picked and the description is cleared, **When** Blake
   tries to generate, **Then** the form stays open and says a description is
   required.
5. **Given** an issued Summary invoice, **When** Blake opens it later,
   **Then** the line reads exactly as issued, whatever has since been renamed.

---

### User Story 2 - Supporting detail, starting on page 2 (Priority: P2)

Blake ticks which schedules to attach: by project, by week, by date, by task.
The invoice's first page holds only the invoice itself: parties, lines,
totals, payment details and notes. Each ticked schedule is printed after it,
the first always starting a new page. The schedules show where the hours
went and are never added into the total.

**Why this priority**: The project lead wants hours by project, and without
it the summary line is unverifiable. It depends on nothing in Story 1 to be
useful, but is what makes Story 1 acceptable to a client.

**Independent Test**: Generate an invoice with "by project" and "by week"
ticked; page one ends after the payment details and notes, page two opens
with "Detail by project", and the invoice total is unchanged from the same
invoice with nothing ticked.

**Acceptance Scenarios**:

1. **Given** no schedule is ticked, **When** the invoice is generated,
   **Then** the document is exactly what it is today.
2. **Given** "by project" is ticked, **When** the invoice is generated,
   **Then** page two opens with a schedule of one row per project, sorted by
   hours descending, and the invoice total is unchanged.
3. **Given** page one has room left, **When** a schedule is ticked, **Then**
   the schedule still starts on page two.
4. **Given** several schedules are ticked, **When** the invoice is generated,
   **Then** they print in a fixed order: by project, by task, by week, by
   date.
5. **Given** a schedule runs past the end of a page, **When** it continues,
   **Then** its title and column headings repeat on the next page, and no row
   is split across pages.
6. **Given** an entry with no project, **When** "by project" is printed,
   **Then** its hours appear in a row named "Unassigned".
7. **Given** an issued invoice with schedules, **When** it is downloaded
   again later, **Then** the schedules are identical to the first download.
8. **Given** the invoice detail screen, **When** Blake views an invoice with
   schedules, **Then** the screen names which schedules the document carries.

---

### User Story 3 - PO / SOW reference (Priority: P3)

Blake types "ICA dated Aug 5, 2026 · Exhibit A SOW" into an optional
Reference field. It prints in the invoice header. Next month, for the same
client, the field already holds it.

**Why this priority**: A client's accounts payable often matches an invoice
to a purchase order or contract and rejects one without it. It is a single
field, independent of the rest.

**Independent Test**: Generate an invoice with a reference; the document
header shows it. Start a second invoice for the same client; the field is
prefilled.

**Acceptance Scenarios**:

1. **Given** a reference is typed, **When** the invoice is generated,
   **Then** the header prints it, labeled "Reference".
2. **Given** the reference is empty, **When** the invoice is generated,
   **Then** the header has no reference row.
3. **Given** the client's most recent invoice carried a reference, **When**
   Blake starts a new invoice for that client, **Then** the field is
   prefilled with it and can be edited or cleared.
4. **Given** a prefilled reference is cleared, **When** the invoice is
   generated, **Then** the invoice has no reference.

---

### User Story 4 - Reimbursable expenses (Priority: P4)

Blake adds a charge, "Claude Code — $100/mo plan", and marks it an expense.
The totals block prints "Services" and "Reimbursable expenses" as separate
amounts above the total, so the client sees what was earned and what was
passed through.

**Why this priority**: A contractor who rebills costs must show them apart
from fees; the client books them differently. Charges can already be added,
so only the distinction is missing.

**Independent Test**: Generate an invoice with time and one charge marked an
expense; the totals block shows Services, Reimbursable expenses and the
total, and the two parts sum to the total.

**Acceptance Scenarios**:

1. **Given** one charge is marked an expense, **When** the invoice is
   generated, **Then** the totals block prints "Services" and "Reimbursable
   expenses" above the total, and they sum to the subtotal.
2. **Given** no charge is marked an expense, **When** the invoice is
   generated, **Then** the totals block is exactly what it is today.
3. **Given** a charge not marked an expense, **When** an invoice also carries
   an expense, **Then** the unmarked charge counts toward Services.
4. **Given** expense and non-expense charges, **When** the invoice prints,
   **Then** expenses are listed after every other line.

---

### Edge Cases

- A schedule row's amount is rounded once for that row, so a schedule's rows
  can sum to a cent more or less than the invoice line. The rows are never
  adjusted to match.
- A week that the period cuts short prints only its days inside the period
  ("Aug 31").
- An entry that crosses midnight counts on the day it started, as the "day"
  grouping does today.
- Summary grouping with no billable time and only charges: no time line,
  charges only, as any grouping today.
- An unrated entry blocks generation in Summary as in every grouping.
- A schedule of one row (one project, one week) still prints when ticked.
- "By task" over a month may run to several pages; page numbers print on
  every page.
- A voided and reissued invoice keeps the reference, description and schedule
  choice of the original unless changed.

## Requirements *(mandatory)*

### Functional Requirements

**Summary grouping**

- **FR-001**: Users MUST be able to choose a Summary grouping alongside the
  existing four.
- **FR-002**: Summary MUST produce one time line per distinct rate; entries
  at different rates MUST NOT share a line.
- **FR-003**: Users MUST be able to type the summary line's description; it
  defaults to "Professional services" and MUST NOT be empty.
- **FR-004**: A summary line MUST print the service period beneath its
  description.
- **FR-005**: A summary line's hours and amount MUST be computed from the
  summed time, rounded once, as every other grouping is.
- **FR-006**: The preview MUST show the summary line exactly as it will be
  issued.

**Supporting detail**

- **FR-007**: Users MUST be able to attach any of four schedules: by project,
  by task, by week, by date.
- **FR-008**: Schedules MUST be offered
  [NEEDS CLARIFICATION: in every grouping, or only with Summary?].
- **FR-009**: The first schedule MUST start on a new page; page one MUST hold
  only the invoice itself, however much room it has left.
- **FR-010**: Schedules MUST NOT change any line, subtotal, tax or total.
- **FR-011**: Each schedule MUST cover exactly the entries the invoice bills.
- **FR-012**: By project, by task and by week MUST print hours per row
  [NEEDS CLARIFICATION: and an amount per row, which can differ from the
  invoice line by a cent, or hours only?]; by date prints date, day, project
  and hours.
- **FR-013**: A schedule that continues onto another page MUST repeat its
  title and column headings, and MUST NOT split a row.
- **FR-014**: An issued invoice's schedules MUST be the same on every
  download.
- **FR-015**: The invoice detail screen MUST name the schedules an invoice
  carries.

**Reference**

- **FR-016**: Users MUST be able to give an invoice an optional free-text
  reference, printed in the header only when present.
- **FR-017**: The reference field MUST be prefilled from the same client's
  most recent non-void invoice, and stay editable.

**Reimbursable expenses**

- **FR-018**: Users MUST be able to mark a charge as an expense.
- **FR-019**: When any line is an expense, the totals block MUST print
  "Services" and "Reimbursable expenses" above the total; otherwise it is
  unchanged.
- **FR-020**: Expense lines MUST print after every other line.

**Across all four**

- **FR-021**: Everything a user chose (grouping, description, schedules,
  reference, expense marks) MUST be frozen when the invoice is issued.
- **FR-022**: The summary description and schedule choice MUST be
  [NEEDS CLARIFICATION: prefilled from the client's last invoice, as the
  reference is, or chosen fresh each time?].
- **FR-023**: An invoice that uses none of these MUST be identical to what is
  produced today.

### Key Entities

- **Invoice**: gains a Summary grouping, the summary description, the set of
  schedules it carries, and an optional reference.
- **Invoice line**: a charge gains an expense mark.
- **Schedule**: a view of the invoice's billed entries bucketed by project,
  task, week or date. Derived, never stored; it is stable because the entries
  an issued invoice bills cannot change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Blake can reproduce invoice 2026-001 to SystemSphere in Stint:
  one services line, one expense, split totals, the reference, and schedules
  by week, by project and by date from page two.
- **SC-002**: A month of work at one rate yields a first page with one time
  line, whatever the number of projects or tasks.
- **SC-003**: For any invoice, the total with schedules attached equals the
  total without them, to the cent.
- **SC-004**: No schedule ever begins on page one.
- **SC-005**: An invoice that uses none of the four additions is
  byte-for-byte the document produced before this feature.
- **SC-006**: A second invoice to the same client needs no retyping of the
  reference.

## Assumptions

- Tax is computed as today, on the subtotal of every line, expenses included.
  The default rate is 0; excluding expenses from tax is out of scope.
- A week runs Monday through Sunday, in the user's time zone, as elsewhere in
  the app.
- The rows of a schedule that carries amounts use each entry's resolved rate,
  the same rates the invoice lines use.
- Schedules by project and by task sort by hours descending, then by name;
  by week and by date sort chronologically.
- An "Attn:" line is out of scope: the client address is free text and
  already holds one. Invoice number formats are out of scope.
- The web app is the only place invoices are created; the macOS app is
  unaffected.
- The change needs a database migration, so its PR is the one open
  `migration` PR while it is in review.
