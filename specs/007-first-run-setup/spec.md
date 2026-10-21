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

## Design

The look is `design/first-run.html`: each screen and state, at desktop and
phone width, dark and light.

- **Welcome dialog**: a two-step dialog over Home on the first web sign-in,
  built from a new stepped dialog (the app dialog plus a step counter, two
  bars and "Step 1 of 2", and Back). Escape and a click outside do nothing.
- **Step 1, the rate**: "Welcome to Stint", "What do you charge by the
  hour?", one large rate field (`$`, placeholder `100.00`, `/ hour`), and the
  hint "A client or project can set its own rate later." "Skip for now"
  closes the dialog and saves nothing; "Next" is disabled until a rate is
  entered, saves it, and moves to step 2.
- **Step 2, the first client**: "Who are you working for?", a client name,
  a rate (placeholder is the default just entered, hint "Blank uses your
  default"), the client form's color picker starting on "No color", and
  "Coming from Toggl? Import your history instead." Back returns to step 1;
  "Skip this step" shows while the name is empty and closes the dialog;
  "Start tracking" saves the client, shows "Saving" while pending, and closes
  the dialog. A failure keeps the dialog open with what was entered and says
  why.
- **Inbox rate row**: a neutral Inbox card, "Set your default rate" over
  "Home can't show money without one", with a rate field (`$`, `100.00`,
  `/ hr`) and a neutral Save, never the accent like every Inbox action,
  disabled until a rate is entered. Saving takes the row
  away at once; a rejection brings it back with the reason under the field.
  It sorts after overdue invoices and stale drafts, before entry rows.
- **New invoice, details missing**: a notice at the top of the form, "Your
  business details are missing" over "Name and email are needed to
  generate.", with an "Add details" button. Generate is disabled. The preview
  shows a dashed placeholder where the "from" block goes.
- **Business details dialog**: "Who is this invoice from?", business name and
  email (required) and address, Cancel and Save. It opens only from "Add
  details". Save writes to Settings and closes; the notice goes, the preview
  shows the block, and Generate enables.
- **Settings**: the default hourly rate's placeholder becomes `100.00`, to
  match.

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

### User Story 2 - A welcome dialog on first sign-in (Priority: P2)

On their first sign-in to the web app, a new contractor sees a two-step
welcome dialog over Home. Step 1 asks for their default hourly rate. Step 2
offers to add a first client, with an optional rate and color, and links to
the Toggl import for anyone who is switching.

**Why this priority**: It is the friendliest first minute. Story 1 already
covers an account that never sees it.

**Independent Test**: Sign in as a brand-new invited account, see the welcome
dialog, enter a rate and a client, and land on Home with both saved.

**Acceptance Scenarios**:

1. **Given** an account that has never seen the welcome dialog, **When** it
   signs in to the web app, **Then** it sees the welcome dialog over Home.
2. **Given** step 1, **When** the user enters a rate and presses "Next",
   **Then** the rate is saved and step 2 shows.
3. **Given** step 2, **When** the user enters a client name and presses
   "Start tracking", **Then** the client is saved and the dialog closes.
4. **Given** step 1, **When** the user presses "Skip for now", **Then** the
   dialog closes, nothing is saved, and the Inbox asks for a rate (Story 1).
5. **Given** step 2, **When** the user presses "Skip this step", **Then** the
   dialog closes with only the rate saved.
6. **Given** an account that has finished or skipped the welcome dialog,
   **When** it signs in again on any device, **Then** it goes straight to
   Home.
7. **Given** step 2, **When** the user follows "Coming from Toggl?",
   **Then** the import page opens and the welcome dialog does not come back.
8. **Given** an existing account from before this feature, **When** it signs
   in, **Then** it never sees the welcome dialog.

---

### User Story 3 - The first invoice asks for business details (Priority: P3)

When a contractor starts an invoice and their business name or email is
empty, New invoice says so and offers a dialog for them, instead of sending
the contractor to Settings. What they enter saves to Settings and appears on
the invoice preview.

**Why this priority**: It only matters at the first invoice, which comes
after tracking. Today an invoice can be generated with no "from" block.

**Independent Test**: With empty business details, open New invoice, fill
them in the dialog, and see them on the preview and in Settings.

**Acceptance Scenarios**:

1. **Given** empty business details, **When** the user opens New invoice,
   **Then** a notice says they are missing, with "Add details".
2. **Given** that notice, **When** the user presses "Add details", fills
   name and email and saves, **Then** they save to Settings, the notice goes,
   and they appear on the preview.
3. **Given** complete business details, **When** the user opens New invoice,
   **Then** it asks for nothing extra.
4. **Given** empty business details, **When** the user tries to generate,
   **Then** Generate is disabled until business name and email are filled
   in, and the notice says why. Address is asked for but not required.

---

### Edge Cases

- The rate entered is zero. It is a valid rate (Constitution II), so the
  Inbox row leaves.
- The rate entered is negative or not a number. It is refused in place, and
  nothing is saved.
- The user has entries before setting a rate. Setting it makes those entries
  rated through the usual fallback, and Home updates.
- The user adds a first client in the welcome dialog with a name that matches
  an archived client. It is created as a new client, as it would be from the
  client list.
- The user closes the tab during the welcome dialog. It shows again on the
  next sign-in, since it was neither finished nor skipped; a rate saved by
  "Next" stays saved.
- Saving in the welcome dialog fails. The dialog stays open with what was
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
  dialog MUST see it on its first web sign-in, over Home.
- **FR-006**: Accounts that existed before this feature MUST NOT see the
  welcome dialog.
- **FR-007**: The welcome dialog MUST ask for the default hourly rate in step
  1 and MAY take a first client's name, rate and color in step 2. Every field
  starts empty; nothing is saved on the user's behalf (Constitution I).
- **FR-008**: The welcome dialog MUST offer "Skip for now" in step 1 and
  "Skip this step" in step 2; each records that it was seen.
- **FR-009**: Whether the welcome dialog was seen MUST be kept on the account,
  so it shows once across every device.
- **FR-010**: The welcome dialog MUST link to the Toggl import.
- **FR-011**: New invoice MUST show a notice while business name or email is
  empty, whose "Add details" opens a dialog for name, email and address that
  saves them to Settings.
- **FR-012**: Every save in this feature MUST answer in the same frame and go
  through the app's API (Constitution III, VI).
- **FR-013**: New invoice MUST NOT generate while business name or email is
  empty.

### Key Entities

- **Account settings**: gain a record of when the welcome dialog was finished
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

- The macOS app gets no welcome dialog. An account that starts there can
  track with no rate, and the web Inbox asks for one.
- Payment profiles are out of scope; New invoice already offers to add one in
  place.
- Product tours, tooltips, sample data and setup checklists are out of scope.
