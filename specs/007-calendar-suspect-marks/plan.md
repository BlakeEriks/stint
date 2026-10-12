# Implementation Plan: The calendar marks its own suspect entries

**Branch**: `f290-cal-suspect` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-calendar-suspect-marks/spec.md`

## Summary

The calendar reads the same `/stats` query the Inbox and the folded dock
already read, and a pure client helper turns its `attention.overlaps` and
`attention.strangeDurations` into a map from entry id to the reasons, worded
as the Inbox words them. `EntryBlock` takes its entry's reasons: a warning
border and glyph, and the reasons in its name and tooltip. A calendar edit
already invalidates `/stats` (`invalidateEntryData`), so a mark appears and
clears with the save. Web only; no data, API or macOS change.

## Technical Context

**Language/Version**: TypeScript, React 19, Next.js App Router

**Primary Dependencies**: TanStack Query, Tailwind 4, lucide-react

**Storage**: N/A

**Testing**: Vitest `apps/web/test/ui` (the helper), Storybook stories rendered in a real browser (each visible state)

**Target Platform**: The web app, desktop and phone widths

**Project Type**: Web application

**Performance Goals**: No new request: the `/stats` query is deduped with the folded dock's

**Constraints**: The block's client edge and fill are unchanged; the mark adds a border color and a 12px glyph

**Scale/Scope**: One component changed (`calendar.tsx`), one helper added

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The mark only reads. A suspect block is surfaced in place for the user to resolve, never auto-corrected; pressing it opens the editor, as before. |
| II. Logic written twice has a parity test | No | Nothing is detected twice: the calendar uses the server's `attention` lists, the Inbox's own answer. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The marks come from `GET /api/v1/stats`. The drag predicts the block's position only; the mark waits for the server (FR-008). |
| IV. `packages/core` does no I/O | No | Nothing goes into core; the helper maps an API response on the client. |
| V. Tests first where a regression is silent | Yes | `suspectEntries()` is client logic, tested first in `apps/web/test/ui/suspects.test.tsx`. Each visible state is a story: an overlap with its unmarked other, a long entry, both on one block, and a failed `/stats`. |
| VI. Every press answers in the same frame | Yes | No new press. Edits keep their existing mutations; the mark follows the refetch they already trigger. |

Additional Constraints: no new fixed cost; online-only, US-first unaffected.

Post-design re-check: passes; nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-calendar-suspect-marks/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

No `data-model.md` or `contracts/`: the feature adds no data and no API.

### Source Code (repository root)

```text
apps/web/src/lib/client/
└── suspects.ts              # NEW: suspectEntries(attention) → Map<entryId, reasons[]>
apps/web/src/components/
├── calendar.tsx             # reads /stats; EntryBlock draws the mark
└── calendar.stories.tsx     # one story per visible state
apps/web/test/ui/
└── suspects.test.tsx        # NEW
```

**Structure Decision**: The helper is client logic over the API's shape, so
it lives in `lib/client` beside the other helpers the calendar uses, and is
tested in `apps/web/test/ui`.

## Complexity Tracking

None.
