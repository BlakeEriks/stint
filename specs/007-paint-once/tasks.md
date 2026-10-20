# Tasks: Every screen paints once, with all its data

**Input**: `specs/007-paint-once/` (spec.md, plan.md, research.md, data-model.md, contracts/stats.md, quickstart.md, design/loader.html)

Tests: Constitution V. Core, routes and client logic are tested first, in
their suites; each visible loading state is a story; macOS logic in
`StintTests`.

## Phase 1: Setup

- [X] T001 Add `@tanstack/react-query-persist-client` and `@tanstack/query-sync-storage-persister` (v5, matching `@tanstack/react-query`) to `apps/web/package.json`; `pnpm install`

## Phase 2: Foundational (blocks every story)

- [X] T002 [P] Write the `dayByClient` tests first in `packages/core/test/calendar.test.ts`: billable seconds per client id per local day; non-billable work excluded; work with no project or no client keyed `''`; running entries (`endedAt == null`) and entries starting before `from` skipped; a day with no billable work is `{}`; days keyed by `localDateKey(startedAt, tz)` across a DST change
- [X] T003 Implement `dayByClient(entries, clientOf, { from, tz })` in `packages/core/src/calendar.ts` (exported from `packages/core/src/index.ts`) returning `Map<dateKey, Record<string, number>>`, moving the rule out of `apps/web/src/app/api/v1/calendar/route.ts:85-93`; T002 passes. Make the calendar route call it; the existing `routes.test.ts` calendar day-split tests still pass
- [X] T004 [P] Create `apps/web/src/components/loader.tsx`: `Loader`, a centered `<p role="status" className="type-label text-subtle">Loading</p>` filling its region (`py-10`, `tight` → `py-8`, the sizes `Empty` uses), animated by a `loader` class defined in the web app's global CSS: `ld-in` fade from 0 over `--motion-count` with a 600ms delay, then `still-pulse` (1 → 0.4 → 1) over 2.4s `ease-in-out` from 1500ms, infinite; under `prefers-reduced-motion` only the fade, linear. Values from `specs/007-paint-once/design/loader.html`
- [ ] T005 [P] `apps/web/src/components/loader.stories.tsx`: Loading (the word is present with `role=status`, and its computed `animation-delay` starts at 600ms, so a fast load never shows it), Tight
- [X] T006 Write `apps/web/test/ui/listing.test.tsx` cases first: `Listing` given a tuple of queries renders `Loader` until every query has data, then calls children once with the data tuple; an error in any query shows the failure message; a 401 keeps the loader; a query that has data keeps rendering through another's refetch error; the single-query form behaves as today
- [X] T007 Extend `Listing` in `apps/web/src/components/page.tsx` to accept `query` as one query or a tuple, rendering `Loader` (not `Empty`'s "Loading…") while any is first loading; children rendered inside a `motion-safe` rise-in (`motion-rise`, `ease-decelerate`, `motion-quick`); T006 passes. Update `apps/web/src/app/(app)/loading.tsx` to render `Loader`
- [ ] T008 Replace "Loading…" assertions with the `Loader`'s role and text in `apps/web/test/ui/listing.test.tsx`, `apps/web/test/ui/invoice-detail.test.tsx:125`, `apps/web/src/components/calendar.stories.tsx:52,184` and `apps/web/src/components/invoice-detail.stories.tsx:266-277`

## Phase 3: User Story 1 - The home panel, and every web screen, appears whole (P1)

**Independent test**: With `/stats` stalled, Home shows only the loader in the panel; once it resolves, the bars appear in client colors with the legend complete, in one step.

- [X] T009 [US1] Write the `/stats` test first in `apps/web/test/routes.test.ts` (in the `/stats` section, from line ~1150): every `week[i]` has `byClient`, billable seconds only, `''` for work with no client, and equal to `byClient` from `GET /calendar?granularity=day` for the same week and tz; the existing "the week sees only its own user's work" test also covers `byClient`
- [X] T010 [US1] Add `byClient: z.record(z.string(), z.number())` to `WeekDay` in `packages/schema/src/index.ts:697`; in `apps/web/src/app/api/v1/stats/route.ts`, add the week window's entries (ended, with project id and billable) and the projects `id → client_id` map to the existing `Promise.all`, and fill each day with `dayByClient`; `buildWeek` in `packages/core/src/stats.ts:536` takes the map and sets `byClient` (`{}` for a missing day); T009 passes
- [X] T011 [US1] In `apps/web/src/components/home-cards.tsx`, drop the `api.activity` query; gate the panel on `[stats, clients(archived), projects(archived), today's entries]` through `Listing`; build `byDay` from `stats.week[i].byClient`; pass entries and projects into `Today` (`apps/web/src/components/home-today.tsx`), which stops running its own queries and its `?? []` fallbacks. Remove `api.activity` and `keys.activity` from `apps/web/src/lib/client/api.ts` and `query-keys.ts` if nothing else uses them; `useClients`/`useAllProjects` in `apps/web/src/lib/client/use-project-colors.ts` expose their query objects for the gate
- [X] T012 [P] [US1] Home stories in `apps/web/src/components/home.stories.tsx`: Loading (`stalled('stats')`: the loader shows and no region of the panel renders); OneStep (three clients this week: the first render of the panel has every bar colored and the legend naming all three); Empty (no entries: the empty panel, never stuck on the loader)
- [ ] T013 [US1] Dock: `apps/web/src/components/dock.tsx` and `DockToday` gate `[summary, stats, projects]` and `EntryList` (`apps/web/src/components/entry-list.tsx`) gates `[entries, clients, projects]`, so Today's header, figure and rows appear together; `apps/web/src/components/dock-strip.tsx` shows no count until stats arrive (no `0` pill); `apps/web/src/components/timer-dock.tsx` holds the timer bar until `[summary, projects]` resolve. Keep `apps/web/test/ui/dock.test.tsx`'s rule that Today does not wait on the inbox
- [ ] T014 [P] [US1] Calendar: in `apps/web/src/components/calendar.tsx` and `apps/web/src/lib/client/use-calendar.ts`, gate the grid on `[calendar, projects, clients]`; remove `CalendarStatus`'s "Loading…" in favor of the loader in the grid's place on first load; a week change keeps the previous week until the next arrives (`placeholderData: keepPreviousData`)
- [ ] T015 [P] [US1] Clients: `apps/web/src/components/client-list.tsx` gates `[clients, projects, settings, expenses]` with the tuple `Listing` in place of its hand-combined query; `apps/web/src/components/client-detail.tsx` issues the client, its projects and settings together and gates on all three, passing projects into `apps/web/src/components/client-projects.tsx` (no nested fetch)
- [ ] T016 [P] [US1] Invoices: `apps/web/src/components/invoice-list.tsx` gates `[invoices, clients]`; `apps/web/src/components/invoice-detail.tsx` gates `[invoice, settings]` (keeping `placeholderData: fromLists`); `apps/web/src/components/invoice-new.tsx` gates `[clients, settings, payment-profiles]` before the form renders (the selection-driven expense and preview queries stay as they are)
- [ ] T017 [P] [US1] Settings: `apps/web/src/components/settings-form.tsx` gates `[settings, payment-profiles]` and passes profiles into `apps/web/src/components/payment-profiles.tsx`
- [ ] T018 [US1] A Loading story (`stalled` on the screen's primary query: the loader shows, no partial region) in each converted screen's `*.stories.tsx`: dock, calendar, client list, client detail, invoice list, invoice detail, new invoice, settings
- [ ] T019 [US1] Sweep: `grep -rn "?? \[\]\|?? null\|data?\." apps/web/src/components` for any region still painting before its data; convert or justify each in a comment at the line

## Phase 4: User Story 2 - The menu bar panel appears whole (P1)

**Independent test**: With the API slowed, opening the panel after launch shows "Loading" until the summary arrives, then timer, recent tasks, picker and figures in one update; a failing `/stats` leaves the rest working.

- [X] T020 [US2] Write first in `apps/macos/Tests/StintTests/TimerModelTests.swift`: a full refresh assigns summary, projects, clients, stats and task names from one fetch; with stats failing, the others update and stats keeps its old value; a press during the fetch leaves every property as it was
- [X] T021 [US2] In `apps/macos/Sources/Stint/TimerModel.swift` `fetch(full:recent:)`, start summary, projects, clients, stats and task names with `async let` (secondaries as `try?`), await all, check the prediction guard, then assign everything in one step; `full: false` still fetches the summary alone; T020 passes
- [X] T022 [US2] In `apps/macos/Sources/Stint/ContentView.swift`, while `model.summary == nil` the panel body shows the word "Loading" (the `label` type role, `textSubtle`), centered, fading in after 600ms and breathing 1 → 0.4 over 2.4s, with no animation under Reduce Motion (`accessibilityReduceMotion`); the header stays

## Phase 5: User Story 3 - Reopening shows the last known numbers at once (P2)

**Independent test**: Load Home, reload with the network slowed: the previous panel shows with no loader, and only changed figures update. Sign out and in as another account: nothing of the first shows.

- [ ] T023 [US3] Write first in `apps/web/test/ui/query-cache.test.tsx`: `clearQueryCache(client)` clears the `QueryClient` and removes the persisted entry from `localStorage`; signing out (`useAccount`), the 401 path in `api.ts`, and mounting the sign-in page each call it; a persisted cache with a different `buster` is not restored
- [ ] T024 [US3] Create `apps/web/src/lib/client/query-cache.ts` (the persister: `createSyncStoragePersister` over `localStorage`, key `stint-query-cache`; `clearQueryCache`); wrap `apps/web/src/components/providers.tsx` in `PersistQueryClientProvider` with `maxAge: 7 days` and `buster: process.env.NEXT_PUBLIC_APP_VERSION`, persisting successful queries except `keys.session` and `['account']`; Storybook passes no persister
- [ ] T025 [US3] Call `clearQueryCache` from `apps/web/src/lib/client/use-account.ts` (sign out, before the redirect), `apps/web/src/components/account-section.tsx` (delete account), `apps/web/src/lib/client/api.ts:96-103` (before the 401 redirect) and the sign-in page under `apps/web/src/app/signin/` on mount; T023 passes
- [X] T026 [US3] Write first in `apps/macos/Tests/StintTests/SnapshotTests.swift`: a `Snapshot` (version, projects, clients, stats, taskNames per `data-model.md`) round-trips through a temp directory; a version mismatch reads as nil; the model loads a snapshot on start when signed in and assigns it before the first fetch; a full fetch writes it; sign-out deletes it, including the sign-out a 401 triggers through `tokens.signOut()`
- [X] T027 [US3] Create `apps/macos/Sources/Stint/Snapshot.swift` (read, write, delete under `Caches/Stint/snapshot.json`, directory injectable for tests); wire it into `TimerModel` start, after a full fetch, and every sign-out (delete it when the token store's `onChange` reports signed out, which covers both `signOut()` and a 401); the summary is never written; T026 passes

## Phase 6: Polish

- [ ] T028 Update comments that describe the old loading: `apps/web/src/components/page.tsx` (`Empty` no longer stands in for loading), `home-cards.tsx` (the `/activity` comment), `apps/web/src/app/(app)/loading.tsx`
- [ ] T029 Add the rule to `.claude/rules/web-ui.md`: a region paints once, with all its data, through `Listing`; never a `?? []` fallback in a rendered region; its only loading state is `Loader`
- [ ] T030 Run `pnpm --filter @stint/core test`, the web `test`, `test:ui`, `test:stories`, lint and typecheck, and `cd apps/macos && swift test`
- [ ] T031 Verify `quickstart.md` in the dev server signed in, with Slow 4G, at desktop and phone, dark and light; and the menu bar panel with `apps/macos/qa.sh`

## Dependencies

- T001 before T024. T002–T003 before T010. T004–T008 before every screen task (T011–T019) and T022's look.
- US1, US2 and US3 are otherwise independent: US2 touches only `apps/macos`; US3's web half touches only providers, `query-cache.ts` and the sign-out paths.
- Within US1, T009–T010 before T011; T013–T017 touch different files and can run in parallel.

## Parallel examples

- After Phase 2: T014, T015, T016 and T017 at once (different screens).
- US2 (T020–T022) alongside any US1 task.
- T026–T027 alongside the web half of US3.

## Implementation strategy

MVP is Phase 2 plus T009–T012: Home paints once, the bug the issue names. Then the rest of US1 screen by screen, then US2, then US3. Each merges on its own (`docs/sdlc.md`: one story at a time).
