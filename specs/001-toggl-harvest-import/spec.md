# Feature Specification: Import from Toggl

**Feature Branch**: `001-toggl-harvest-import`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Import from Toggl and Harvest — the docs/roadmap.md M3 item. File upload only (CSV/JSON export), no OAuth or stored third-party credentials. Parsing shared identically between the review-preview step and the actual write. Idempotent against re-running an import. Overlapping entries — within the import and against existing history — are never silently resolved; they write through and are flagged, not blocked. Rates not present in the export are never guessed; entries resolve through the normal rate chain and surface as unrated when nothing resolves. Toggl first, Harvest second, sharing the same pipeline. No tags, no live sync. Web app only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bring a full history from Toggl on day one (Priority: P1)

A contractor who has tracked time in Toggl for years signs up, exports their
Toggl data, and uploads it. Their history — the actual hours, on the actual
days, under the actual project names — is now here, so their first invoice
from this app can be compared against the last one they sent from Toggl.

**Why this priority**: Per `docs/roadmap.md`'s gate — without this, a new
user does not start. An import is the first thing a contractor arriving with
years of history tries, before anything else here is worth evaluating.

**Independent Test**: Export a real Toggl account's time entries to CSV,
upload it, confirm the import, and verify every unambiguous entry appears in
the calendar and contributes to the earned/unbilled figures on Home with the
correct date, duration, and project.

**Acceptance Scenarios**:

1. **Given** a Toggl CSV export with a mix of entries across several
   projects and months, **When** the contractor uploads it, **Then** they see
   a preview of what will be imported before anything is written.
2. **Given** a reviewed, confirmed import, **When** the write completes,
   **Then** every entry appears in the calendar on the date it was actually
   worked, with the same duration the export reported.
3. **Given** an import that has already been confirmed once, **When** the
   contractor uploads the exact same export file again, **Then** no entry is
   duplicated.

---

### User Story 2 - See rates the export didn't provide, without a wrong guess (Priority: P2)

A contractor's Toggl export has amounts on some entries and nothing on
others — Toggl doesn't export the rate hierarchy, only a computed total. The
import must never invent a rate: an entry either resolves one through the
same chain every other entry in this app uses, or it lands unrated so the
contractor sees and fixes it, the same way any other unrated entry is
handled today.

**Why this priority**: A wrong number on an invoice is the one failure this
whole product exists to prevent. A guessed rate from `amount ÷ duration`
introduces rounding noise and is flatly wrong for anything billed at a fixed
fee rather than hourly — silently corrupting the number the entire product
exists to get right.

**Independent Test**: Import a Toggl export containing entries with and
without a project the contractor has since set a rate on. Verify entries
under a rated project resolve a rate, and entries with no path to a rate
(no project, no client rate, no default) are flagged unrated rather than
given a computed or zero value.

**Acceptance Scenarios**:

1. **Given** an imported entry whose project has a rate set, **When** the
   import completes, **Then** the entry shows that rate, not a value derived
   from the export's own reported amount.
2. **Given** an imported entry with no project, no client rate, and no
   default rate to fall back to, **When** the import completes, **Then** the
   entry is marked unrated and is excluded from being invoiced until the
   contractor resolves it — exactly as an unrated entry created any other way
   is handled.

---

### User Story 3 - Import an export that contains overlapping entries (Priority: P2)

Toggl allows two entries to cover the same span of time — pausing and
resuming sloppily, or briefly tracking two things at once — and a real
export from an active user contains some. The import must never silently
adjust a timestamp to make an overlap disappear. Every entry writes in, and
any entry whose time overlaps another — whether that other entry came from
this same import or was already here before the import ran — is flagged for
the contractor to look at and resolve.

**Why this priority**: An overlap the app quietly resolved is exactly the
kind of silent correction this product's core trust rule forbids — a
double-counted hour inside a past invoice costs real money and real
credibility, and it is invisible to the contractor unless the app tells them.

**Independent Test**: Import a Toggl export containing two entries with
overlapping start/end times. Verify both entries are written (not held back
or merged), and that a flag exists for the contractor to see and resolve the
conflict. Separately, import an export whose entries overlap something
already in the contractor's history before the import ran, and verify the
same flag appears.

**Acceptance Scenarios**:

1. **Given** an import file with two overlapping entries, **When** the
   import completes, **Then** both entries exist as separate records and
   both are flagged as needing the contractor's attention.
2. **Given** an entry already tracked in the app for a given afternoon,
   **When** an import brings in an entry overlapping that same afternoon,
   **Then** the imported entry is written and flagged, not silently dropped
   or silently adjusted to fit.
3. **Given** a flagged overlap, **When** the contractor edits one of the two
   entries so the times no longer conflict, **Then** the flag clears without
   the contractor having to find and use a separate "resolve overlaps" tool.

---

### Edge Cases

- What happens when the uploaded file isn't a recognizable Toggl or Harvest
  export at all (wrong file, corrupted export, a spreadsheet someone edited
  by hand)? The contractor sees the file was not understood before anything
  is written, not a write that produces garbage entries.
- What happens when an entry's reported total duration disagrees with what
  its own reported start and end time would compute to? The disagreement is
  surfaced to the contractor rather than one of the two values being chosen
  silently.
- What happens to an entry so short it looks like a start/stop accident (an
  existing concept in this app for entries created directly)? The same
  threshold-based flag applies to an imported entry as to any other.
- What happens if the contractor closes the browser tab mid-upload, or the
  network drops partway through? Re-uploading the same file afterward must
  not duplicate anything already written before the interruption.
- What happens to time zone handling for an entry whose local time falls in
  the one-hour window a daylight-saving transition skips or repeats? The
  entry resolves to one specific, correct instant rather than an ambiguous
  or invalid one.
- What happens to an entry from a project or client that does not exist yet
  in this app? The contractor sees this named in the review step before
  confirming, not discovered after the fact as an entry with no project.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Contractors MUST be able to upload a Toggl time-entry export
  file and see a preview of what will be imported before anything is
  written.
- **FR-002**: *Deferred.* Harvest import is a separate `docs/roadmap.md`
  item, gated on a user asking for it.
- **FR-003**: The system MUST NOT require the contractor to authorize an
  OAuth connection or store a Toggl/Harvest API credential to perform an
  import — the export file is the only input.
- **FR-004**: The preview a contractor reviews MUST reflect exactly what
  will be written if they confirm — no entry may be written differently than
  it was previewed.
- **FR-005**: The system MUST NOT guess or back-compute a rate for an
  imported entry from the export's own reported dollar amount. An imported
  entry's rate MUST resolve the same way any other entry's rate resolves in
  this app, and an entry with no resolvable rate MUST be marked unrated
  rather than given a computed, zero, or otherwise invented value.
- **FR-006**: An unrated imported entry MUST be excluded from invoicing
  until the contractor resolves it, identically to how any other unrated
  entry in this app is already handled.
- **FR-007**: The system MUST detect when an entry's time range overlaps
  another entry's time range — both between two entries in the same import,
  and between an imported entry and an entry already in the contractor's
  history before the import ran.
- **FR-008**: An overlap MUST NOT be silently resolved by adjusting either
  entry's start or end time. Both overlapping entries MUST be written, and
  the overlap MUST be flagged for the contractor to see and resolve
  themselves.
- **FR-009**: A flagged overlap MUST be resolvable by the contractor editing
  either entry's time so the conflict no longer exists — the same everyday
  action of editing an entry, not a separate import-specific tool.
- **FR-010**: Re-uploading and confirming the same export file a contractor
  has already imported MUST NOT create duplicate entries.
- **FR-011**: An interrupted or partial import, when retried with the same
  file, MUST NOT duplicate any entry that was already successfully written
  before the interruption.
- **FR-012**: An entry's date and time MUST be resolved to the correct
  single instant it actually occurred at, including for a time that falls
  during a daylight-saving transition — never an ambiguous or shifted time.
- **FR-013**: The system MUST NOT introduce a tag or label concept as part
  of import — any tag data present in a Toggl export is not carried into
  this app.
- **FR-014**: The system MUST NOT establish an ongoing or repeating sync
  with Toggl or Harvest. Each import is a one-time action against a file the
  contractor uploads.
- **FR-015**: When an entry's reported total duration disagrees with the
  duration implied by its own start and end time, the system MUST surface
  the disagreement to the contractor rather than silently choosing one value.
- **FR-016**: When an uploaded file cannot be recognized as a valid Toggl or
  Harvest export, the contractor MUST be told this before any entry is
  written, not left to discover a broken or empty result afterward.
- **FR-017**: This capability MUST be available on the web app. It is
  explicitly out of scope for the macOS menu bar app and the mobile apps,
  whose scope in `docs/architecture.md` does not include data import.

### Key Entities *(include if feature involves data)*

- **Import**: A single upload-review-confirm action against one export
  file, from one source (Toggl or Harvest), at one point in time. Not an
  ongoing relationship with the source tool.
- **Imported time entry**: A time entry that came from an import rather than
  being started, stopped, or typed by the contractor directly. Once written,
  it is a time entry like any other — subject to the same rate resolution,
  the same overlap flagging, the same editing, and the same inclusion in
  invoicing as an entry created any other way.
- **Unrated entry**: An existing concept in this app — an entry with no
  resolvable rate, already excluded from invoicing until resolved. Import
  produces entries in this state when the export offers no path to a rate;
  it does not introduce a new kind of "unrated."
- **Overlap flag**: A marker that two entries' time ranges conflict, needing
  the contractor's attention. Generalizes beyond import — a manually edited
  entry that comes to overlap another entry should be flaggable the same way.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contractor with a multi-year Toggl history can complete an
  import — upload, review, confirm — in under five minutes for an export of
  a typical year's activity.
- **SC-002**: 100% of entries in a well-formed export that do not overlap
  anything and have a resolvable rate are written with the correct date,
  duration, and rate — zero entries silently dropped, merged, or altered
  from what the export reported.
- **SC-003**: Zero entries are ever written with a rate that was computed or
  guessed rather than resolved through the app's normal rate chain.
- **SC-004**: Re-running an already-completed import against the same file
  produces zero duplicate entries, verified against an export of at least
  several hundred entries.
- **SC-005**: Every entry the import writes that overlaps another entry —
  whether within the import or against prior history — is flagged and
  discoverable by the contractor, with zero silent overlaps.
- **SC-006**: A contractor uploading a file that is not a valid export from
  either supported source is told so before any write occurs, in all cases.

## Assumptions

- The contractor performing the import is importing their own history into
  their own account — this is not a multi-user or bulk-admin operation.
- Toggl's and Harvest's export formats are the ones each product currently
  documents as its standard CSV time-entry export; a future format change by
  either vendor is out of scope for this feature to anticipate.
- "Project" and "client" referenced by an imported entry are matched by name
  against what already exists in the contractor's account; creating a new
  project or client from an import is in scope if the referenced one does
  not exist, since otherwise every entry from an unrecognized project would
  be unimportable.
- A contractor performs this import a small number of times total (onboarding,
  and perhaps catching up an old period later) — this is not a workflow
  designed for frequent or automated re-imports.
