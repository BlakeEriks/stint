# Implementation Plan: Import from Toggl and Harvest

**Branch**: `001-toggl-harvest-import` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-toggl-harvest-import/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A contractor uploads a Toggl or Harvest CSV export, sees a preview of exactly
what will be written, and confirms. Parsing is one set of pure functions in
`packages/core` shared by the preview response and the write, so nothing can
diverge between what was shown and what landed. Each source row derives a
**deterministic UUIDv7** from `(user_id, source, source_id)` — not
`uuidv7()`'s random form — so re-uploading the same file after a partial
failure or a duplicate attempt is a no-op rather than a duplicate. Rate
resolution calls the existing `resolveRate()` chain per entry; nothing is
back-computed from the export's reported amount. Overlap detection
(`findOverlaps()`, new to this feature) runs against both the batch being
imported and the contractor's existing history, and every overlap found is
written and flagged, never silently adjusted. A "strange duration" entry
gets `duration_ok = false` exactly as a manually created one would — no
special-cased import logic there.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Next.js 16.3.5 (App Router, Node runtime)

**Primary Dependencies**: `@supabase/supabase-js` (RLS-scoped client via
`requireSession()`), `zod` (via `@stint/schema`), `packages/core` (pure
functions, no I/O per Constitution VI)

**Storage**: PostgreSQL via Supabase. No new table — imported rows are
ordinary `time_entries` rows; see Data Model below for the one schema
question this feature must resolve (how the source row's identity is
recorded for idempotency and future re-import detection).

**Testing**: Vitest (`apps/web`, `pnpm test:ui` / `pnpm test:rls`), Node's
built-in test runner (`packages/core`, `pnpm core:test`), parity tests
against a real Postgres instance for anything written twice
(`pnpm verify:db`, Constitution IV).

**Target Platform**: Web only (Next.js App Router). Explicitly out of scope
for macOS and mobile per FR-017 and `docs/architecture.md`.

**Project Type**: Web application — `apps/web` (routes + UI) and
`packages/core` (pure parsing/matching/rate/overlap logic).

**Performance Goals**: SC-001 — a multi-year export (assume up to a few
thousand rows) previews and confirms in under five minutes of contractor
time; the parse/preview/write operations themselves must be fast enough
that this bound is about the contractor reading the preview, not about
processing time.

**Constraints**: No OAuth, no stored third-party credential (FR-003) — file
upload is the only input. No live or repeating sync (FR-014). No tags
(FR-013). Preview must reflect exactly what gets written (FR-004) — same
parse function, not a second approximation.

**Scale/Scope**: A single contractor's account, a small number of import
runs over the account's lifetime (per spec Assumptions) — not a
high-frequency or bulk-admin operation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies | Assessment |
| --- | --- | --- |
| I. Timer invariant (DB-enforced) | Yes | An imported row with no `ended_at` (an in-progress Toggl entry at export time) would collide with `one_running_timer_per_user` if the contractor has a running timer, or with a second such row in the same batch. Plan must decide: reject/flag rows with no end time rather than writing them as "running," since an import producing a phantom running timer is worse than excluding one row. Resolved in Phase 1 data model. |
| II. Schema invariants asserted every build | Yes, if schema changes | If idempotency needs a new column (see Data Model), it ships with RLS already enabled on `time_entries` (inherited) and any new index verified by `pnpm verify:schema`. No new table is anticipated, so no new RLS policy is anticipated either — flagged as a design decision to confirm in Phase 1. |
| III. Server boundary (`/api/v1/*`, no Server Actions) | Yes | Import routes are plain Route Handlers under `/api/v1/imports/*`, matching `apps/web/src/app/api/v1/entries/route.ts`'s pattern: `requireSession()`, `ApiError`/`handle()`, no Server Action. |
| IV. Anything written twice needs a parity test | Yes | Rate resolution is *called*, not reimplemented — the import route imports `resolveRate()` from `packages/core` directly rather than restating the chain, so it inherits the existing parity test instead of needing a new one. If overlap detection or id-derivation logic ends up expressed in both TS and SQL, that would need its own parity test; the plan's default is to keep both in TS only (see Data Model) specifically to avoid this. |
| V. App never silently modifies user data | Yes — this is the feature's core constraint | Overlaps are written and flagged, not adjusted (FR-008). Duration disagreement is surfaced, not resolved (FR-015). Unrated entries land unrated (FR-005). Unrecognized files are rejected before write (FR-016). All of this is FR-level already, not a new design question — Phase 1 just has to avoid inventing a second silent-correction path per Principle V's own warning. |
| VI. `packages/core` has no I/O | Yes | CSV/JSON parsing, row-to-entry mapping, rate resolution call, overlap detection, and deterministic-id derivation are all pure functions taking parsed input and returning typed output — no Supabase client, no `fetch`, no file I/O inside `packages/core`. The route handler does the reading (`request.formData()`) and the writing (`db.from('time_entries').insert(...)`); `packages/core` only transforms. |
| VII. RLS verified correct | Yes, if schema changes | No new table anticipated. If Phase 1 concludes a new column is needed on `time_entries`, it inherits that table's existing RLS policy and `apps/web/test/rls.test.ts` coverage — no new cross-user surface is introduced by an import route since every write still goes through `requireSession()`'s RLS-scoped client with `user_id` from the session, never from the request body. |
| VIII. Secrets / observability | No | Import introduces no new credential (FR-003 explicitly forbids one). Parse failures are user-facing errors (FR-016), not the unhandled-exception gap `TODO(ERROR_TRACKING)` covers — no change to that principle's status. |
| IX. Migration ships for the client that hasn't updated | Yes, if schema changes | Any new column must be nullable/defaulted per Principle IX — consistent with the Data Model decision below, which favors no new column if one can be avoided, and an additive nullable one if it can't. |

**Gate result**: PASS. No principle is violated by the feature as specified;
Principle I and the schema question under Principle II/VII/IX are resolved
by a concrete design decision in Phase 1 (Data Model), not deferred as an
open risk.

### Post-Phase-1 re-check

| Principle | Result after design |
| --- | --- |
| I. Timer invariant | Confirmed satisfied by construction — Data Model's Running Entries rule means no row with `ended_at: null` ever reaches the write set, so `one_running_timer_per_user` cannot be hit by an import. |
| II / VII / IX. Schema, RLS, migration rollout | Confirmed **no new table and no new column** — research.md's deterministic-id decision resolved idempotency without schema change. Nothing for these three principles to gate; no migration ships with this feature. |
| III. Server boundary | Confirmed — contracts/imports-api.md specifies two plain Route Handlers, `requireSession()` + `ApiError`/`handle()`, no Server Action. |
| IV. Parity test | Confirmed avoided by construction, not by adding a test — `resolveRate()` is called, not reimplemented; the deterministic-id function and `findOverlaps()` exist in TypeScript only, with no SQL-side restatement, so Principle IV's obligation never triggers. |
| V. Never silently modify | Confirmed — Data Model's `overlapsWith`/`durationDisagreement`/`excludedReason` fields all route through display/flagging, never through mutation of another row. |
| VI. `packages/core` has no I/O | Confirmed — Project Structure places all parsing/matching/overlap/id-derivation logic under `packages/core/src/import/`, with `request.formData()` and the Supabase insert both staying in the route handler. |

**Gate result (post-design)**: PASS, unchanged. No Complexity Tracking entry
needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-toggl-harvest-import/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/core/src/
├── import/
│   ├── parse-toggl.ts       # Toggl CSV -> ParsedRow[]
│   ├── parse-harvest.ts     # Harvest CSV -> ParsedRow[]
│   ├── match-project.ts     # ParsedRow project/client name -> existing id | "create new"
│   ├── find-overlaps.ts     # entries[] (batch + existing) -> OverlapFlag[]
│   ├── deterministic-id.ts  # (userId, source, sourceId) -> stable UUIDv7
│   └── build-preview.ts     # ParsedRow[] + account context -> ImportPreview (shared by preview + write)
└── test/
    └── import/*.test.ts

apps/web/src/app/api/v1/imports/
├── preview/route.ts     # POST — accepts file, returns ImportPreview, writes nothing
└── confirm/route.ts     # POST — accepts a confirmed preview, writes time_entries

apps/web/src/app/(app)/import/
└── page.tsx              # upload -> preview -> confirm UI, per docs/design/screens/ convention

supabase/migrations/
└── <NNN>_import_idempotency.sql   # only if Data Model concludes a new column is needed
```

**Structure Decision**: Web application structure already in place
(`apps/web` + `packages/core`), extended rather than restructured. Parsing,
matching, overlap detection, and id derivation are new pure modules under
`packages/core/src/import/`, consistent with Principle VI. Two route
handlers (preview, confirm) rather than one, so FR-001/FR-004's
preview-before-write guarantee is a route boundary, not a flag inside a
single handler — the confirm route re-runs the identical `build-preview.ts`
logic against the uploaded file bytes (or a reference to them) rather than
trusting client-supplied preview data, so a tampered or stale preview
payload cannot cause a write that disagrees with what was shown.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
