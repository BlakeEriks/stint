# Data model: Say in the Inbox when billable work is past due to bill

Nothing stored. `attention.unbilledDue` is derived per request, one row per client:

| Field | Type | From |
| --- | --- | --- |
| `clientId`, `clientName` | uuid, string | an active client |
| `entryIds` | uuid[] | its billable, finished entries on no invoice, not billed elsewhere, past due, inside no non-void invoice's period |
| `seconds` | integer | their time |
| `since` | `YYYY-MM-DD` | the first one's day in `tz` |
| `periodStart`, `periodEnd` | `YYYY-MM-DD` | the oldest run of that work no invoice interrupts: adjacent whole periods for a scheduled client, days with no invoice between them for any other |
| `onePeriod` | boolean | that span is exactly one of the client's periods |
