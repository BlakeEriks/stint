# Floating frame + new home dashboard

Rebuilds the app frame as one borderless panel on a continuous ground, and
replaces the home card set. `docs/tasks.md` "Re-imagining the frame" and
"Re-imagining the home cards" are the approved design; this spec is how it
lands. Delete both sections, and this file, in the final commit.

## The shape

```
tokens.json (elevation.dark/.light + shadow-panel)
    └─ pnpm tokens ─> dist/tokens.css, docs/design/screens/_mockup.css

(app)/layout.tsx          ground bg-base, no borders between regions
  ├─ app-header.tsx       painted, border-b removed
  ├─ nav.tsx              painted, border removed, active = pill + marker
  ├─ [content column]     ONE borderless panel, bg-primary, shadow-panel
  │    └─ Page > Home > HomePanel
  │         ├─ Unbilled region      ─┐
  │         ├─ Month region          │ regions of one surface,
  │         ├─ Velocity region       │ inset rule between
  │         └─ Heatmap region       ─┘
  ├─ dock.tsx             painted, border removed
  │    ├─ Inbox           rows keep their surfaces
  │    └─ EntryList       NEW HERE, @container, below the inbox
  └─ timer-bar.tsx        xl: panel width below the panel; else full width

GET /stats      ← unchanged shape + velocity{} + month cumulative series
GET /calendar?granularity=day&from&to  ← reused for the heatmap, 1yr range
useCountUp()    ← new, CSS-free numeric tween, motion-safe
```

## Decisions taken (do not relitigate)

| | |
| --- | --- |
| Timer bar width | Panel width **at `xl` only**; full width below, as today |
| Radii / spacing | **Tailwind's scale**, as the app already uses. Not the token scales — they are not in `@theme` and nothing reads them |
| `home_cards` | **Dropped entirely.** One view, no visibility, no ordering, no column |
| Streak | Ships unconditionally; the forgiving rule is what keeps it honest |
| Heatmap | **Full year**, 52 weeks, fills its row alone. One `/calendar` call |
| Revenue goals | Get a goal ray too — `month_revenue()` already exists |
| Count-up | All three beats, one hook, honouring `prefers-reduced-motion` |
| Nav tasks | Deleted from `tasks.md`. Not built, not deferred |

## Phases

Each phase is one commit, one agent, fresh context.

### Phase 1 — the token

`packages/design-tokens/tokens.json` only.

Add `shadow-panel` to **both** `elevation.dark` (:194-197) and
`elevation.light` (:198-201). The key MUST exist in `dark` — `elevationTheme()`
(`src/generate.js:63-66`) iterates only dark's keys, so a light-only entry
breaks silently. Update the `$elevation` prose at `:192`.

```
dark:  inset 0 1px 0 color-mix(in oklab, var(--bg-hover) 75%, transparent), 0 1px 2px rgb(0 0 0 / .4), 0 10px 28px -12px rgb(0 0 0 / .6)
light: inset 0 1px 0 color-mix(in oklab, var(--bg-active) 55%, transparent), 0 1px 2px rgb(16 18 26 / .07), 0 10px 28px -12px rgb(16 18 26 / .16)
```

**Zero generator edits.** It flows to all four `--tt-` blocks, the `@theme`
utility, and both `_mockup.css` blocks. `color-mix` is the codebase's first
use — confirm it survives the generator verbatim.

Commit `docs/design/screens/_mockup.css` and
`apps/macos/Sources/Stint/Tokens.swift` if it changed. `dist/` is gitignored.

Consider `apps/web/scripts/shadcn-detox.mjs:113` — it maps shadcn shadows to
ours; a new name may want an entry.

**Verify:** `pnpm tokens && pnpm tokens:validate && pnpm detox`
Then `grep -c 'shadow-panel' packages/design-tokens/dist/tokens.css` — expect
5 (four `--tt-` + one `@theme`).

### Phase 2 — the frame

`(app)/layout.tsx`, `app-header.tsx`, `nav.tsx`, `dock.tsx`, `timer-bar.tsx`,
`page.tsx`.

Remove four borders, all `border-edge-subtle`:
`app-header.tsx:10` `border-b` · `nav.tsx:55-56` `border-b`→`lg:border-r` ·
`dock.tsx:25-26` `border-t`→`xl:border-l` · `timer-bar.tsx:68` `border-t`.

Backgrounds: ground `bg-surface-base` on the outer column
(`layout.tsx:27`); header, rail and dock get **no** background;
content column keeps `bg-surface-primary` and gains `rounded-xl shadow-panel`.
`bg-surface-recessed` leaves the frame entirely.

The content column (`layout.tsx:39`) is the panel, so it needs margin to let
the ground show — it currently fills its track edge to edge.

Active rail item (`nav.tsx:69-73`) — today
`'bg-surface-primary text-strong shadow-card'`. Becomes a pill on
`bg-surface-elevated/55` with **no** shadow, plus a `2px × 14px` fully-rounded
`bg-edge-control` marker at its left edge. Keep `aria-current="page"` (`:68`).

Timer bar at `xl`: it is currently the last child of the outer column
(`layout.tsx:44-47`), wrapped `sticky bottom-0 z-20 sm:static`. **Below `xl`
nothing changes.** At `xl` it must render at the content column's width,
beneath it. The content+dock wrapper (`layout.tsx:36`) is the scroller below
`xl` and `xl:overflow-visible` above, so at `xl` the content column can become
a flex column holding the panel plus the bar. Do not move the node at other
widths — `sticky` on a phone depends on it sitting outside the scroller.

Bar fill: `bg-surface-primary/55`, no shadow, no border, in both states.
The accent stays exactly where it is (`timer-bar.tsx:284, :298-300, :333`).

**Must not regress:** `(app)/error.tsx` replaces only the content column and
the timer keeps counting — `e2e/error-boundary.spec.ts` asserts the rail AND
the stop button survive. `Page` still owns the measure; no screen sets width.
`Nav` still returns `null` on `/signin` and `/auth*` (`nav.tsx:44,46`).

**Verify:** `pnpm verify:static && pnpm test:e2e`

### Phase 3 — API

`app/api/v1/stats/route.ts`, `packages/core/src/stats.ts`,
`packages/schema/src/index.ts`.

Three additions to `GET /stats`, which stays **one call** (`route.ts:50-122`
is already one `Promise.all` of 8):

1. **`velocity`** — trailing 3-month gross, split invoiced vs unbilled, per
   client. The rate chain is `unbilled_by_client()`
   (`migrations/00000000000007:29-34`); a trailing window needs the same
   `coalesce(e.rate_override, p.hourly_rate, c.hourly_rate,
   s.default_hourly_rate)` and the same group-by-rate-then-reaggregate shape.
   **Prove any new SQL against real Postgres before building on it** — a NULL
   `project_id`, a client with no rate, two entries at different rates in one
   day, another user's rows.
2. **Month cumulative series** — `buildPace` (`core/src/stats.ts:300`) returns
   a single delta. Add the per-business-day cumulative array plus the goal
   ray. `businessDaysInLocalMonth` (`core/src/calendar.ts:128-146`) already
   skips weekends; the ray steps on business days only.
3. **Revenue goals get a ray.** Today `buildPace` returns `delta: null,
   expected: null` when the unit is `revenue` (`stats.ts:333-343`).
   `month_revenue()` (`migrations/00000000000008:20`) supplies the actual.

Zod contracts in `packages/schema` (`Stats` :481, `Pace` :469) — every client
derives its types from here.

**Verify:** `pnpm db:setup && pnpm verify:db`

### Phase 4 — the panel and its regions

`home.tsx`, `home-cards.tsx`, new `home-panel.tsx`, delete
`activity-chart.tsx` + its test.

The four cards become four regions of one surface. `Card`
(`home-cards.tsx:268`) is local to that file and draws
`rounded-xl border border-edge-subtle bg-surface-elevated shadow-card` — inside
the panel **nothing carries a border, background or shadow of its own.**
Regions separate by an inset `1px border-edge-subtle` rule with equal space
above and below. `Card`'s existing inset-rule idiom (`:306`, `:328`) is the
pattern.

- **Unbilled** — keep `Unbilled` (`:72`), strip its shell. Gains the count-up.
- **Month** — replaces `Pace` (`:136`). Cumulative line vs. business-day goal
  ray, the gap between them shaded as the delta.
- **Velocity** — new. Figure, invoiced/unbilled split, per-client rows.
- **Heatmap** — new, replaces `ActivityChart`. 52 weeks, a cell per day,
  colour = client, density = hours, blank days stay blank. Streak in the
  header: survives one missed day, breaks on two.

Heatmap data: `api.activity({from, to, tz})` (`api.ts:307`) over a year.
Colour is keyed by **client**, but `useProjectColors()`
(`use-project-colors.ts:14`) is keyed by *project* — use `clientByProject`
(`:33`) inverted, or query clients directly with `includeArchived: true` as
`ActivityChart` did (`activity-chart.tsx:61-64`). **Archived clients keep
their colour.**

Add the heatmap's query key to `invalidateEntryData`
(`query-keys.ts:45-53`) or it goes stale on every timer stop.

Salvage before deleting `activity-chart.tsx`: `stackFor` (:234), the
gap-filling loop (:71-75), window-wide client ranking (:80-93),
`INTERNAL`/`NEUTRAL` (:44-45), `Swatch` (:214), `monthDay` (:252).

**Cards never mutate** (`home-cards.tsx:22-24`) — every action is a `Link`.

**Verify:** `pnpm verify:static`

### Phase 5 — Today moves to the dock

`dock.tsx`, `entry-list.tsx`, `home.tsx`, `inbox.tsx`.

`EntryList` (`entry-list.tsx:19`, sole call site `home.tsx:23`) moves into the
dock below the inbox and visually subordinate to it.

**The dock stays 372px** (`dock.tsx:25-26`). That width is load-bearing —
`dock.tsx:23-24` records that the inbox's labelled actions need 263px of row.
Today adapts to the dock, never the reverse.

The rows hide two fields at **viewport** `sm:` — the project tag
(`entry-list.tsx:137`) and the time range (`:162`). In a 372px dock on a
1440px window `sm:` is true, so both render into a column with no room.
`home-cards.tsx:356-358` names this exact trap and solves it: `@container` on
the row, `@md:flex-row`, and `@md:w-24` on the figure. Copy that. Fields
**wrap to a second line rather than hide** — they are billing-relevant.

Today renders **without `Panel`** (`page.tsx:61-72` draws a surface; the dock
carries none). It has its own `/entries` query, so it must render even when
`/stats` has not resolved — `dock.tsx:28` currently gates everything on
`data`.

Also fix the duplicated empty state: `inbox.tsx:142-143` renders
`{count || 'clear'}` and `:146-147` renders "Nothing needs you." Both appear
at zero. Drop `'clear'`; the count is a count.

**Verify:** `pnpm verify:static && pnpm test:e2e`

### Phase 6 — the count-up

New `lib/client/use-count-up.ts`, plus its three callers.

One hook. No dependency — there is no `framer-motion` and no numeric tweening
in the codebase today. `motion-safe:` is the established prefix
(`timer-bar.tsx:333`, `save-indicator.tsx:33`) and
`globals.css:108` already has a `prefers-reduced-motion` block: **reduced
motion renders the settled figure, never a jump to zero.**

Three beats, one mechanism:
1. **On stop** — Unbilled counts to its new value, `+$112.50` beside it,
   fading after a beat. Neutral, never green: the accent is the running timer.
   An unbillable stop moves hours and the billable ratio instead, and says so.
2. **On invoice paid** — Unbilled counts **down**, Velocity counts up, together.
   This is the one outcome on the screen and the only legitimate use of
   **success cyan** here.
3. **On arrival** — animate from the value this browser last displayed to what
   the server now says, with a line naming the period. Last-seen in
   `localStorage`, one key per origin. **Never animate on first load** with no
   stored value — render settled and store it.

**Verify:** `pnpm verify:static`

## Surfaces

Per `docs/architecture.md`.

| Surface | This feature |
| --- | --- |
| Web | **Everything.** The primary product |
| macOS | **Token only.** `Tokens.swift` is regenerated in phase 1. The menu bar app is the timer and nothing else — it has no frame, no dashboard, no cards |
| Mobile | Out of scope |

`tasks.md`'s stop-beat task says the menu bar should get the same count-up.
That is **not** in this feature: it is Swift, hand-written models, and a
separate phase. The web's "arriving shows what moved" already covers the case
where a stop happened on the menu bar.

## Out of scope

- Reordering or hiding cards. Dropped; there is one view.
- Collapsible rail, narrow-width nav collapse. Deleted from `tasks.md`.
- Effective hourly rate — `tasks.md` puts it in `/reports`, not Home.
- `paid_at` asking for a date, days-to-payment, invoice snooze.
- Registering `--radius-*`/`--space-*` in `@theme`. Real divergence, own task.
- The menu bar count-up.

## Docs

- `docs/design/screens/_shell.html` and `frame.html` — rewritten in phase 0,
  committed with the spec.
- `docs/design/screens/home.html` — rewritten to the new card set. Final form
  only: no options, no rejected variants (`screens/README.md`).
- `docs/design/principles.md` — "the dock holds the inbox and nothing else"
  gains Today beneath it. Amend to what it defends; do not delete.
- `docs/api.md` — `/stats` gains `velocity` and the month series.
- **Delete** both `tasks.md` sections and this spec in the final commit.

## Verification

| Phase | Command |
| --- | --- |
| 1 | `pnpm tokens && pnpm tokens:validate && pnpm detox` |
| 2 | `pnpm verify:static && pnpm test:e2e` |
| 3 | `pnpm db:setup && pnpm verify:db` |
| 4 | `pnpm verify:static` |
| 5 | `pnpm verify:static && pnpm test:e2e` |
| 6 | `pnpm verify:static` |
| Final | `pnpm verify:static && pnpm verify:db && pnpm test:e2e` |

Every new test must **fail when its rule is reverted**. A test that passes
against the old behaviour is testing nothing.
