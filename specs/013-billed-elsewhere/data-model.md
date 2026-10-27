# Data model: Mark entries as billed outside Stint

One check constraint, `entry_billed_once`: `invoice_id is null or not invoiced_elsewhere`.

| Table | Column | Rule |
| --- | --- | --- |
| `time_entries` | `invoiced_elsewhere boolean not null default false` | Set only on a finished entry with `invoice_id is null`; cleared on any of the user's entries. Editable either way. |
