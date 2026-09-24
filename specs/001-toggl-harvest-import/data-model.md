# Phase 1 Data Model: Import from Toggl and Harvest

No new table and no new column. Every entity below is either an existing
table row (`time_entries`, `projects`, `clients`) or an in-memory shape that
exists only for the duration of one preview/confirm request pair — nothing
new is persisted beyond ordinary `time_entries` rows.

## ParsedRow (in-memory, `packages/core`)

One row from a source export, before matching against the contractor's
account.

| Field | Type | Notes |
| --- | --- | --- |
| `source` | `'toggl' \| 'harvest'` | |
| `sourceRowId` | `string` | The row's own content plus its position among identical twins — Toggl's CSV has no entry id. See research.md. |
| `projectName` | `string \| null` | As reported by the export, unmatched. |
| `clientName` | `string \| null` | As reported by the export, unmatched. |
| `taskName` | `string` | |
| `startedAtLocal` | `string` | Wall-clock local time as reported. |
| `endedAtLocal` | `string \| null` | `null` means the export reported this entry as still running — see Running Entries below. |
| `reportedDurationSeconds` | `number \| null` | The export's own separately-reported duration, compared against `endedAtLocal - startedAtLocal` per FR-015. |
| `reportedAmount` | `number \| null` | Present on some rows, absent on others (User Story 2) — read only for display in the preview, never for rate computation. |

## ImportRow (in-memory — one row of the preview/write set)

`ParsedRow` after matching and rate resolution, the unit both the preview
response and the write operation share.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` (UUIDv7) | `deterministicUuidv7(userId|source|sourceRowId, startedAt)` — see research.md. This *is* the idempotency mechanism; no separate dedup check exists. |
| `projectId` | `uuid \| null` | Resolved by name match against the contractor's existing `projects` (scoped `user_id`, case-insensitive), or flagged `willCreateProject: true` if none matches (per spec Assumption — creating a project from an unmatched name is in scope). |
| `clientId` | `uuid \| null` | Same matching against `clients`, reached the same way the UI reaches it — independently of `projectId`, since `projects.client_id` is nullable. |
| `startedAt` | `timestamptz` | Absolute instant from the wall-clock start and the zone the contractor names on upload (defaulting to the browser's) — the export carries none. Resolved by `localDateTimeToInstant()`. |
| `endedAt` | `timestamptz \| null` | `null` only for a row excluded from the write per the Running Entries decision below — never written as `null` to `time_entries`. |
| `resolvedRate` | `number \| null` | Output of `resolveRate()` from `packages/core/src/rates.ts`, called with this row's `projectId`/`clientId` context — never derived from `reportedAmount`. |
| `rateSource` | `'project' \| 'client' \| 'default' \| 'none'` | Output of `resolveRateSource()`, shown in the preview so the contractor sees *why* a rate did or didn't resolve. |
| `durationDisagreement` | `boolean` | `true` when `reportedDurationSeconds` disagrees with `endedAt - startedAt` beyond a rounding tolerance (FR-015). |
| `willWrite` | `boolean` | `false` for a row excluded from the write set (no end time, or file-level rejection never reaches this shape at all). |
| `overlapsWith` | `uuid[]` | Ids of other rows (existing `time_entries` rows or other rows in this same batch) whose time range this row overlaps. Computed by `findOverlaps()`, not stored. |

## `time_entries` row written by a confirmed import

No schema change. An imported row is an ordinary `time_entries` row —
`id`, `user_id`, `project_id`, `task_name`, `started_at`, `ended_at`,
`is_billable`, `rate_override`, `created_at`, `updated_at` — written through
the same insert path `POST /api/v1/entries` already uses, so it inherits:

- **Principle I** (`one_running_timer_per_user`) — satisfied by construction
  since a row with no `ended_at` is never in the write set (Running Entries
  decision, research.md).
- **RLS** — `user_id` set server-side from `requireSession()`, never from
  request body; existing `time_entries` RLS policy applies unchanged, no new
  policy needed (Principle VII already covers this table).
- **`duration_ok`** — left to the existing trigger/default, exactly as a
  manually created entry would be; import does not special-case the
  "strange duration" (short/long) flag, per spec's edge case ("the same
  threshold-based flag applies to an imported entry as to any other").
- **`rate_override`** — always `null`. The rate resolves live through the
  chain like any other entry's, so a later project or client rate change
  reaches imported entries too. Writing `resolvedRate` here would freeze it
  as an entry-level override the contractor never set. `resolvedRate` is
  preview display only; an entry whose chain yields nothing is the existing
  unrated state (FR-006), not a new one.

## Validation rules

- A `ParsedRow` with an unrecognized file format (the file itself, not one
  row) never produces any `ImportRow` — the whole request fails before
  parsing individual rows (FR-016).
- `reportedAmount` is read-only display data on `ImportRow`; no code path
  may assign it to `resolvedRate` or `rate_override` (FR-005, SC-003).
- `endedAt` is never synthesized — a row with no reported end time has
  `willWrite: false` and is excluded, never given a fabricated end time
  (Principle V, research.md).
- `overlapsWith` is computed, never causes exclusion — an overlapping row
  still has `willWrite: true` (FR-008); the flag and the write are
  independent facts about the same row.

## State / flow

```
Upload file
  → POST /api/v1/imports/preview
      parse (source-specific) → ParsedRow[]
      match projects/clients, resolve rates, detect overlaps, check DST/duration
      → ImportRow[] (ImportPreview)
      nothing written
  → contractor reviews ImportPreview
  → POST /api/v1/imports/confirm (re-sends the same file)
      re-parse + re-build ImportRow[] server-side (never trusts a client-echoed preview)
      insert every ImportRow where willWrite === true, on conflict (id) do nothing
      a row already there is counted as alreadyImported, not an error
      → confirmation summary (counts: written, unrated, overlapping, excluded-no-end-time)
```

A retried `confirm` call with the same file after a partial failure re-runs
this whole flow; every row whose deterministic id already exists is
skipped by the insert itself, satisfying FR-010/FR-011 without a separate
"was this batch already imported" check. New projects and clients get
deterministic ids the same way, so a retry never creates a second one.
