# Research: Every screen paints once, with all its data

## Why screens paint in pieces today

- **Home** waits on `/stats` behind a `Listing`, then starts
  `/calendar?granularity=day` (`api.activity`) for the week's per-client
  split, because its window comes from `stats.week`. Clients load
  separately. Bars draw before either arrives, so their hues are built from
  partial data (`home-cards.tsx:48-75`).
- **Every other screen** renders with `data?.x ?? []` fallbacks for its
  secondary queries: client names in the invoice list, the project picker in
  the timer bar, Today's earned figure in the dock, the calendar's colors.
- **macOS** `TimerModel.fetch` awaits summary, projects, clients, stats and
  task names one after another and assigns each as it lands
  (`TimerModel.swift:202-244`): five repaints, and the sum of five round
  trips.

## Decisions

### 1. `/stats` carries the week's per-client split

- **Decision**: Add `byClient: Record<clientId, seconds>` to each
  `stats.week[i]`, billable work only, with no-project work keyed `''`,
  the rule `/calendar`'s day split uses today. Move that rule into one
  pure function in `packages/core` (`dayByClient`), and call it from both
  routes. Home drops `api.activity`.
- **Rationale**: Removes the serial request at its source (SC-003), and
  the rule exists once (Principle II needs no parity test when there's one
  implementation).
- **Alternatives**: Fetch `/activity` in parallel by computing the week
  window on the client. Rejected: the window depends on the user's
  `week_starts_on` setting, which only `/stats` reads, and it stays two
  requests.

### 2. A region renders through one gate: `Listing` takes several queries

- **Decision**: `Listing` accepts a tuple of queries and renders its
  children only once every one has data, passing the data as a tuple.
  Errors and 401s behave as today. Every region with secondary queries
  moves its `?? []` fallbacks behind the gate. `client-list.tsx`'s
  hand-combined query becomes the general case.
- **Rationale**: One mechanism for FR-001 on every screen, which a test can
  hold to. A fallback like `?? []` is exactly how a region paints in
  pieces.
- **Alternatives**: `useSuspenseQueries` with Suspense boundaries. Rejected:
  a second loading mechanism beside `Listing`, and Suspense refetch
  semantics fight the optimistic-mutation rules (Constitution VI).

### 3. Serial queries start in parallel

- **Decision**: Where a nested component fetches by an id the parent
  already knows (`ClientProjects` under `ClientDetail`), the parent issues
  both queries and gates on both.
- **Rationale**: A serial request is a second loader, or a second paint.

### 4. One loader: the word "Loading"

- **Decision**: A `Loader` component replaces `Empty`'s "Loading…" in
  `Listing` and `(app)/loading.tsx`. It renders `type-label` and
  `text-subtle`, centered. A CSS animation fades it in starting at 600ms
  over `motion-count`, then breathes between full and 40% opacity on a
  2.4s cycle. It is `role="status"`. When the data arrives, the content
  rises in once (`motion-rise`, `ease-decelerate`). On macOS, the same
  word appears in the panel body until the first summary arrives.
- **Rationale**: The pick from `/design-review`
  (`design/loader.html`). The 600ms delay in CSS is the FR-005 threshold,
  so no timer state exists.
- **Alternatives**: A JS timer to mount the loader late. Rejected: state,
  and a flash on remount, for what one `animation-delay` does.

### 5. Web: persist the query cache to `localStorage`

- **Decision**: `@tanstack/react-query-persist-client` with
  `createSyncStoragePersister`, wrapped around the existing `QueryClient`
  in `providers.tsx`. `maxAge` is 7 days. The `buster` is
  `NEXT_PUBLIC_APP_VERSION` (`next.config.ts`), so a cache written by an
  older build is discarded (edge case). Only
  successful queries are persisted (the library default). Restored data
  is stale on arrival, so every query refetches on mount and the server's
  answer replaces it (Constitution III).
- **Rationale**: FR-008 with the library TanStack ships for it, rather than
  a hand-rolled store.
- **Alternatives**: IndexedDB through `idb-keyval`. Rejected: a second
  dependency for data well under `localStorage`'s limit.
- **Cost**: One dependency (`@tanstack/react-query-persist-client` and its
  sync-storage persister), no fixed cost.

### 6. Web: one account's cache never reaches another

- **Decision**: Remove the persisted cache, and clear the `QueryClient`,
  on every way out: the Sign out press, Delete account, the 401 redirect in
  `api.ts`, and on mount of `/signin`. A second account can only arrive
  through `/signin`, so it always starts from an empty cache.
- **Rationale**: FR-009 without knowing the user id synchronously at
  startup. Supabase's session lives in cookies, so the id isn't readable
  before restore without an async `getClaims()`.
- **Alternatives**: Key the cache by user id. Rejected: it delays the
  restore behind an async claim read, which is the wait this feature
  removes.

### 7. macOS: fetch in parallel, assign once

- **Decision**: `fetch(full:)` starts summary, projects, clients, stats and
  task names with `async let`, awaits all of them, then assigns every
  result in one main-actor step. The summary stays required (its failure
  is the error path, as now); each secondary result stays `try?`, so a
  failure keeps the old value (FR-007). The prediction guard runs after
  the awaits, before any assignment. The poll path (`full: false`) still
  fetches the summary alone.
- **Rationale**: SC-002 (one update), and the wait becomes the slowest
  request instead of the sum.

### 8. macOS: cache the last snapshot to disk

- **Decision**: After each full fetch, write projects, clients, stats and
  task names as one JSON `Snapshot` to `Caches/Stint/snapshot.json`. On
  launch, when signed in, load it before the first fetch. The summary (the
  timer) is not cached: the server owns timer truth (Constitution III), and
  a cached running timer that was stopped elsewhere would tick until the
  answer arrives. Sign-out deletes the file. The snapshot carries the app
  version and is discarded on a mismatch.
- **Rationale**: FR-008 and FR-009 on macOS. The models are already
  `Codable` (`API.swift`).
- **Consequence**: Until the first summary arrives, the panel shows the
  loader in its body even with a snapshot loaded. The cached lists make the
  rest of the panel complete the moment the summary lands.

### 9. Tests

- `packages/core/test`: `dayByClient`, test first.
- `apps/web/test/routes.test.ts`: `/stats` week carries `byClient`, which
  is billable only, keys no-project work `''`, and matches the calendar's
  day split for the same week.
- `apps/web/test/ui`: `Listing` with several queries renders nothing of its
  children until all resolve, and shows the loader. The persisted cache is
  removed on sign-out, the 401 redirect and `/signin` mount.
- Stories: `Loader` (loading, reduced motion); Home with a stalled `/stats`
  shows the loader and no partial panel; one loading story per screen
  converted to the gate, replacing the existing `Loading…` assertions
  (`calendar.stories.tsx:184`).
- `apps/macos/Tests/StintTests`: a full fetch with one secondary failing
  keeps the old value and assigns the rest; a snapshot round-trips, loads
  on start, and is deleted on sign-out.
