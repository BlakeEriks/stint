Closes #205

# Feature Specification: Feedback from inside the app

**Feature Branch**: `f205-feedback-form`

**Created**: 2026-10-10

**Status**: Draft

**Input**: Issue #205, "Feedback form in the app": an alpha user who hits a
fault or wants something has no way to say so from where they are, and stops
using the app quietly instead.

## Design

Adds a control and a form to the web app, and to the macOS app if it is in
scope. Offer `/design-review` before planning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Say what's in the way, from where it happened (Priority: P1)

An alpha user is on the invoice screen when a total looks wrong. Without
leaving the screen, they open feedback, type two sentences and send it. The
form says it was sent, closes, and they carry on where they were.

**Why this priority**: Collecting this signal is the reason Alpha exists.
Without it, a user who hits a fault just stops using the app.

**Independent Test**: Signed in, open feedback from any screen, send a
message, and confirm it reaches us with the user, the screen and the app
version attached.

**Acceptance Scenarios**:

1. **Given** a signed-in user on any screen, **When** they open feedback,
   **Then** a form opens over that screen without navigating away from it.
2. **Given** an open form with a message, **When** they send it, **Then** the
   send control shows a pending state until the server answers, then the form
   closes and says it was sent.
3. **Given** an empty message, **When** they try to send, **Then** sending is
   refused and the form stays open.
4. **Given** a send the server rejects or never answers, **When** that fails,
   **Then** the form stays open with the message intact and says why.

---

### User Story 2 - We get enough to act without asking back (Priority: P1)

Blake reads a submission and knows who sent it, from which screen, on which
app and version, and when, without writing back to ask.

**Why this priority**: A message with no context costs us a round trip with
the user, which is exactly the friction this feature removes.

**Independent Test**: Send feedback from two screens on two clients and
confirm each submission names its user, screen, client, version and time.

**Acceptance Scenarios**:

1. **Given** a sent message, **When** Blake reads it, **Then** it shows the
   sender's account, the screen it was sent from, the client (web or macOS),
   the app version and the time it was sent.
2. **Given** a user who wrote nothing about their setup, **When** Blake reads
   it, **Then** the attached context is still complete, because the user
   never typed it.

---

### Edge Cases

- A long message: accepted up to a fixed limit, with the limit shown before
  it is reached and never cut off silently.
- Pressing send twice: only one submission is created.
- Closing the form with an unsent message: the message is discarded and the
  user is not warned. It's a note, not a record.
- A signed-out visitor: the form isn't offered, since every submission names
  its sender.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A signed-in user MUST be able to open feedback from every
  screen of the app, without leaving that screen.
- **FR-002**: The form MUST take one free-text message. It's required, has a
  length limit, and asks for nothing else from the user.
- **FR-003**: Each submission MUST record the sender's account, the screen it
  came from, the client (web or macOS), the app version and the time, without
  the user entering any of them.
- **FR-004**: Feedback MUST be available on
  [NEEDS CLARIFICATION: web only, or web and macOS together? Both go through
  the same API, but macOS doubles the UI work.]
- **FR-005**: Submissions MUST go through the shared API (Constitution III)
  and land in [NEEDS CLARIFICATION: where Blake reads them. Options: a table
  read in the database dashboard, an email to the team, or a GitHub issue.
  The repo is public, so an issue would publish the user's words.]
- **FR-006**: Sending MUST show a pending state on the send control until the
  server answers, and MUST say why when it fails (Constitution VI). A retried
  send MUST NOT create a second submission.
- **FR-007**: A user MUST NOT be able to read anyone else's submissions.
- **FR-008**: The feature MUST add no new fixed cost.

### Key Entities

- **Feedback submission**: one message from one user, with the screen,
  client, app version and time it was sent. Once sent, it can't be changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can send feedback from any screen in under 30 seconds,
  without losing their place.
- **SC-002**: Every submission names its sender, screen, client and version,
  with no follow-up needed to learn them.
- **SC-003**: Blake sees a new submission within one working day of it being
  sent, without having to look for it.
- **SC-004**: No submission is ever lost or duplicated.

## Assumptions

- The form doesn't attach screenshots. They're a privacy risk for invoices
  and client names, and the screen name carries the context.
- Category pickers (bug or idea) are left out. The message says which, and a
  field nobody fills in only slows the send down.
- The user gets no reply inside the app. Blake answers by email from the
  account address when he needs to.
- The existing app version string (shown in the nav today) is the version
  that gets recorded.
