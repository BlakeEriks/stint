# Data model: A phone timer

No table or migration. The app reads what `/api/v1` already returns and
keeps one thing on the phone.

## Session (on the phone)

| Field | Meaning |
| --- | --- |
| `accessToken` | GoTrue access token, sent as `Authorization: Bearer` |
| `refreshToken` | rotating; spent once per refresh |
| `expiresAt` | epoch seconds; refreshed 60s before |
| `email` | shown in Settings |

Kept under one key per backend host, so local, preview and production
sessions never mix. Removed on Sign out and when GoTrue rejects the refresh
token; kept on any other failure.

## Reads (server-owned, cached by React Query)

| Key (`@stint/client` `keys`) | Route | The screen uses |
| --- | --- | --- |
| `summary` | `GET /summary?tz` | running entry, `todaySeconds`, `serverTime` |
| `stats(tz)` | `GET /stats?tz` | `earnedToday`, `currency` |
| `projects({archived:false})` | `GET /projects` | the picker |
| `clients({archived:true})` | `GET /clients?includeArchived=true` | each project's client name and color |
| `taskNames({})` | `GET /entries/task-names?limit=6` | Recent: five, the running one left out |

## Writes

| Press | Route | Prediction |
| --- | --- | --- |
| Start, or a Recent row | `POST /timer/start?include=summary,stats&tz` | `summary.running` is the new entry at once |
| Stop | `POST /timer/stop?include=summary,stats&tz` | `summary.running` is null at once |
