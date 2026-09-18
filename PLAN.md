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

**The week keeps all 24 hours.** Cropping was the plan and it was wrong.
Simulated against the real algorithm, a fixed 07:00–19:00 window widened to
cover the week's entries gives an ordinary week 12 hours of grid — and:

| Worked | Window | Of 24h |
| --- | --- | --- |
| 09:00–17:00 | 07:00–19:00 | 12h |
| One 03:00 entry, rest ordinary | 02:00–19:00 | 17h |
| 06:00–09:00 and 21:00–23:00 | 05:00–24:00 | 19h |
| 22:00–02:00 | 00:00–24:00 | 24h |

Nothing is ever hidden — the window only widens, so a 03:00 entry forces
03:00 into view, which a billing system requires. But one outlier costs
every column five empty hours all week, and someone working across midnight
is pushed to the full 24 and gets nothing at all. The unusual hours are
where the win evaporates, and the grid rescales as you page between weeks.

So the vertical fix is hour height, not hour count.

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

## Phase 2 — an hour is a real height, and the grid opens on the work

`GRID_HEIGHT = 720` goes. The week draws all 24 hours at `PX_PER_HOUR`, the
constant day view already uses, so an hour is one size everywhere and a
30-minute entry keeps the touch target 44px was chosen for. The scroller
`fills` gave the panel in `9ef6229` is what makes this affordable: the grid
is taller than the panel and the panel scrolls it, which is what a fixed 720
was avoiding by crushing 24 hours into a space for 16.

On open, the scroller goes to the first entry of the visible week, an hour
above it. That is what cropping was really for — landing on the work rather
than on midnight — and it costs nothing when the day is empty, where 07:00
is the sensible resting place (`EMPTY_WINDOW` already says so).

The scroll position is set when the visible week changes, not on every
render: a drag must not yank the grid, and neither should a refetch.

`calendar.test.tsx:557` keeps asserting 24 hours and its comment's first
clause stands. The second — "short enough to read whole" — is retired by
this phase, so the comment needs rewriting even though the assertion holds.

## Phase 3 — folded into 2

Phases 2 and 3 were one change once cropping was dropped. Entry blocks are
positioned in percentages (`top`, `height`, `left`, `width`), so they
rescale with no arithmetic change — the one coupling is the `height > 0.045`
gate at `calendar.tsx:651`, which decides whether a block shows its second
line, and a taller grid changes which entries clear it.

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
