Closes #61

# Feature Specification: Gate the invoice document

**Feature Branch**: `f61-invoice-gate`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Issue #61, "Gate the invoice document, and gate it in the right
place": the paid tier has to be paid for, or the price is decorative. The
boundary is the invoice document in both forms, the saved file and the
in-browser view, since a view has a save button. The preview before an
invoice exists stays free: it is the user's own data, with no number, no
frozen rates and no payment details. Whether generating an invoice is gated
is decided deliberately. Exporting records is not gated, and the page says
so. Builds on billing (#60): canceling never locks an invoice generated
while paying, and while billing isn't set up nothing changes.

## Design

Design review: skipped in autonomous run; follows existing invoice detail,
Settings Plan section and `.claude/rules/web-ui.md`.

- **Locked**: in the invoice detail header, where Download PDF and Preview
  sit, one primary control, "Subscribe to download", leading to Settings'
  Plan section. Under the header, one support line: downloading the invoice
  is on the paid plan at the price, and tracking and your records, exporting
  them included, stay free.
- **Unlocked** (paid, generated while paid, or billing not set up): the
  header as today.
- **Plan section, free**: its description adds that records and their export
  stay free.
- **Inbox**: a late or stale invoice row offers Download only when the
  account's plan opens documents; a free user with billing set up gets Mark
  paid or Mark sent alone, and the invoice's page carries the rest.

## Clarifications

### Session 2026-10-12

- Q: Is generating an invoice (number, frozen rates, locked entries) gated
  too? → A: No. `docs/positioning.md` owns what is paid and says downloading
  the invoice "is the only thing that does". Generating stays free, so a
  free user's numbering, frozen rates and locked entries are the same records
  a paying user has, and subscribing later unlocks the documents of what they
  already generated, with nothing to regenerate. A free user can retype the
  totals from the screen; that is the inconvenience positioning accepts in
  exchange for keeping records whole and free. (decided autonomously)
- Q: When billing is first set up, do invoices generated before then stay
  downloadable for free users? → A: No. "Generated while paying" is the only
  exemption, and nobody paid while billing was dark, so those invoices follow
  the free rule once billing is live. Alpha is a handful of invited users;
  if the owner wants to grandfather them, a one-time backfill marks their
  invoices as generated while paying. (decided autonomously)
- Q: How does the server refuse a locked document? → A: HTTP 402 Payment
  Required with a new error code, `PAYMENT_REQUIRED`, and a message naming
  the paid plan; a missing or someone else's invoice stays 404. (decided
  autonomously)
- Q: Where does the locked screen's control lead? → A: To Settings' Plan
  section, which already owns subscribing and confirming the return from
  Checkout; the invoice screen doesn't open Checkout itself, so there is one
  subscribe flow. (decided autonomously)
- Q: Where is "data gets out free" said? → A: On the invoice detail's lock
  line and in the Plan section's free description, where a user meets the
  rule. The landing page still says nothing is gated and promises a
  different paid feature; correcting it goes with billing's launch, filed
  as #323, since changing marketing copy now would announce a
  price while billing is dark. (decided autonomously)
- Q: The inbox's late and stale invoice rows also link the PDF. What do they
  offer a free user? → A: No Download. The rows don't carry the plan each
  invoice was generated on, so the inbox decides from the account's plan
  alone: a canceled user loses the shortcut even for an invoice generated
  while paying, whose own page still offers it. Found while verifying;
  adding the stamp to `/stats` wasn't worth it for a shortcut. (decided
  autonomously)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A free user's invoice document is the paid tier (Priority: P1)

A free user on an account where billing is set up generates an invoice and
opens it. The detail screen shows the invoice in full — lines, totals,
status — but the document itself, downloaded or viewed, needs the paid
tier. The screen says so, names the price, and says that tracking and the
user's records, exporting them included, stay free. One press takes them to
subscribe.

**Why this priority**: Without it nobody has a reason to pay; the price is
decorative.

**Independent Test**: With billing set up and no subscription, open an
issued invoice: the document is refused in both forms, and the screen
offers the paid tier instead of Download and Preview.

**Acceptance Scenarios**:

1. **Given** billing is set up and the user is free, **When** they ask for
   an invoice's document to download, **Then** it is refused with a reason
   that names the paid tier.
2. **Given** the same user, **When** they ask for the document to view in
   the browser, **Then** it is refused the same way.
3. **Given** the same user, **When** they open the invoice's detail screen,
   **Then** they see its lines and totals, a line saying downloading the
   invoice is on the paid tier at the price, that tracking and their records
   (exporting them included) stay free, and a control that leads to
   subscribing — not Download or Preview.
4. **Given** the same user, **When** they preview a new invoice before
   generating it, or generate it, **Then** both work as they do today.

---

### User Story 2 - A paying user gets the document (Priority: P1)

A subscriber — active, or with a failed payment Stripe is still retrying —
downloads and views every invoice, including ones generated before they
subscribed.

**Why this priority**: It is what the subscriber paid for.

**Independent Test**: With a paid subscription, download and view an
invoice generated while free and one generated while paid.

**Acceptance Scenarios**:

1. **Given** a paying user, **When** they download or view any of their
   invoices, **Then** the document arrives as it does today.
2. **Given** a paying user, **When** they open an invoice's detail screen,
   **Then** they see Download PDF and Preview, as today.

---

### User Story 3 - Canceling never locks what was generated while paying (Priority: P1)

A user who paid and then stopped — canceled, or their payment finally
failed — keeps the document of every invoice generated while they were
paying. An invoice generated after the paid tier ended is locked like any
free user's.

**Why this priority**: #60 promises it, and the terms say it. A tool that
locks an invoice someone already earned is the distrust the product exists
to answer.

**Independent Test**: Generate an invoice while paid, end the subscription,
then download it; generate another after it ended and see it refused.

**Acceptance Scenarios**:

1. **Given** an invoice generated while the user paid, **When** the
   subscription has ended and they ask for its document, **Then** it
   arrives.
2. **Given** an invoice generated after the subscription ended, **When**
   they ask for its document, **Then** it is refused as for any free user.
3. **Given** an invoice generated while free, **When** the user subscribes
   and later lets the paid tier end, **Then** that invoice is locked again.

---

### User Story 4 - Nothing changes until billing is set up (Priority: P1)

Until billing is configured, every user gets every document, and the detail
screen looks as it does today.

**Why this priority**: The feature merges before billing goes live;
merging must change nothing anyone sees.

**Independent Test**: With billing not configured and no subscription,
download and view an invoice and open its detail screen.

**Acceptance Scenarios**:

1. **Given** billing is not set up, **When** any user asks for any invoice's
   document, **Then** it arrives.
2. **Given** billing is not set up, **When** a user opens an invoice's
   detail screen, **Then** it shows Download PDF and Preview and no paid
   tier line.

### Edge Cases

- A refused document request is told apart from a missing invoice: another
  user's invoice, or one that doesn't exist, is still "not found", never
  "paid tier", so the gate reveals nothing about other accounts.
- An invoice voided and reissued is a new invoice; whether its document
  opens follows the plan at its own generation.
- A user cannot mark their own invoice as generated while paying: that
  record is written from the stored subscription, never from what a client
  sends, and cannot be changed afterward.
- Back from Checkout, the invoice screen reads the invoice afresh, so it
  shows Download PDF and Preview; the server's answer decides either way.
- A user whose plan read fails sees an error, never a document they aren't
  entitled to and never a false lock that hides their invoice.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When billing is set up, the invoice document MUST be refused
  to a user who is not paying, for an invoice not generated while they were
  paying, in both the saved and in-browser forms.
- **FR-002**: The refusal MUST be decided by the server on every request;
  hiding a control is never the gate.
- **FR-003**: A paying user (as `planOf()` defines paid) MUST receive the
  document of every invoice of theirs.
- **FR-004**: An invoice generated while the user was paying MUST open for
  as long as the invoice exists, whatever the plan later becomes.
- **FR-005**: Whether an invoice was generated while paying MUST be recorded
  when it is generated, from the stored subscription, and MUST NOT be
  settable or changeable by the user.
- **FR-006**: When billing is not set up, every document MUST open for
  every user.
- **FR-007**: Previewing an invoice before it exists, generating it, and
  everything else about it — status, voiding, its lines and totals on
  screen — MUST stay free.
- **FR-008**: The invoice detail screen MUST tell a user whether the
  document opens before they press, and when it doesn't, say that
  downloading the invoice is the paid tier, the price, that tracking and
  their records stay free with exporting included, and lead to the Plan
  section in Settings to subscribe.
- **FR-012**: Every other place that links the document (the inbox's
  Download) MUST NOT offer it to a free user once billing is set up.
- **FR-011**: Invoices generated before billing was set up follow the same
  rule as any other: they open while billing is dark, and once it is live
  only for a paying user.
- **FR-009**: The refusal MUST be HTTP 402 with the documented code
  `PAYMENT_REQUIRED`, so a client can tell "pay to open" from any other
  failure. A missing or another user's invoice stays 404.
- **FR-010**: The Plan section's free description MUST say the same thing:
  invoice downloads are what paid adds, and records and their export stay
  free.

### Key Entities

- **Invoice**: gains a record of the subscription state at generation,
  written once from the stored subscription. Read only to decide whether
  its document opens.
- **Subscription** (from #60): the stored mirror of the user's plan.
  Unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With billing set up, a free user obtains no invoice document
  for an invoice generated while free, by any route or parameter.
- **SC-002**: 100% of invoices generated while paying still open after the
  subscription ends.
- **SC-003**: With billing not set up, every existing test of downloading
  and viewing an invoice passes unchanged, and the detail screen is
  unchanged.
- **SC-004**: A free user meeting the lock learns the price, what stays
  free, and how to subscribe without leaving the invoice screen.

## Assumptions

- `docs/positioning.md` decides scope: "Downloading an invoice requires the
  paid tier, and that is the only thing that does." So generation and the
  pre-generation preview stay free.
- Data export (#58, #148) isn't built yet; positioning promises it free, so
  the page names it among what stays free.
- The landing page still promises nothing is gated; it is out of this
  feature's scope and goes with billing's launch (see Clarifications).
- The macOS app neither downloads nor views invoices, so it is unaffected.
