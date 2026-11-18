# Data model: A draft lists the entries it bills

No table changes.

**InvoiceEntry** (response only): a `TimeEntry` plus

| Field | Type | Meaning |
| --- | --- | --- |
| `projectName` | string or null | Its project's name |
| `amount` | number or null, draft only | What a line billing it alone charges; null when non-billable or unrated. Absent on an issued invoice |

A draft holds the entries whose `draft_id` is its id and which it prices;
an issued invoice, those whose `invoice_id` is.
