# Implementation Plan: Live figures while a timer runs

**Branch**: `live-earned` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-live-earned/spec.md`

## Summary

The three rollups behind the home figures and Unbilled count a running entry
up to `now()`, priced by the rule they already use for stopped entries.
`GET /entries` returns a running entry's length so far, so Today's figures
and rows all come from the server.
Web refetches them alongside `/summary`, which already polls each minute
while a timer runs and pauses when the tab is hidden. macOS refreshes the
panel's figures only while the panel is open.

## Technical Context

**Language/Version**: TypeScript (Next.js route handlers, React), SQL
(Postgres 15 on Supabase), Swift (macOS menu bar app)

**Primary Dependencies**: TanStack Query on web; existing `TimerModel`
refresh loop on macOS

**Storage**: Supabase Postgres; one migration replacing three functions

**Testing**: `apps/web/test/routes.test.ts` and `rates.test.ts` against real
Postgres; `mocks-parity.test.ts`; stories for Today;
`apps/macos/Tests/StintTests`

**Target Platform**: Web (Vercel) and macOS

**Project Type**: Web app + native client

**Performance Goals**: One refresh a minute per visible client while a timer
runs: `/summary`, `/stats` and today's `/entries`

**Constraints**: No new fixed cost. Invoicing never bills a running entry.

**Scale/Scope**: One user, one running timer

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | No | Read-only change to figures; no row is written. |
| II. Logic written twice has a parity test | Yes | The running session is measured and priced only in SQL. The mock rollups in `apps/web/src/mocks/derive.ts` follow, and `mocks-parity.test.ts` already holds them to the SQL. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The server measures and prices the running session; clients only show it. |
| IV. `packages/core` does no I/O | No | No core change. |
| V. Tests first, one suite per kind of code | Yes | Route tests and a pricing test against real Postgres, a Today story with a running timer, and a Swift test for the panel-only refresh. |

Additional Constraints: one running timer (unchanged); issued invoices
untouched, and `lib/invoicing.ts` keeps its own `ended_at is not null`
filter; no fixed cost. The migration makes this the one open `migration` PR
while in review.

Post-design re-check: passes, nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-live-earned/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/00000000000031_live_running_entry.sql   # new: helper + 3 rollups
apps/web/src/app/api/v1/stats/route.ts      # passes p_now to the rollups
apps/web/src/app/api/v1/entries/route.ts    # running entry's length so far
apps/web/src/mocks/derive.ts                # mock rollups count the running entry
apps/web/src/lib/client/use-timer.ts        # each summary refetch while running refetches stats + entries
apps/web/src/components/home-today.tsx      # drop the client clock
apps/macos/Sources/Stint/TimerModel.swift   # full refresh only while the panel is open
apps/macos/Sources/Stint/ContentView.swift  # tells the model when the panel opens and closes
packages/schema/src/                        # doc comments only
apps/web/test/routes.test.ts, rates.test.ts, mocks-parity.test.ts
apps/macos/Tests/StintTests/
```

**Structure Decision**: The existing web + macOS layout; no new modules.

## Complexity Tracking

None.
