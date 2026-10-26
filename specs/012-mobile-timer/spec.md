Closes #462

# Feature Specification: A phone timer for iPhone and Android

**Feature Branch**: `f462-mobile-timer`

**Created**: 2026-10-25

**Status**: Draft

**Input**: Issue #462. A contractor who starts work away from the desk (a
client site, a call on a walk, a commute) has no timer with them, so those
hours are reconstructed afterward or lost. Harvest, Toggl and Clockify all
ship a phone timer, and a stranger comparing Stint at Launch reads its
absence as a toy. The phone app has the macOS app's scope: start, stop,
task name, project, and nothing more. It signs in with the same emailed
six-digit code, writes through the same optimistic-press rules as the web,
and refreshes the timer whenever it comes to the foreground. Depends on
#460, which records the Apple and Google fees in `docs/positioning.md`.

## Clarifications

### Session 2026-10-25

- Q: Does the app show today's entries, or only the running one? → A: The
  macOS panel's content: the timer, Today and Earned, and the five most
  recent task names to start again. No list of entries. (decided
  autonomously: the issue sets the macOS scope, and a list of entries is
  where editing starts, which is the web app's.)
- Q: Can the project be changed while the timer runs? → A: No, as on macOS:
  it would reassign time already tracked. Stop, then start on the other
  project. (decided autonomously)
- Q: How does the reviewer try a PR's phone build? → A: The owner installs
  the PR's EAS cloud build on their Android phone from the link in Try it;
  it points at that PR's Vercel preview and signs in as its seeded account.
  Builders check an Expo web render. (the owner's answer, on #462)
- Q: Which layout? → A: B, the docked timer. (the owner's answer, on #462)
- Q: When is the user signed out? → A: Only when the server rejects the
  refresh token, as on macOS. Offline or a server error keeps the session
  and says the timer could not be reached. (decided autonomously)
- Q: Do iPhone and Android ship together? → A: Yes, one codebase, both in
  the first release, as the issue asks. (decided autonomously)

## Design

[`design/timer.html`](design/timer.html) and
[`design/sign-in.html`](design/sign-in.html), in the app's tokens, dark and
light, 390 and 360 wide.

- **Header**: the wordmark, a badge naming the backend when the build is not
  production, and a settings button that opens the account and Sign out.
- **Today and Earned**: two figures side by side at the top. Today is in
  whole minutes, so only the readout moves by the second.
- **Recent**: the middle of the screen, five task names with their project
  and client dot, the running one left out; a tap starts that task on its
  project. With none yet, one line says tasks you track show here.
- **The dock**: the whole timer, pinned to the foot of the screen in thumb
  reach. Stopped, it holds the task field, then the project picker with a
  round Start beside it, the one accent object. Running, it holds the live
  dot, the readout in the running color, the task, and the project and
  client, with a round Stop beside them; there is no picker.
- **A notice** sits under the header: a refusal says why while the dock
  shows what is running; offline says Stint can't be reached and keeps the
  dock as it was.
- **Sign-in** is full screen: the wordmark, an email field and "Email me a
  code", then the code field (no placeholder), Sign in, inert until six
  digits, and "Use a different email". An error shows under the field.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start and stop the timer from the phone (Priority: P1)

Away from the desk, the contractor opens Stint on the phone, types a task,
picks a project, and starts. Later they open it again and stop. The entry
is on the web and in the menu bar as if they had started it there.

**Why this priority**: It is the whole reason for the app.

**Independent Test**: Signed in, start a timer on the phone with a task and
project, see it running in the web app, stop it on the phone, see the
finished entry on the web.

**Acceptance Scenarios**:

1. **Given** no timer running, **When** the user types a task, picks a
   project and presses start, **Then** the readout starts counting in the
   same frame, and the server's entry replaces the prediction when it
   answers.
2. **Given** a timer running, **When** the user presses stop, **Then** the
   app shows the stopped state in the same frame and Today includes the
   finished entry.
3. **Given** a timer started on the web or the Mac, **When** the user brings
   the app to the foreground, **Then** it shows that timer running, with
   its task, project and elapsed time.
4. **Given** a timer stopped elsewhere while the app was in the background,
   **When** the app comes to the foreground, **Then** it shows the stopped
   state.
5. **Given** the server refuses a start because a timer already runs,
   **When** the refusal arrives, **Then** the prediction is taken back, the
   app says why, and it shows the timer that is running.
6. **Given** no network, **When** the user presses start, **Then** the
   prediction is taken back within 10 seconds and the app says the timer
   could not be reached.
7. **Given** the recent tasks list, **When** the user taps one, **Then** a
   timer starts on that task and its project.

---

### User Story 2 - Sign in with an emailed code (Priority: P1)

The first time, the app asks for an email, sends a six-digit code, and the
user types it in. The app stays signed in until they sign out.

**Why this priority**: Nothing else works signed out.

**Independent Test**: On a fresh install, request a code, type it, and see
the timer screen; relaunch and see it still signed in.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the user enters their email,
   **Then** a code is sent and the app asks for it.
2. **Given** the code screen, **When** the user types a wrong or expired
   code, **Then** the app says so and keeps the field.
3. **Given** a signed-in user offline for a night, **When** they open the
   app, **Then** they are still signed in and see that the timer could not
   be reached.
4. **Given** the server rejects the session, **When** the app next asks,
   **Then** it returns to the email screen.
5. **Given** a signed-in user, **When** they choose Sign out, **Then** the
   session and anything cached is removed from the phone.

---

### User Story 3 - See today at a glance (Priority: P2)

Under the timer, the app shows today's tracked time and what it earned, the
two numbers the web's Today leads with.

**Why this priority**: It is how a timer left running, or one never
started, gets noticed.

**Independent Test**: With entries today, open the app and see Today and
Earned match the web.

**Acceptance Scenarios**:

1. **Given** entries today and a timer running, **When** the app is open,
   **Then** Today includes the running time, and only the readout changes
   every second.
2. **Given** no entries today, **When** the app is open, **Then** Today
   reads 0m and Earned $0.00.

---

### User Story 4 - Try and release a phone build (Priority: P3)

The reviewer tries a PR's phone build on their own phone against its
preview, and the maintainer releases a build to TestFlight and Play
internal testing.

**Why this priority**: Nobody can review or ship the app without it, but a
user never sees it.

**Independent Test**: Install an open PR's build from the link in its Try
it and see the app signed in as that PR's seeded account.

**Acceptance Scenarios**:

1. **Given** an open PR, **When** the reviewer installs its Android build
   from the link in Try it, **Then** its first launch asks once for
   Vercel's bypass, which no build holds, and the app opens against the
   PR's preview, signed in as `pr-<n>@preview.test`, and says it is that
   PR's build. It installs beside the released app, not over it.
2. **Given** a commit on `main`, **When** the maintainer runs the release
   steps in `docs/mobile.md`, **Then** a build reaches TestFlight and Play
   internal testing pointed at production. The iPhone build waits on the
   Apple Developer Program (#460).

### Edge Cases

- A timer running across midnight: Today counts only today's part, as the
  menu bar does.
- A task name longer than the screen is wide: it truncates, never wraps the
  readout.
- Two quick presses (start then stop): the latest wins and they reach the
  server in press order.
- A server that never answers a press: the prediction fails after 10
  seconds, and a late answer refetches.
- An archived project: not offered in the picker; a running timer on one
  still shows its name.
- The phone's clock is wrong: elapsed time is corrected from the server's
  time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST let a signed-in user start a timer with an
  optional task name and project, and stop the running one.
- **FR-002**: The app MUST NOT let the project change while a timer runs.
- **FR-003**: Every press MUST show its result in the same frame, and a
  refusal MUST take the prediction back and say why, by the same rules as
  the web and macOS (Constitution VI).
- **FR-004**: The app MUST refetch the timer whenever it comes to the
  foreground; the server's answer wins.
- **FR-005**: The app MUST sign in with an emailed six-digit code and keep
  the session in the phone's secure storage, where a later widget or
  extension of the same app can read it.
- **FR-006**: The app MUST sign out only on Sign out or when the server
  rejects the session.
- **FR-007**: The app MUST show Today and Earned for the user's time zone,
  and the five most recent task names other than the running one.
- **FR-008**: The app MUST talk only to `/api/v1` and the sign-in service,
  as every client does (Constitution III).
- **FR-009**: A build MUST target one backend: local, a PR's preview, or
  production, and say which whenever it is not production.
- **FR-010**: The app MUST hold nothing beyond the macOS app's scope: no
  entry editing, clients, invoices or settings beyond the account and Sign
  out.

### Key Entities

- **Session**: the signed-in user's tokens, in secure storage, per backend.
- **Timer**: the running entry, owned by the server: task name, project,
  start time.
- **Today**: tracked seconds and earnings for the current day, from the
  server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the app signed in, a user starts a timer in two
  presses when the task is in Recent, and in under 10 seconds when typed.
- **SC-002**: A timer started or stopped on another device shows correctly
  within 2 seconds of the app coming to the foreground.
- **SC-003**: A user stays signed in across a week without opening the app.
- **SC-004**: The reviewer has a PR's build on their phone from one link.

## Assumptions

- #460 lands first: the Apple Developer Program and Google Play fees are
  recorded in `docs/positioning.md`. This branch stacks on its PR.
- Push notifications, widgets and a lock-screen timer are separate issues;
  this one only keeps the session where they can read it.
- Online only, like every client. A press with no network fails visibly;
  nothing is queued.
- US formats: USD, US dates and number formats.
- Builds use EAS Build's free tier, TestFlight and Play internal testing; no
  paid service is added.
