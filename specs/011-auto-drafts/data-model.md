# Data model: automatic drafts

| Table | Column | Change |
| --- | --- | --- |
| `invoices` | `invoice_number`, `sequence_no`, `issue_date` | nullable; check `status = 'draft' or (invoice_number, sequence_no, issue_date all not null)` |
| `invoices` | `auto boolean not null default false` | made by the job |
| `invoices` | `ready_emailed_at timestamptz` | the ready email's claim |
| `user_settings` | `time_zone text` | IANA zone, null is UTC |
| `user_settings` | `auto_drafts boolean not null default true`, `ready_email boolean not null default true` | the switches |

Index: unique `(user_id, client_id, period_start, period_end) where auto and status = 'draft'`.

`number_invoice(p_invoice_id uuid, p_issue_date date, p_due_date date, p_terms text)`: security invoker; on a draft with no number, allocates one, sets the four, appends the payment reference; returns the row either way. `create_invoice` stops allocating.
