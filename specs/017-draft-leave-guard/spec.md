Closes #583

# Feature Specification: Leaving New invoice with changes offers to save the draft

**Feature Branch**: `draft-leave-guard`

**Created**: 2026-11-03

**Status**: Draft

**Input**: Issue #583. An unsent invoice lives only in the New invoice
page's memory, so leaving or refreshing loses it. A first-time user had to
recreate an invoice several times. Nothing is saved unasked (Constitution I):
a draft takes an invoice number and holds its period's work, so the user
decides when one exists. Leaving with changes asks: Save draft, Discard, or
Keep editing.

## Clarifications

### Session 2026-11-03

- Q: Does the edit form (New invoice opened on a draft) ask too? → A: Yes.
  It is the same form, and leaving it loses the edits the same way. There,
  Save draft saves the edits. (decided autonomously)
- Q: What counts as a change? → A: Any field of the form differing from
  what it opened with. A form opened from an Inbox link, with its client
  and dates filled in, has no changes until the user makes one. Edits to
  the client's details go through Edit client, which saves them to the
  client; they are not form changes. (decided autonomously)
- Q: Can Generate invoice also make a draft with nothing to bill? → A: Yes.
  It and Save draft are the same press, so one rule decides both; a second
  rule for the same draft would be a state with no use (Constitution VII).
  The draft says it has nothing to bill, and Mark sent refuses it, as today.
  (decided autonomously)
- Q: What if the form can't be saved yet, such as no client, unrated work
  or a missing summary line? → A: The dialog still asks. Save draft is
  disabled, and the dialog says why. Discard and Keep editing work.
  (decided autonomously)
- Q: Does the browser's Back button ask? → A: No. Next.js offers no way to
  hold a Back press, and faking one with an extra history entry breaks
  Forward. Back leaves without asking, as it does today. (decided
  autonomously)

## Design

No design review: the dialog is the app's confirm dialog with a third
button, so it has no choice of layout or hierarchy to review (decided
autonomously).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leaving with changes asks (Priority: P1)

The user picks a client on New invoice, types a reference, then presses
Calendar in the sidebar. A dialog asks whether to save the draft, discard
it, or keep editing.

**Why this priority**: It is the loss #583 names.

**Independent Test**: Change a field, press a link to another page, and see
the dialog; press Keep editing and see the form unchanged.

**Acceptance Scenarios**:

1. **Given** New invoice with a client picked, **When** the user presses a
   link to another page, **Then** a dialog offers Save draft (primary),
   Discard and Keep editing, and the page has not changed.
2. **Given** that dialog, **When** Keep editing is pressed, **Then** the
   dialog closes and the form is as it was.
3. **Given** that dialog, **When** Discard is pressed, **Then** the app
   goes to the link's page and nothing is saved.
4. **Given** New invoice with nothing entered, or opened from an Inbox link
   and not changed, **When** the user presses a link, **Then** the app
   leaves without asking.
5. **Given** New invoice with changes, **When** the user refreshes or
   closes the tab, **Then** the browser asks with its own prompt, and
   nothing is kept if the user leaves.
6. **Given** a draft's edit form with changes, **When** the user presses a
   link, **Then** the same dialog asks.

---

### User Story 2 - Save draft keeps the work (Priority: P1)

Save draft in the dialog creates the draft, or saves the edits, and opens
it.

**Why this priority**: Without it, the dialog only warns before the loss.

**Independent Test**: Change a field, press a link, press Save draft, and
see the draft open with its number and the field kept.

**Acceptance Scenarios**:

1. **Given** the dialog on New invoice, **When** Save draft is pressed,
   **Then** it shows a pending state until the server answers, then the
   new draft opens.
2. **Given** the dialog on an edit form, **When** Save draft is pressed,
   **Then** the edits are saved and the draft opens.
3. **Given** the server refuses the save, **Then** the refusal shows in
   the dialog, which stays open.
4. **Given** a form that can't be saved yet (no client, unrated work, a
   missing summary line, a due date before the issue date, no business
   details), **Then** Save draft is disabled and the dialog says why.

---

### User Story 3 - A draft may have nothing to bill (Priority: P2)

A client picked with no unbilled work in the period can still be saved as
a draft. Mark sent refuses it until it bills something.

**Why this priority**: Save draft on a half-filled form would otherwise be
refused, and the user would lose the form anyway.

**Independent Test**: Pick a client with no unbilled work in the period,
generate, and see the draft with nothing to bill; press Mark sent and see
it refused.

**Acceptance Scenarios**:

1. **Given** a client with nothing to bill in the period, **When** Generate
   invoice or Save draft is pressed, **Then** a draft is created.
2. **Given** a draft with nothing to bill, **When** Mark sent is pressed,
   **Then** it is refused with "Nothing to send", as today.

### Edge Cases

- A link to the page already shown leaves nothing, so it does not ask.
- A link opened in a new tab or window (a modifier key, a middle click,
  `target="_blank"`) leaves nothing, so it does not ask.
- Generate invoice going to the new draft does not ask: the draft is saved.
- An Inbox row pressed on this page opens another invoice form, so it asks.
- Signing out, or the session ending, leaves without asking.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Pressing an in-app link that would leave the invoice form
  while it has changes MUST open a dialog with Save draft (primary),
  Discard and Keep editing, and MUST NOT navigate until one is chosen.
- **FR-002**: A form with no changes MUST leave without asking. A change is
  any field differing from what the form opened with.
- **FR-003**: Refreshing or closing the tab with changes MUST raise the
  browser's own prompt. Nothing MUST be stored on the device.
- **FR-004**: Save draft MUST make the same press as Generate invoice, or
  Save draft on an edit form, and open the draft. It MUST show a pending
  state, and a refusal MUST show in the dialog.
- **FR-005**: While the form can't be saved, Save draft MUST be disabled,
  and the dialog MUST say why.
- **FR-006**: Discard MUST go to the link's page and save nothing.
- **FR-007**: Creating or saving a draft MUST be allowed with nothing to
  bill. Mark sent MUST still refuse it.
- **FR-008**: The comment in `invoice-new.tsx` saying generation marks
  entries invoiced MUST say what it does: it holds them for the draft.

### Removes (Constitution VII)

- The "Nothing to invoice" refusal on creating and saving a draft, and the
  form's rule that Generate needs at least one line. Mark sent's "Nothing
  to send" covers the case.
- The tests that assert either.

### Key Entities

- **Draft**: unchanged. It may now hold no work and no charges.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No in-app link press loses a changed invoice form without
  the user choosing Discard.
- **SC-002**: A user who wants to keep the form keeps it with one press.

## Assumptions

- The phone and Mac apps have no invoice form, so only the web changes.
- `DRAFT_OVERLAPS` no longer exists (#600), so the issue's inline overlap
  link has nothing to show.
