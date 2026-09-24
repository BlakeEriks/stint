# Quickstart: Import from Toggl and Harvest

Validates the feature end-to-end once implemented, against local dev
(`docs/local-dev.md` — never against production).

## Prerequisites

- `pnpm dev` running, signed in as the seeded local account (per
  [Sign in to local Stint before calling a UI change done] convention).
- A sample Toggl CSV export and a sample Harvest CSV export. Use Toggl's and
  Harvest's own documented export format — a hand-edited spreadsheet is
  exactly the malformed-file edge case (FR-016), not a valid fixture.
- At least one existing `time_entries` row in the seeded account whose time
  range will deliberately overlap one row in the sample export, to exercise
  User Story 3.

## Scenario 1 — first import, nothing written yet (User Story 1)

1. Upload the Toggl sample to `POST /api/v1/imports/preview`.
2. Confirm the response lists every row from the file, with dates,
   durations, and project names matching the source export exactly.
3. Confirm nothing was written — query `time_entries` for the account and
   see no new rows.
4. `POST /api/v1/imports/confirm` with the same file.
5. Confirm every row with `willWrite: true` from step 2 now exists as a
   `time_entries` row with matching date, duration, and project.
6. Re-run step 4 with the identical file. Confirm the response's
   `alreadyImported` count equals the row count, `written` is 0, and no
   duplicate rows exist in `time_entries`.

## Scenario 2 — rate resolution never guesses (User Story 2)

1. Set an hourly rate on one project in the seeded account; leave another
   project (referenced by the sample export) with no rate anywhere in its
   chain.
2. Preview the export. Confirm the rated project's rows show
   `resolvedRate` matching the configured rate and `rateSource: "project"`
   — not a value derived from the export's own reported amount column.
3. Confirm the unrated project's rows show `resolvedRate: null`,
   `rateSource: "none"`.
4. Confirm the import, then confirm the unrated entries are excluded from
   invoice generation exactly as a manually created unrated entry would be.

## Scenario 3 — overlaps are written and flagged, never fixed silently (User Story 3)

1. Preview the export containing the deliberately overlapping row from
   Prerequisites. Confirm that row's `overlapsWith` is non-empty.
2. Confirm the import. Confirm both the imported row and the pre-existing
   row it overlaps still exist, unmodified — check their `started_at` /
   `ended_at` are exactly what they were before the import ran.
3. Query the inbox-feeding endpoint (`GET /stats` or equivalent) and
   confirm the overlap appears as a flagged item.
4. Edit one of the two overlapping entries so the times no longer conflict.
   Confirm the flag is gone on the next `GET /stats` call, with no separate
   "resolve overlap" action taken.

## Scenario 4 — Harvest, same guarantees (User Story 4)

1. Repeat Scenario 1's steps 1–6 against the Harvest sample instead of
   Toggl. Confirm identical behavior (preview-then-confirm, no duplication
   on retry) — the pipeline is source-agnostic past parsing.

## Scenario 5 — malformed file (edge case)

1. `POST /api/v1/imports/preview` with a file that is not a Toggl or
   Harvest export (e.g. an unrelated CSV, or a `.txt` file).
2. Confirm the response is `IMPORT_FILE_UNRECOGNIZED` (422), and that
   nothing was written.

## Done when

- All five scenarios pass against local dev with real sample exports.
- `pnpm verify:static` and `pnpm verify:db` are green (Governance, main
  branch bar) before this reaches `main`.
