# Dashboard corrections

Six items from looking at the shipped dashboard beside the mockup. Five are
code; one changes how the `feature` command works.

Delete this file when the work ships.

## Why the layout is wrong, before anything else

`home-cards.tsx:47` is `<div className="flex flex-col">` with four children.
**A two-column layout was never built**, and no agent dropped it: the spec I
wrote said "Region order, top to bottom" and listed four regions. The mockup's
pairings — Unbilled beside By-client, September beside Velocity — were lost
when the spec was written from `tasks.md` rather than from the mockup.

That single omission is items 2, 5 and 6. They are one piece of work, not
three.

The mockup is the reference and still renders:
`/private/tmp/claude-501/-Users-blakeeriks-dev-stint/d9f72765-0bfc-4226-bc88-fbaa48f5534c/scratchpad/floating.html`
(source `_head.html` + `build.mjs` beside it). **Read it before building.**
`docs/design/screens/home.html` is the committed doc and is wrong in the same
way — it documents the vertical stack. It gets rewritten with the code.

---

## 1. The `feature` command stops using worktrees

`.claude/commands/feature.md` — the description line (:2), section 5 (:121-128)
and the teardown (:226-229).

**Work on a branch in the existing directory instead.** `git checkout -b
<feature>` from local `HEAD`, phases commit to it as they do now, and the
branch is simply left checked out at the end.

Three things this fixes, all of which cost real time in the last run:

- **The stack does not come along.** `.env*` is gitignored, so a worktree
  cannot run the app, and a deny rule blocks copying credentials into one.
  Every visual check had to go through the design docs instead.
- **Playwright has no `webServer` block** (`apps/web/playwright.config.ts:25`)
  and targets `localhost:3100`. From a worktree that port serves the *main*
  checkout, so `pnpm test:e2e` silently passes against pre-feature code. It
  did, twice, and was reported as a pass.
- **Visual checkpoints are the point.** Running the app found a defect no test
  could — the dock's task name squeezed to 15px — and that only happened after
  the worktree was removed.

Keep everything else about section 5: fresh context per phase, one commit per
phase, dependency order, the throwaway-Postgres rule for new SQL.

**Say what replaces it, not what was removed.** The file states current
practice; it is not a changelog.

## 2. The panel goes two-column at width

`home-cards.tsx`, and `docs/design/screens/home.html` to match.

Pairs, per the mockup:

| Left | Right |
| --- | --- |
| Unbilled — figure, awaiting-payment line | **By client** — the per-client rows |
| September — the cumulative plot | Velocity — figure, split, per-client |
| Heatmap — full width, spans both | |

**Size by `@container`, never the viewport.** The panel is not the window: the
rail and the dock flank it, and its width changes at `lg` and `xl` for reasons
that have nothing to do with the screen. The row-level precedent is
`home-cards.tsx:356-358` and `entry-list.tsx:129-131`; this is the same rule
one level up. A viewport breakpoint here would go two-column while the panel
is still narrow.

The regions collapse to one column below the threshold, in the order they
read today.

**The inset rule stays horizontal** between region *rows*, never a vertical
divider between the columns. A vertical rule would rebuild the gridlines this
whole feature removed.

## 3. By-client leaves Unbilled and becomes its own region

Currently `Unbilled` renders the figure *and* the rows (`home-cards.tsx:215`).
Split them: the figure, the aging line and the beat stay on the left; the
per-client rows become the right-hand region under a `BY CLIENT` label.

This is what makes the pairing possible and is half of why Unbilled and
Gross earned look identical today.

## 4. Gross earned stops looking like Unbilled

Item 3 on your list. The two regions are the same component shape — a mono
figure over a list of client rows with the same columns and the same trailing
arrow — so at a glance they read as one thing printed twice, which is worse
than either alone.

The mockup's Velocity is a different object: **figure, then the split bar,
then a compact two-up key** (`Northwind $5,730 · Byrne $2,218`), then the
`invoiced · unbilled` line. Not a row list.

Build that. Specifically:

- The **split bar is the region's picture** — three segments, one per client,
  muted (`opacity: .62` in the mockup; the hues at full strength out-shout the
  running timer, which is the one thing on screen allowed to shout).
- The client key is **inline text with a swatch**, not rows: no aging column,
  no amount column, no arrow.
- Keep `/mo gross` beside the figure. The label is `GROSS EARNED`; never
  "earned" alone.

**They must remain distinguishable when the data is identical.** Today both
read `$6,201.84` because everything is unbilled — which is exactly the case
where two similar-looking regions are most confusing, and the case a test
should pin.

## 5. Seed a year of history

`supabase/seed.sql`. The oldest entry is 60 days back and the oldest *time
entry* 9 days (`seed.sql:72`, and the `interval` values from :116). So the
heatmap renders 51 empty weeks and two cells, the streak reads `4 day`, and
Velocity's trailing 3 months is really 9 days of work.

**Seed ~14 months of entries**, so:

- the heatmap has a full year of shape with visible gaps and dry spells —
  a five-on-two-off rhythm is the thing it exists to show, and it cannot
  show it from two cells;
- the streak is long enough to be interesting and has at least one
  **single-day gap it survives** and one **two-day gap that breaks it**,
  because that rule is the card's whole claim to honesty;
- Velocity's trailing three months are three real months, with a
  **different mix per month** so the split bar has something to say;
- **some invoiced work**, so `$0.00 invoiced` stops being the whole story and
  the invoiced/unbilled split renders as a split;
- the month-to-date line has enough days to be a line rather than a stub.

Keep everything the current seed deliberately includes — the overlapping
entries, the runaway, the unprojected work, the archived client, the rate
edge cases. `seed.sql:96-100` documents why they are there; that comment is
the contract.

**Generate the history rather than hand-writing it.** A `generate_series` over
days with a deterministic pseudo-random pick of client, start hour and
duration keeps the file short and the data plausible. Skip most weekends.
It must be **deterministic** — a seed that differs per run makes a screenshot
diff meaningless.

**Dates relative to `now()`**, as the file already does, or the heatmap drifts
out of range the week after it is written.

## 6. The month plot needs a believable goal

Not on your list, and cheap to fix while the seed is open: the goal is `10.0h`
against `48.4h` logged, so the plot shows `on pace +42.5h` and the ray is
pinned to the floor. Seed a monthly target in the region of the seeded hours
so the region shows what it is for — a line against a ray with a real gap.

---

## Out of scope

- Re-opening card visibility or ordering. There is one view.
- Any change to the frame, the timer bar, the dock or the rail — they are
  right.
- The count-up beats, which work.
- Changing what `/stats` returns. Every figure these regions need is already
  in the payload; this is layout and presentation.

## Verification

| Item | Command |
| --- | --- |
| 1 | None — a docs change. Read it back and check it states practice, not history |
| 2, 3, 4 | `pnpm verify:static`, then **look at the running app** at ≥1440 and at 1100, both themes |
| 5, 6 | `pnpm dev:reset`, then the dashboard — heatmap full, streak plausible, split bar split |
| All | `pnpm verify:static && pnpm test:e2e` |

`pnpm test:e2e` is trustworthy again once item 1 lands and the branch is in
the main directory: `localhost:3100` is then the code under test.

Every new test must **fail when its rule is reverted**. For item 4 that means
a test that goes red if Velocity is rebuilt as a row list; for item 2, one
that goes red against a viewport breakpoint rather than a container query —
note that jsdom applies no media queries, so a presence assertion passes
either way and proves nothing. Assert the mechanism.

## Docs

- `.claude/commands/feature.md` — item 1.
- `docs/design/screens/home.html` — the two-column arrangement and the new
  Velocity. It currently documents the vertical stack.
- `supabase/seed.sql` — its header comment says what the data is for; extend
  it to cover the year of history and why it is generated.
