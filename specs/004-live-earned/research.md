# Research: Live figures while a timer runs

## R1. Where the running session is measured

- **Decision**: One SQL helper, `entry_seconds(started_at, duration_seconds, now)`,
  returns `duration_seconds` for a stopped entry and
  `greatest(0, extract(epoch from now - started_at))::integer` for a running
  one. The three rollups use it in place of `duration_seconds`, drop
  `ended_at is not null`, and take a trailing `p_now` (default `now()`) that
  the routes pass: the same instant they cut the day, week and month windows
  at, as `/summary` already measures. It also lets `mocks-parity.test.ts`,
  which fakes the JavaScript clock, agree with the SQL.
- **Rationale**: `duration_seconds` is generated as
  `extract(epoch from ended_at - started_at)::integer`, so a running entry
  measured at `now()` and the same entry stopped at that moment produce the
  same seconds, and so the same `round(seconds / 3600.0, 2)` hours and price.
  Stopping changes nothing (FR-006).
- **Alternatives considered**: Pricing the running entry in TypeScript in the
  route: a second implementation of the pricing rule (Principle II).
  Inlining the expression in each rollup: three copies of one definition.

## R2. Which rollups change

- **Decision**: `unbilled_by_client`, `revenue_by_day` and
  `revenue_by_client`: the only ones behind `/stats`, `/clients` and
  `/timer/stop`. `month_revenue` and `revenue_by_project` are unchanged;
  no screen reads them.
- **Rationale**: Today, the week, the month, its client strip and Unbilled
  all come from these three.

## R3. Invoicing stays closed to a running entry

- **Decision**: No change. `apps/web/src/lib/invoicing.ts` selects billable
  entries with its own `ended_at is not null`, independent of the rollups.
  A route test pins it: an invoice generated during a running timer excludes
  it (FR-004).

## R4. Today's figures from one answer

- **Decision**: `/stats` adds `secondsToday` from the same `revenue_by_day`
  row as `earnedToday`. Today's total and the dock's total read it.
  `GET /entries` returns a running entry's `durationSeconds` measured at the
  response, so Today's rows need no client clock.
- **Rationale**: The headline pair (`$x · 22m`) comes from one row of one
  response, so it cannot disagree (FR-010). The rows come from the same
  refresh.
- **Alternatives considered**: Summing the rows on the client for the total:
  the total and Earned would come from different responses.
  Changing `toEntry` for every route: wider than needed; only the list feeds
  Today's rows.

## R5. Web refresh

- **Decision**: `/summary` already refetches every 60s while a timer runs,
  pauses while the tab is hidden (TanStack Query's
  `refetchIntervalInBackground` defaults to false), and refetches on every
  focus. Each summary fetch that lands with a running timer invalidates
  `stats` and `entries`, so all three refresh on one beat.
- **Rationale**: One driver; nothing polls while hidden or idle (FR-007,
  FR-009). The figures move on the same minute the timer reconciles.
- **Alternatives considered**: A `refetchInterval` on each query: three
  independent timers that drift apart within a minute.

## R6. macOS refresh

- **Decision**: The 60s poller keeps refreshing `/summary` always: the menu
  bar title is the timer, and a timer started on the web must reach it. The
  rest of `refresh()` (stats, projects, clients, recent entries) runs only
  while the panel is open, and at once when it opens. `ContentView` reports
  open and close to the model through `onAppear` and `onDisappear`, which
  fire on opposite edges depending on whether the content survives (see the
  comment at `ContentView.swift:29`). The model treats either as a
  transition, not a toggle.
- **Rationale**: Meets FR-008 and drops four of five requests a minute while
  the panel is closed.

## R7. What stays on the client

- **Decision**: The running timer's elapsed readout and the menu bar's
  today total keep their per-second local tick. They are the timer clock,
  outside FR-002.
