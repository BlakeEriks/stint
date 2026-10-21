# Implementation Plan: Every screen paints once, with all its data

**Branch**: `f383-paint-once` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-paint-once/spec.md`

## Summary

Every region renders once, with all of its data, behind one quiet loader:
the word "Loading" (`design/loader.html`). `/stats` carries the week's
per-client split, so Home no longer waits on two requests in series.
`Listing` gates on several queries, so no screen paints with `?? []`
fallbacks. macOS fetches in parallel and assigns once. Both clients keep the
last known data (web: TanStack's persisted cache; macOS: a JSON snapshot),
show it at once on reopen, and clear it on sign-out. Decisions are in
[research.md](research.md).

## Technical Context

**Language/Version**: TypeScript, React 19, Next.js App Router; Swift 6, SwiftUI

**Primary Dependencies**: TanStack Query 5, plus `@tanstack/react-query-persist-client` and `@tanstack/query-sync-storage-persister` (new); Tailwind 4

**Storage**: Browser `localStorage` (the persisted query cache); macOS `Caches/Stint/snapshot.json`. No database change.

**Testing**: Vitest `packages/core/test`, `apps/web/test/routes.test.ts` (real Postgres), `apps/web/test/ui`; Storybook stories in a real browser; Swift Testing `apps/macos/Tests/StintTests`

**Target Platform**: The web app at desktop and phone widths; the macOS menu bar app

**Project Type**: Web application and desktop app

**Performance Goals**: Each region updates once (SC-001, SC-002); Home completes at least one round trip sooner (SC-003); a reload after a first visit shows no loader (SC-004)

**Constraints**: The loader shows only past 800ms (FR-005); the frame never moves (FR-003); no account sees another's numbers (FR-009)

**Scale/Scope**: About 15 web components converted to the gate, two routes and one core function, one macOS model change

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | No | Nothing is written; the cache holds server answers and is replaced by the next one. |
| II. Logic written twice has a parity test | Yes | The per-client day split moves into one function, `dayByClient` in `packages/core/src/calendar.ts`, which `/stats` and `/calendar` both call. One implementation, so no parity test is needed; a route test still checks the two responses agree. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | All data still comes through `/api/v1`. Restored web data is stale on arrival and refetches on mount; the server's answer replaces it. macOS never caches the summary, so the timer is always the server's. |
| IV. `packages/core` does no I/O | Yes | `dayByClient` takes entries and a project map and returns a record; the routes read. |
| V. Tests first where a regression is silent | Yes | `dayByClient` in `packages/core/test`; the `/stats` field in `routes.test.ts`; the multi-query `Listing` and cache clearing in `apps/web/test/ui`; a loading story per converted screen; the parallel fetch and snapshot in `StintTests`. Each first, failing. |
| VI. Every press answers in the same frame | Yes | No press changes. The gate applies to a query's first load only; a refetch keeps existing data (as `Listing` does today), so an optimistic prediction is never hidden behind the loader. A section switch stays static, and `(app)/loading.tsx` now renders the `Loader`. |

Additional Constraints: no new fixed cost (two open-source packages, no
service); one running timer and immutable invoices are untouched;
online-only holds, since the cache only paints before the server answers.

Post-design re-check: passes; nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-paint-once/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/stats.md
├── design/loader.html
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/core/src/calendar.ts    # dayByClient(): the per-client day rule, moved out of the route
packages/core/test/              # dayByClient tests
packages/schema/src/index.ts     # WeekDay.byClient
apps/web/src/app/api/v1/stats/route.ts     # reads the week's entries, fills byClient
apps/web/src/app/api/v1/calendar/route.ts  # calls dayByClient
apps/web/test/routes.test.ts     # /stats week byClient

apps/web/src/components/
├── loader.tsx                   # NEW: the "Loading" word
├── loader.stories.tsx           # NEW
├── page.tsx                     # Listing takes a tuple of queries; Empty loses "Loading…"
├── providers.tsx                # PersistQueryClientProvider, buster, maxAge
├── home-cards.tsx, home-today.tsx       # one gate: stats, clients, projects, entries; no api.activity
├── dock.tsx, dock-strip.tsx, timer-dock.tsx, entry-list.tsx
├── calendar.tsx, client-list.tsx, client-detail.tsx, client-projects.tsx
├── invoice-list.tsx, invoice-new.tsx, settings-form.tsx, payment-profiles.tsx
└── *.stories.tsx                # a loading story per converted screen
apps/web/src/app/(app)/loading.tsx       # renders Loader
apps/web/src/app/signin/                 # clears the persisted cache on mount
apps/web/src/lib/client/
├── api.ts                       # 401 redirect clears the cache; api.activity removed
├── use-account.ts               # sign out clears the cache
└── query-cache.ts               # NEW: clearQueryCache(), the one way out
apps/web/test/ui/                # listing gate, cache clearing

apps/macos/Sources/Stint/
├── TimerModel.swift             # async let fetch, one assignment; load and save the snapshot
├── Snapshot.swift               # NEW: Codable snapshot, read, write, delete
└── ContentView.swift            # the Loading word until the first summary
apps/macos/Tests/StintTests/     # parallel fetch, snapshot
```

**Structure Decision**: The existing web app, shared packages and macOS
app. No new package or route.

## Complexity Tracking

None.
