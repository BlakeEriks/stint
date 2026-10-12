Closes #58
Closes #148

# Feature Specification: Export your records

**Feature Branch**: `f58-csv-export`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Issue #58, "CSV export of entries and invoices" (Alpha), and issue
#148, "Export your records" (Launch). A contractor deciding whether to trust
years of billing records to an unknown tool asks first whether they can get
them out; the IRS expects three to seven years of retention. Without an
export, Stint looks like the lock-in `docs/positioning.md` sells against, and
positioning already promises that records get out free. The accountant's
version is the invoice list: issue date, paid date, client and total. Rates
must be in the entry export, and `0` is a real rate.

## Design

Design review: skipped in autonomous run; follows existing screens and
`.claude/rules/web-ui.md`. The Export section is a Settings section like
Import beside it: a title, one line of description, and two buttons, each a
plain download link like the invoice's Download PDF.

## Clarifications

### Session 2026-10-12

- Q: Are dates written US style (`MM/DD/YYYY`) or ISO (`YYYY-MM-DD`)? → A: US
  style, with 12-hour times, in the user's time zone. Positioning makes US
  formats the baseline, and US spreadsheets read them as dates. (decided
  autonomously — Blake to review)
- Q: What rate does an entry an invoice already billed show: the one it
  resolves to now, or the one that billed it? → A: The one it resolves to
  now. No stored record ties an entry to the line that billed it, and adding
  one needs a migration; the Invoice column points to the invoice, whose
  frozen totals in the invoices file are what was billed. (decided
  autonomously — Blake to review)
- Q: Which invoices does the invoices file include? → A: Every one: draft,
  sent, paid and void, with the status in its own column. A void row
  explains a gap in the numbering, and a draft is the user's record too.
  (decided autonomously — Blake to review)
- Q: Can the user narrow an export by date range or client? → A: No; each
  file is the whole history. A retention copy wants everything, a
  spreadsheet filters, and a filter adds controls for no file a spreadsheet
  can't already make. (decided autonomously — Blake to review)
- Q: How is a cell that a spreadsheet would run as a formula neutralized? →
  A: A single quote is put before it, as OWASP recommends, on text cells
  only; numbers are written as numbers. (decided autonomously — Blake to
  review)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hand the accountant every invoice (Priority: P1)

At tax time, the contractor opens Settings, downloads their invoices as a
CSV, and emails it to their accountant. The accountant opens it in a
spreadsheet and sees one row per invoice: its number, client, status, issue
date, paid date and total, and can sum what was collected in the year.

**Why this priority**: The issue names it the highest value per line of code,
and it is what an accountant asks for.

**Independent Test**: Signed in with issued, paid, draft and void invoices,
download the invoices CSV and confirm it opens in a spreadsheet with one row
per invoice and figures that match each invoice's screen.

**Acceptance Scenarios**:

1. **Given** a user with invoices, **When** they download the invoices CSV,
   **Then** the file has one row per invoice, every status included, newest
   issue date first.
2. **Given** a paid invoice, **When** it is exported, **Then** its row carries
   the day it was paid; an unpaid one leaves that cell empty.
3. **Given** a voided invoice, **When** it is exported, **Then** its row says
   Void, so a gap in the numbering is explained.
4. **Given** a user with no invoices, **When** they download the invoices
   CSV, **Then** the file holds the header row only.

---

### User Story 2 - Take every entry, with its rate (Priority: P1)

The contractor downloads their time entries as a CSV to keep alongside their
tax records, or to move to another tool. Each row says when the work was
done, for how long, for which client and project, what the task was, whether
it was billable, the rate it resolves to, what it is worth, and which invoice
billed it.

**Why this priority**: Entries are the bulk of the records, and the promise
that records leave free is about them.

**Independent Test**: Signed in with entries at every rate level, including a
rate of `0` and an entry with no rate anywhere, download the entries CSV and
confirm each row's hours, rate and amount.

**Acceptance Scenarios**:

1. **Given** a user with entries, **When** they download the entries CSV,
   **Then** the file has one row per finished entry, oldest first.
2. **Given** an entry whose rate resolves to `0`, **When** it is exported,
   **Then** its rate reads `0.00` and its amount `0.00`, never empty.
3. **Given** a billable entry with no rate at any level, **When** it is
   exported, **Then** its rate and amount are empty and its rate source reads
   `none`.
4. **Given** an entry billed on an invoice, **When** it is exported, **Then**
   its row names that invoice's number; one billed in another tool reads
   `Invoiced elsewhere`.
5. **Given** a non-billable entry, **When** it is exported, **Then** it is
   included, marked not billable, with an empty amount.

---

### User Story 3 - Find export where import is (Priority: P2)

The contractor looks for export in Settings, beside Import, and finds two
downloads there, one per file.

**Why this priority**: The files are the value; where the buttons sit is
secondary, but a downloader that cannot be found is no export at all.

**Independent Test**: Open Settings at desktop and phone widths and confirm
the Export section shows both downloads.

**Acceptance Scenarios**:

1. **Given** a signed-in user on Settings, **When** the page renders, **Then**
   an Export section beside Import offers "Download entries" and "Download
   invoices".
2. **Given** a user who presses a download, **When** the file arrives,
   **Then** it is named for what it holds and the day it was made, such as
   `stint-invoices-2026-10-12.csv`.

---

### Edge Cases

- A running entry has no end yet and is left out until it stops.
- An entry with no project exports with empty client and project cells.
- Archived clients and projects still export by name: their entries and
  invoices are records too.
- A task name containing commas, quotes or line breaks stays one cell.
- A task name beginning with `=`, `+`, `-` or `@` can't run as a formula
  when the file opens in a spreadsheet.
- Names in any script survive the round trip into a spreadsheet.
- Another user's records never appear, whatever the request asks for.
- A download that fails says so instead of saving an error page as a CSV.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A signed-in user MUST be able to download all of their invoices
  as one CSV file, on the free tier, with no paid tier required.
- **FR-002**: A signed-in user MUST be able to download all of their finished
  time entries as one CSV file, on the free tier.
- **FR-003**: The invoices file MUST carry, per invoice: invoice number,
  client, status, issue date, due date, sent date, paid date, period start,
  period end, subtotal, tax rate, tax, reimbursed expenses, total and
  currency.
- **FR-004**: The entries file MUST carry, per entry: date, start time, end
  time, hours, client, project, task, billable, rate, rate source, amount,
  currency and invoice.
- **FR-005**: An entry's rate MUST be the one the app resolves for it (entry,
  then project, then client, then the user's default) at the time of export,
  invoiced or not, and `0` MUST export as `0.00`, distinct from no rate.
- **FR-006**: An entry's hours and amount MUST be the figures the app bills:
  hours in hundredths, amount as those hours times the rate, to the cent.
- **FR-007**: Dates and times MUST be in the user's own time zone, US
  formatted (`MM/DD/YYYY`, `9:05 AM`); money MUST be a plain decimal with two
  places and no symbol or thousands separator, beside a currency column.
- **FR-008**: Each file MUST open correctly in common spreadsheet apps: a
  header row, every value that needs it quoted, and text in any script intact.
- **FR-009**: A text cell beginning with `=`, `+`, `-`, `@`, a tab or a
  carriage return MUST be written with a single quote before it, so a
  spreadsheet does not run it. Numeric cells are never prefixed.
- **FR-010**: The files MUST hold only the requesting user's records.
- **FR-011**: The Settings screen MUST offer both downloads in an Export
  section beside Import.
- **FR-012**: The export MUST change nothing it reads.

### Key Entities

- **Entries export**: one row per finished time entry, with its resolved rate
  and billed figures, and the invoice that billed it if any.
- **Invoices export**: one row per invoice, with its status, dates and frozen
  totals as issued.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From Settings, a user has both files saved in two presses.
- **SC-002**: Every invoice's total in the export equals the total on its
  screen and its PDF, to the cent.
- **SC-003**: Every billable, rated entry's amount in the export equals what
  an invoice built from it bills, to the cent.
- **SC-004**: An account with five years of daily entries exports in under
  ten seconds.
- **SC-005**: Both files open in a spreadsheet with no import wizard, every
  row in its own line and every value in its own column.

## Assumptions

- Expenses, clients and projects as files of their own are out of scope;
  clients and projects appear by name on every row that uses them.
- Web only. The macOS app reaches the same files through the same API when it
  wants them.
