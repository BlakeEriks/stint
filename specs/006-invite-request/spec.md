Closes #55

# Feature Specification: Ask for an invite from the landing page

**Feature Branch**: `f55-invite-only`

**Created**: 2026-10-11

**Status**: Draft

**Input**: Issue #55, "Alpha is invite-only, and the landing page is how you
ask". Sign-in no longer creates accounts (#271), so the gate holds. But the
landing page's "Start tracking — free" still sends a stranger to a sign-in
form that turns them away, and nothing on the page lets them ask in. The page
should capture their address. The owner reads the list and invites from it, which
is all invite-only means at a dozen people. Collecting addresses goes through
a form service, not a table and a route: an unauthenticated write to our own
database would need rate limiting so spammers can't abuse it, and an alpha
list doesn't justify that. Swap in a table when the volume makes the list
tedious to read.

## Design

Design review: skipped in autonomous run; follows the existing landing page
and `.claude/rules/web-ui.md`.

- **The control** (decided autonomously): each call to
  action becomes the form itself, an email field and a "Request an invite"
  button in the accent, in the hero and in the closing section. Pressing the
  call to action is sending the address; there's no step between.
- **Open**: an empty field with the placeholder "you@example.com" and a
  label for screen readers. The line beside it says access is by invite
  during alpha and is free.
- **Sending**: the field is read-only and the button is disabled and reads
  "Sending…".
- **Sent**: the form is replaced by "You're on the list." and a line saying
  an invite comes to that address by email if they're let in.
- **Failed**: the field keeps the address, and a line under it in the danger
  color says the request didn't send and to try again.
- **Invalid**: the browser's own validation says the address isn't an email,
  and nothing is sent.
- **Sign-in refusal**: "Stint is invite-only during alpha." and a link,
  "Request an invite", to the hero form on the landing page.

## Clarifications

### Autonomous decisions, 2026-10-12

- Form service (decided autonomously): Formspree's free
  plan. It accepts a cross-origin POST from a static page and answers JSON
  when asked, so the page stays put. It emails each submission and lists
  them with timestamps in its dashboard, and costs nothing at 50 submissions
  a month. A plain HTML POST works too, so a visitor with JavaScript off
  still reaches the list, landing on Formspree's thank-you page. Web3Forms
  and Basin also fit; Formspree is the longest-running and answers errors
  in a shape the page can tell from success.
- Without JavaScript (decided autonomously): the form
  posts to Formspree and the visitor lands on its thank-you page. The edge
  case's promise is that the address reaches the list, and it does.

### Session 2026-10-11

- Q: Where does a visitor type their address: on the landing page itself,
  or on the form service's own hosted page? → A: On the landing page. The
  page sends the address to the service and stays static.
- Q: What does the invite request ask the visitor for? → A: Email only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stranger asks for an invite (Priority: P1)

Someone reading the landing page wants to try Stint. They press the main call
to action, type their email address into the form on the page, and send
it. The page confirms that the
request was received and that an invite comes by email if they're let in.
Signing in doesn't come up.

**Why this priority**: This is the feature. Without it, the page can't go
live on the domain: every interested visitor reaches a dead end.

**Independent Test**: On the landing page, request an invite with a new
address. Confirm the page acknowledges it and the address reaches the owner's
list. Confirm no account exists for that address.

**Acceptance Scenarios**:

1. **Given** a visitor on the landing page, **When** they press the hero or
   closing call to action, **Then** they reach a one-field invite request
   on the landing page itself, not sign-in.
2. **Given** a valid address, **When** they send it, **Then** the control
   shows a pending state until the result is known, and the page then
   confirms the request and says an invite arrives by email if accepted.
3. **Given** a sent request, **When** the owner checks the list, **Then** the
   address is on it, with when it was sent.
4. **Given** an address that isn't a valid email, **When** they try to send
   it, **Then** the form says so and sends nothing.
5. **Given** the form service fails or can't be reached, **When** they send,
   **Then** the form keeps their address and says it couldn't send and to
   try again.

---

### User Story 2 - An invited user still signs in (Priority: P2)

Someone the owner already invited comes back to the landing page to sign in. The
header's Sign in link still takes them to the sign-in form.

**Why this priority**: Invited users must not lose their way in, but the
path already works. It only has to survive the change.

**Independent Test**: From the landing page, follow Sign in and complete a
magic-link sign-in as an invited user.

**Acceptance Scenarios**:

1. **Given** the landing page, **When** a visitor presses Sign in in the
   header, **Then** they reach the sign-in form.

---

### User Story 3 - A turned-away sign-in points to the request (Priority: P3)

A stranger who goes straight to sign-in and enters an address without an
account is told Stint is invite-only. The message links to the invite
request instead of telling them to "ask the owner", which a stranger can't do.

**Why this priority**: It covers a side door. Most visitors arrive through
the landing page.

**Independent Test**: On sign-in, enter an address with no account. Confirm
the refusal links to the invite request.

**Acceptance Scenarios**:

1. **Given** an address with no account, **When** it's submitted on
   sign-in, **Then** the refusal says Stint is invite-only and links to
   the invite request on the landing page.

### Edge Cases

- The same address asks twice: both requests reach the list, and the owner
  ignores the duplicate. The visitor sees the same confirmation each time.
- An already invited address asks: it lands on the list like any other.
  Sign-in still works for it.
- A bot fills the form: it adds a row to the list and nothing else. Any spam
  protection is whatever the form service provides. No account and no row
  in our database results.
- The visitor has JavaScript off: the request still reaches the list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every call to action on the landing page except the header's
  Sign in MUST request an invite instead of linking to sign-in.
- **FR-002**: An invite request MUST ask for an email address and
  nothing else.
- **FR-003**: The form MUST be on the landing page, in Stint's own design,
  not the service's hosted page or embedded widget. It sends to a hosted
  form service that the owner reads and gets notified from, and nothing is
  written to Stint's database. The visitor never leaves the page.
- **FR-004**: The form service MUST cost nothing at alpha volume (no new
  fixed cost, constitution).
- **FR-005**: The page MUST show a pending state on the send control while
  the request is in flight, then a confirmation or an error (Principle VI).
- **FR-006**: A failed send MUST keep the visitor's address in the form and
  say it didn't send.
- **FR-007**: The landing page MUST stay a static document. Requesting an
  invite adds no server rendering and no route.
- **FR-008**: The sign-in refusal for an address with no account MUST link
  to the invite request.
- **FR-009**: Copy on the landing page that promises instant access MUST
  say access is by invite during alpha. "Free" stays.
- **FR-010**: The privacy page MUST say that an invite request's address
  goes to the form service and is used only to send the invite.

### Key Entities

- **Invite request**: an email address and when it was sent. It's held by
  the form service, not by Stint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can request an invite in under 30 seconds from
  landing on the page.
- **SC-002**: No path on the landing page creates an account.
- **SC-003**: Every request reaches the owner's list, and they're notified of it.
- **SC-004**: An invited user signs in from the landing page with the same
  number of steps as before.

## Assumptions

- The account gate is already in place: sign-up is off, and accounts come
  from the Supabase dashboard's invite (#271, `docs/setup.md`). This feature
  doesn't touch it.
- The owner invites by hand from the list. Nothing is automated between a
  request and an invite.
- The visitor gets no confirmation email, only the confirmation on the page.
  The invite email is the only email they get.
- The form service's own spam protection is enough at alpha volume.
- Web only. The macOS app has no sign-up path to change.
