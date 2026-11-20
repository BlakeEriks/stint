# Data model: projection days

## `user_settings.projection_days`

| Column | Type | Default | Check |
| --- | --- | --- | --- |
| `projection_days` | `text not null` | `'weekdays'` | in `every_day`, `weekdays`, `weekdays_except_holidays` |

Existing rows take the default, so nobody's numbers change. RLS on
`user_settings` already scopes it to its owner; no new policy.

## Counted days (computed, not stored)

| Rule | A day counts when |
| --- | --- |
| `every_day` | always |
| `weekdays` | Monday to Friday |
| `weekdays_except_holidays` | Monday to Friday, and not an observed federal holiday |
