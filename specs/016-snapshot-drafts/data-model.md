# Data model

## `time_entries.draft_id`, `expenses.draft_id`

`uuid null`, `(draft_id, user_id)` references `invoices (id, user_id)` on
delete set null `(draft_id)`. Indexed. Set only on unbilled work
(`invoice_id is null`); `send_draft` clears it as it bills.

A recurring expense is never held: it bills on every invoice.

## Functions

| Function | Change |
| --- | --- |
| `create_invoice(p_user_id, p_invoice)` | No overlap check. Holds `p_invoice.entry_ids` and `expense_ids` that are unbilled and unheld. |
| `update_draft(p_invoice_id, p_invoice)` | No overlap check. Releases held work not in `entry_ids` / `expense_ids`, then holds them. |
| `hold_draft_work(p_invoice_id, p_entry_ids, p_expense_ids)` | New. Holds unbilled, unheld work for a draft. Returns how many it held. |
| `send_draft(...)` | Also clears `draft_id` on everything the draft held. |
| `release_moved_entry()`, `release_moved_project()` triggers | New. Clear `draft_id` when an entry's project, or a whole project, moves it to another client. An expense's client can't be changed through the API, so it has no trigger. |

## Backfill

Each open draft holds what it would bill now: its client's ended, unbilled,
not-elsewhere entries started in its period (read in its zone, else UTC),
and each unbilled one-off expense dated on or before its end and not left
off, given to the open draft with the earliest end, as `assignExpenses`
gave it.
