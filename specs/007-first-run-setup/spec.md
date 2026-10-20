Closes #382

# Feature Specification: First sign-in asks for your rate, and the invoice asks for the rest

**Feature Branch**: `f382-onboarding`

**Created**: 2026-10-20

**Status**: Draft

**Input**: Issue #382. A contractor invited to the alpha signs in for the
first time to an empty Home. The default hourly rate, the one setting that
makes Home show money, sits in Settings under "Billing defaults". Without it,
every figure is marked incomplete and invoicing refuses the work. Ask only
for what blocks the first useful moment, and ask for the rest when it
matters: the rate up front, business details at the first invoice, and an
Inbox row until a rate is set.

## Clarifications

### Session 2026-10-20

- Q: With business details empty, may an invoice still be generated? → A: No. Generate waits for business name and email; address is asked for but optional.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Inbox asks for a default rate until one is set (Priority: P1)

A signed-in contractor with no default hourly rate sees an Inbox row asking
for one. They set the rate from that row without leaving Home, and the row
disappears. Home's figures then show money.

**Why this priority**: It closes the gap on its own. Every account without a
rate is caught, however it got here: a skipped welcome, an import, or a
first sign-in on the macOS app.

**Independent Test**: Sign in as an account with no default rate and see the
row; set a rate from it and see the row leave and Home show money.

**Acceptance Scenarios**:

1. **Given** an account with no default rate, **When** Home loads, **Then**
   the Inbox shows a row asking for the default rate, and the Inbox count and
   the folded dock count it.
2. **Given** that row, **When** the user enters a rate and saves, **Then** the
   row leaves the Inbox at once and Home's figures include money.
3. **Given** an account with a default rate, **When** Home loads, **Then** no
   rate row appears.
4. **Given** a saved rate, **When** the user clears it in Settings, **Then**
   the row comes back.
5. **Given** the user enters a rate that the server rejects, **When** the
   answer arrives, **Then** the row stays and says why.

---

### User Story 2 - A welcome screen on first sign-in (Priority: P2)

On their first sign-in to the web app, a new contractor sees one welcome
screen before Home. It asks for their default hourly rate, offers to add a
first client with an optional rate of its own, and links to the Toggl import
for anyone who is switching. "Start tracking" saves what they entered and
opens Home. "Skip for now" opens Home with nothing saved.

**Why this priority**: It is the friendliest first minute. Story 1 already
covers an account that never sees it.

**Independent Test**: Sign in as a brand-new invited account, see the welcome
screen, enter a rate and a client, and land on Home with both saved.

**Acceptance Scenarios**:

1. **Given** an account that has never seen the welcome screen, **When** it
   signs in to the web app, **Then** it sees the welcome screen before Home.
2. **Given** the welcome screen, **When** the user enters a rate and a client
   name and presses "Start tracking", **Then** both are saved and Home opens.
3. **Given** the welcome screen, **When** the user presses "Skip for now",
   **Then** Home opens, nothing is saved, and the Inbox asks for a rate
   (Story 1).
4. **Given** an account that has finished or skipped the welcome screen,
   **When** it signs in again on any device, **Then** it goes straight to
   Home.
5. **Given** the welcome screen, **When** the user follows "Coming from
   Toggl?", **Then** the import page opens and the welcome screen does not
   come back.
6. **Given** an existing account from before this feature, **When** it signs
   in, **Then** it never sees the welcome screen.

---

### User Story 3 - The first invoice asks for business details (Priority: P3)

When a contractor starts an invoice and their business name, email or address
is empty, New invoice asks for them in place instead of sending the
contractor to Settings. What they enter saves to Settings and appears on the
invoice preview.

**Why this priority**: It only matters at the first invoice, which comes
after tracking. Today an invoice can be generated with no "from" block.

**Independent Test**: With empty business details, open New invoice, fill
them in place, and see them on the preview and in Settings.

**Acceptance Scenarios**:

1. **Given** empty business details, **When** the user opens New invoice,
   **Then** it asks for business name, email and address in place.
2. **Given** those fields, **When** the user fills them, **Then** they save
   to Settings and appear on the preview.
3. **Given** complete business details, **When** the user opens New invoice,
   **Then** it asks for nothing extra.
4. **Given** empty business details, **When** the user tries to generate,
   **Then** Generate stays disabled until business name and email are
   filled in, and says that is why. Address is asked for but not required.

---

### Edge Cases

- The rate entered is zero. It is a valid rate (Constitution II), so the
  Inbox row leaves.
- The rate entered is negative or not a number. It is refused in place, and
  nothing is saved.
- The user has entries before setting a rate. Setting it makes those entries
  rated through the usual fallback, and Home updates.
- The user adds a first client on the welcome screen with a name that matches
  an archived client. It is created as a new client, as it would be from the
  client list.
- The user closes the tab on the welcome screen. It shows again on the next
  sign-in, since it was neither finished nor skipped.
- Saving on the welcome screen fails. The screen stays open with what was
  entered and says why.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Inbox MUST show a row asking for a default hourly rate
  whenever the account has none, and MUST NOT show it otherwise.
- **FR-002**: The rate row MUST count toward the Inbox count and the folded
  dock's count, like every other row.
- **FR-003**: The user MUST be able to set the default rate from the rate row
  without leaving Home.
- **FR-004**: The rate row MUST have no snooze or dismiss, like every other
  Inbox row.
- **FR-005**: An account that has never finished or skipped the welcome
  screen MUST see it on its first web sign-in, before Home.
- **FR-006**: Accounts that existed before this feature MUST NOT see the
  welcome screen.
- **FR-007**: The welcome screen MUST ask for the default hourly rate and MAY
  take a first client's name and rate. Every field starts empty; nothing is
  saved on the user's behalf (Constitution I).
- **FR-008**: The welcome screen MUST offer "Skip for now", which saves
  nothing but records that it was seen.
- **FR-009**: Whether the welcome screen was seen MUST be kept on the account,
  so it shows once across every device.
- **FR-010**: The welcome screen MUST link to the Toggl import.
- **FR-011**: New invoice MUST ask in place for business name, email and
  address when any is empty, and save them to Settings.
- **FR-013**: Every save in this feature MUST answer in the same frame and go
  through the app's API (Constitution III, VI).
- **FR-012**: New invoice MUST NOT generate while business name or email is
  empty.

### Key Entities

- **Account settings**: gain a record of when the welcome screen was finished
  or skipped. Default hourly rate and business details already exist.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new contractor can go from first sign-in to Home showing money
  in under one minute.
- **SC-002**: No account with no default rate can reach Home without being
  asked for one.
- **SC-003**: No alpha tester asks Blake where to set their rate.
- **SC-004**: No invoice is generated without the user being asked for their
  business details first.

## Assumptions

- The macOS app gets no welcome screen. An account that starts there can
  track with no rate, and the web Inbox asks for one.
- The welcome screen is one screen, not a sequence. Its layout is settled in
  `/design-review`.
- Payment profiles are out of scope; New invoice already offers to add one in
  place.
- Product tours, tooltips, sample data and setup checklists are out of scope.
