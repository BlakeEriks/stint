Closes #568

# Feature Specification: The account has a billing time zone

**Feature Branch**: `billing-tz`

**Created**: 2026-10-29

**Status**: Draft

**Input**: Issue #568. An invoice's period, issue date and due date are read
in the time zone the user is in when they generate it. Nothing ties one
invoice's zone to the next, so for a contractor who travels, work near
midnight can fall in neither of two invoices: a Sep 30, 11:30 PM Pacific
entry is Oct 1 to a September invoice generated in Lisbon, and Sep 30 to an
October invoice generated back in Pacific time. It is then unbilled and
dated before the current period. The account gets a billing time zone, and
every invoice reads its dates in it, wherever the user is. The owner chose
this design over carrying the last invoice's zone forward (issue comment,
2026-10-29), and at review cut the per-client zone it first had: one zone
on the account (PR #580, 2026-11-01).

## Clarifications

### Session 2026-10-29

- Q: When a zone changes, does an open draft follow it? → A: No: a draft keeps the zone it was generated in until it is sent, as it keeps its period, so a change moves no draft's work (decided autonomously).
- Q: Does the invoice or its PDF print the zone? → A: No: the client reads dates, and their zone is the one the contract bills in (decided autonomously).
- Q: Which zone does a request made before an account has one use? → A: The device's, as every invoice does today, so nothing changes for that account until a zone is picked (decided autonomously).

## Design

No design review (decided autonomously): the change is one field in a form
that already exists, a time zone picker in Settings' Billing defaults, built
from the select the app already uses. The screen has no choice of layout or
hierarchy. Its stories show every state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An invoice covers the same days wherever it is made (Priority: P1)

A contractor in Los Angeles bills a client monthly. They travel to Lisbon
and generate September's invoice there. The invoice covers September as
Los Angeles reads it, so an entry at 11:30 PM on Sep 30 Pacific is on it,
and October's invoice, generated back home, doesn't claim it again.

**Why this priority**: It is the defect: work falls in neither invoice and
goes unbilled.

**Independent Test**: With the account's billing zone `America/Los_Angeles`,
generate September's invoice from a browser in `Europe/Lisbon` and from one
in `America/Los_Angeles`; both bill the same entries.

**Acceptance Scenarios**:

1. **Given** an account billed in `America/Los_Angeles` and an entry at
   11:30 PM Sep 30 Pacific, **When** September's invoice is generated from
   `Europe/Lisbon`, **Then** the entry is on it.
2. **Given** the same account, **When** September's invoice is generated from
   `America/Los_Angeles`, **Then** it bills exactly the entries the Lisbon
   one did.
3. **Given** an account billed in `America/Los_Angeles`, **When** New invoice
   is opened from `Pacific/Auckland` at 9 AM Oct 1 local, which is still
   Sep 30 in Los Angeles, **Then** the issue date it shows and the period it
   suggests are those of Sep 30 in Los Angeles.
4. **Given** a client with a billing schedule, **When** New invoice suggests
   its last ended period, **Then** "today" is today in the account's
   billing zone.
5. **Given** a billing zone whose clocks change inside the period (DST),
   **When** the invoice is generated, **Then** the period runs from
   midnight on its first day to midnight after its last, each in that
   zone's offset on that day, so no hour at either end is lost or billed
   twice.

---

### User Story 2 - The account sets its billing zone (Priority: P2)

In Settings, under Billing defaults, the user picks the account's billing
time zone. Every invoice reads its dates in it.

**Why this priority**: A contractor bills every client on one calendar,
their home one; this one setting fixes story 1 for all of them.

**Independent Test**: Set the account's zone in Settings, reload, and see
it kept; generate an invoice and see the period read in it.

**Acceptance Scenarios**:

1. **Given** Settings, **When** the user picks `America/Chicago`, **Then**
   it is kept and new invoices read their dates in it.
2. **Given** a new account, **When** the welcome dialog closes by any way
   out, **Then** the account's billing zone is the zone the account was
   created in.
3. **Given** an account made before this feature with invoices, **When**
   the change is applied, **Then** its billing zone is the zone its newest
   invoice was made in.
4. **Given** an account with no billing zone (made before this feature,
   with no invoice), **When** Settings opens, **Then** the field reads that
   none is set and invoices use the device's zone, as they do today, until
   one is picked.

---

### Edge Cases

- A draft made before this feature, or before a zone was changed, keeps the
  zone it was made in until it is sent, as it keeps its period: changing a
  zone moves no draft's work.
- A sent, paid or void invoice keeps its zone as issued.
- The calendar, the timer, day totals and the home screen keep the device's
  zone: billing is the account's calendar, display is the device's.
- A line's date on an invoice ("Sep 30") is read in the invoice's zone, so
  it matches the period the line falls in.
- A zone that isn't an IANA zone is refused with a message naming the
  field; nothing is saved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The account MUST have a billing time zone, which may be unset
  only on accounts made before this feature that have no invoice.
- **FR-002**: (Cut at review: a client has no zone of its own.)
- **FR-003**: A new invoice's zone MUST be the account's, else the device's;
  one shared rule decides it, which every client and the server call.
- **FR-004**: An invoice's preview, its generation, and its New invoice
  issue date and suggested period MUST all read dates in that zone.
- **FR-005**: A draft MUST keep the zone it was generated in until it is
  sent; a sent invoice keeps it for good.
- **FR-006**: Display of entries, days and times outside an invoice MUST
  stay in the device's zone.
- **FR-007**: The Inbox's late-entry row MUST read an entry's date in the
  zone of the sent invoice whose period it falls in, as that invoice did.
- **FR-008**: Settings MUST set the zone, refusing
  anything but an IANA zone.
- **FR-009**: Closing the welcome dialog MUST set an unset account zone to
  the device's.
- **FR-010**: Existing accounts MUST take the zone of their newest invoice.
- **FR-011**: The Inbox's ready-to-invoice row (#548) MUST read today and
  its entries' dates in the billing zone, as the invoice it suggests would,
  so no entry is in both it and the late-entry row.

### Key Entities

- **Account billing time zone**: the IANA zone the account's invoices read
  dates in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An invoice for an account billed in `America/Los_Angeles` covers
  the same entries whether generated from `Europe/Lisbon` or
  `America/Los_Angeles`.
- **SC-002**: No entry falls between two consecutive invoices for one client
  because the user travelled between them.
- **SC-003**: The account's zone is set in one field, kept on reload.

## Removes

Constitution VII. The per-client billing zone was cut at review (PR #580,
2026-11-01): the owner chose one zone on the account. The cut took out:

- `clients.billing_time_zone` and `Client.billingTimeZone` on
  `/api/v1/clients`, with its route test
- the client dialog's Billing time zone field and its `ClientBillingZone`
  story
- the client step of `billingZone`, which is now `(account, device)`, and
  the route test that a client's zone wins over the account's
- the key in the macOS `clients.json` fixture

Nothing a user had is lost: no client zone ever shipped.

## Assumptions

- The zone list is the browser's IANA zones (decided autonomously): every
  zone, labeled by its IANA name, so a user finds their city.
- An unset account zone after the backfill falls back to the device's zone
  rather than a guessed one (decided autonomously): a guess would move
  work between invoices unseen (Principle I).
- The macOS and phone apps create no invoices, so they change nothing.
