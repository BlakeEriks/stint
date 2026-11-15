# Data model: New invoice offers to include unbilled work dated just before its period

Nothing stored. `earlierWork` is derived per preview, null when there is none:

| Field | Type | From |
| --- | --- | --- |
| `entryCount` | integer | the client's billable, finished entries on no invoice, not billed elsewhere, dated in the look-back |
| `from`, `to` | `YYYY-MM-DD` | the first and last of their dates, in the billing zone |

The entries counted are held by no draft, or by the one being edited. The look-back runs from the day after the latest `periodEnd` of the client's non-void invoices that start before `periodStart`, the edited draft left out, to the day before `periodStart`. No such invoice, or one reaching `periodStart`, leaves no look-back.
