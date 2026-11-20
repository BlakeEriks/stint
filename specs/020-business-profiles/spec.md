Closes #838

# Feature Specification: Invoices can come from more than one business

**Feature Branch**: `business-profiles`

**Created**: 2026-11-20

**Status**: Draft

**Input**: Issue #838. A contractor who bills both as themself and through
one or more LLCs can't bill a client through the LLC that client
contracted with: every invoice's From block (business name, address, email,
logo) comes from the one set of fields in Settings, copied onto the invoice
when its draft is made. Today they edit Settings before each invoice and
change it back after. Settings holds a list of businesses instead, as it
already holds a list of payment details, and New invoice picks which one
the invoice is from.

## Clarifications

### Session 2026-11-20

- Q: Does each business keep its own invoice numbers? → A: No. One
  sequence across the account, as today. The number is how the account
  orders its invoices, finds a client's last one and refuses a next number
  already used, so splitting it changes each of those. US invoices carry no
  per-entity numbering rule, and a business can gain its own prefix and
  counter later without renumbering a sent invoice. (decided autonomously)
- Q: Does a business point to its own payment details? → A: No. The
  invoice's payment details already resolve on their own (the pick on New
  invoice, else the client's, else the default), and a second default
  chain would be a setting the existing one covers (Constitution VII).
  (decided autonomously)
- Q: How is the logo stored? → A: As now: a URL, one per business, set
  through the API. No screen sets a logo today, and this feature adds none.
  (decided autonomously)
- Q: Where does a client's business come from? → A: The client's last
  invoice, as its grouping, summary text and reference already do; else the
  default business. The issue proposed a column on the client, but no
  screen sets a client's payment details either, and the last invoice
  already says which business bills that client. (decided autonomously)
- Q: Can a draft change its business? → A: No. A draft keeps the From
  block it was made with, as it does today; another business is a new
  draft. (decided autonomously)
- Q: What does the migration make? → A: One business, the default, for
  each account whose Settings has a business name, from those fields. An
  account with none starts with no business, and New invoice asks for one
  as it asks for the name today. Then the Settings fields go.
  (decided autonomously)

## Design

No design review: Settings' Businesses section is the Payment details
section's list and dialog with three fields, and New invoice's From block
opens a menu the way its payment block already does. There is no choice of
layout or hierarchy to see first. (decided autonomously)

- **Settings, Businesses**: one row per business: its name with a Default
  badge, its email beneath; Make default and Edit on the row; Add a
  business under the list. With none: "No business yet. New invoice asks
  for one."
- **The dialog**: Name, Email, Address; name and email required. Archive
  on an existing business, as a payment profile has.
- **New invoice, From block**: a press opens a menu of the businesses, the
  one printing checked, and New business. With none, the notice above the
  page says so and its button opens the dialog, as today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bill a client through an LLC (Priority: P1)

She bills most clients as herself and Northwind through Eriks LLC. In
Settings she adds Eriks LLC. On New invoice for Northwind she presses the
From block and picks Eriks LLC; the page prints Eriks LLC's name, email
and address. She saves the draft, and its PDF is from Eriks LLC.

**Why this priority**: It is the feature.

**Independent Test**: Add a second business in Settings, pick it on New
invoice, save, open the draft.

**Acceptance Scenarios**:

1. **Given** two businesses, **When** she picks the other on New invoice,
   **Then** the page and the saved draft print that business.
2. **Given** she picks nothing, **Then** the invoice is from the business
   of the client's last invoice, else the default.
3. **Given** a draft, **When** she edits the business in Settings, **Then**
   the draft and every sent invoice keep the From block they were made
   with.
4. **Given** she picked a business that was archived meanwhile, **When**
   she saves, **Then** it is refused, naming why, and nothing is saved.

### User Story 2 - Keep the list in Settings (Priority: P1)

Settings' Businesses section lists each business. She adds one, edits one,
makes one the default, archives one.

**Acceptance Scenarios**:

1. **Given** no business, **When** she adds one, **Then** it is the default.
2. **Given** she archives the default, **Then** another live business
   becomes the default.
3. **Given** one business, **When** she un-ticks its default, **Then** it
   stays the default.

### User Story 3 - A first invoice with no business (Priority: P2)

A new account has no business. New invoice says the business details are
missing and Save draft is disabled; the notice's button opens the dialog,
and saving it makes the first business, the default, and the page prints
it.

### Edge Cases

- An account upgraded by the migration sees one business, its Settings
  fields, as the default, and invoices exactly as before.
- A business with no email can't be invoiced from: the server refuses, as
  it refuses a missing name or email today.
- The client's last invoice was from an archived business: the default
  applies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An account MUST hold any number of businesses, each a name,
  email, address and logo URL, archived rather than deleted, with at most
  one live default.
- **FR-002**: The first business MUST be the default; archiving the default
  MUST move it to another live business; the last live business MUST stay
  the default.
- **FR-003**: Making a draft MUST copy the From block from the chosen
  business, else the business of the client's last invoice that is still
  live, else the default.
- **FR-004**: A chosen business that is archived or not the caller's MUST
  be refused, never swapped for another.
- **FR-005**: An invoice MUST NOT be made without a business with a name
  and email.
- **FR-006**: A draft and a sent invoice MUST keep the From block they were
  made with.
- **FR-007**: Settings MUST list, add, edit, make default and archive
  businesses.
- **FR-008**: The migration MUST make one default business per account with
  a business name in Settings, and then drop those fields.

### Key Entities

- **Business**: who an invoice is from. Name, email, address, logo URL,
  default flag, archived time. The user's own.
- **Invoice**: gains the business it was made from, beside the From block
  it already copies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Billing a client through another business takes one pick on
  New invoice, and no visit to Settings.
- **SC-002**: The next invoice for that client is from the same business
  with no pick.
- **SC-003**: No sent invoice's From block changes.

## Assumptions

- macOS and the phone make no invoices and read no business fields.
- Invoice numbers stay one sequence across the account (see
  Clarifications).
