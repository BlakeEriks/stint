# Data model: Every screen paints once

No table or migration changes. Two shapes change, and one is new.

## `WeekDay` (`packages/schema/src/index.ts`, in `Stats.week`)

| Field | Type | Change |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | unchanged |
| `seconds` | number | unchanged |
| `amount` | money or null | unchanged |
| `byClient` | `Record<string, number>` | **new**: billable seconds per client id that day; work with no client is keyed `''`; a day with no billable work is `{}` |

`byClient` is computed by `dayByClient` in `packages/core`.

## Persisted query cache (web, `localStorage`)

One entry, written by TanStack's sync-storage persister.

| Property | Value |
| --- | --- |
| Holds | every successful query's data, keyed as in `query-keys.ts` |
| `buster` | `NEXT_PUBLIC_APP_VERSION`; a mismatch discards it |
| `maxAge` | 7 days |
| Removed | on Sign out, Delete account, the 401 redirect, and `/signin` mount |

## `Snapshot` (macOS, `Caches/Stint/snapshot.json`)

| Field | Type |
| --- | --- |
| `version` | `String`, the app version; a mismatch discards the file |
| `projects` | `[Project]` |
| `clients` | `[Client]` |
| `stats` | `Stats?` |
| `taskNames` | `[TaskName]` |

The summary (the timer) is never cached. Written after each full fetch,
loaded on launch when signed in, deleted on sign-out.
