Closes #465

# Feature Specification: The timer outside the Android app

**Feature Branch**: `f465-android-surfaces`

**Created**: 2026-10-27

**Status**: Draft

**Input**: Issue #465. A contractor's Android phone is in their pocket, and
opening an app to see or stop the timer is the friction that makes them
forget to stop it. The timer then runs over lunch or overnight; Principle I
means Stint flags the entry and never fixes it for them. The timer should be
seen and stopped without opening the app: a pinned notification with a
running clock and Stop, a home screen widget, a Quick Settings tile, and
long-press shortcuts on the app icon. Every surface follows the timer
whichever client changed it, driven by the push #463 built.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A running timer is pinned to the notification shade (Priority: P1)

While a timer runs, from any client, the phone shows an ongoing
notification: the task, the project, and a clock counting up from the
start. Its Stop button stops the timer without opening the app. Tapping the
notification opens the app.

**Why this priority**: It is the issue: the timer is seen at every glance at
the phone, and stopped from there.

**Independent Test**: Start the timer on the web with the phone locked;
unlock and see the notification counting; press Stop and see it go, and the
web show the entry stopped.

**Acceptance Scenarios**:

1. **Given** the phone is signed in, **When** a timer starts on any client,
   **Then** within 5 seconds the notification shows its task, project and a
   clock counting from its start.
2. **Given** the notification, **When** Stop is pressed, **Then** the
   notification goes at once, and the server stops the timer.
3. **Given** Stop was pressed, **When** the server refuses or can't be
   reached within 10 seconds, **Then** the notification comes back with the
   reason in it.
4. **Given** a running timer, **When** it is stopped or deleted on another
   client, **Then** the notification goes within 5 seconds.
5. **Given** the running task is renamed elsewhere, **Then** the
   notification shows the new name.
6. **Given** the user has refused notifications, **Then** nothing is pinned
   and every other surface still works.

---

### User Story 2 - A home screen widget shows and drives the timer (Priority: P2)

A widget on the home screen shows the running timer, with its clock
counting and a Stop button. Stopped, it shows the task Start would begin and
a Start button. A press shows its result at once.

**Why this priority**: The widget is where a stopped timer is started
without the app, which the notification can't do.

**Independent Test**: Add the widget; press Start and see it run on the
widget and the web; press Stop and see it stop on both.

**Acceptance Scenarios**:

1. **Given** no timer runs, **Then** the widget shows the task Start would
   begin and a Start button.
2. **Given** Start is pressed, **Then** the widget shows the timer running
   at once, and the server starts it.
3. **Given** a timer runs, **Then** the widget shows its task, project and
   a counting clock with a Stop button.
4. **Given** a press the server refuses or never answers within 10
   seconds, **Then** the widget shows what the server holds and says why
   the press failed, until the next press or update.
5. **Given** the timer changes on another client, **Then** the widget
   follows within 5 seconds.
6. **Given** the phone is signed out, **Then** the widget says to sign in,
   and a tap opens the app.

---

### User Story 3 - A Quick Settings tile toggles the timer (Priority: P3)

A tile in Quick Settings is on while a timer runs and names its task. A tap
stops a running timer or starts the task Start would begin.

**Acceptance Scenarios**:

1. **Given** a timer runs, **Then** the tile is on and names its task.
2. **Given** the tile is tapped while on, **Then** it turns off at once and
   the server stops the timer.
3. **Given** the tile is tapped while off, **Then** it turns on at once and
   the server starts the task Start would begin.
4. **Given** the phone is locked, **When** the tile is tapped, **Then** the
   phone asks to unlock before the press happens.
5. **Given** the phone is signed out, **Then** a tap opens the app.

---

### User Story 4 - The app icon's shortcuts start and stop (Priority: P3)

Long-pressing the app icon lists the one press that applies: Stop while a
timer runs, otherwise Start with the task it would begin. Choosing it opens
the app and makes the press there.

**Acceptance Scenarios**:

1. **Given** no timer runs, **Then** the shortcut reads Start and names the
   task it would begin.
2. **Given** a timer runs, **Then** the shortcut reads Stop.
3. **Given** a shortcut is chosen, **Then** the app opens and shows the
   press's result at once, as if pressed in the app.
4. **Given** the phone is signed out, **Then** no shortcut is listed.

### Edge Cases

- No task tracked yet: Start begins an unnamed timer on no project, which
  the app and web can name later.
- Two presses on two surfaces before the server answers: the later one
  wins, and they reach the server in press order.
- A press while a timer started elsewhere has not reached the phone yet:
  the server refuses a second start and returns the running timer, which
  every surface then shows.
- Offline for hours: each surface shows the last state it knew; its clock
  keeps counting from that start. The next push, press or app open
  corrects it.
- The app force-stopped from Settings: Android delivers no push until the
  app is opened again, so the surfaces can be stale until then.
- Sign-out clears every surface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: While a timer runs and notifications are allowed, the phone
  MUST show one ongoing notification with the task, the project, a clock
  counting from the start, and a Stop action; with no timer running, none.
- **FR-002**: A home screen widget MUST show the running timer with a
  counting clock and Stop, or the task Start would begin and Start.
- **FR-003**: A Quick Settings tile MUST show whether a timer runs and its
  task, and toggle it on a tap.
- **FR-004**: The app icon's shortcut MUST offer Stop while a timer runs,
  otherwise Start with the task it would begin.
- **FR-005**: Start from any surface MUST begin the most recently tracked
  task on its project, or an unnamed timer on no project when none was
  tracked.
- **FR-006**: Every surface MUST follow the server's timer: on a push, on
  each press's answer, and whenever the app reads the timer.
- **FR-007**: A press MUST show its predicted result on every surface at
  once, and the server's answer MUST replace it. A refusal, or no answer
  within 10 seconds, MUST put back what the server holds and say why.
- **FR-008**: Presses from every surface MUST follow the app's mutation
  rules: the latest wins, and a timer's presses reach the server in press
  order.
- **FR-009**: A press from the lock screen MUST ask to unlock first.
- **FR-010**: Signed out, the widget and tile MUST say to sign in and open
  the app, the notification and shortcut MUST be gone.
- **FR-011**: The surfaces MUST work on every Android version the app
  supports; one that a version lacks is simply absent there.

### Key Entities

- **Timer state on the phone**: what every surface shows: running or not,
  the task, the project and its color, the start time, the task Start would
  begin, and the reason the last press failed, if it did. It is a copy of
  the server's; nothing is kept that the server doesn't hold.

## Success Criteria *(mandatory)*

- **SC-001**: On the owner's Pixel 9, a timer stopped from the
  notification, widget or tile takes one press and no app opening.
- **SC-002**: A timer started on the web shows on every surface within 5
  seconds, with the phone locked in a pocket.
- **SC-003**: A press shows its result on its surface in the same frame.
- **SC-004**: No surface ever shows a timer state the server doesn't hold
  for longer than 10 seconds after a press.

## Assumptions

- The push from #463 reaches the phone with the app closed, and only the
  owner's Firebase setup (`docs/mobile.md`, Push) is needed for it.
- Surfaces add native code, so the phone needs a new build, not an update.
- iPhone has its own issue (#464).
