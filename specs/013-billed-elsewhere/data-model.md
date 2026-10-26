# Data model: Mark entries as billed outside Stint

No change to the schema.

| Table | Column | Rule |
| --- | --- | --- |
| `time_entries` | `invoiced_elsewhere boolean not null default false` | Set only on a finished entry with `invoice_id is null`; cleared on any of the user's entries. Editable either way. |
