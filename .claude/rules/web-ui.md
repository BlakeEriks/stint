---
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/**/*.css"
  - "packages/design-tokens/src/**"
---

## Web UI

Tailwind 4. Semantic tokens are registered in `@theme` by the token
generator, so `bg-surface-base`, `text-muted`, `border-edge-subtle`,
`text-on-accent` are real utilities and a hardcoded hex has nothing to hide
behind.

**A color a component needs is a token, never mixed at the call site.** No
hex, and no alpha modifier on a semantic token — `bg-danger/12` is a
one-off that exists in one file, has no light-mode counterpart, and cannot be
found by anyone auditing the palette. Need a tint? Add it to `tokens.json` and
run `pnpm tokens`. `accent-muted` and `danger-muted` are the tinted-surface
pair, each a near-ground tint on its own hue:

| token | dark | light |
|---|---|---|
| `accent-muted` | L 0.299 / C 0.060 | L 0.936 / C 0.031 |
| `danger-muted` | L 0.298 / C 0.061 | L 0.956 / C 0.022 |

Dark holds one pair of numbers for both; light tunes each against the card it
sits on, so a third is tuned the same way rather than copied. Opacity is for
*elevation* —
overlays, scrims, a disabled control — not for deriving a color that should
have a name.

**Two things that bite here:**

1. **Tailwind parses `text-`/`bg-`/`border-` as the utility prefix**, so a
   token named `text-muted` must register as `--color-muted` or no utility is
   generated. The generator strips those prefixes: `bg-*` → `surface-*`,
   `border-*` → `edge-*`, `text-*` → bare. Check `dist/tokens.css` for the
   real names rather than guessing from the token file.
2. **`@theme inline` resolves `var()` at its own position**, so it is emitted
   last, after the light/dark blocks. Moving it earlier silently freezes every
   utility to the light palette.

The app is dark-first: `prefers-color-scheme: light` only applies under an
explicit `[data-theme="light"]`, so an un-stamped viewer gets the dark theme
the palette was derived for.

Import the token CSS by **relative path**, not the package export — Tailwind
does not follow package specifiers when collecting `@theme` values.

### Visual conventions

These are the house defaults, not law. A design may change one when the
change reads better; update the line here in the same PR. The only enforced
color fact is text on the accent (`--text-on-accent`, `tokens:validate`).

- **Green is the one hue, and the step says the tense.** `timer-running`
  marks what is live, and `accent-default` the action a screen exists to
  complete — one hex in dark, a rung apart in light, where paper gives the
  timer no glow to tell it from the button. `success`, a ramp step off the
  timer, reports what has already happened: paid, saved. Test any green by
  asking whether a user could say in one phrase what it means there.
- **Weight tracks how often an action is taken**, not how much damage it can
  do. Filled red is for the step that destroys, never the step that asks.
  Focus rings are neutral.
- **Depth rises toward what is read**, in four planes: `bg-surface-recessed`,
  `bg-surface-base`, `bg-surface-primary`, `bg-surface-elevated`. A card is
  never darker than the surface under it. Adjacent surfaces are judged by
  OKLCH ΔL; the numbers come from the generators in
  `docs/design/deriving-color.md`, never a hand-edited hex.
- **Color belongs to the client**, through `useProjectColors()`. Internal
  work gets none.
- **A home card ships only with a number the user can't work out in their
  head, or a row they can act on.**
- **Motion reports a change; it never announces one.** Every duration honors
  `prefers-reduced-motion`.
- **The mark takes one color**: `text-strong` in the app header, `text-muted`
  where it recedes. The invoice PDF and the macOS status item carry none.

### Typography comes from the scale

**A component names a role (`type-amount`), never assembles one
(`font-mono text-[15px]`).** Each role in `tokens.json` under `type.scale`
generates a Tailwind `@utility` carrying family, size, weight, tracking, case
and tabular-nums together, so half a role cannot be applied. Color stays
separate: a role says how text is set, not what it means.

Need something the scale lacks? Add a role, with a reason — `pnpm check:type`
runs in CI and rejects anything off it. A typo'd role compiles to **no CSS, no
warning, exit 0**, which is why it is a check rather than a convention.

`Foundations/Type` in Storybook sets every role in itself.

### Storybook is the design surface

A screen's look is picked in `/design-review`, before planning; from then
on it is built, reviewed and specified as stories: `pnpm --filter
@stint/web storybook`. Every screen has a `*.stories.tsx` beside its
component, as do the parts and primitives worth seeing alone, rendering the
real component against the in-memory `/api/v1` in `src/mocks/`. A new screen
or state is a story first, built to the pick in the spec's `## Design`.
`docs/local-dev.md` has the commands.

A story renders the real component, never a copy. A state it needs comes
from the account (`parameters.db`, `account((db) => …)`) or one failing
handler (`failing('stats')`), not from props the app never passes.

### Layout

Header, rail, content column, dock, timer bar — `Screens/Frame` shows each
arrangement, from the phone's nav strip to the `2xl` card.

Two things that govern code rather than this frame:

**`(app)/error.tsx` is nested inside the group on purpose**, so a failing
screen replaces the content column and the running timer keeps counting. Do
not move it to the root; `e2e/error-boundary.spec.ts` fails if you do.

**`Page` owns the content column**, so no screen sets its own width. It pads
by the 18px `INSET`; `flush` is for a screen whose regions carry the inset
themselves (Home, the calendar), so it is never doubled. `wide` is for a
screen that needs the room (Home, the calendar), not a preference. The page
title is `type-title`, once.

**Nothing inside the panel is a card.** The panel is the one surface; a
region is space and a rule (`border-edge-subtle`, stopping at the inset), and
a record is a plain row.

### Components

Reach for what exists before writing a div — every screen is these pieces in
a different order, and the ones that drifted were rebuilt:

| Need | Use |
|---|---|
| The content column | `Page`, `DetailPage` |
| A list's loading, failure and empty states | `Panel` + `Listing` |
| A titled region with its own save state | `Section` + `useAutosave` + `SaveIndicator` |
| A labeled control | `Field`, `Input`, `inputClass`, `textareaClass` |
| Any action | `Button`, sized and varied by the tables in `ui/button.tsx` |
| An invoice's status | `StatusBadge` |
| Money, dates, durations | `Money`, `formatCurrency`, `shortDate` — never `toLocaleString` at the call site |
| A client's color | `useProjectColors()`, `Swatch` |
| A rate, with its source | `ProjectRate` |
| A key to press | `Kbd` |

`Select` is for choices that are only words; a row carrying a swatch, a
second line or an `Add…` item is a `DropdownMenu`. Put a component in
`components/` when a second screen needs it, not in anticipation of one.

**Conventions every screen keeps:**

- **A list filter lives in the URL** (`FilterTabs`), so the view is linkable
  and Back returns to it. A component reading `useSearchParams` needs a
  `Suspense` boundary in its `page.tsx`, or `next build` fails while
  `next dev` passes.
- **Every action carries a visible label.** Two exceptions, both with an
  `aria-label`: a destructive first step, and a dense repeating row. A glyph
  is always `aria-hidden`.
- **A destructive action is quiet until it is the confirm**: a ghost trash
  icon in `text-danger`, pushed away with `mr-auto`, then `destructive`
  spelling the consequence out.
- **A dialog's or form's actions run secondary, Cancel, Save**: Save
  (`accent`) at the bottom right, Cancel beside it, and a secondary action
  (Archive, Delete) pushed to the far left with `mr-auto`.
- **A row that opens an editor is itself the button**: the whole row
  highlights on hover, and a faint pencil at its end says so where there is
  no hover. Its `aria-label` is `Edit <name>`.
- **A failure renders beside the thing that failed**, and a failed load is
  neutral, never red — it is a condition, and the answer is to try again.
- **An empty state says what to do**, or what the consequence is.
- **Archive, never delete**, wherever invoices or entries reference the
  record.
- **A picker row is swatch, name, then the client muted.** Internal work gets
  no client text and no color; the absence is the answer.

`components/ui/` is **vendored shadcn**, rewritten to our tokens at install by
`apps/web/scripts/shadcn-detox.mjs`. shadcn's palette names are not defined in
`@theme`: two collide with ours and mean the opposite — its `bg-primary` is
the action color (ours is neutral gray), its `bg-accent` is hover gray (ours
is the neon green).

To add one: `pnpm dlx shadcn@latest add <name>`, then
`node scripts/shadcn-detox.mjs 'src/components/ui/<name>.tsx'`, then read the
diff. Add any unmapped name to `MAP` rather than hand-editing the file.

**`pnpm detox` in CI is the only enforcement.** Tailwind 4 drops an unknown
utility with no warning and exit 0, so a surviving `bg-primary` renders our
gray on a primary button and the build still passes.

The converter also rewrites what the check cannot see: `bg-black/50` →
`bg-overlay`, `shadow-lg`/`shadow-md` → our elevation tokens, and a floating
panel's `bg-background` → `bg-surface-elevated` (shadcn means "the app
surface"; ours is the recessed ground, so a dialog left on it would sit
*below* the page it floats over).

It is **one pass over an alternation**, not sequential `replaceAll` —
cascading turned `bg-primary` into `bg-surface-hover-default` when a later
rule matched its own output.

Radix supplies dialog/dropdown/popover behavior: arrow keys, typeahead,
roving tabindex and focus-return.

### Time is local wall-clock; the API is UTC

**Never step days or weeks with `+ 86_400_000`.** Use `startOfLocalDayOffset`:
a week containing a DST transition is 167 or 169 hours, so fixed-millisecond
arithmetic mis-buckets the entries at its edges. The inverse math is
`packages/core/src/grid.ts`, and every function takes the column's real span
rather than 24 hours.

The same rule governs the entry dialog, whose inputs are local wall-clock:
`toInstant` corrects by the offset the guess lands in, so it is DST-correct at
the target instant.

### Queries

**Cache keys come from `lib/client/query-keys.ts`, never written inline**, so
one shape per query is what an invalidation can match. Anything that changes a
time entry calls `invalidateEntryData()` — summary, entries, stats, calendar
and activity all read those rows, and refreshing a subset makes two screens
disagree about the same work.

**A query renders through `Listing`**, which owns loading, failure and empty,
so no screen writes those branches.

**`TaskSuggest` is the exception, deliberately** — its query renders nothing
while loading and nothing on failure. A suggestion is an accelerator nobody
asked for, so a spinner or a failure panel flashing over the timer bar reports
a problem the user was not waiting on, in front of the field they are typing
into. Absent, the list is simply not offered and the field still works. Do not
"fix" it back to `Listing`.

### Invoices

**Preview and generation must agree.** Any change to what would be billed
clears the approved preview and hides Generate. Tested, and the test was
verified to fail when the invalidation is removed.

**An issued invoice locks an entry; a draft does not** — `guard_billed_entry`
returns early on a draft.
