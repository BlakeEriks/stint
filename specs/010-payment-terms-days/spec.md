Closes #438

# Feature Specification: Payment terms are a number of days, per client

**Feature Branch**: `f438-payment-terms-days`

**Created**: 2026-10-23

**Status**: Draft

**Input**: Issue #438. Payment terms are free text today, and the due date is
guessed from that text: "Net N" or "N days" gives N days, "on receipt" gives
0, and anything else gives 30, so a typo silently becomes 30 days. Terms
can't be set per client, so a client on Net 15 needs its due date fixed by
hand on every invoice. Terms become a whole number of days, with the user's
default and an optional per-client override; the printed terms are generated
from the days, so they can't disagree with the due date. Auto-drafting
(#434) depends on this.

## Clarifications

### Session 2026-10-23

- Q: When you pick a due date by hand on one invoice, what should its printed terms say? → A: Terms for that invoice's own days: 20 days out prints "Net 20", the same day prints "Due on receipt".
- Q: What should happen when someone picks a due date earlier than the invoice's issue date? → A: Reject it: New invoice shows a message and won't generate until the due date is on or after the issue date.
- Q: When an invoice is created without a due date (through the API, or by auto-drafting), should the server fill one in from the client's terms? → A: Yes: the issue date plus the client's days, else the user's, and its terms follow.

## Design

No design review: each change is one field or message in a pattern the app already has (a Settings field, a client-dialog field beside the billing schedule, a form error, an inbox notice like the missing-rate one); its stories show every state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Due dates follow each client's terms (Priority: P1)

A contractor bills most clients Net 30 and one client Net 15. They set
Net 15 once on that client. Every new invoice for that client is due 15
days after it's issued, and prints "Net 15"; every other client's invoices
are due in 30 days and print "Net 30".

**Why this priority**: It removes the per-invoice correction the issue
describes, and auto-drafting needs a due date with nobody there to fix it.

**Independent Test**: Set a client's terms to 15 days, start a new invoice
for it, and see the due date 15 days after the issue date and "Net 15" on
the preview and the PDF.

**Acceptance Scenarios**:

1. **Given** the user's terms are 30 days and a client has no override,
   **When** a new invoice is started for it with issue date Jan 10, **Then**
   the due date is Feb 9 and the terms read "Net 30".
2. **Given** a client's terms are 15 days, **When** a new invoice is started
   for it, **Then** the due date is the issue date plus 15 days and the
   terms read "Net 15".
3. **Given** a client's terms are 0 days, **When** a new invoice is started,
   **Then** the due date is the issue date and the terms read "Due on
   receipt".
4. **Given** a new invoice's default due date, **When** the user changes the
   issue date, **Then** the due date moves with it until the user picks a
   due date themselves.
5. **Given** the user picks a due date on one invoice, **When** they
   generate it, **Then** only that invoice has it, its terms are its own
   days (a due date 20 days after issue prints "Net 20"), and the client's
   and user's terms are unchanged.
6. **Given** a client with an override, **When** the override is cleared,
   **Then** its next invoice uses the user's terms.

---

### User Story 2 - Terms are set as days (Priority: P2)

In Settings, payment terms are a whole number of days, where 0 means due on
receipt and the default is 30. In a client's dialog, beside the billing
schedule, an optional number of days overrides the user's terms for that
client; left empty, it says the user's terms apply.

**Why this priority**: It's how story 1 is configured, and it replaces the
free text whose typos story 1's due dates would otherwise inherit.

**Independent Test**: Save 45 in Settings and 10 on one client; reload both
and see the values kept.

**Acceptance Scenarios**:

1. **Given** Settings, **When** the user saves 45 days, **Then** it is kept
   and new invoices for clients without an override are due in 45 days.
2. **Given** a client's dialog, **When** the user enters 10 days and saves,
   **Then** it is kept, and an empty field shows that the user's terms
   apply.
3. **Given** either field, **When** the user enters a negative number, a
   fraction or more than 365, **Then** it is rejected with a message and
   nothing is saved.

---

### User Story 3 - Existing terms carry over, and odd ones are surfaced (Priority: P3)

A user who already wrote terms keeps their meaning. Text the current rule
reads as a number of days becomes that number. Text it can't read becomes
30 days, the same due date it gave before, and the inbox asks the user to
check their payment terms, since the printed text will now say "Net 30".

**Why this priority**: Only users with existing text are affected, but a
silent change to what prints on their invoices breaks Principle I.

**Independent Test**: Before the change, set terms to "Net 45", "Due on
receipt", and "Payment by check, thanks"; after it, see 45, 0, and 30 with
an inbox notice for the last.

**Acceptance Scenarios**:

1. **Given** terms of "Net 45" or "45 days", **When** the change is applied,
   **Then** the user's terms are 45 days and no notice appears.
2. **Given** terms of "Due on receipt", **When** the change is applied,
   **Then** the user's terms are 0 days and no notice appears.
3. **Given** terms the rule can't read, **When** the change is applied,
   **Then** the user's terms are 30 days and the inbox shows a notice
   quoting what they wrote, with a days field to save; anything else they
   wrote, like a late-fee clause, belongs in the invoice notes.
4. **Given** the notice, **When** the user saves their payment terms,
   in Settings or in the notice, **Then** the notice is gone.
5. **Given** invoices already issued, **When** the change is applied,
   **Then** each still prints the terms text it was issued with.

### Edge Cases

- The due date crosses a month end or a year end (Jan 31 + 30 days is
  Mar 2, or Mar 1 in a leap year; Dec 20 + 30 days is Jan 19).
- A draft that is still open keeps the due date and terms it was generated
  with when the client's or user's terms change; they're the draft's own
  choice, like its other choices.
- A due date before the issue date is rejected: New invoice says so and
  won't generate until it's on or after the issue date.
- A client archived with an override keeps it; it matters only if it's
  unarchived.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The user's payment terms MUST be a whole number of days from 0
  to 365, defaulting to 30.
- **FR-002**: A client MUST be able to hold an optional number of days in
  the same range, and when it holds none, the user's days apply.
- **FR-003**: A new invoice's default due date MUST be its issue date plus
  the client's days, or the user's when the client has none. This holds for
  every way an invoice is created: one created without a due date gets this
  one, never none.
- **FR-004**: An invoice's printed terms MUST be generated from its issue
  and due dates: "Due on receipt" when they're the same day, otherwise
  "Net N" for N days between them. No free text is accepted for terms.
- **FR-005**: An issued invoice MUST keep the terms text it was issued
  with, unchanged by any later change to the user's or client's days.
- **FR-006**: Picking a due date on one invoice MUST change only that
  invoice.
- **FR-007**: Existing free-text terms MUST be converted once by the current
  rule: "Net N" or "N days" is N, "on receipt" with no count is 0. Anything
  else MUST become 30 and raise an inbox notice that stays until the user
  saves their payment terms.
- **FR-008**: The free-text interpretation of terms MUST be removed once the
  conversion has run.
- **FR-009**: Values outside 0–365, or not whole numbers, MUST be rejected
  with a message, saving nothing.
- **FR-010**: A due date before its invoice's issue date MUST be rejected
  with a message, generating nothing.

### Key Entities

- **User's payment terms**: a whole number of days, the default for every
  client.
- **Client's payment terms**: an optional number of days that overrides the
  user's for that client.
- **Invoice's terms**: the text printed on one invoice, generated from its
  dates when it's generated and frozen once it's issued.
- **Terms notice**: an inbox item, present only for a user whose old text
  couldn't be read.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a client with its own terms, a new invoice needs no
  due-date edit: 0 corrections per invoice, down from 1.
- **SC-002**: No invoice prints terms that disagree with its due date.
- **SC-003**: Every user with existing terms either keeps their number of
  days or sees a notice; none has their printed terms change unseen.
- **SC-004**: Setting a client's terms takes one field in its dialog.

## Assumptions

- The macOS app shows no payment terms, so only the web changes.
- 365 days is a generous upper bound; no real terms run longer.
- Terms other than days (end of month, 2/10 Net 30 discounts) are out of
  scope; a note on the invoice can say them.
- The notice joins the inbox the way the missing-rate notice does: one item
  per user, not per invoice.
- An issued invoice's due date and terms are part of what makes it
  immutable (the constitution's additional constraints); nothing here
  rewrites them.
