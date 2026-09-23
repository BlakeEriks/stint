# Contract: `/api/v1/imports/*`

Two Route Handlers, following the existing convention at
`apps/web/src/app/api/v1/entries/route.ts`: `requireSession()` for auth,
`handle()` + `ApiError` for error shape, no Server Action (Principle III).

## `POST /api/v1/imports/preview`

**Request**: `multipart/form-data` — `file` (the Toggl or Harvest CSV
export) and `timeZone` (IANA), the zone the export's wall-clock times are
in. No JSON body; `parseBody` (which assumes JSON) is not
used for this route — the file is read via `request.formData()`.

**Response 200** — `ImportPreview`:

```jsonc
{
  "source": "toggl" | "harvest",
  "newClients": [{ "id": "uuid", "name": "string" }],
  "newProjects": [{ "id": "uuid", "name": "string", "clientId": "uuid | null" }],
  "rows": [
    {
      "sourceRowId": "string",
      "projectName": "string | null",
      "clientName": "string | null",
      "willCreateProject": "boolean",
      "willCreateClient": "boolean",
      "taskName": "string",
      "startedAt": "ISO 8601 instant",
      "endedAt": "ISO 8601 instant | null",
      "resolvedRate": "number | null",
      "rateSource": "project" | "client" | "default" | "none",
      "durationDisagreement": "boolean",
      "overlapsWith": "string[]  // sourceRowId or existing-entry id",
      "willWrite": "boolean",
      "excludedReason": "no_end_time | not_after_start | null"
    }
  ],
  "summary": {
    "totalRows": "number",
    "willWriteCount": "number",
    "unratedCount": "number",
    "overlappingCount": "number",
    "excludedCount": "number"
  }
}
```

**Errors**:
- `IMPORT_FILE_UNRECOGNIZED` (422) — the file is not a recognizable Toggl or
  Harvest export (FR-016). New `Code` added to `apps/web/src/lib/errors.ts`'s
  `Code` union and `@stint/schema`'s `ErrorCode` (the drift guard at
  `errors.ts:109-120` forces both to change together).
- `VALIDATION_FAILED` (422) — no file present, or more than one file.
- `UNAUTHORIZED` (401) — no session, via `requireSession()` as usual.

**Writes nothing.** This route only parses and computes; no
`time_entries`/`projects`/`clients` insert happens here (FR-001).

## `POST /api/v1/imports/confirm`

**Request**: `multipart/form-data`, same `file` field, the identical bytes
previously sent to `preview`. The confirm route does not accept a
client-echoed preview payload as its source of truth — it re-parses the
file and re-derives `ImportRow[]` itself (research.md, "Preview-to-confirm
data flow"), so what gets written is always what *this* request's own parse
produces, never what the client claims the preview said.

**Response 200** — `ImportResult`:

```jsonc
{
  "source": "toggl" | "harvest",
  "written": "number",
  "alreadyImported": "number",  // deterministic-id conflicts (FR-010/FR-011)
  "unrated": "number",
  "overlapping": "number",
  "excluded": "number"
}
```

**Errors**: same as `preview`. A partial failure mid-write (e.g. one row's
insert fails for a reason other than a duplicate key) surfaces as an error
after writing everything that succeeded — a retried `confirm` with the same
file is safe (FR-011) because every already-written row's id is
deterministic and hits the existing `23505` → treat-as-already-there path,
not a fresh conflict.

## New error code

`apps/web/src/lib/errors.ts`:

```diff
 export type Code =
   | 'TIMER_ALREADY_RUNNING'
   | 'NO_TIMER_RUNNING'
   | 'ENTRY_LOCKED'
   | 'ENTRY_NOT_FOUND'
   | 'NO_RATE_CONFIGURED'
   | 'INVALID_PERIOD'
   | 'UNAUTHORIZED'
+  | 'IMPORT_FILE_UNRECOGNIZED'
   | 'VALIDATION_FAILED';

 const STATUS: Record<Code, number> = {
   ...
+  IMPORT_FILE_UNRECOGNIZED: 422,
 };
```

The matching `ErrorCode` entry in `@stint/schema` must change in the same
commit — the drift guard at `errors.ts:109-120` fails the build otherwise
(Constitution II, "asserted every build, not assumed").
