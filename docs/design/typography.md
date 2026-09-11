# Typography

**IBM Plex Sans** for text, **IBM Plex Mono** for everything numeric.

## Why mono for numbers

Duration is this product's core datum, and it is read in columns. Every number
the user sees is monospaced with `font-variant-numeric: tabular-nums`, so a
duration never reflows as its digits change — a timer ticking from `1:09:59`
to `1:10:00` must not shift the layout.

Plex Mono over the usual candidates because its digits stay open and legible at
13px, which is the macOS menu bar size.

## Scale

| Role | Family | Size | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Timer | mono | 30 | 500 | −0.02em | tabular; the hero element |
| Page title | sans | 28 | 600 | −0.02em | |
| Section | sans | 18 | 500 | | |
| Body / entry | sans | 15 | 400 | | |
| Duration, inline | mono | 14 | 400 | | tabular |
| Meta | mono | 11.5 | 400 | | muted |
| Label | mono | 11 | 500 | 0.16em | uppercase |
| Menu bar | mono | 13 | 400 | | tabular |

Defined in `packages/design-tokens/tokens.json` under `type.scale`, so all
three clients share one scale.

## Rules

- Durations are **always** tabular mono. No exceptions.
- Running text stays near 65 characters.
- Uppercase labels always carry letter-spacing.
- Task names truncate with ellipsis rather than wrapping — an entry row is one
  line, which is what makes a dense list scannable.
