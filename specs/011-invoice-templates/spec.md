Closes #461

# Feature Specification: Invoice templates, Standard by default

**Feature Branch**: `f461-invoice-templates`

**Created**: 2026-10-25

**Status**: Draft

**Input**: Issue #461. Every invoice looks the same today, and a contractor
bills clients with different expectations: a law firm's AP desk wants a
traditional document, a startup a modern one, a studio something with flair.
Offer four templates that change only how the invoice looks — Standard
(today's layout, the default), Modern, Classic and Creative — chosen in
Settings or on New invoice, one choice for the account. An invoice already
sent keeps the template it was sent with.

## Clarifications

### Session 2026-10-25

- Q: When the template setting changes, which invoices switch to the new template? → A: Drafts follow the current setting; marking sent freezes the template.

## Design

[invoice.html](design/invoice.html) · [settings.html](design/settings.html) · [new-invoice.html](design/new-invoice.html)

Every template prints on white and uses the accent sparingly, so each sits
beside Stint's own screens. Each page's supporting detail (hours by project,
week and date) is set in that template's type, under a "Supporting detail"
running header; a table that runs past its page continues on the next under
its title marked "(continued)".

- **Standard**: today's invoice. Helvetica with Courier figures; the accent
  marks the amount due.
- **Modern**: Outfit. A light-weight "Invoice" heads the page with its
  number, the business across from it; a hairline with a short accent
  segment; then rows that span the page — billed to, issued, due and the
  amount due in the accent; period and reference; the lines under hairlines;
  payment details beside the totals; notes. No fills or bands.
- **Classic**: EB Garamond with old-style figures. An italic "Invoice" heads
  the page, the one italic on it, over its number in small capitals; a thin
  accent rule; the business name centered in letterspaced small capitals
  over its address on one line. Billed to on the left, issued, due, period
  and reference on the right. Lines are set like a table of contents, each
  with its quantity and rate as a muted phrase and a dotted leader to its
  amount, under accent small-capital labels for services and expenses. The
  accent marks the rule, those labels and the balance due. No frame,
  ornaments or boxes.
- **Creative**: Space Grotesk with IBM Plex Mono figures. A composition of
  an outlined circle, a filled square, an outlined triangle and an accent
  dot off the top corner; the invoice number runs up the left edge; the
  amount due sits in a ring beside tiles for billed to, issued, period, due
  and reference. Lines are grouped by kind — time, fixed fees, expenses —
  each headed by an accent shape and its subtotal, numbered straight
  through; a kind with no lines is left out. Payment details sit in a
  dashed ticket stub.
- **Settings**: an "Invoice template" section between Business identity and
  Invoice numbering. Four cards in a radio group, each a thumbnail of the
  invoice in that template with its name and a line on what it is; the
  chosen card is edged in the accent with a check. A press selects at once
  and saves. A refused save returns the selection to the saved template,
  and the app-wide notice says why.
- **New invoice**: a Template field, last in the form: the same four
  templates as small thumbnails in a radio group, with a hint that it
  changes the template for every draft, here and in Settings. The preview
  beside the form is unchanged: it shows what the invoice says, not its
  look. A user's own invoice in a template is the PDF, the paid document;
  the thumbnails draw a sample invoice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a template (Priority: P1)

A contractor picks a template from thumbnails of the invoice, in Settings
or on New invoice. It is one choice for the account: picking it in either
place changes it in both, and every invoice they download from then on uses
it, including drafts not yet sent.

**Why this priority**: It is the feature. Without a picker there is nothing
to choose.

**Independent Test**: Pick Classic on New invoice, open Settings, and
Classic is selected; download a draft invoice, and the PDF is in Classic.

**Acceptance Scenarios**:

1. **Given** a contractor who has never chosen, **When** they open Settings,
   **Then** Standard is selected and the four templates show as thumbnails.
2. **Given** Standard is selected, **When** they pick Modern in Settings,
   **Then** Modern shows as selected at once, and stays selected after a
   reload.
3. **Given** Modern is selected, **When** they pick Creative on New invoice,
   **Then** Creative shows as selected there and in Settings.
4. **Given** Modern is selected and a draft invoice exists, **When** they
   download the draft's PDF, **Then** it is in Modern.
5. **Given** the save fails, **When** they pick a template, **Then** the
   selection returns to the previous template and the app says why.

---

### User Story 2 - A sent invoice keeps its template (Priority: P1)

An invoice marked sent keeps the template it was sent with, so the PDF a
client already has is the PDF the contractor can download again.

**Why this priority**: An issued invoice is immutable. A template change
that reprinted sent invoices would hand the client a document that no
longer matches the one they hold.

**Independent Test**: Mark an invoice sent in Standard, switch the setting
to Creative, and download the sent invoice again: it is in Standard.

**Acceptance Scenarios**:

1. **Given** an invoice marked sent while Standard was selected, **When** the
   contractor switches to Classic and downloads it, **Then** it is in
   Standard.
2. **Given** an invoice that existed before this feature, **When** it is
   downloaded, **Then** it is in Standard, exactly as before.
3. **Given** a voided invoice, **When** it is downloaded, **Then** it is in
   the template it was sent with, marked VOID.

---

### User Story 3 - Every template prints the whole invoice (Priority: P2)

Whatever the template, the invoice carries the same content: letterhead and
logo, bill-to, dates, service period, reference, time, fixed-fee and expense
lines, totals, payment details, notes, page footer, and the supporting
detail from page 2.

**Why this priority**: A template that drops a section is a wrong invoice,
and the invoice being right is the product.

**Independent Test**: Render one invoice with every section filled and all
three supporting-detail tables attached in each template; every section
appears, and no row is cut off or split across a page break.

**Acceptance Scenarios**:

1. **Given** an invoice with time, fixed fees and expenses, a reference and
   payment details, **When** it is rendered in each template, **Then** every
   section appears in each.
2. **Given** an invoice whose supporting detail runs several pages, **When**
   it is rendered in each template, **Then** a table that breaks continues
   on the next page under its title marked "(continued)", and no row
   overflows its page.
3. **Given** an invoice with no logo, no reference, no payment details, no
   fixed fees and no expenses, **When** it is rendered in each template,
   **Then** the missing sections leave no empty space or stray labels.

### Edge Cases

- A business name or address long enough to wrap in the letterhead wraps in
  every template without overlapping the invoice number or Creative's shapes.
- A logo that is very wide or very tall fits its box in every template.
- An amount large enough for seven figures fits its column, and Creative's
  ring, in every template.
- Switching templates while a download is in flight: the PDF uses the
  template saved when the download was asked for.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer exactly four invoice templates: Standard,
  Modern, Classic and Creative, as the Design section describes them.
- **FR-002**: Standard MUST be today's invoice layout, unchanged, and MUST be
  the template for every account that has not chosen one.
- **FR-003**: Templates MUST differ only in presentation. Every template
  MUST print the same content under the same rules (VOID mark, supporting
  detail from page 2, a table that breaks continues marked "(continued)").
- **FR-004**: Modern, Classic and Creative MUST each use their typefaces
  (Outfit; EB Garamond; Space Grotesk and IBM Plex Mono), shipped with the
  app under open licenses and never fetched when an invoice renders.
- **FR-005**: Every template MUST use the app's accent color, in the places
  the Design section names and nowhere else.
- **FR-006**: Users MUST be able to choose the template in Settings and on
  New invoice, from a thumbnail of each template. Both MUST read and write
  the one account setting.
- **FR-007**: The invoice preview, on New invoice and an invoice's page,
  MUST stay as it is: what the invoice says, not its template. Only the PDF
  shows a user's own invoice in a template.
- **FR-008**: A draft invoice MUST render in the template currently chosen.
- **FR-009**: Marking an invoice sent MUST freeze its template; a later
  change to the setting MUST NOT change any sent or voided invoice.
- **FR-010**: Every invoice that exists before this feature MUST render in
  Standard.
- **FR-011**: Choosing a template MUST show as selected in the same frame,
  and a rejected save MUST return the selection and say why
  (Constitution VI).

### Key Entities

- **Invoice template**: one of Standard, Modern, Classic or Creative. A
  fixed set; not created or edited by users.
- **Settings**: gains the chosen template, Standard by default.
- **Invoice**: carries the template it was sent with, frozen once sent like
  its other issued fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contractor can change their template in under 15 seconds,
  from Settings or from New invoice.
- **SC-002**: 100% of invoices that existed before this feature download
  identical in layout to before.
- **SC-003**: 0 sent invoices change template when the setting changes.
- **SC-004**: In all four templates, an invoice with every section filled
  shows every section, and no row is cut off at a page break.

## Assumptions

- The choice is account-wide. Per-client and per-invoice choice are out of
  scope; picking on New invoice changes the account's choice.
- Custom colors and a template editor are out of scope. The accent is the
  app's brand accent in every template.
- The macOS app downloads the same PDF from the server, so it needs no
  change.
