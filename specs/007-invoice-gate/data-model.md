# Data model: Gate the invoice document

## invoices (changed)

| Column | Type | Rule |
| --- | --- | --- |
| `issued_subscription_status` | `text`, null | The user's `subscriptions.status` when the invoice was inserted; null when they had none. No check of its own: it only ever copies the checked `subscriptions.status`. Set by trigger at insert, whatever the insert supplied. An update that changes it raises `check_violation`. |

Existing rows get null: nobody has paid yet, since billing has never been
configured (spec FR-011).

The invoice is still immutable once issued; the column needs no entry in
`guard_issued_invoice`'s mutable list.

## subscriptions (unchanged, #60)

Read by the trigger for the inserting user's row.

## Derived: canDownload

`documentOpens(billing.available, billing.plan, invoice.issued_subscription_status)`
— not stored.
