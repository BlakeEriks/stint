# Typography

**IBM Plex Sans** for text, **IBM Plex Mono** for everything numeric.

## Why mono for numbers

Duration is this product's core datum, and it is read in columns. Every number
the user sees is monospaced with `font-variant-numeric: tabular-nums`, so a
duration never reflows as its digits change — a timer ticking from `1:09:59`
to `1:10:00` must not shift the layout.

Plex Mono over the usual candidates because its digits stay open and legible at
13px, which is the macOS menu bar size.

## Everything lives in the scale

**A component names a role. It never assembles one.**

```tsx
<span className="type-amount text-strong">    ✅ a role
<span className="font-mono text-[15px]">      ❌ a one-off
```

Each role in `type.scale` is generated as a real Tailwind `@utility`, so one
class carries family, size, weight, tracking, case and tabular-nums together
and a component cannot apply half of a role. Colour is still applied
separately — a role says how text is set, not what it means.

Need something the scale does not have? **Add a role, with a reason.** Never an
arbitrary value at the call site.

### Why this is enforced rather than documented

This file used to document eight roles. The app had accumulated **twelve
arbitrary font sizes across twenty-five components** anyway — including 13 and
13.5 for the same job, 14 and 14.5 for another, a nav that used the label
tracking at 0.14em while the scale said 0.16em, and page titles at 24px while
the scale said 28. Neither the timer role nor the title role was applied
anywhere.

Nothing failed, because nothing checked. Tailwind emits `text-[13.5px]`
happily, and a *typo'd* role is worse: `type-lable` compiles to no CSS, no
warning, exit 0 — the same silence that makes `shadcn-detox` necessary for
colour.

So `pnpm check:type` runs in CI and rejects arbitrary sizes, arbitrary or
preset tracking, bare `font-mono`/`font-sans`, Tailwind's own font scale, and
any `type-*` that is not a real role. `src/components/ui/**` is exempt —
vendored shadcn, policed by `shadcn-detox.mjs` instead.

## The roles

Twenty roles. `tokens.json` under `type.scale` is the source — if this table
and that file disagree, the file is right.

**Numeric** (all tabular):

| Role | Family | Size | Weight | Tracking | For |
|---|---|---|---|---|---|
| `type-figure` | mono | 30 → 36 @sm | 500 | −0.02em | a card's headline number |
| `type-timer` | mono | 24 → 30 @sm | 500 | −0.02em | the timer readout |
| `type-amount-hero` | mono | 24 | 500 | −0.02em | an invoice's total |
| `type-amount` | mono | 15 | 400 | | invoice line amounts |
| `type-duration` | mono | 14 | 400 | | durations, rates, money cells |
| `type-meta` | mono | 11.5 | 400 | | secondary numerics, timestamps |

**Headings and text:**

| Role | Family | Size | Weight | Tracking | For |
|---|---|---|---|---|---|
| `type-hero` | sans | 30 → 44 @sm | 600 | −0.03em | the landing headline |
| `type-hero-strike` | sans | 19 → 23 @sm | 400 | −0.015em | the landing refusal list |
| `type-display` | sans | 22 → 28 @sm | 500 | −0.02em | a section's opening line |
| `type-title` | sans | 24 | 600 | −0.025em | page title |
| `type-section` | sans | 18 | 500 | | section heading |
| `type-heading` | sans | 16.5 | 600 | −0.01em | card heading |
| `type-lede` | sans | 15 → 17 @sm | 400 | | a paragraph under a headline |
| `type-body` | sans | 15 | 400 | | primary text |
| `type-control` | sans | 14 | 400 | | inputs, list rows |
| `type-support` | sans | 13 | 400 | | helper text, errors, empty states |

**Uppercase mono** (letter-spacing is part of the role):

| Role | Family | Size | Weight | Tracking | For |
|---|---|---|---|---|---|
| `type-wordmark` | mono | 24 | 600 | 0.12em | `\|Stint\|` — mixed case, not upper |
| `type-nav` | mono | 13 | 500 | 0.08em | navigation |
| `type-label` | mono | 11 | 500 | 0.16em | field labels, column heads |
| `type-badge` | mono | 9.5 | 400 | 0.08em | status pills |

Defined in `packages/design-tokens/tokens.json` under `type.scale`, so all
three clients share one scale. Sizes stay in **px**: the scale was derived at
specific pixel sizes for legibility, and `rem` would let a browser setting
resize the timer readout out of its own layout.

**Six roles step at `sm`** — `hero`, `hero-strike`, `figure`, `timer`, `lede`
and `display`. Every one is large enough that its desktop size would force a
horizontal scroll on a narrow phone. A component writing `sm:text-3xl` itself
is exactly the one-off this replaces, so the step belongs to the role.

### Notes on specific roles

**`type-nav` exists because the label role was too small for it.** Navigation
is scanned and clicked constantly; a field label is read once while filling a
form. Both are uppercase mono, and they legitimately want different sizes —
nav also takes *less* tracking, because 0.16em at 13px sprawls.

Inactive nav items use `text-muted`, not `text-subtle`: on `bg-base` subtle is
**3.14:1** and fails AA. This was a real bug, not a preference.

**`type-section` and `type-heading` are not interchangeable.** A section
heading sits above content that is already on the page (`Projects` on a client
detail); a card heading names a panel. The home cards use neither by default —
see the next note.

**A card whose point is one figure demotes its own title.** It drops to a
quiet `type-label` above a `type-figure` the eye actually lands on; a card
whose point is a *list* keeps its `type-heading`. Passing a `value` to `Card`
selects the first mode, and that is the whole rule — deliberately not a free
choice per card. See `home-cards.tsx`.

## Rules

- Numbers are **always** a mono role. No exceptions.
- Running text stays near 65 characters.
- Uppercase roles always carry letter-spacing; it is part of the role.
- Task names truncate with ellipsis rather than wrapping — an entry row is one
  line, which is what makes a dense list scannable.
