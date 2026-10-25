Closes #461

# Feature Specification: Invoice templates, Standard by default

**Feature Branch**: `f461-invoice-templates`

**Created**: 2026-10-25

**Status**: Draft

**Input**: Issue #461. Every invoice looks the same today, and a contractor
bills clients with different expectations: a law firm's AP desk wants a
traditional document, a startup a modern one. Offer four templates that
change only how the invoice looks — Standard (today's layout, the default),
Modern, Classic and Compact — chosen once in Settings. An invoice already
sent keeps the template it was sent with.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a template in Settings (Priority: P1)

A contractor opens Settings, sees the four templates side by side as
thumbnails of a sample invoice, and picks one. Every invoice they download
from then on uses it, including drafts not yet sent.

**Why this priority**: It is the feature. Without a picker there is nothing
to choose.

**Independent Test**: Pick Classic in Settings, download a draft invoice,
and the PDF is in Classic.

**Acceptance Scenarios**:

1. **Given** a contractor who has never chosen, **When** they open Settings,
   **Then** Standard is selected and the four templates show as thumbnails.
2. **Given** Standard is selected, **When** they pick Modern, **Then** Modern
   shows as selected at once, and stays selected after a reload.
3. **Given** Modern is selected and a draft invoice exists, **When** they
   download the draft's PDF, **Then** it is in Modern.
4. **Given** the save fails, **When** they pick a template, **Then** the
   selection returns to the previous template and the app says why.

---

### User Story 2 - A sent invoice keeps its template (Priority: P1)

An invoice marked sent keeps the template it was sent with, so the PDF a
client already has is the PDF the contractor can download again.

**Why this priority**: An issued invoice is immutable. A template change
that reprinted sent invoices would hand the client a document that no
longer matches the one they hold.

**Independent Test**: Mark an invoice sent in Standard, switch the setting
to Compact, and download the sent invoice again: it is in Standard.

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
logo, bill-to, dates, service period, reference, service and expense lines,
totals, payment block and its notice, notes, page footer, and the supporting
detail from page 2.

**Why this priority**: A template that drops a section is a wrong invoice,
and the invoice being right is the product.

**Independent Test**: Render one long invoice with every section filled in
each template; every section appears, and no supporting-detail row is cut
off or split across a page break.

**Acceptance Scenarios**:

1. **Given** an invoice with every section filled, **When** it is rendered in
   each template, **Then** every section appears in each.
2. **Given** an invoice whose supporting detail runs several pages, **When**
   it is rendered in Compact, **Then** it takes no more pages than in
   Standard, and no row overflows its page.
3. **Given** an invoice with no logo, no payment details and no expenses,
   **When** it is rendered in each template, **Then** the missing sections
   leave no empty space or stray labels.

### Edge Cases

- A business name or address long enough to wrap in the letterhead wraps in
  every template without overlapping the invoice number.
- A logo that is very wide or very tall fits its box in every template.
- An amount large enough for seven figures fits its column in every template.
- Switching templates while a download is in flight: the PDF uses the
  template saved when the download was asked for.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer exactly four invoice templates: Standard,
  Modern, Classic and Compact.
- **FR-002**: Standard MUST be today's invoice layout, unchanged, and MUST be
  the template for every account that has not chosen one.
- **FR-003**: Modern MUST lead with a band in the accent color and show the
  amount due large near the top of page 1.
- **FR-004**: Classic MUST use a serif typeface, a centered letterhead and
  boxed tables.
- **FR-005**: Compact MUST use smaller type and tighter rows than Standard,
  so a long invoice takes no more pages than in Standard.
- **FR-006**: Templates MUST differ only in presentation. Every template
  MUST print the same sections, in the same order, under the same rules
  (payment block and notice, VOID mark, supporting detail from page 2).
- **FR-007**: Templates MUST use only typefaces already available to the
  invoice; none is added.
- **FR-008**: Users MUST be able to choose the template once, in Settings,
  from a thumbnail of each template rendered from sample data.
- **FR-009**: A draft invoice MUST render in the template currently chosen.
- **FR-010**: Marking an invoice sent MUST freeze its template; a later
  change to the setting MUST NOT change any sent or voided invoice.
- **FR-011**: Every invoice that exists before this feature MUST render in
  Standard.
- **FR-012**: Choosing a template MUST show as selected in the same frame,
  and a rejected save MUST return the selection and say why
  (Constitution VI).
- **FR-013**: The invoice preview on the invoice screens MUST stay as it is;
  it shows content, not the template.

### Key Entities

- **Invoice template**: one of Standard, Modern, Classic or Compact. A fixed
  set; not created or edited by users.
- **Settings**: gains the chosen template, Standard by default.
- **Invoice**: carries the template it was sent with, frozen once sent like
  its other issued fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contractor can change their template in under 15 seconds
  from opening Settings.
- **SC-002**: 100% of invoices that existed before this feature download
  identical in layout to before.
- **SC-003**: 0 sent invoices change template when the setting changes.
- **SC-004**: In all four templates, an invoice with every section filled
  shows every section, and no row is cut off at a page break.

## Assumptions

- The choice is account-wide. Per-client and per-invoice choice are out of
  scope.
- Custom colors, a template editor and new typefaces are out of scope. The
  accent is the app's brand accent in every template.
- The macOS app downloads the same PDF from the server, so it needs no
  change.
- Each template's look is settled by `/design-review` before planning; the
  descriptions in FR-003 to FR-005 are the brief, not the final design.
