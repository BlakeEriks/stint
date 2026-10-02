# Data Model: Live figures while a timer runs

No table changes.

## `entry_seconds(started_at timestamptz, duration_seconds integer) → integer`

New SQL function, `stable` because it reads `now()`.

- Stopped entry: `duration_seconds`.
- Running entry: seconds from `started_at` to `now()`, never below 0.

## Rollups

`unbilled_by_client`, `revenue_by_day`, `revenue_by_client`:

- Read `entry_seconds(...)` where they read `duration_seconds`.
- No longer filter `ended_at is not null`.
- Same signatures and grants.

A running entry counts toward the day, week and month of `started_at`
(FR-011), which is how every rollup already buckets.
