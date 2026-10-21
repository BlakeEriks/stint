# Data model: First-run setup

## `user_settings` (changed)

| Column | Type | Rule |
| --- | --- | --- |
| `welcomed_at` | `timestamptz`, nullable | Null until the welcome dialog is finished or skipped. Backfilled to `now()` for every row that exists when the migration runs. |

No other column changes. `default_hourly_rate`, `business_name`,
`business_email` and `business_address` already exist; this feature only
reads and patches them.

## State

- **Welcome**: `welcomed_at` null → set, once, by any path out of the dialog.
  Never set back to null by the app.
- **Rate row**: shown while `default_hourly_rate` is null; any save, zero
  included, takes it away. Clearing the rate in Settings brings it back.
- **Business notice**: shown while `business_name` or `business_email` is
  empty or blank.
