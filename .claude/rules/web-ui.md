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

### Typography comes from the scale

**A component names a role (`type-amount`), never assembles one
(`font-mono text-[15px]`).** Each role in `tokens.json` under `type.scale`
generates a Tailwind `@utility` carrying family, size, weight, tracking, case
and tabular-nums together, so half a role cannot be applied. Color stays
separate: a role says how text is set, not what it means.

Need something the scale lacks? Add a role, with a reason — `pnpm check:type`
runs in CI and rejects anything off it. A typo'd role compiles to **no CSS, no
warning, exit 0**, which is why it is a check rather than a convention.

`docs/design/brand.html` has the roles and what each is for.

### Layout

Header, rail, content column, dock, timer bar — `screens/frame.html` shows the
three arrangements and what changes at each breakpoint, plus the account menu
and the error boundaries.

Two things that govern code rather than this frame:

**`(app)/error.tsx` is nested inside the group on purpose**, so a failing
screen replaces the content column and the running timer keeps counting. Do
not move it to the root; `e2e/error-boundary.spec.ts` fails if you do.

**`Page` owns the content column**, so no screen sets its own width.

### Components

`screens/components.html` is what a screen is assembled from — which
primitive to reach for, the conventions that repeat across screens, and the
shapes already duplicated. Read it before adding a component.

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
