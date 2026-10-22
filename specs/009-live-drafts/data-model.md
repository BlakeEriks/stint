# Data model: Drafts collect their period's work until sent

## invoices (changed)

| Column | Type | Rule |
| --- | --- | --- |
| `tz` | `text`, null | The time zone the period's local dates are read in. Set at generation; null on drafts made before this change until a read supplies one. |
| `excluded_expense_ids` | `uuid[]`, not null, default `{}` | Expenses the user left off on New invoice. A refresh never bills them. |
| `downloaded_snapshot` | `jsonb`, null | What the PDF showed when last rendered as a draft: `{ total, hours, lines: [{ description, quantity, amount }] }`. |

`guard_issued_invoice` already refuses changes to any column but status and
dates once an invoice leaves `draft`, so all three freeze with it.

## refresh_draft(p_invoice_id, p_totals, p_lines, p_entry_ids, p_expense_ids, p_sent_at)

`security invoker`, so RLS holds. Raises unless the invoice is the caller's
and `draft`. In one transaction: releases its entries and one-off expenses,
deletes its lines, inserts `p_lines`, attaches `p_entry_ids` and
`p_expense_ids` (raising `ENTRY_ALREADY_INVOICED` / `EXPENSE_ALREADY_INVOICED`
when another invoice holds one), updates the totals and `supporting_detail`,
and when `p_sent_at` is set, `status = 'sent'` and `sent_at`.

## Derived

- **changedSinceDownload**: `snapshotChanged(downloaded_snapshot, current)`.
- **lateEntries**: unbilled billable entries dated inside a sent or paid invoice's period for its client.
