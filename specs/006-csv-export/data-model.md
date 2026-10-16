# Data model: Export your records

No table, column or function is added. Both files are read from existing
tables, only the requesting user's rows.

## Entries file

One row per time entry with `ended_at` set, oldest `started_at` first.

| Column | Source |
| --- | --- |
| Date | `started_at`, local date in `tz`, `MM/DD/YYYY` |
| Start | `started_at`, local time in `tz`, `9:05 AM` |
| End | `ended_at`, local time in `tz` |
| Hours | `duration_seconds` in billed hundredths, `1.50` |
| Client | the project's client's name, or empty |
| Project | the project's name, or empty |
| Task | `task_name` |
| Billable | `Yes` or `No` |
| Rate | `resolveRate(entry, project, client, default)`, `0.00` for zero, empty for none |
| Rate source | `entry`, `project`, `client`, `default` or `none` |
| Amount | `billedAmount(seconds, rate)` when billable and rated, else empty |
| Currency | the client's currency, else the user's |
| Invoice | the billing invoice's number, `Invoiced elsewhere`, or empty |

## Invoices file

One row per invoice, every status, newest issue date first, then highest
sequence number.

| Column | Source |
| --- | --- |
| Invoice | `invoice_number` |
| Client | the client's name |
| Status | `Draft`, `Sent`, `Paid` or `Void` |
| Issue date, Due date | `issue_date`, `due_date`, `MM/DD/YYYY` |
| Sent date, Paid date | `sent_at`, `paid_at`, local date in `tz` |
| Period start, Period end | `period_start`, `period_end` |
| Subtotal, Tax rate, Tax, Expenses, Total | the frozen columns, two places |
| Currency | `currency` |
