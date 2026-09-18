# The calendar becomes the panel

Branch `calendar-panel`, off `main` at `38a8b1b`.

## Why

`docs/design/screens/_shell.html` states the rule:

> Nothing inside the panel is a card. Regions are separated by an inset
> rule with 18px above and below.

It landed in `ba801f5` ("The cards become regions, and the panel is one
surface"), which converted Home. `9ef6229` ("The calendar owns its scroll")
then touched the calendar, gave `Page` its `fills` prop — and kept the inner
card. **The calendar is the only route still drawing a card inside the
panel.** This finishes that migration.

The squish is three costs stacked:

| Cost | Where | Size |
| --- | --- | --- |
| A card inside the panel | `calendar.tsx:203` | border + `shadow-card`, same radius as the panel |
| `Page` padding applied inside the panel | `calendar.tsx:150`, `<Page wide fills>` | 32px each side, 40px top and bottom |
| A week grid fixed at 720px | `GRID_HEIGHT`, `calendar.tsx:322` | 24h needs 1056px at `PX_PER_HOUR`; hours render at ~30px |

The empty 00:00–09:00 band is ~40% of the grid, and at ~104px per day column
entry names truncate to "Pairi…".

## Decisions taken

**The dock stays.** 286px is a third of the horizontal budget, but
`principles.md` has "The dock holds what you act on", and Home is "one view
— no configurable card set, no hiding". A per-tab collapse cuts against
both. The width comes from phases 1–3 instead.

**A fixed window that expands.** 07:00–19:00 by default, widened only when
entries fall outside it. A union crop is tighter but re-scales week to week,
so the grid moves under you as you page. Fixed is stable; expansion keeps it
honest. `EMPTY_WINDOW` is already `[7, 19]`, so this generalises a constant
that exists.

**No second layer on the grid**, per `tasks.md:617`: the screen visualises
what was tracked and does not schedule.

## Phase 1 — merge the card into the panel

`calendar.tsx:150` `<Page wide fills>` becomes `<Page wide flush fills>`.

`calendar.tsx:203` drops `rounded-xl border border-edge-subtle
bg-surface-elevated shadow-card`, keeping `flex min-h-0 flex-col
overflow-hidden`.

The day-heading row and the legend keep their rules and become regions —
the sanctioned separator. `flush` removes `Page`'s inset, so the header, the
heading row and the legend take their own padding at the panel's own inset
rather than inheriting a doubled one.

Reclaims ~64px horizontal and ~80px vertical, and closes the rule violation.

Resolves the plane disagreement on the way: the mockup's `.cal` is
`bg-primary` while the app ships `bg-surface-elevated`. Neither survives —
the grid sits on the panel.

## Phase 2 — a fixed week window that expands

`workedWindow()` (`use-calendar.ts:176`) already crops, for day view only.
`use-calendar.ts:93` keeps all 24 hours in week view, and
`calendar.test.tsx:557` asserts it:

> Seven columns share one window, so cropping would crop them all to the
> busiest day's range — and the week's columns are short enough to read
> whole anyway.

The first clause is the real objection and the fix answers it: one window
for all seven columns, so they stay aligned. The second clause is what no
longer holds — 30px hours are not "short enough to read whole".

The window is `[7, 19]`, widened to cover any entry outside it, floored to
whole hours and padded by `WINDOW_PAD_HOURS`. A week inside working hours
always draws the same window; a 06:00 start widens the top only.

Both branches of `byDay` then take a window, so `[at, next]` at line 93 goes
away and positions stay fractions of the drawn window — the existing
invariant.

Rewrite `calendar.test.tsx:557` to assert the new contract: a default week
draws 07–19, an out-of-hours entry widens it, and all seven columns report
the same window.

## Phase 3 — the grid takes the height it has

`GRID_HEIGHT = 720` goes. The grid measures `flex-1` against the panel that
`fills` already provides, so an hour is as tall as the window allows rather
than a constant that disagrees with `2xl:max-h-[900px]`.

Entry blocks are positioned in percentages (`top`, `height`, `left`,
`width`), so they rescale with no arithmetic change. One coupling to check:
the `height > 0.045` gate at `calendar.tsx:651` decides whether a block
shows its second line, and a taller grid changes which entries clear it.

## Folded in

Both already open in `docs/tasks.md`:

- **Header weight.** `type-title` (24/600) beside a mono readout reads
  unbalanced; the mockup already uses `type-heading` (16.5/600).
- **A block overlaps the day's label** — Saturday, seeded week.

And one rule violation: `calendar.tsx:540` uses `border-edge-subtle/60`, an
alpha modifier on a semantic token, which `.claude/rules/web-ui.md:16`
forbids.

## The doc

`docs/design/screens/calendar.html` was never updated for `9ef6229` and
states the current final form, per `docs/CLAUDE.md`. It changes with the
code:

- It still says "The page owns the scroll — one gesture at any inbox size."
  `9ef6229` retired that from `sm` up.
- `.cal` is a bordered card; it becomes the panel.
- `.cal-head` is `bg-base` inside a card, which inverts the planes.
- The week caption claims all 24 hours.

`README.md`'s frame table is stale too (the header and timer bar are now
`bg-base`, and `bg-recessed` is the `2xl` ground) — out of scope here, worth
a task.

## Order and verification

Each phase is independently shippable and verifiable in the browser.

1. Phase 1 — subtractive, immediately visible.
2. Phase 2 — the real reclaim; carries the test rewrite.
3. Phase 3 — depends on 1 for the height to measure against.

Existing coverage: `apps/web/test/ui/calendar.test.tsx`,
`calendar-edit.test.tsx`, `packages/core/test/calendar.test.ts`. Drag
behaviour (15-minute snap, 4px threshold, duration-preserving moves) is
untouched by all three phases — positions stay fractional — but
`calendar-edit.test.tsx` is the guard on that and must stay green.
