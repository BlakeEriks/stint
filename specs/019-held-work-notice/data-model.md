# Data model: New invoice says when a draft holds this period's work

Nothing stored. `heldWork` is derived per preview, null when there is none:

| Field | Type | From |
| --- | --- | --- |
| `entryCount` | integer | the client's billable, finished entries in the period, on no invoice, not billed elsewhere, held by a draft other than `draftId` |
| `drafts[].id` | uuid | the holding draft |
| `drafts[].invoiceNumber` | string | its number |
| `drafts[].entryCount` | integer | how many of those entries it holds |

`drafts` is ordered by number.
