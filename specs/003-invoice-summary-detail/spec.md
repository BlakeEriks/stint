Closes #188

# Feature Specification: Invoice summary with supporting detail

**Feature Branch**: `f188-invoice-summary`

**Created**: 2026-09-30

**Status**: Draft

**Input**: GitHub issue #188 ("Invoice: a one-line summary with supporting
detail below the total"), and invoice 2026-001 to SystemSphere, which Blake
built by hand because Stint could not produce it

## Design

The design is `design/new-invoice.html`: the New invoice screen
(`apps/web/src/components/invoice-new.tsx`) and the PDF it makes
(`apps/web/src/lib/invoice-pdf.tsx`).

- **Title row**: "New invoice" on the left, "Generate invoice" on the right,
  sticky at the top of the panel. Generate is disabled with no client, while
  the preview is updating, or with an empty summary line; pressed, it shows a
  pending state.
- **Form**: one list in bands separated by a rule, labels only, no hint text.
  1. Client; From, To and Due on one row; Reference, optional, placeholder
     "PO number, contract or SOW".
  2. "Show time as": One summary line, Every entry, By task, By project, By
     day, each with its one-line description in the menu. With One summary
     line, a required "Summary line" text field sits directly under the
     picker, indented on a left rule, empty to start.
  3. Expenses: a bordered list. Each row is a checkbox that bills the expense
     on this invoice, then a button holding the name, its meta beneath
     ("↻ Recurring", or a date such as "Aug 20"), the amount and a pencil; the
     button opens the expense dialog. "+ Add an expense" opens it empty, and
     the saved expense is ticked.
  4. Charges: the same bordered list of description, amount and pencil. "+ Add
     a charge" opens the charge dialog (Description, Amount); an existing
     charge's dialog also has Remove.
  5. Payment details: a picker of the user's payment profiles by name, bank
     and last four beneath, a "Default" badge on the default. Its last item,
     "+ New payment details", opens the payment-profile dialog and selects the
     saved profile.
  6. Attach, only with One summary line: Hours by project, Hours by week,
     Hours by date, all unticked to start.
- **Preview**: live, under the caption "Preview · N entries". The card
  mirrors the PDF: the user's business block with No., Issued and Due; Bill to
  and Engagement (Service period, and Reference when set); the lines table
  (Description, Qty, Rate, Amount; a charge is an amount-only row); an
  Expenses group; totals; Payment details; then, when any Attach box is
  ticked, a dashed rule, "Page 2 · supporting detail" and each ticked schedule
  with a Total row. Its last line reads "Generating assigns a number and locks
  these entries. Voiding later keeps the number on record."
- **Layout**: at a panel 900px or wider, the form is on the left (320–400px)
  and the preview on the right, sticky beside it; narrower, the preview
  follows the form. On a card narrower than 360px the Rate column is hidden.
- **The PDF it makes**: page 1 is the invoice; each ticked schedule follows
  from page 2, under a running header, hours only.
- **States**:
  - *Client chosen*: the form filled and the preview current.
  - *No client yet*: Generate disabled; the preview waits for a client.
  - *Updating*: after a change the server computes, the preview says
    "Updating…" and dims its figures until the answer lands; Generate is
    disabled.
  - *No summary line*: the Summary line field is empty and says "Give the
    summary line its text."; Generate is disabled.
  - *New payment details*: the payment-profile dialog, opened from the picker.
  - *Editing an expense*: the expense dialog, opened from a row.
  - *New charge*: the charge dialog, opened from "+ Add a charge".
  - Each in Desktop and Phone widths, and in Dark and Light themes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One summary line and a clean total (Priority: P1)

Blake bills one client by the hour at one rate across eight workstreams. On
New invoice he picks "One summary line" under "Show time as" and types
"Software consulting services". The invoice has one time line with that text,
the total hours, the rate and the amount, and the total sits under it.

**Why this priority**: Accounts payable reads the total, not the work. Every
grouping today puts a line per task, project or day in the summed table, so
the total is buried. This story alone makes page 1 presentable.

**Independent Test**: Generate an invoice over a month of entries at one rate
with One summary line; the document has exactly one time line, and its hours
and amount equal the month's billable total.

**Acceptance Scenarios**:

1. **Given** billable entries in the period all at $80.00, **When** Blake
   picks One summary line and types its text, **Then** the preview shows one
   time line with that text, the period's total hours, $80.00 and the summed
   amount.
2. **Given** entries at $80.00 and others at $120.00, **When** Blake picks One
   summary line, **Then** there are two lines, one per rate, each with the
   same text and its own hours and amount.
3. **Given** One summary line is picked and its text is empty, **When** Blake
   looks at the form, **Then** the field says "Give the summary line its
   text." and Generate is disabled.
4. **Given** an issued summary invoice, **When** Blake opens it later,
   **Then** the line reads exactly as issued.

---

### User Story 2 - Supporting detail from page 2 (Priority: P2)

With One summary line picked, Blake ticks Hours by project and Hours by date.
Page 1 of the PDF holds only the invoice. Each ticked schedule follows from
page 2 and shows hours, never money.

**Why this priority**: The project lead wants hours by project, and without
it the summary line is unverifiable.

**Independent Test**: Generate an invoice with Hours by project and Hours by
week ticked; page 2 opens with "Hours by project", and the total equals the
same invoice with nothing ticked.

**Acceptance Scenarios**:

1. **Given** nothing is ticked, **When** the invoice is generated, **Then** it
   has no supporting detail.
2. **Given** Hours by project is ticked, **When** the invoice is generated,
   **Then** page 2 opens with one row per project and a Total row, in hours,
   and the invoice total is unchanged.
3. **Given** page 1 has room left, **When** a schedule is ticked, **Then** it
   still starts on page 2.
4. **Given** all three are ticked, **When** the invoice is generated, **Then**
   they print in order: by project, by week, by date.
5. **Given** a schedule runs past a page, **When** it continues, **Then** its
   heading repeats with "(continued)" and its column headings repeat, and each
   detail page carries the running header "Supporting detail · Invoice no ·
   client · period".
6. **Given** a grouping other than One summary line, **When** Blake looks at
   the form, **Then** there is no Attach choice.
7. **Given** an issued invoice with schedules, **When** it is downloaded
   again, **Then** the schedules are identical.
8. **Given** an invoice with schedules, **When** Blake opens its detail
   screen, **Then** the screen names the attached schedules.

---

### User Story 3 - A live preview beside the form (Priority: P3)

Blake builds the invoice while watching it. Every change shows in the preview
as the page will print it, without a Preview button.

**Why this priority**: The summary line, reference and schedules only make
sense seen in place; a preview behind a button hides the result of each
choice.

**Independent Test**: Choose a client and change each field; the preview
matches the generated PDF's information.

**Acceptance Scenarios**:

1. **Given** a client is chosen, **When** the screen shows, **Then** the
   preview shows the business block, No. (the next number), Issued (today),
   Due, Bill to, Engagement, lines, totals and payment details.
2. **Given** Blake types a reference or ticks a schedule, **When** he does,
   **Then** the preview changes in the same frame.
3. **Given** Blake changes the grouping, the summary text, an expense tick or
   a charge, **When** he does, **Then** the preview says "Updating…" with its
   figures dimmed until the server answers, and Generate is disabled until
   then.
4. **Given** no client is chosen, **When** the screen shows, **Then** Generate
   is disabled.
5. **Given** a panel 900px or wider, **When** Blake scrolls the form, **Then**
   the preview stays beside it; narrower, it follows the form.

---

### User Story 4 - PO / SOW reference (Priority: P4)

Blake types "ICA dated Aug 5, 2026 · Exhibit A SOW" into Reference. It prints
under Service period in the invoice header.

**Why this priority**: Accounts payable often matches an invoice to a purchase
order or contract and rejects one without it.

**Independent Test**: Generate an invoice with a reference; the header shows
it. Generate one without; the header has no Reference row.

**Acceptance Scenarios**:

1. **Given** a reference is typed, **When** the invoice is generated, **Then**
   the header prints it, labeled "Reference", beneath "Service period".
2. **Given** the reference is empty, **When** the invoice is generated,
   **Then** the header has no Reference row.

---

### User Story 5 - Expenses, charges and payment details in the form (Priority: P5)

Blake ticks this month's expenses, edits one, adds a charge and picks which
payment details the invoice prints, all without leaving New invoice.

**Why this priority**: Each already exists elsewhere; bringing them into the
form makes the preview the whole invoice.

**Independent Test**: Add an expense and a charge and pick a non-default
payment profile; the generated invoice bills both and prints that profile.

**Acceptance Scenarios**:

1. **Given** an expense row, **When** Blake presses its name, **Then** the
   expense dialog opens for it.
2. **Given** "+ Add an expense", **When** Blake saves a new expense, **Then**
   it appears in the list, ticked.
3. **Given** "+ Add a charge", **When** Blake saves a description and amount,
   **Then** the charge appears in the list and in the preview.
4. **Given** an existing charge, **When** Blake opens it and presses Remove,
   **Then** it leaves the list and the preview.
5. **Given** a client with its own payment profile, **When** the form opens
   for that client, **Then** the picker holds that profile; otherwise it
   holds the default.
6. **Given** "+ New payment details", **When** Blake saves a profile, **Then**
   the picker selects it.
7. **Given** a chosen profile, **When** the invoice is generated, **Then** the
   invoice freezes and prints that profile.

---

### Edge Cases

- One summary line with no billable time and only charges or expenses: no
  time line, the rest as usual.
- An unrated entry blocks generation with One summary line as in every
  grouping.
- A schedule of one row still prints when ticked.
- An entry with no project counts under "Unassigned" in Hours by project.
- A week the period cuts short prints only its days inside the period.
- An entry that crosses midnight counts on the day it started, as By day does.
- The period prints once, in Engagement, never under the summary line.
- With no expenses billed, the totals read Subtotal and Amount due.

## Requirements *(mandatory)*

### Functional Requirements

**Form**

- **FR-001**: New invoice MUST present one list in bands separated by a rule,
  with labels and no hint text; the grouping menu keeps its one-line
  descriptions.
- **FR-002**: The first band MUST hold Client; From, To and Due on one row;
  and an optional free-text Reference with the placeholder "PO number,
  contract or SOW".
- **FR-003**: "Group lines" MUST be renamed "Show time as", offering One
  summary line first, then Every entry, By task, By project and By day.
- **FR-004**: With One summary line, a required "Summary line" field MUST sit
  directly under the picker, empty to start; empty, it says "Give the summary
  line its text."
- **FR-005**: Expenses MUST be a bordered list whose rows tick an expense onto
  this invoice and open the expense dialog when pressed; "+ Add an expense"
  MUST open the dialog for a new one, which is ticked once saved.
- **FR-006**: Charges MUST be a bordered list whose rows open a charge dialog
  (Description and Amount, both required, and Remove for an existing charge);
  "+ Add a charge" MUST open it for a new one. There is no inline empty row.
- **FR-007**: Payment details MUST be a picker of the user's payment profiles,
  preselected to the client's profile, else the default; "+ New payment
  details" MUST open the payment-profile dialog and select the saved profile.
- **FR-008**: The invoice MUST freeze the chosen payment profile.
- **FR-009**: Attach MUST offer Hours by project, Hours by week and Hours by
  date, only with One summary line, all unticked to start.
- **FR-010**: The Notes field MUST be removed from New invoice; issued
  invoices keep their notes.
- **FR-011**: The title row MUST stay at the top of the panel; "Generate
  invoice" MUST be disabled with no client, while the preview is updating, or
  with an empty summary line, and MUST show a pending state when pressed.

**Summary line**

- **FR-012**: One summary line MUST produce one time line per distinct rate,
  each with the summary text.
- **FR-013**: A summary line's hours and amount MUST follow the same hours
  rule as every other grouping, and that amount is authoritative.

**Preview**

- **FR-014**: The preview MUST be live and replace the Preview button,
  captioned "Preview · N entries".
- **FR-015**: The preview MUST show the invoice's information as the PDF
  prints it: business block, No., Issued, Due, Bill to, Engagement, lines,
  expenses, totals, payment details and, when ticked, the supporting detail
  after "Page 2 · supporting detail".
- **FR-016**: A change the server computes (grouping, summary text, an expense
  tick, a charge) MUST show "Updating…" with the figures dimmed until the
  server answers; the reference and Attach ticks MUST update at once.
- **FR-017**: At a panel 900px or wider the preview MUST sit beside the form
  and stay in view; narrower, it MUST follow the form. On a card narrower than
  360px the Rate column MUST be hidden.

**PDF**

- **FR-018**: The header MUST label the period "Service period" and print
  "Reference" beneath it when set.
- **FR-019**: Supporting detail MUST print only with One summary line and
  MUST always start on page 2, whatever room page 1 has.
- **FR-020**: Schedules MUST print hours only, never a rate or an amount, and
  MUST NOT change any line, subtotal, tax or total.
- **FR-021**: Schedules MUST print in order by project, by week, by date, each
  with a Total row; by date prints date, day, project and hours.
- **FR-022**: Each detail page MUST carry the running header "Supporting
  detail · Invoice no · client · period"; a schedule that runs over a page
  MUST repeat its heading with "(continued)" and its column headings.
- **FR-023**: Schedules MUST be computed from the entries the invoice bills
  when it is generated and frozen with it, so a project rename, a void or an
  entry edited on a draft never changes them; every download prints the same
  schedules.
- **FR-024**: The invoice detail screen MUST name the schedules an invoice
  carries.

**Across the feature**

- **FR-025**: The grouping, summary text, schedule choice, reference and
  payment profile MUST be frozen when the invoice is issued.
- **FR-026**: The summary text and schedule choice MUST start fresh on every
  new invoice.

### Key Entities

- **Invoice**: gains the One summary line grouping, the summary text, the
  schedules it carries, an optional reference, and the payment profile the
  user chose.
- **Schedule**: the invoice's entries bucketed by project, week or date, in
  hours, computed and frozen at generation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Blake can reproduce invoice 2026-001 to SystemSphere in Stint:
  one services line, one expense, the reference, and schedules by project, by
  week and by date from page 2.
- **SC-002**: A month of work at one rate yields a page 1 with one time line,
  whatever the number of projects or tasks.
- **SC-003**: For any invoice, the total with schedules attached equals the
  total without them, to the cent.
- **SC-004**: No schedule ever begins on page 1.
- **SC-005**: Every figure in the preview matches the generated PDF.

## Assumptions

- Expenses on the invoice and the Services / Expenses / Amount due totals are
  built (#126); this feature only moves expenses into the form.
- The expense and payment-profile dialogs exist and are reused as they are.
- A week runs Monday through Sunday in the user's time zone, as elsewhere in
  the app.
- Hours by project sorts by hours descending, then by name; by week and by
  date sort chronologically.
- Prefilling the summary text, schedule ticks and reference from the client's
  last invoice is out of scope, deferred to #190.
- A by-task schedule, an "Attn:" line and invoice number formats are out of
  scope.
- The web app is the only place invoices are created; the macOS app is
  unaffected.
- The change needs a database migration, so its PR is the one open
  `migration` PR while it is in review.
