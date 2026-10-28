# Data model: Say in the Inbox when a scheduled period has ended with no invoice

Nothing stored. `attention.periodsDue` is derived per request:

| Field | Type | From |
| --- | --- | --- |
| `clientId` | uuid | an active client with `billing_period` set |
| `clientName` | string | `clients.name` |
| `periodStart`, `periodEnd` | `YYYY-MM-DD` | `lastEndedPeriod(today in tz, schedule)` |
| `seconds` | integer ≥ 0 | billable, finished, uninvoiced, not-elsewhere time dated in the period |

A row exists when `seconds > 0` or a one-off unbilled expense is spent in
the period, and no draft, sent or paid invoice for the client shares a day
with the period. Ordered by `periodEnd`, then client name.
