# Phase 0 Research: Import from Toggl and Harvest

## Idempotency mechanism

**Decision**: Derive each imported row's `time_entries.id` deterministically
from `sha256(userId + '|' + source + '|' + sourceRowId)`, truncated/shaped
into a valid UUIDv7 (version and variant nibbles forced, remaining bits from
the hash) — a `deterministicUuidv7(userId, source, sourceId)` function
alongside, not replacing, the existing random `uuidv7()`. No new column.

**Rationale**: The roadmap item is explicit — "a stable UUIDv7 per source
entry, so re-running a partial or interrupted import cannot duplicate
anything." A deterministic id reuses the exact mechanism that already makes
every other insert in this app idempotent (Principle I's "Conventions" note,
`POST /entries`'s `23505` → re-fetch-existing pattern at
`apps/web/src/app/api/v1/entries/route.ts:73-84`): the row's id is the
idempotency key, not a separate table or a "seen this batch before" check.
This needs no migration, no new RLS surface, and no parity test (Principle
IV) since the derivation exists in exactly one place — TypeScript, called by
both `preview` and `confirm` routes, never restated in SQL.

`sourceRowId` is source-specific: Toggl's CSV export includes a per-row
numeric `Duration` and start/stop timestamps but critically also a `Time
Entry Id`-equivalent column (confirmed by Toggl's documented CSV format) —
Phase 1's `data-model.md` records the exact column consumed per source.
Harvest's export includes a comparable stable identifier per line. If a
future export format lacks a stable per-row id entirely, the fallback is a
hash of the row's own content (project, start, end, task) — accepted as a
known limitation (two genuinely identical entries in one export would
collide) rather than solved speculatively, since neither documented export
format requires this fallback today.

**Alternatives considered**:
- *New `external_source text, external_id text` column pair with a unique
  index* — rejected as the primary mechanism because it adds schema surface
  (a migration, Principle IX's additive/nullable discipline, a new index)
  for something the id itself already solves without one; kept as a
  candidate only if the hash-derivation approach fails validation in Phase
  1 against a real Toggl export's column set.
- *Application-level "import batch" log table recording which source ids
  have been seen* — rejected: duplicates the id-as-idempotency-key pattern
  with an extra table to keep in sync, and doesn't compose with FR-011's
  "retried partial import" requirement as cleanly as a deterministic id
  does (a batch log needs its own crash-consistency story; a deterministic
  id's idempotency is a property of the row itself).

## Running (unfinished) entries in an export

**Decision**: A parsed row with no end time is excluded from the write and
surfaced in the preview as a distinct category ("not imported — no end
time"), not written as a running entry and not silently given a synthetic
end time.

**Rationale**: `one_running_timer_per_user` (Principle I) permits at most one
`ended_at is null` row per user, database-enforced. Writing an imported
"still running" row would either collide with a real running timer (insert
fails) or silently become the contractor's running timer (wrong — it may be
a stale export artifact from months ago, not something actually running
now). Principle V (never silently modify or invent) rules out fabricating an
end time. Excluding the row and naming it in the preview keeps the
guarantee that what's previewed is what's written (FR-004) — the row simply
isn't in the "will be written" set, same treatment as an unrecognized-file
rejection (FR-016) but scoped to one row instead of the whole file.

**Alternatives considered**:
- *Synthesize `ended_at = started_at` or some default duration* — rejected
  outright, this is exactly the silent-invention Principle V forbids.
- *Reject the entire file if any row lacks an end time* — rejected as
  disproportionate; a single stale open entry in a multi-year export
  shouldn't block importing everything else, and the spec's overlap/edge-case
  section already establishes the pattern of flagging individual problem
  rows rather than failing the whole import.

## Preview-to-confirm data flow across two requests

**Decision**: The confirm route re-parses the same uploaded file rather than
trusting a client-echoed preview payload. The preview route returns the
computed `ImportPreview` (for display) *and* an opaque, signed reference to
the uploaded file's content (e.g., its own hash, or the file re-attached on
confirm) so the confirm request can re-derive the identical preview
server-side before writing.

**Rationale**: FR-004 requires the preview to reflect exactly what's
written — "no entry may be written differently than it was previewed." The
only way to guarantee that against a client that could (accidentally or
otherwise) send a stale or edited preview payload on confirm is to not trust
client-supplied preview data as the write source at all. Re-running
`build-preview.ts` against the actual file bytes on confirm, and diffing the
result against what the contractor is confirming, is the same function
called twice — not two implementations to keep in sync (Principle IV avoided
by construction, not by a parity test).

**Alternatives considered**:
- *Client sends the full previewed row set back on confirm, server writes it
  as-is* — rejected: this makes the client the source of truth for what
  gets written, which is exactly the gap FR-004 exists to close, and
  reopens a class of bug (preview/write divergence) the spec explicitly
  calls a failure.
- *Server holds parsed rows in a short-lived server-side session/cache keyed
  by an import id, confirm just references that id* — viable alternative,
  deferred: adds server-side state and a cleanup/expiry story for something
  a stateless re-parse already solves; revisit only if re-parsing large
  files twice proves to be a real performance problem against SC-001's
  five-minute bound (unlikely — parsing a few thousand CSV rows twice is not
  the bottleneck; the contractor reading the preview is).

## Overlap detection scope and shape

**Decision**: `findOverlaps(candidates: EntryRange[], existing: EntryRange[]): OverlapFlag[]`
in `packages/core`, pure interval-overlap comparison (no I/O), called by the
confirm route after fetching the contractor's existing entries in the
affected date range. Flags are computed per request (not stored), consistent
with the inbox pattern's existing "derived, not stored" convention
(`docs/design/screens/inbox.html`).

**Rationale**: No overlap-detection code exists anywhere in the repo today
(confirmed by survey) — this is net-new, but the shape to build is dictated
by the inbox's existing convention: every other flag in this app
(runaway timer, strange duration, unprojected entry) is computed per-request
from `GET /stats`, not persisted as a row-level status. An overlap flag
should follow the same rule rather than inventing a second, stored
mechanism, which Principle V's mechanism note explicitly warns against
("a feature that invents its own silent-correction path instead of routing
through the inbox pattern has not followed this principle"). Concretely:
`GET /stats` (or an equivalent inbox-feeding endpoint) already computes
derived flags per request; overlap becomes one more predicate it evaluates,
using the same interval-overlap check `findOverlaps()` exposes, rather than
a separate storage-backed subsystem.

**Alternatives considered**:
- *Store the overlap flag as a column or a join table row at import-write
  time* — rejected: contradicts the inbox's established "derived, not
  stored" pattern, and creates a staleness problem (User Story 3's
  acceptance scenario 3 requires the flag to clear automatically when the
  contractor edits either entry — a derived-per-request check gets this for
  free; a stored flag needs its own invalidation logic to get the same
  behavior).

## CSV parsing library

**Decision**: No new dependency — parsing is straightforward newline/comma
splitting with quoted-field handling for both Toggl's and Harvest's
documented export shape, implemented directly in `packages/core` as it's a
pure, dependency-free transform (Principle VI already requires no I/O; a
dependency-free parser also avoids a supply-chain addition for a well-scoped
format).

**Rationale**: Both exports are simple flat CSVs (no nested structures, no
nested nested-quoting edge cases beyond RFC 4180's escaped-quote rule).
`packages/core` currently has zero runtime dependencies beyond TypeScript
itself; adding a CSV library would be the first. Given the format is small
and stable (per the spec's own Assumptions — "a future format change by
either vendor is out of scope"), a ~50-line RFC 4180 parser is simpler to
audit and keeps `packages/core` dependency-free, matching its existing
character.

**Alternatives considered**:
- *`papaparse` or similar* — rejected: pulls a dependency into a package
  that has deliberately had none, for a format simple enough not to need
  one; revisit only if a real Toggl/Harvest export surfaces a CSV quirk a
  hand-rolled parser mishandles.

## Outstanding NEEDS CLARIFICATION

None. Every unknown the Technical Context section could have left open was
resolved above from either the roadmap entry, the constitution's existing
mechanisms, or a survey of this repo's own conventions — consistent with the
spec's own note that no `[NEEDS CLARIFICATION]` marker was needed because
the hard decisions were pre-resolved before writing began.
