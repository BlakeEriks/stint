Closes #463

# Feature Specification: Push timer changes to Android phones

**Feature Branch**: `f463-push`

**Created**: 2026-10-25

**Status**: Draft

**Input**: Issue #463. A contractor starts the timer on their Mac or the
web, then leaves the desk. Their phone learns of it only when the app next
comes to the foreground, so anything on the phone that shows the timer is
wrong exactly when they glance at it. The server should tell every phone
the moment the running timer changes, from any client. The owner narrowed
the scope on #463: the device registry, its routes, the sender, and Android
over Firebase Cloud Messaging. APNs and every iPhone push are #471, which
waits on the Apple Developer Program purchase; the sender stays open for a
second provider. The pinned notification and widget the push will drive
are #465.

## Clarifications

### Session 2026-10-25

- Q: What does a push carry? → A: Nothing about the timer: only that it
  changed. The phone asks the server for the timer, as it does on
  foreground. (decided autonomously: the server stays the truth
  (Principle III), two pushes arriving out of order can't show the older
  state, no task name passes through Google, and a token still registered
  to an account that signed out leaks nothing.)
- Q: Does the device that pressed also get a push? → A: Yes. A push that
  arrives while a press of its own is still in flight is ignored, since
  that press refetches when it settles; one that arrives after refetches
  the same truth. (decided autonomously: excluding it would need every
  write to name its device, for a refetch that costs nothing.)
- Q: Is a failed send retried? → A: Once, a second later, when the failure
  is transient (a network error, a 429 or a 5xx). A second failure goes to
  Sentry. (decided autonomously: the next change or the next foreground
  corrects the phone, so a queue would buy little.)
- Q: Which changes push? → A: A start, a stop, an edit to the running
  entry's task or project, an edit that stops or reopens an entry, and
  deleting the running entry. (decided autonomously)
- Q: Can one phone's token belong to two accounts? → A: Yes, one row per
  account and token. Signing out removes the phone from that account; a
  token left behind by a sign-out that couldn't reach the server only wakes
  a phone that ignores a push while signed out, and carries no data.
  (decided autonomously: moving a token between accounts needs a function
  that bypasses RLS.)

## Design

No design review: nothing on screen changes. The timer screen already
shows whatever the timer query holds; the push only refreshes it sooner.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A timer started elsewhere shows on the phone (Priority: P1)

The contractor has Stint open on their Android phone. They start the timer
on the web. Within a few seconds the phone shows it running, without being
touched. Stopping it on the Mac stops it on the phone the same way.

**Why this priority**: It is the issue: the phone shows the truth when it
is glanced at.

**Independent Test**: With the phone app open and signed in, start, retitle
and stop the timer on the web, and watch the phone follow each within a few
seconds.

**Acceptance Scenarios**:

1. **Given** the phone app is open and signed in, **When** the timer starts
   on another client, **Then** the phone shows it running within 5 seconds.
2. **Given** a running timer shown on the phone, **When** it is stopped on
   another client, **Then** the phone shows it stopped within 5 seconds.
3. **Given** a running timer, **When** its task or project is edited on
   another client, **Then** the phone shows the new task or project.
4. **Given** the running entry is deleted on the web, **Then** the phone
   shows no timer.
5. **Given** the phone presses Start, **When** its own push arrives while
   the press is in flight, **Then** the screen keeps the prediction and
   doesn't flicker back.

---

### User Story 2 - A phone registers itself and leaves on sign-out (Priority: P2)

Signing in on an Android phone registers it to receive timer pushes, with
no prompt. A new token from Firebase replaces the old one. Signing out
removes the phone from the account.

**Why this priority**: Story 1 needs it, and a signed-out phone must stop
hearing about the account.

**Independent Test**: Sign in on the phone and see its row in the account's
devices; sign out and see it gone.

**Acceptance Scenarios**:

1. **Given** a signed-in Android phone, **Then** the account has one device
   row for its token, however often the app launches.
2. **Given** Firebase issues the phone a new token, **Then** the new token
   is registered.
3. **Given** the user signs out, **Then** the phone's row is removed; when
   the server can't be reached, sign-out still happens.
4. **Given** one user, **Then** they can never read, register or remove
   another user's devices.

---

### User Story 3 - A failed send never fails the timer (Priority: P2)

Firebase being down, slow or misconfigured never delays or fails a start or
a stop. A dead token is removed, and any other failure reaches Sentry.

**Acceptance Scenarios**:

1. **Given** Firebase answers 500 twice, **When** the timer starts, **Then**
   the start answers 201 as usual and the failure is reported to Sentry.
2. **Given** Firebase says a token is unregistered, **Then** its row is
   deleted and nothing is reported.
3. **Given** the server has no Firebase credentials, **Then** nothing is
   sent and every timer route behaves as before.
4. **Given** Firebase answers 503 once, **Then** the send is retried once
   and succeeds.

### Edge Cases

- A user with no registered phone: no send is attempted.
- Two phones: both get the push.
- A phone offline for hours: Firebase keeps only the latest push for it,
  and the refetch on arrival shows the timer as it is then.
- The app open in the background, or closed: the push does nothing visible
  yet; #465's notification and widget will act on it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST keep each user's phones, one per token, with
  the platform each runs.
- **FR-002**: A signed-in client MUST be able to register a phone and
  remove it; registering the same token again changes nothing.
- **FR-003**: Every change to the running timer listed in Clarifications
  MUST send one push to each of the user's phones, after the response.
- **FR-004**: A push MUST carry no timer data and MUST be collapsible, so a
  phone that was offline gets only the last.
- **FR-005**: A send MUST NOT delay or fail the timer write. A transient
  failure MUST be retried once; a token the provider reports unregistered
  MUST be deleted; any other failure MUST be reported to Sentry.
- **FR-006**: With no provider credentials, the server MUST send nothing.
- **FR-007**: The Android app MUST register its token when signed in, with
  no permission prompt, re-register a new token, and remove it on sign-out.
- **FR-008**: The app MUST refetch the timer and what it moves on a push,
  unless a press of its own is in flight.
- **FR-009**: Sending MUST be per platform, so iPhone (#471) adds a provider
  without changing the routes.

### Key Entities

- **Push device**: a user, a platform (Android only, for now), the token
  the provider addresses it by, and when it was registered.

## Success Criteria *(mandatory)*

- **SC-001**: On the owner's Pixel 9, with the app open, a timer started or
  stopped on the web shows within 5 seconds.
- **SC-002**: A start or stop answers in the same time with Firebase down
  as with it up.
- **SC-003**: No user can see or change another's devices.

## Assumptions

- The owner creates the Firebase project and its credentials in the
  dashboard; the PR lists the steps. Firebase Cloud Messaging is free, so
  no fixed cost is added.
- Only the foreground app acts on a push here. Waking a closed app to
  update a notification or widget is #465's.
- `expo-notifications` adds native code, so the phone needs a new build,
  not an update (#474).
