# Data Model: Live figures while a timer runs

No table changes.

## `entry_seconds(started_at timestamptz, duration_seconds integer, now timestamptz) → integer`

New SQL function, `immutable`.

- Stopped entry: `duration_seconds`.
- Running entry: seconds from `started_at` to `now`, never below 0.

## Rollups

`unbilled_by_client`, `revenue_by_day`, `revenue_by_client`:

- Read `entry_seconds(...)` where they read `duration_seconds`.
- No longer filter `ended_at is not null`.
- Gain a trailing `p_now timestamptz default now()`; the old signatures are
  dropped so a call without it is not ambiguous. Grants restated.

A running entry counts toward the day, week and month of `started_at`
(FR-011), which is how every rollup already buckets.
