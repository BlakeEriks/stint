Closes #464

# Feature Specification: The timer outside the iPhone app

**Feature Branch**: `ios-surfaces`

**Created**: 2026-10-29

**Status**: Draft

**Input**: Issue #464. A contractor's iPhone is in their pocket, and opening
an app to see or stop the timer is the friction that makes them forget to
stop it. The timer then runs over lunch or overnight; Principle I means
Stint flags the entry and never fixes it for them. The timer should be seen
and pressed without opening the app: a Live Activity on the lock screen and
in the Dynamic Island, home and lock screen widgets, a Control Center
control, and Siri and Shortcuts actions. The owner's decision on the issue
(2026-10-29): build it before buying the Apple Developer Program, so
nothing here may need push; updates from other clients through APNs are
#471.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A running timer is on the lock screen and in the Dynamic Island (Priority: P1)

While a timer runs, the lock screen shows a Live Activity: the task, the
project, a clock counting up from the start, and Stop. On an iPhone with a
Dynamic Island, the island shows the clock. Stop stops the timer without
opening the app.

**Why this priority**: It is the issue: the timer is seen at every glance at
the phone, and stopped from there.

**Independent Test**: Start the timer in the app, lock the phone, see the
Live Activity counting; press Stop and see it go, and the web show the entry
stopped.

**Acceptance Scenarios**:

1. **Given** the app is open and signed in, **When** a timer runs, **Then**
   the Live Activity shows its task, project and a clock counting from its
   start.
2. **Given** the Live Activity, **When** Stop is pressed, **Then** it goes
   at once, and the server stops the timer.
3. **Given** Stop was pressed, **When** the server refuses or can't be
   reached within 10 seconds, **Then** the Live Activity comes back with the
   reason in it.
4. **Given** a timer started from a widget, Siri or Control Center, **Then**
   the Live Activity starts with it.
5. **Given** a timer that was stopped or renamed on another client, **When**
   the app is next opened, **Then** the Live Activity follows.

---

### User Story 2 - Home and lock screen widgets show and drive the timer (Priority: P2)

A widget shows the running timer, with its clock counting and Stop. Stopped,
it shows the task Start would begin and Start. A press shows its result at
once.

**Why this priority**: The widget is where a stopped timer is started
without the app, which the Live Activity can't do.

**Independent Test**: Add the widget; press Start and see it run on the
widget and the web; press Stop and see it stop on both.

**Acceptance Scenarios**:

1. **Given** no timer runs, **Then** the widget shows the task Start would
   begin and Start.
2. **Given** Start is pressed, **Then** the widget shows the timer running
   at once, and the server starts it.
3. **Given** a timer runs, **Then** the widget shows its task, project and
   a counting clock with Stop.
4. **Given** a press the server refuses or never answers within 10
   seconds, **Then** the widget shows what it showed before the press and
   says why the press failed, until the next press or app read.
5. **Given** the phone is signed out, **Then** the widget says to sign in,
   and a tap opens the app.

---

### User Story 3 - Siri, Shortcuts and the Action button start and stop (Priority: P3)

"Start" and "Stop" are actions Siri and the Shortcuts app know, so the
Action button can run one.

**Acceptance Scenarios**:

1. **Given** no timer runs, **When** Start runs, **Then** the task Start
   would begin runs, and every surface shows it.
2. **Given** a timer runs, **When** Stop runs, **Then** it stops, and every
   surface shows it.
3. **Given** the server refuses, **Then** Siri or Shortcuts says why.

---

### User Story 4 - A Control Center control toggles the timer (Priority: P3)

A control in Control Center is on while a timer runs and names its task. A
tap stops a running timer or starts the task Start would begin.

**Acceptance Scenarios**:

1. **Given** a timer runs, **Then** the control is on and names its task.
2. **Given** the control is tapped while on, **Then** it turns off at once
   and the server stops the timer.
3. **Given** the control is tapped while off, **Then** it turns on at once
   and the server starts the task Start would begin.

### Edge Cases

- No task tracked yet: Start begins an unnamed timer on no project, which
  the app and web can name later.
- A timer started or stopped on another client with the app closed: no
  surface knows until the app is next opened (#471 brings push). A press
  made meanwhile gets the server's conflict, and shows what the server
  holds.
- iOS ends a Live Activity after 8 hours. The app starts it again the next
  time it opens on a running timer.
- Offline: each surface shows the last state it knew, its clock counting
  from that start.
- Sign-out clears every surface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: While a timer runs, the phone MUST show a Live Activity with
  the task, the project, a clock counting from the start, and Stop; with
  none running, none.
- **FR-002**: Home and lock screen widgets MUST show the running timer with
  a counting clock and Stop, or the task Start would begin and Start.
- **FR-003**: A Control Center control MUST show whether a timer runs and
  its task, and toggle it on a tap.
- **FR-004**: Siri and Shortcuts MUST offer Start and Stop.
- **FR-005**: Start from any surface MUST begin the most recently tracked
  task on its project, or an unnamed timer on no project when none was
  tracked.
- **FR-006**: Every surface MUST follow the server's timer whenever the app
  reads it, and after each press's answer. No surface may need push.
- **FR-007**: A press MUST show its predicted result at once, and the
  server's answer MUST replace it. A refusal, or no answer within 10
  seconds, MUST take the prediction back and say why.
- **FR-008**: Presses from every surface MUST reach the server in press
  order.
- **FR-009**: A press from the lock screen MUST ask to unlock first.
- **FR-010**: Signed out, the widgets MUST say to sign in and open the app,
  and the Live Activity MUST be gone.
- **FR-011**: A build signed by a free Apple ID MUST still install and run
  the timer; a surface that build can't support is simply absent or says to
  open the app.

### Key Entities

- **Timer state on the phone**: what every surface shows, Android's (spec
  014): running or not, the task, the project and its color, the start
  time, the task Start would begin, and the reason the last press failed.
  It is a copy of the server's.

## Success Criteria *(mandatory)*

- **SC-001**: A running timer is stopped from the lock screen with one press
  and an unlock, without opening the app.
- **SC-002**: A press shows its result on its surface at once.
- **SC-003**: No surface shows a timer state the server doesn't hold for
  longer than 10 seconds after a press.
- **SC-004**: A build signed with a free Apple ID installs on an iPhone.

## Assumptions

- Surfaces add native code, so the phone needs a new build, not an update.
- No iPhone build has shipped, so no installed session or state needs
  carrying over.
- The look follows Android's approved surfaces
  (`specs/014-android-surfaces/design/surfaces.html`) in iOS's sizes.
