# Data model: Say in the Inbox when a client is ready to invoice

Nothing stored. `attention.unbilledDue` is derived per request, one row per client:

| Field | Type | From |
| --- | --- | --- |
| `clientId`, `clientName` | uuid, string | an active client with a schedule |
| `seconds` | integer | its billable, finished entries in that period, on no invoice, not billed elsewhere, inside no non-void invoice's period |
| `periodStart`, `periodEnd` | `YYYY-MM-DD` | the schedule's most recent ended period |
