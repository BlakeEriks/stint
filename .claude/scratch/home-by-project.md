# By project, beside the half-year

The home panel answers "which client" four ways and "which project" not at all.
This adds a fifth region: projects ranked by hours or revenue over the same
trailing window Velocity reports, as vertical columns, paired with the year
heatmap which drops to 26 weeks to make room.

`docs/tasks.md` carries the reasoning. This spec carries the build.

## The shape

```
GET /api/v1/stats
  └─ revenue_by_project(p_user_id, p_from, p_to)   ← NEW migration 13
       … same p_from/p_to binding velocity already uses
  └─ buildByProject(rows, fallbackCurrency)        ← NEW in packages/core
       └─ byProject: { seconds, amount, byProject[], moreProjects, tailSeconds, tailAmount }
            └─ Stats.byProject                     ← NEW zod shape
                 └─ <ByProject>                    ← NEW apps/web/src/components/home-by-project.tsx
                      └─ Pair( ByProject, Heatmap )  ← home-cards.tsx row 3
```

## Decisions taken in the interview

| Question | Answer |
| --- | --- |
| Hours mode counts | **All worked time**, billable or not. Revenue counts billable only. |
| Top-4 cut | **In core.** SQL returns all rows ordered; `buildByProject` slices and sums the tail. |
| 0–1 projects | **Always render.** One project draws one full-height bar; the figure carries the truth. |
| `project_id IS NULL` | **Included, but never a column.** It aggregates into the footer tail, so the total is the window's real total. |
| Failing tests | Update both, **and** add the cell-count coverage that does not exist today. |

## Layers, in dependency order

### 1. Migration — `supabase/migrations/00000000000013_revenue_by_project.sql`

Mirrors `revenue_by_client()` (`00000000000012`), which is the pattern to copy
in full: two CTEs, `security invoker`, `set search_path = public, pg_temp`, and
the `revoke … from public, anon` + `grant execute … to authenticated` pair.

**Signature.** `revenue_by_project(p_user_id uuid, p_from timestamptz, p_to
timestamptz)` returning `project_id uuid, project_name text, client_id uuid,
client_name text, currency char(3), seconds bigint, billable_seconds bigint,
invoiced numeric, unbilled numeric, unrated_count bigint`.

**Four differences from `revenue_by_client`, each load-bearing:**

1. **Group by `p.id`, never `p.name`.** `projects.name` has no unique
   constraint — two projects named "Redesign" under different clients are
   distinct rows and must stay distinct. `client_id`/`client_name` ride along
   so the UI can disambiguate them.
2. **Uncategorised work is included**, so no `project_id is not null` guard.
   Entries with a null `project_id` collapse into one row with a null
   `project_id` and a null `project_name`, exactly as `revenue_by_client`'s
   null-client row does. The footer total is the window's real total; a chart
   whose total silently omits unfiled hours is a billing screen disagreeing
   with itself. Core keeps that row out of the columns — see layer 2.
3. **`is_billable` moves out of the WHERE and into the aggregate.** This is the
   one real structural change: `revenue_by_client` filters `and e.is_billable`,
   so it never sees unbillable work. Hours mode needs all of it. So the guard
   becomes `sum(...) filter (where e.is_billable)` for money and
   `billable_seconds`, while `seconds` sums everything. A project that is
   entirely unbillable has `seconds > 0`, `billable_seconds = 0`, and zero
   money — and must still appear.
4. **`having sum(seconds) > 0`** stays, but now over all seconds rather than
   billable ones.

Keep: the half-open `[p_from, p_to)` window on `started_at` (never an invoice's
`issue_date`), `ended_at is not null`, the void-invoice exclusion, and rounding
**once per `(project, rate, is_invoiced)` bucket** from summed seconds.

`resolve_rate()` is called unchanged. It deliberately has **no** `set
search_path` so Postgres can inline it — do not add one.

**`unrated_count` matters more here, not less.** The project tier is the second
link in the rate chain, so a project with no rate under a client with no rate
and no user default yields NULL for the whole project — the row that would
otherwise silently render as $0.

**ORDER BY.** `order by sum(seconds) desc, project_name asc` — a stable
secondary key, because ties at 0.00 revenue are common. Core re-sorts per mode
anyway; SQL's order only has to be deterministic.

**Prove it against a real Postgres before anything is built on it.** Rows that
will find the bugs: a project with no client; a NULL rate at every level; two
projects sharing a name under different clients; an entirely-unbillable
project; an entry whose project was deleted (`on delete set null`); a rate of
exactly `0`, which is a real rate and must not count as unrated.

    initdb -D "$S/pg" && pg_ctl -D "$S/pg" -o "-p 55439 -h 127.0.0.1 -k ''" start

Over TCP on a spare port — the scratchpad socket path exceeds the 103-byte
limit.

**Verify:** the function created and queried by hand on that throwaway cluster,
reading the output for each row above. Then `pnpm db:setup && pnpm verify:db`.

### 2. `packages/core/src/stats.ts` — `buildByProject`

Sits beside `buildVelocity` (`:185`) and follows it exactly: a pure row-mapper,
no I/O, no dates, numerics arriving as `string | number` because PostgREST
returns them as strings.

```
buildByProject(rows: ByProjectRow[], fallbackCurrency: string)
```

- **A new constant, `MAX_PROJECT_COLUMNS = 4`.** Do **not** reuse or edit
  `MAX_UNBILLED_ROWS = 5` — it is shared by `buildUnbilled` and
  `buildVelocity`, and changing it silently reshapes both and breaks two tests.
- **Core sorts, because the mode decides the order.** `buildVelocity` trusts
  SQL's order; this cannot, since hours and revenue rank differently and both
  come from one query. Emit `byProject` sorted by `seconds` desc and let the
  component re-sort for revenue — or emit both orders. **Emit one array sorted
  by seconds; the component sorts by amount in revenue mode.** One array, no
  duplication.
- `seconds` and `billableSeconds` are emitted raw. **Core emits seconds, never
  hours** — every rollup does, and the client converts.
- Money: `roundMoney` on the sums, per-row amounts passed through `Number()`
  unrounded because SQL already rounded them.
- `projectName: r.project_name`, `clientName: r.client_name ?? null`,
  `currency: r.currency ?? fallbackCurrency`.
- **The null-`projectId` row is partitioned out before the slice, always.** It
  is never a column however many hours it carries: a bar labelled "No project"
  competes for one of four slots with work that is not a project, and the
  unprojected inbox row already owns that subject and links to the surface that
  fixes it. It goes straight to the tail.
- Tail: the top four come from the **remaining** rows, and everything else —
  the fifth project onward **plus** the null row — sums into `tailSeconds` and
  `tailAmount`, with `moreProjects` counting them. The footer prints
  `+11h 45m across 3 more`, so the remainder needs its own totals, which
  `buildVelocity`'s `moreClients` count does not carry.
- Section totals `seconds` / `amount` cover **every** row including the null
  one, so `columns + tail === total` exactly. This is the reason the null row
  is carried through SQL rather than filtered there.

**Verify:** `pnpm core:test`, with cases mirroring `packages/core/test/stats.test.ts:90-156`
— rounding once so the sum is money; the cap at four with the remainder counted
and its tail totals correct; a null client name surviving; **a null-`projectId`
row kept out of the columns even when it would rank first, while still landing
in the tail and the section total**; and `columns + tail === total` in every
case.

### 3. `packages/schema/src/index.ts`

`ByProjectRow` slots beside `VelocityClient` (`:494-504`); `byProject` slots
into `Stats` after `velocity` (ends `:533`). Export the inferred type near
`:674`.

Two traps: `money` is `.nonnegative()` — fine here, no credits. And
`.multipleOf(0.01)` is why `roundMoney` is mandatory; an unrounded sum is not
`money`.

Note the schema is a **type source only** — nothing calls `Stats.parse` at
runtime, so a drifting shape fails at compile time on the consumer, not here.

**Verify:** `pnpm typecheck`.

### 4. `apps/web/src/app/api/v1/stats/route.ts`

- Add the RPC to the existing `Promise.all` (`:71-97`), passing **the same
  `velocityStart` and `monthEnd` bindings velocity uses** (`:91-95`). Do not
  recompute the window — that is how the two regions drift onto different
  windows, which the task line forbids.
- **Two hand-maintained parallel lists must both be updated**: the destructure
  (`:71-82`) and the error loop (`:163-176`). They have no shared source.
- Add `byProject: buildByProject(...)` to the response after `velocity` (`:197`).

**Note the blast radius:** the error loop throws on the first failing RPC, so a
broken `revenue_by_project` 500s the entire home screen. That is the existing
design, not a regression — but it is why the migration is proved first.

**Verify:** `pnpm verify:db`, with a new block in `apps/web/test/routes.test.ts`
beside `// ── velocity ──` (`:1370`) following its seeding pattern exactly.
Cases: the hours/revenue split over a mixed billable book; two same-named
projects under different clients staying distinct; unbillable work present in
`seconds` and absent from money; `project_id IS NULL` work reaching the total
but never a column; another user's work invisible.

**One assertion carries the decision**: with a null-project entry big enough to
outrank every real project, `byProject` still holds only real projects and
`seconds === columns + tail`. Revert the partition and it must go red.

Add a fourth parity test to `apps/web/test/rates.test.ts` (`:225-272` is the
shape): the SQL aggregate's per-project totals must equal the TS rate chain's,
across all four default-rate levels.

### 5. `apps/web/src/components/home-by-project.tsx` — NEW

Follows `home-velocity.tsx`. Uses `Region` from `home-shell.tsx` in
**`labelled`** mode (demoted title, like `Month`), with the toggle in the
existing **`action`** slot — `Region` already supports a control there
(`home-shell.tsx:44`), so it needs no change.

**The toggle.** No segmented control exists in the app. Build a local one from
the two patterns that do: `FilterTabs`' active/inactive classes
(`page.tsx:193-224` — `bg-surface-elevated text-strong` vs `text-subtle
hover:text-muted`, on `rounded-md px-2 py-1 type-label`) with `Swatch`'s
`aria-pressed` idiom (`color-picker.tsx:44-71`), which is the app's existing
a11y shape for a mutually-exclusive choice. State is a local
`useState<'hours'|'revenue'>` — the file inherits `'use client'` from the
`home-cards.tsx` boundary. **Not** URL state: this is panel-local, and
`FilterTabs` is `<Link>`-based only because its state belongs in the URL.

**The chart.** DOM bars in a fixed-height flex container with percentage
heights — **not** an SVG with `preserveAspectRatio="none"`, which would
distort bar widths and text. Heights are share-of-tallest.

**Hue.** A by-project chart cannot use the `clients` map `Panel` already
resolved. Use `useProjectClients()` (`use-project-colors.ts:52-84`) — it
returns both maps from the same queries, at the cost of one extra
`keys.projects()` fetch on this screen. Resolve it **once in `Panel`** and pass
it down, honouring the resolve-once rule (`home-cards.tsx:85-88`); do not
subscribe inside the new component.

Render idiom, unchanged from the other three charts:
`(clientId ? clients.get(clientId)?.color : null) ?? INTERNAL_SWATCH`.

Muted at `0.62`. `MIX_OPACITY` is private to `home-velocity.tsx:92` — **export
it** rather than declaring a second constant, which is the divergence
`INTERNAL_SWATCH`'s own doc comment warns about.

**Formatting.** `formatCompact(seconds)` for hours, `formatCurrency(amount,
currency)` for money — both from `@stint/core`. `Month` already switches units
this way (`home-month.tsx:45-46`); match it.

**Accessibility.** `role="img"` + a joined `aria-label`, following `Mix`
(`home-velocity.tsx:113-116`).

**Verify:** `pnpm test:ui`.

### 6. `home-year.tsx` — 26 weeks

`WEEKS = 52` → `26` (`:19`); `DAYS` follows. Four consequences, all real:

1. **`DAYS` is also the fetch range** (`:38`), so the query halves.
2. **`keys.heatmap(tz)` carries no length** (`query-keys.ts:24-25`), unlike
   `keys.activity(tz, days)`. A cached 364-day payload would be served to a
   182-cell view. **Add the length to the key.**
3. **`peak` rebases** (`:65`) to the half-year busiest day, so the same day can
   render darker than it does today. Correct, but visible.
4. **Naming**: `yearSeconds`, the `"Year"` title (`:98`), and the `Heatmap` doc
   comment (`:18-32`) all become wrong. The heading becomes the half-year.

The streak (`:215-233`) reads only the array tail and is safe, unless a streak
exceeds 182 days — where it would silently cap.

### 7. `home-cards.tsx` — row 3 becomes a pair

`Heatmap` is not in a `Pair` today (`:118`). Wrap both: `<Pair left={<ByProject
…/>} right={<Heatmap …/>} />`, using the existing
`@2xl:grid-cols-[1.15fr_1fr]` with `gap-x-6`.

## Measurements — from the mockup at the app's 900px panel

Read off `docs/design/screens/home.html` with `getBoundingClientRect()`, not by
eye.

| What | Value | Where |
| --- | --- | --- |
| Panel | 900px | the measurement width; the app's is 732–780px |
| Pair grid | `1.15fr 1fr`, 24px gap | `@2xl:grid-cols-[1.15fr_1fr] gap-x-6` |
| Left (chart) region | 469px | at a 900px panel |
| Right (heatmap) region | 407px | at a 900px panel |
| Plot height | 116px | fixed; bars are % of it |
| Column width | 102px | 4 columns, gap 10px → `gap-2.5` |
| Bar heights | 95 / 71 / 56 / 30px | 100% / 61% / 48% / 26% of 116 |
| Column name | 102px, unclipped | `min-w-0` + `truncate` per column |
| Heatmap cell | 12.52px | 26 cols × 7 rows, 2px gap, `aspect-square` |
| Heatmap cells | 182 | `WEEKS * 7` |
| Region body padding | `px-5 pt-1 pb-3` | matches `home-velocity.tsx:55` |
| Figure above bar | `type-meta` | 11.5px mono, tabular-nums |
| Column name | `type-support` | 13px sans |
| Client under name | `type-meta` + `text-subtle` | |
| Footer line | `type-meta` + `text-subtle`, right | `+11h 45m across 3 more · 214h 20m logged · last 3 months` |
| Bar opacity | 0.62 | `MIX_OPACITY`, exported |

**The squeeze is real and is the risk to watch.** At the app's 732px panel the
chart's half is ~330–380px, less `px-5` (40px) → roughly 290–340px for four
columns plus three 10px gaps, so **~65–80px per column**, not the mockup's
102px. At 13px `type-support` that is ~9–11 characters before the ellipsis.
Below `@2xl` the pair stacks and the chart gets full width, so the awkward case
is a container **just past 672px**, not the narrowest one. Reconcile against
this table at the real panel width, and expect the column figure to differ from
102px by design — the mockup is at 900px.

## What must not regress

- **Velocity and By project must report the identical window.** Same
  `velocityStart`/`monthEnd` bindings, not a recomputation.
- **`unbilled.total` still equals `velocity.unbilled`** — the existing
  cross-rollup assertion (`routes.test.ts:1412`).
- **A rate of exactly `0` is a real rate** and never counted as unrated.
- **Rounding stays once-per-bucket in SQL**, once more on the sums in core.
- **Unbillable work never acquires money.** It has hours and no rate, by
  definition.
- **The footer total is the window's real total.** `columns + tail === total`,
  with uncategorised work inside it. A total that omits unfiled hours is the
  screen disagreeing with itself.
- **No Server Actions** — everything through `/api/v1/*`.
- **Colour still means client.** Project shades are a separate task.
- The panel keeps **one view**: no hiding, no reordering, no timeframe picker.

## Surfaces

| Surface | This feature |
| --- | --- |
| **Web** | **Ships now.** The primary product. |
| macOS | **Out of scope** — the ceiling is "the timer and nothing else: start, stop, task name, project". A dashboard chart does not serve starting or stopping. |
| iOS / Android | **Deferred, not refused.** The Expo ceiling is "start / stop / view, light editing"; a stats region is arguably "view". Integration point if wanted later: `apps/mobile`, consuming the same `byProject` field, which lands once in `@stint/schema` and every client inherits. |

The SQL, core and schema layers land once and every client inherits them. Only
the component multiplies.

## Out of scope

- **Fall-through to `task_name`** when one project exists. Stays in
  `tasks.md`; it is a second grouping with no id and unbounded cardinality.
- **Project shades within a client hue.** Separate task; needs a token
  generator that does not exist.
- **An index for this grouping.** `entries_unbilled_idx` has an `invoice_id is
  null` predicate so it cannot serve this, and `revenue_by_client` has the same
  gap — a pre-existing condition, not a regression.
- **Currency mixing.** Section totals sum across currencies exactly as
  `buildVelocity` already does. Inherited wrongness, not introduced.
- **A heatmap `role="img"`/aria-label.** It has none today (`home-year.tsx:113-148`);
  worth closing, but it is not this feature.

## Verification, per phase

| Phase | Command |
| --- | --- |
| 1 migration | throwaway Postgres by hand, then `pnpm db:setup && pnpm verify:db` |
| 2 core | `pnpm core:test` |
| 3 schema | `pnpm typecheck` |
| 4 route | `pnpm verify:db` |
| 5–7 web | `pnpm test:ui`, then `pnpm verify:static` |
| all | `pnpm verify:static && pnpm verify:db`, plus `pnpm test:e2e` |

`pnpm dev:up` first for anything touching the database; `pnpm db:setup` after
the migration lands, since the test databases are built from migrations.

**e2e targets port 3100 with no `webServer` block**, and this worktree's dev
server is on **3101**. Either serve this worktree on 3100 or set
`E2E_BASE_URL=http://localhost:3101` — otherwise the suite silently passes
against the other checkout.

## Tests that must change

| File:line | Assertion | Why |
| --- | --- | --- |
| `test/ui/home-cards.test.tsx:604` | `getByText('100h')` in Velocity | The hours line moves to By project's footer |
| `test/ui/home-cards.test.tsx:454` | `getByText('Year')` | The heading changes; it sits inside an unrelated observer-count test |
| `test/ui/home-cards.test.tsx:638-645` | `region.querySelector('[role="img"]')`, no `<ul>`, no arrow icon | A second `role="img"` in the panel could mis-target; the new chart must not be a `<ul>` |
| `test/ui/home-cards.test.tsx:650` | every `[role="img"] > div` has `0 < opacity < 1` | New bars must be muted or this fails |
| `test/ui/count-up.test.tsx:322` | Velocity's headline formatting | Restructuring the region risks it |

**And one test to add, which does not exist:** nothing asserts the heatmap's
cell count, grid columns, or date alignment — so a 52→26 regression would pass
silently today. Assert 182 cells and the column count.

## Doc changes, in the final commit

- Delete the `tasks.md` line. A finished task is deleted, not ticked.
- Delete this scratch spec.
- `docs/api.md` — add `byProject` to the `/stats` row and drop the
  `(not implemented)` marker from `home.html`'s API table.
- `docs/design/screens/home.html` — already updated on this branch; reconcile
  the phase-3 table against the built screen and fix any row that differs.
