---
description: "Task list for Import from Toggl and Harvest"
---

# Tasks: Import from Toggl and Harvest

**Input**: Design documents from `/specs/001-toggl-harvest-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/imports-api.md, quickstart.md

**Tests**: The spec does not request TDD. Unit tests are included only for the
pure `packages/core` functions whose correctness *is* a success criterion —
deterministic ids (SC-004), rates never guessed (SC-003), overlaps never
missed (SC-005), DST (FR-012). They run under `pnpm core:test`
(Node's built-in runner, `packages/core/test/*.test.ts`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3, mapping to spec.md's user stories

---

## As built (MVP)

- Core lives in fewer files than listed: `packages/core/src/import/{csv,toggl,preview,index}.ts`. Matching, detection and the preview builder are in `preview.ts`/`index.ts`; T007 reuses `localDateTimeToInstant()` from `calendar.ts` instead of a new `time.ts`.
- Toggl's CSV has no entry id and no zone. `sourceRowId` is the row's content plus its position among identical twins, and the zone is chosen on the import page (default: the browser's).
- New projects and clients get deterministic ids too, so T017's retry safety comes from `on conflict (id) do nothing` rather than re-matching.
- Tests: `packages/core/test/import.test.ts` (T008, T014, T021's cases) and three route tests in `apps/web/test/routes.test.ts`.
- T003/T034: the endpoints were documented as implemented from the start.
- Overlaps (US3): `findOverlaps()` lives in `packages/core/src/overlaps.ts`, not under `import/`, because `/stats` uses it too. Only overlaps of 60s or more count (`MIN_OVERLAP_SECONDS`) — real exports hold seconds-long ones from stop/start clicks. The inbox row is per pair, opens the later entry, and has no "It's correct". Tests: `packages/core/test/overlaps.test.ts`, the import tests, `inbox.test.tsx`, and a `/stats` route test.
- A scrubbed fixture in the real export's shape: `packages/core/test/fixtures/toggl-detailed.tsv`.

- Added after the first real export: tab-separated files, an "import them as billable" choice when every row says not billable (Toggl's free plan), and "Already invoiced through", backed by `time_entries.invoiced_elsewhere` (migration 21) — earned, never unbilled.

- T035: the roadmap deletes a finished item rather than ticking it, so the Toggl entry is gone; Harvest stays as its own item.
- T036: scenarios 1, 2, 3 and 5 exercised in the browser on the seeded account; scenario 4 was Harvest, deferred.

## Phase 1: Setup

- [X] T001 Create `packages/core/src/import/` and an `index.ts` barrel; re-export it from `packages/core/src/index.ts`
- [X] T002 [P] Add `IMPORT_FILE_UNRECOGNIZED` to `ErrorCode` in `packages/schema/src/index.ts` and to the `Code` union plus `STATUS` (422) in `apps/web/src/lib/errors.ts` in the same change — the drift guard at `errors.ts:109-120` fails the build otherwise
- [X] T003 [P] Mark `POST /api/v1/imports/preview` and `POST /api/v1/imports/confirm` `(not implemented)` in `docs/api.md`, linking the shapes in `specs/001-toggl-harvest-import/contracts/imports-api.md`

---

## Phase 2: Foundational (blocks every story)

- [X] T004 [P] Define `ParsedRow`, `ImportRow`, `ImportPreview`, `ImportResult` types in `packages/core/src/import/types.ts` exactly per data-model.md — `source: 'toggl' | 'harvest'`; `endedAtLocal: string | null`; `reportedAmount: number | null` (display only); `rateSource: 'project' | 'client' | 'default' | 'none'`; `excludedReason: 'no_end_time' | null`
- [X] T005 [P] Implement an RFC 4180 CSV parser (quoted fields, escaped `""`, CRLF/LF, BOM stripped) with no dependency in `packages/core/src/import/csv.ts`
- [X] T006 [P] Implement `deterministicUuidv7(userId, source, sourceRowId): string` in `packages/core/src/uuid.ts` — SHA-256 of `userId|source|sourceRowId`, version nibble `0x7`, variant `0b10`, remaining bits from the hash. Keep the existing random `uuidv7()` unchanged. Must be synchronous or clearly async and usable in both routes identically
- [X] T007 [P] Implement `localToInstant(local: string, timeZone: string): string` in `packages/core/src/import/time.ts` using `Intl` only — a skipped DST time resolves forward to the first valid instant, a repeated time resolves to the earlier offset; both are deterministic (FR-012)
- [X] T008 [P] Unit tests in `packages/core/test/import-foundation.test.ts`: `deterministicUuidv7` is stable across calls, differs per user/source/row, and is a valid v7 UUID; CSV parser handles quoted commas/newlines; `localToInstant` on the US spring-forward gap and fall-back overlap for `America/New_York`
- [X] T009 Implement `matchProjects(rows, projects, clients)` in `packages/core/src/import/match-project.ts` — case-insensitive, trimmed name match scoped to non-archived rows; returns `projectId`/`clientId` or `willCreateProject`/`willCreateClient` (depends on T004)
- [X] T010 Implement `buildPreview(parsed, context): ImportPreview` in `packages/core/src/import/build-preview.ts` — the single function both routes call (FR-004). Context carries `userId`, account timezone, projects, clients, user default rate, existing entry ranges. Per row: deterministic id, instants, `resolveRate()`/`resolveRateSource()` from `packages/core/src/rates.ts` with `entryRateOverride: null` and **never** `reportedAmount`, `willWrite: false` + `excludedReason: 'no_end_time'` when `endedAtLocal` is null (never synthesize an end), and summary counts (depends on T004–T007, T009)
- [X] T011 Implement `detectSource(csvHeader): 'toggl' | 'harvest' | null` in `packages/core/src/import/detect.ts`; `null` means the file is unrecognized (FR-016)
- [X] T012 Implement a shared route helper `readImport(req, db, userId)` in `apps/web/src/lib/import.ts` — reads exactly one `file` from `request.formData()` (else `VALIDATION_FAILED`), detects source (else `IMPORT_FILE_UNRECOGNIZED`), parses, loads projects/clients/user_settings/existing entries in the file's date span through the RLS-scoped `db`, and returns `buildPreview(...)`. No `parseBody` — it assumes JSON (depends on T010, T011)

**Checkpoint**: every story now needs only a source parser and routes.

---

## Phase 3: User Story 1 — Toggl history on day one (P1) 🎯 MVP

**Goal**: Upload a Toggl CSV, preview it, confirm, entries land; re-running writes nothing new.

**Independent test**: quickstart.md Scenario 1.

- [X] T013 [US1] Implement `parseToggl(csvRows): ParsedRow[]` in `packages/core/src/import/parse-toggl.ts` against Toggl Track's documented detailed-report CSV columns (record the exact column names consumed in a comment at the mapping). Tags are ignored (FR-013). `sourceRowId` comes from the export's per-entry id; content-hash fallback only if absent (research.md)
- [X] T014 [P] [US1] Unit tests in `packages/core/test/import-toggl.test.ts` with a small fixture CSV at `packages/core/test/fixtures/toggl.csv`: rows map to correct instants, a row with no end is excluded not written, identical input produces identical ids
- [X] T015 [US1] Implement `POST /api/v1/imports/preview` in `apps/web/src/app/api/v1/imports/preview/route.ts` — `handle()` + `requireSession()` + `readImport()`, returns `ImportPreview`, writes nothing
- [X] T016 [US1] Implement `POST /api/v1/imports/confirm` in `apps/web/src/app/api/v1/imports/confirm/route.ts` — re-derives the preview via `readImport()` from the uploaded bytes (never trusts a client-echoed preview), creates missing projects/clients first, inserts rows where `willWrite` with `user_id` from the session and `rate_override: null`, counts a `23505` on a row id as `alreadyImported` (the `apps/web/src/app/api/v1/entries/route.ts:73-84` pattern), returns `ImportResult`
- [X] T017 [US1] Make project/client creation in T016 idempotent across retries — a retried confirm must match the project it created the first time rather than creating a second one with the same name (match again after create, within the same request)
- [X] T018 [P] [US1] Add the import screen doc `docs/design/screens/import.html` (upload → preview table → confirm), assembled from shapes in `docs/design/screens/components.html`; the primary confirm is the one accent use
- [X] T019 [US1] Build the import page in `apps/web/src/app/(app)/import/page.tsx` per T018 — upload, preview table with summary counts, confirm button, result summary; entry point from Settings
- [X] T020 [US1] Unrecognized-file state on the page: show the `IMPORT_FILE_UNRECOGNIZED` message before any confirm is offered (FR-016)

**Checkpoint**: Toggl import is usable end-to-end.

---

## Phase 4: User Story 2 — Rates never guessed (P2)

**Goal**: Every imported entry resolves through the normal chain or lands unrated.

**Independent test**: quickstart.md Scenario 2.

- [X] T021 [P] [US2] Unit test in `packages/core/test/import-rates.test.ts`: a row with a `reportedAmount` and no resolvable chain yields `resolvedRate: null`, `rateSource: 'none'`; a row under a rated project yields that project's rate regardless of `reportedAmount`; a `0` project rate resolves to `0`, not a fall-through (SC-003)
- [X] T022 [US2] Show `rateSource` and an "unrated" marker per preview row, and the unrated count in the summary, in `apps/web/src/app/(app)/import/page.tsx`; `reportedAmount` may be shown only labelled as the source tool's figure

---

## Phase 5: User Story 3 — Overlaps written and flagged (P2)

**Goal**: Overlaps within the batch and against history are detected, written, flagged, and clear when edited.

**Independent test**: quickstart.md Scenario 3.

- [X] T023 [US3] Implement `findOverlaps(ranges: {id, start, end}[]): Map<id, id[]>` in `packages/core/src/import/find-overlaps.ts` — sort-and-sweep, half-open intervals (an entry ending exactly when another starts is not an overlap); used for the batch plus existing entries
- [X] T024 [P] [US3] Unit tests in `packages/core/test/import-overlaps.test.ts`: within-batch overlap, batch-vs-existing overlap, touching endpoints not flagged, nested ranges flagged
- [X] T025 [US3] Wire `findOverlaps()` into `buildPreview()` in `packages/core/src/import/build-preview.ts` to fill `overlapsWith`; an overlap never sets `willWrite: false` (FR-008)
- [X] T026 [US3] Add an `overlaps` array to the inbox part of `Stats` in `packages/schema/src/index.ts` (`entryId`, `otherEntryId`, `taskName`, `startedAt`), derived per request like `strangeDurations` — no stored flag, so editing either entry clears it (FR-009)
- [X] T027 [US3] Compute `overlaps` in `apps/web/src/app/api/v1/stats/route.ts` by calling `findOverlaps()` over the user's stopped, uninvoiced entries, matching how strange-duration candidates are loaded there
- [X] T028 [US3] Render the overlap row in `apps/web/src/components/inbox.tsx` with an "Edit entry" action, and add its row spec to the table in `docs/design/screens/inbox.html`
- [X] T029 [US3] Show `overlapsWith` per preview row and the overlapping count in `apps/web/src/app/(app)/import/page.tsx`

---

## Phase 6: User Story 4 — Harvest

Deferred to its own roadmap item, gated on a user asking for it.

---

## Phase 7: Polish & Cross-Cutting

- [X] T033 [P] Duration disagreement (FR-015): set `durationDisagreement` in `buildPreview()` when `reportedDurationSeconds` differs from `end − start` by more than 1 second, and surface it per row on the import page
- [X] T034 [P] Remove `(not implemented)` from both endpoints in `docs/api.md`
- [X] T035 [P] Tick the Toggl/Harvest item in `docs/roadmap.md`
- [X] T036 Run quickstart.md Scenarios 1–5 against local dev, signed in to the seeded account
- [X] T037 `pnpm verify:static` and `pnpm verify:db` green before merge (constitution, main branch bar)

---

## Dependencies

- Phase 1 → Phase 2 → stories.
- **US1** depends only on Phase 2.
- **US2** depends on US1's routes and page (T015–T019); its logic already lives in T010.
- **US3** T023–T024 can start after Phase 2; T025 edits `build-preview.ts` after T010; T029 after T019.
- Polish after the stories it touches.

## Parallel Examples

- Phase 2: T004, T005, T006, T007 together (separate files); T008 once they land.
- US1: T014 and T018 alongside T015/T016.
- US3: T023/T024 in parallel with US1's UI work; T026–T028 are one sequence.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + US1.** That is a working Toggl import with
rates already resolved correctly (T010) and no-end rows excluded. Then US3
(the trust rule that matters most after rates), US2's display, polish.
Each story ships behind nothing — the import page is new, so an incomplete
later story does not break an earlier one.
