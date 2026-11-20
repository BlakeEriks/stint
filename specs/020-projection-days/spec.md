Closes #809

# Feature Specification: The month projection counts the days you actually work

**Feature Branch**: `pace-day-rule`

**Created**: 2026-11-20

**Status**: Draft

**Input**: Issue #809. Home's "On track for" figure is earned so far,
divided by the weekdays elapsed, times the weekdays in the month. Weekend
work counts toward the money but never toward the days, so someone who works
any day of the week gets a projection that runs high, and their chart folds
weekend work into Mondays. For a weekday worker, federal holidays count as
working days, so the projection runs a little high in any month with one.
A setting picks which days the projection counts: every day, weekdays (the
current rule, and the default), or weekdays except US federal holidays.

## Clarifications

### Session 2026-11-20

- Q: Does the setting change the week's bars too? → A: No. The week always
  shows its seven days; only the month's projection and chart count days.
  (decided autonomously)
- Q: Does the marketing page's demo month follow a setting? → A: No. It has
  no user; it keeps Weekdays. (decided autonomously)
- Q: Where does the control sit, and what does it read? → A: Its own
  Settings section, "Home", with a three-way choice: "Every day",
  "Weekdays" and "Weekdays, except holidays", and a hint naming what it
  changes: the month's projection. (decided autonomously)

## Design

No design review: the only new UI is one three-way choice in a Settings
section built like the ones around it, with no choice of layout or
hierarchy to make. Home's card and chart keep their look. (decided
autonomously)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Someone who works any day projects over every day (Priority: P1)

A user who works weekends picks **Every day**. Home's projection then
divides what they've earned by the calendar days elapsed and carries that
rate over every day of the month. The chart steps one point per day, so
Saturday's work shows on Saturday.

**Why this priority**: It's the case the current rule gets most wrong:
weekend money inflates the weekday rate every week of the month.

**Independent Test**: On the 10th of a 30-day month, with 1,000 earned and
the setting on Every day, the projection reads 3,000 and the chart has 30
points.

**Acceptance Scenarios**:

1. **Given** Every day, the 10th of a 30-day month and 1,000 earned,
   **When** the user opens Home, **Then** the projection is 3,000 and the
   card reads "10 of 30 working days".
2. **Given** Every day and work logged on a Saturday, **When** the user
   opens Home, **Then** the chart's Saturday point rises by that amount and
   Monday's doesn't.
3. **Given** Every day and the 2nd of the month, **When** the user opens
   Home, **Then** no projection shows yet, as under any rule before its
   third counted day.

---

### User Story 2 - A weekday worker skips federal holidays (Priority: P2)

A user who takes federal holidays off picks **Weekdays, except
holidays**. Each of the 11 US federal holidays, on its observed date, drops
out of the days counted, both elapsed and in the month.

**Why this priority**: The error is a few percent in a month with a
holiday, smaller than story 1's, but every weekday worker who takes them off
sees it.

**Independent Test**: In November 2026, with the setting on, the month
counts 19 days rather than 21 (Veterans Day on Wednesday the 11th and
Thanksgiving on Thursday the 26th drop out).

**Acceptance Scenarios**:

1. **Given** Weekdays except holidays and a November, **When** the user
   opens Home, **Then** the month's total leaves out Veterans Day and
   Thanksgiving, and the chart has no point on either.
2. **Given** a holiday on a Saturday, **When** the month is counted,
   **Then** the Friday before is left out instead.
3. **Given** a holiday on a Sunday, **When** the month is counted, **Then**
   the Monday after is left out instead.
4. **Given** money earned on a holiday, **When** the user opens Home,
   **Then** it carries onto the next counted day, as weekend work does
   under Weekdays.

---

### User Story 3 - Nobody's numbers change unless they choose (Priority: P1)

Every account starts on **Weekdays**, today's rule. The projection, the
chart and the "of N working days" line read exactly as before for anyone
who never opens the setting.

**Why this priority**: A setting nobody asked for must not move anyone's
numbers.

**Independent Test**: For an account that never changed the setting, Home's
month figures match today's for the same entries and date.

**Acceptance Scenarios**:

1. **Given** an account that never set it, **When** the user opens
   Settings, **Then** Weekdays is selected.
2. **Given** the user changes it in Settings, **When** they return to Home,
   **Then** the projection uses the new rule.

### Edge Cases

- New Year's Day on a Saturday is observed on Friday, December 31 of the
  year before: that December loses its 31st.
- Under Every day, no day is ever carried: every date has its own point.
- The last counted day of a month absorbs any uncounted days after it, so
  the chart's total always equals the month's earned, as today.
- A month whose 1st and 2nd are both uncounted days still waits for three
  counted days before projecting.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A user setting MUST choose which days the projection counts:
  Every day, Weekdays, or Weekdays except holidays. It MUST default to
  Weekdays.
- **FR-002**: The projection MUST be earned so far, divided by counted days
  elapsed (today included), times counted days in the month, under the
  chosen rule.
- **FR-003**: The chart's points and the month's day total MUST come from
  one definition of the counted days, so the two can't disagree.
- **FR-004**: Money earned on an uncounted day MUST carry onto the next
  counted day's point, or the month's last counted day when none follows.
- **FR-005**: The minimum days before a projection shows (three) MUST count
  days under the chosen rule.
- **FR-006**: Holidays MUST be the 11 US federal holidays on their observed
  dates, computed from the calendar without any outside source: New Year's
  Day, Martin Luther King Jr. Day, Washington's Birthday, Memorial Day,
  Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day,
  Thanksgiving and Christmas.
- **FR-007**: The setting MUST be readable and writable through the
  settings API, so every client shares it, and Home's figures MUST be
  computed on the server under it.
- **FR-008**: The setting MUST be editable on the web Settings page and save
  like the fields around it.

### Key Entities

- **Projection days**: one per user, beside the week start. Which days
  count toward the month's pace: every day, weekdays, or weekdays except
  holidays.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an account on the default, Home's month figures are
  identical to today's for every date tested.
- **SC-002**: Under Every day, a month's projection equals its earned
  divided by calendar days elapsed, times its calendar days, for every date
  tested.
- **SC-003**: Every federal holiday rule, including each observed-date
  shift, is right for every year tested.

## Assumptions

- The holiday list is the federal one, the same in every state. State
  holidays and a user's own days off are out of scope.
- Juneteenth is applied in every year; the projection only ever reads the
  current month, which is after 2021.
- The API keeps the field names `businessDaysElapsed` and
  `businessDaysTotal`: the macOS app reads them, and "business days" now
  means the days the rule counts. (decided autonomously)
- The "of N working days" line keeps its words: under every rule, the days
  counted are the days the user says they work. (decided autonomously)
- Only the web gets a control. The macOS app reads Home's figures from the
  server and so follows the setting with no change. (decided autonomously)
- **Removes (Constitution VII)**: the "Holidays are not modeled" rationale
  in `packages/core/src/calendar.ts`, and the two separate weekday loops in
  `businessDaysInLocalMonth` and `businessDayKeysInLocalMonth`, which become
  one. The setting justifies itself: one fixed rule is wrong for anyone who
  doesn't work Monday to Friday, and no existing state covers them.
