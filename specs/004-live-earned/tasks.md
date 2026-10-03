---

description: "Tasks: live figures while a timer runs"
---

# Tasks: Live figures while a timer runs

**Input**: Design documents from `specs/004-live-earned/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Required (constitution V). Each test is written first and fails
before its code lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

- [X] T001 Build a private test database for this migration branch with `ci-db.sh`, since other sessions rebuild the shared `tt`/`tt_rls` (`apps/web/test/` README or `docs/local-dev.md` names the command)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The rollups count a running entry. Every story reads them.

- [X] T002 Write failing tests in `apps/web/test/rates.test.ts`: replace `'a running timer is in neither rollup'` (line ~404) with tests that (a) a running entry at a known `started_at` adds `round(seconds / 3600.0, 2) * rate` to `revenue_by_day`, `revenue_by_client` and `unbilled_by_client`, and (b) the same entry stopped at that moment yields the same amount to the cent. Freeze `now()` by running the queries in one transaction and reading `now()` there
- [X] T003 Create `supabase/migrations/00000000000030_live_running_entry.sql`: add `entry_seconds(p_started_at timestamptz, p_duration_seconds integer) returns integer`, `stable`, `security invoker`, `set search_path = public, pg_temp`, returning `p_duration_seconds` when not null, else `greatest(0, extract(epoch from (now() - p_started_at)))::integer`; grant it as `00000000000017_function_grants.sql` does. Then `create or replace` `unbilled_by_client`, `revenue_by_day` and `revenue_by_client` from their bodies in `00000000000028_bill_printed_hours.sql`, reading `entry_seconds(e.started_at, e.duration_seconds)` wherever they read `e.duration_seconds` (both the seconds and the `round(... / 3600.0, 2)` hours), and removing `and e.ended_at is not null`. Same signatures and grants. Header comment: why (`specs/004-live-earned`), and that invoicing keeps its own `ended_at` filter in `apps/web/src/lib/invoicing.ts`
- [X] T004 Update the mock rollups in `apps/web/src/mocks/derive.ts` (`unbilled_by_client` ~113, `revenue_by_day` ~145, `revenue_by_client` ~157) to count a running entry up to the mock's `now`, so `apps/web/test/mocks-parity.test.ts`'s `running` scenario agrees with the SQL; run it
- [X] T005 Update existing tests that asserted the old exclusion, in `apps/web/test/routes.test.ts`: `'stop returns Unbilled with the stopped entry counted, as /stats has it'` (~106; the running entry is now in Unbilled before the stop, and the stop changes it by at most the seconds between the two reads) and `'a running timer and billed work stay out of unbilled'` (~1131; split into a running entry that IS in Unbilled and billed work that is not)

**Checkpoint**: `rates.test.ts`, `mocks-parity.test.ts` and `routes.test.ts` pass.

---

## Phase 3: User Story 1 - Today's money moves with today's time (Priority: P1) 🎯 MVP

**Goal**: Today's Earned, total and rows include the running session, from one server answer.

**Independent Test**: Run a timer on a $100.00/h project for 30 minutes with the home screen open; Earned rises $50.00 in step with the duration, and stopping changes no figure.

### Tests

- [ ] T006 [P] [US1] Failing test in `packages/core/test/stats.test.ts`: `revenueByDay` (or a sibling the route uses) exposes each day's seconds alongside its amount
- [ ] T007 [P] [US1] Failing route tests in `apps/web/test/routes.test.ts`: with a running entry started today on a rated project, `/stats` returns `earnedToday` priced for its elapsed time and `secondsToday` including it, both from the same row; on an unrated project, `secondsToday` grows and `earnedToday` doesn't (FR-005)
- [ ] T008 [P] [US1] Failing route test in `apps/web/test/routes.test.ts`: `GET /entries` returns a running entry with `endedAt: null` and `durationSeconds` equal to its elapsed seconds at the response (± 2s)
- [ ] T009 [P] [US1] Confirm `apps/web/test/invoices.test.ts` `'preview excludes a running timer'` (~216) still passes, and add the same for invoice create in the same file (FR-004)

### Implementation

- [ ] T010 [US1] Add `secondsToday: z.number().int().nonnegative()` to `Stats` in `packages/schema/src/`, with a doc comment: today's worked seconds, the running entry included, from the same row as `earnedToday`
- [ ] T011 [US1] In `packages/core/src/stats.ts`, carry each day's seconds through `revenueByDay` (or add a sibling map); keep it pure
- [ ] T012 [US1] In `apps/web/src/app/api/v1/stats/route.ts`, return `secondsToday` from today's `revenue_by_day` row; update the `earnedToday` comment to say a running entry counts
- [ ] T013 [US1] In `apps/web/src/app/api/v1/entries/route.ts`, set a running entry's `durationSeconds` to its elapsed seconds at the response (`elapsedSeconds` from `@stint/core`), leaving `toEntry` in `apps/web/src/lib/rows.ts` unchanged
- [ ] T014 [US1] In `apps/web/src/components/home-today.tsx`, show `stats.secondsToday` as the total and remove `secondsOf`'s `Date.now()` branch; rows read `durationSeconds` as given
- [ ] T015 [US1] In `apps/web/src/components/dock.tsx`, pass `stats.secondsToday` to `EntryList` instead of `timer.todaySeconds`, so the dock's pair comes from one answer
- [ ] T016 [US1] In `apps/web/src/lib/client/use-timer.ts`, when a `/summary` fetch lands with a running timer, invalidate `keys.stats()` and `keys.entries()` so all three refresh on one beat (research R5); comment why
- [ ] T017 [US1] Add a story export for Today with a running timer on a rated project and one on an unrated project, in the stories file covering `home-today.tsx` (`apps/web/src/components/home.stories.tsx`), using the mocks' `running` scenario

**Checkpoint**: US1 independently testable; sign in locally and watch Today for two minutes with a timer running.

---

## Phase 4: User Story 2 - The week and the month move too (Priority: P2)

**Goal**: Today's week bar, the month's Earned, projection and client strip include the running session.

**Independent Test**: With a timer running, today's week bar, the month's Earned and the dock's Earned rise with Today's Earned.

- [ ] T018 [P] [US2] Failing route test in `apps/web/test/routes.test.ts`: with a running entry, today's `week[]` bar's `seconds`/`amount`, `month.earned` and `month.byClient` each include it, and `month.earned` minus the same figure without it equals `earnedToday`'s share
- [ ] T019 [P] [US2] Failing route test in `apps/web/test/routes.test.ts`: a running entry started before local midnight counts toward the day it started, not today (FR-011)
- [ ] T020 [US2] Make T018–T019 pass; T003 should already cover them. If `buildEarnedPace`'s projection in `packages/core/src/stats.ts` needs no change, say so in a comment on the test
- [ ] T021 [P] [US2] Story export in `apps/web/src/components/home.stories.tsx` for the week and month regions with a running timer

**Checkpoint**: US1 and US2 pass on their own.

---

## Phase 5: User Story 3 - Unbilled, on web and in the menu bar (Priority: P3)

**Goal**: Unbilled includes the running session everywhere, and never reaches an invoice.

**Independent Test**: With a timer running, the menu bar panel and the web show the same Unbilled, including the session.

- [ ] T022 [P] [US3] Failing route test in `apps/web/test/routes.test.ts`: `/stats` `unbilled.total` and `/clients` `unbilledAmount` include a running entry; `POST /timer/stop` returns the same Unbilled the next `/stats` does
- [ ] T023 [US3] Check the inbox: a running unrated entry now counts in `unbilled_by_client.unrated_count`. Confirm in `packages/core/src/stats.ts` (`buildUnbilled`) whether that surfaces an inbox row mid-session; if it does, add a failing test and exclude running entries from that prompt only, with a comment
- [ ] T024 [US3] No macOS change for the figure itself: `apps/macos/Sources/Stint/API.swift` `Stats.unbilled.total` reads the server's value

**Checkpoint**: Unbilled agrees across web and macOS.

---

## Phase 6: User Story 4 - Refresh only while in view (Priority: P4)

**Goal**: Refresh each minute only while a timer runs and the tab is visible or the panel is open.

**Independent Test**: With a timer running, a hidden tab and a closed panel make no scheduled `/stats` requests; showing them refreshes at once.

- [ ] T025 [P] [US4] Failing UI test in `apps/web/test/ui/` (alongside existing `use-*` tests): with a running timer, a summary refetch invalidates stats and entries; with no timer, it doesn't; with `document.visibilityState = 'hidden'`, the interval does not fire
- [ ] T026 [P] [US4] Failing test in `apps/macos/Tests/StintTests/`: with the panel closed, the poll fetches `/summary` only; on open, a full refresh runs at once; while open, the poll runs the full refresh
- [ ] T027 [US4] In `apps/macos/Sources/Stint/TimerModel.swift`, add `panelOpen` state and split `refresh()` so the 60s poller fetches only `/summary` while the panel is closed, and the full refresh (stats, projects, clients, recent) when open; `start()`'s refresh-on-open stays. Comment why the title still polls
- [ ] T028 [US4] In `apps/macos/Sources/Stint/ContentView.swift`, set the model's panel state from `.onAppear` and `.onDisappear`, treating each as a transition (see the comment at line ~29 on which edge fires)
- [ ] T029 [US4] Verify T016's driver pauses in a hidden tab (TanStack Query's `refetchIntervalInBackground` default) and refetches on focus (`refetchOnWindowFocus: 'always'` on summary); no code if T025 passes

**Checkpoint**: All stories pass.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T030 Update `Stats` doc comments in `packages/schema/src/` for `unbilled`, `earnedToday`, `week` and `month` to say a running entry counts up to the response
- [ ] T031 Run `apps/macos/qa.sh` for the panel scenarios in `specs/004-live-earned/quickstart.md` step 7
- [ ] T032 Sign in to local Stint from this worktree and walk `specs/004-live-earned/quickstart.md` steps 1–6; screenshot Today with a timer running for the PR
- [ ] T033 Open the PR with the `migration` label (the one open migration PR), the Try it section, preview link and `ready-for-qa`

---

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002–T005) → stories.
- US1 (T006–T017) is the MVP; US2 and US3 need only Foundational and can run beside US1. US4 needs T016.
- Within a story, tests before implementation.

## Parallel Example: User Story 1

```text
T006 core test   |  T007 stats route test  |  T008 entries route test  |  T009 invoice test
```

## Implementation Strategy

1. Foundational: the migration and its tests. This alone makes `/stats` and the menu bar's Unbilled live on their existing refresh.
2. US1: Today's pair and rows from the server, refreshed on the summary's beat. Stop and validate.
3. US2, US3: tests confirming what the migration already did, plus the inbox check.
4. US4: the macOS panel gate.
