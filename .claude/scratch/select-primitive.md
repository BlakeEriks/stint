# Select primitive and the component polish around it

Working state. Deleted when the feature ships.

## The shape

    ui/select.tsx          NEW — vendored shadcn, detoxed. Plain choices only.
      ├── settings-form         theme, goal unit
      └── payment-profile       account type, fee allocation

    project-picker.tsx     EXTENDED — a trigger variant, plus client names
      ├── timer-bar             trigger="tag"      (unchanged)
      └── entry-dialog          trigger="field"    (was a native select)

    client-picker.tsx      NEW — DropdownMenu, modelled on ProjectPicker
      ├── project-dialog        carries "+ Add a client…"
      └── invoice-new           plain

    invoice-new            Group lines → DropdownMenu with a hint per row

**Two primitives, deliberately.** `ProjectPicker` is built on `DropdownMenu`
because a native select cannot draw the swatch, and Radix's menu hosts an
action item (`+ Add a client…`) and two-line rows that Radix's Select does
not. `Select` is for choices that are only words. The test is whether a row
carries anything besides its label.

## Layers, in dependency order

### Phase 1 — `Select`, and the four plain conversions

`pnpm dlx shadcn@latest add select`, then
`node scripts/shadcn-detox.mjs src/components/ui/select.tsx`. Never
hand-edited; an unmapped token exits 1 and the mapping goes in `MAP`.

Conversions, all currently `Field` + `<select className={inputClass}>`:

| File | Control | Note |
| --- | --- | --- |
| `settings-form.tsx:110` | Theme | No SaveIndicator — theme is localStorage |
| `settings-form.tsx:218` | Measured in | Value drives the Target input's `step` and `placeholder` |
| `payment-profile-dialog.tsx:159` | Account type | `?? ''` ⇄ `|| null` round-trip for a nullable column |
| `payment-profile-dialog.tsx:321` | Fee allocation | Inside a conditional wire section |

The trigger keeps `inputClass`'s metrics (`field.tsx:118`) so these look
unchanged closed. What changes is the popped-open list.

**`Field` supplies the label.** Keep `label=`/`htmlFor=` exactly as they are;
Radix's trigger takes the `id`.

Verify: `pnpm verify:static`

### Phase 2 — `ProjectPicker` serves the dialog

Add a `trigger` variant. `'tag'` is today's pill and stays byte-identical in
the timer bar; `'field'` is a full-width control with `inputClass` metrics.
One component, one row renderer — not a second menu.

**Client name beside the project.** `useProjectClients()` already returns
`clientByProject` from the same two queries the swatch uses, so no new fetch.
Muted role, so the project stays the thing being chosen. `clientId === null`
gets **no client text at all** — the absent client is the meaning, the same
reason its swatch resolves to `INTERNAL_SWATCH` rather than a shared grey.
Note `clientByProject` omits colourless clients too, so absence there is not
the same as internal work; key the text off the project's `clientId`.

**Two behaviours that must survive** (`entry-dialog.tsx:264-283`):

1. `autoFocus` when the inbox opens the dialog on an unprojected entry —
   carried by `focus === 'project'`, with the `biome-ignore
   lint/a11y/noAutofocus` and its reasoning intact.
2. The `focus:` styles **alongside** `focus-visible:`. Programmatic focus is
   never `:focus-visible`, so without the pair the cursor is in the control
   with nothing on screen saying so.

Verify: `pnpm verify:static`

### Phase 3 — `ClientPicker`, and Group lines

`ClientPicker` follows `ProjectPicker`'s shape: swatch per row, a `NONE`
sentinel for "No client — internal work", and — for `project-dialog` only —
a `DropdownMenuSeparator` then a real `+ Add a client…` item, replacing the
trailing `<option>` sentinel at `project-dialog.tsx:181`. `invoice-new`'s
client field gets the picker without that item.

Clients **have** the colour, so both want the swatch. `useClients()` returns a
nullable colour; fall back to `INTERNAL_SWATCH` the way `Swatch` already does.

**Group lines** (`invoice-new.tsx:156`) moves each mode's `hint` from under
the closed control into the row. `GROUPINGS` at `:20` already holds
`{ value, label, hint }` for all four modes — the array is unchanged, only
where the hint renders. Drop `Field`'s `hint` prop on this one field so the
text is not in both places.

Verify: `pnpm verify:static`

### Phase 4 — Icons on the lifecycle buttons

`components.html`'s verb table is the standard and **needs three new rows**:
`Send` / `Download` / void. The inbox already sets two by precedent
(`inbox.tsx:233,240,264`); void has none — use `Ban`.

| Button | File:line | Icon |
| --- | --- | --- |
| Mark sent | `invoice-detail.tsx:181` | `Send` |
| Mark paid | `invoice-detail.tsx:191` | `DollarSign` — the money glyph, not `Check` |
| Void | `invoice-detail.tsx:201` | `Ban` |
| Delete draft | `invoice-detail.tsx:211` | `Trash2` |
| Download PDF | `invoice-detail.tsx:97` | `Download` |
| Preview | `invoice-detail.tsx:100` | `Eye` |
| Settings submits | `settings-form.tsx` | `Check` / `Loader2` |

Pattern from `client-form.tsx:171` and `client-detail.tsx:52`: glyph first,
label second, `aria-hidden` always, `strokeWidth={1.75}` on outline verbs, no
size class (Button's `[&_svg]:size-4` handles it). **Cancel stays bare.**

`Check` commits a form and nothing else — that is why mark-paid takes
`DollarSign`, and `components.html:274` already says so.

Verify: `pnpm verify:static`

### Phase 5 — The showcase, and the two doc fixes

A new `<section class="sec">` in `components.html`, inserted after "Action
buttons" (ends `:279`) and before "Panel, Listing…" (`:282`), so the three
tables are followed by the rendered proof of them.

**The file shows nothing today** — every component is a name in a table or an
escaped `<pre>`. This is the show-don't-tell gap. `docs/CLAUDE.md`: *the page
can show it — delete the caption, keep the picture.*

Render, with the token named beneath each:

- **5 variants × 4 text sizes.** `default`, `accent`, `destructive`, `ghost`,
  `link` at `default`, `xs`, `sm`, `lg`. The four `icon-*` sizes are the same
  metrics in a square box — one row, not a doubled grid.
- **The filter pill**, both states (`.chip` / `.chip.on`, `invoices.html:61`).
- **`StatusBadge`'s four statuses** — `draft`, `sent`, `paid`, `void`. Four,
  not five: `.badge.late` is a derived condition, not a stored status.
- **`SaveIndicator`'s four** — `idle` (a dot, not a check), `pending`,
  `saved`, `error`.
- **`Select` and the two pickers**, closed and open, since this feature adds
  them.
- **`Panel`** with and without an edge.

Idiom from `invoices.html`: `.mock` → `.card`, `.btn`/`.badge`/`.chip`
classes, and `task-suggest.html:89` for an open list. Every colour a
`var(--token)` from `_mockup.css` — `tokens:validate` rejects a hex.

**Two doc corrections in this phase:**

1. `invoices.html:88` — `.badge.sent` uses `--timer-warning`; the component
   uses `text-muted`. Code is right: a sent invoice is the normal state, and
   `late` already carries danger. Change the doc.
2. `brand.html:490` — add the sign-in row to the placement table, in its
   `Placement | Size | Colour` shape.

Verify: `pnpm tokens:validate`, then serve `pnpm design` (:8778) and read the
rendered page at two widths.

### Phase 6 — The sign-in mark

`signin-form.tsx:55` is `<h1 className="type-title text-strong">Stint</h1>`.
Becomes `<h1><Wordmark /></h1>` — `size="default"`, which the component's own
doc defines as "the landing page, where it is the page's subject". Sign-in is
that case. `Wordmark` renders a `<span>`, so the `h1` wrapper keeps the
heading semantics the current markup has.

Verify: `pnpm verify:static`

## What must not regress

- **The timer bar's project tag is unchanged.** It is the accent's own
  surface; a metrics change there is visible on every screen.
- **`autoFocus` and the `focus:` pair** survive the entry-dialog port. Both
  are commented at the call site because both are easy to lose.
- **`+ Add a client…` still creates and selects.** `project-dialog` swaps its
  whole content for `ClientForm` rather than stacking a dialog — keep that.
- **Internal work has no client text and no colour.** The absence is the
  meaning.
- **Green stays the running timer and the one confirm.** Nothing in the
  showcase or the new triggers claims it.
- **Focus rings stay neutral**, never the accent.
- No hardcoded hex anywhere; no assembled type roles.

## Surfaces

**Web only, and this is a ceiling not a deferral.** `architecture.md:15` scopes
macOS to "the timer and nothing else: start, stop, task name, project." A
Select primitive, invoice lifecycle buttons and a doc showcase serve none of
that. The macOS project picker is its own task in `tasks.md` and stays there.

Expo does not exist yet.

## Out of scope

- The inbox invoice row bug — undiagnosed, needs a running stack.
- `DetailPage`'s back link — **cut.** Browser Back already works, and
  `← Invoices` labels its own destination; the link is "up", not "back".
  Delete the task.
- Anything behind the API: no schema, no migrations, no routes, no
  `packages/core`.

## Doc changes

- `components.html` — the showcase section; three rows on the verb table.
- `invoices.html` — `.badge.sent` to match the component.
- `brand.html` — the sign-in placement row.
- `tasks.md` — delete four task entries: the select job, the showcase, the
  icons, the sign-in mark. Plus the back-link task, cut rather than built.

## Verification

| Phase | Command |
| --- | --- |
| 1–4, 6 | `pnpm verify:static` |
| 5 | `pnpm tokens:validate`, then read the page at `:8778` |
| Landing | `pnpm verify:static`, `pnpm verify:db`, `pnpm test:e2e` |

`verify:static` is lint, tokens:validate, detox, check:type, typecheck,
test:ui, core:test. Baseline is green at `38a8b1b`.

**`verify:static` does not run `next build`.** Nothing here reads
`useSearchParams`, so the Suspense trap documented at
`(app)/invoices/page.tsx:5` is not in play — but if a phase reaches for it,
that phase runs `pnpm --filter @stint/web build`, because dev and every test
render happily while the production build fails.
