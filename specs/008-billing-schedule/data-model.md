# Data model: Bill each client on its own schedule

## clients (changed)

| Column | Type | Rule |
| --- | --- | --- |
| `billing_period` | `text`, null | `weekly`, `biweekly`, `semimonthly` or `monthly`; null is no schedule. |
| `period_anchor` | `date`, null | A date one period starts on. Constraint `billing_period_anchor`: set when `billing_period` is `weekly` or `biweekly`, null otherwise. |

Existing rows get null in both: no schedule, today's behavior. No policy
changes; the existing owner policies cover both columns.

## Derived: billing period

`{ periodStart, periodEnd }` from `periodContaining(date, schedule)` — never
stored.
