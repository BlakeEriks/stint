# Color System

Derived in OKLCH with real math — Ottosson OKLab↔sRGB matrices, binary-search
gamut mapping, WCAG 2.1, APCA W3-0.1.9, and Brettel/Viénot dichromat
simulation. No hex codes were guessed.

Source of truth: `packages/design-tokens/tokens.json`.
Visual reference: https://claude.ai/code/artifact/ee053171-62e7-4150-b7a0-dfce2407cfc4

## Accent — hue 142

`oklch(0.87 0.26 142)` = `#52FC43`

Hue 142 sits 2° off the sRGB gamut peak at 140 — a deliberate 2% chroma
give-up, taken because protan lightness rises just past 140, buying a little
extra luminance separation. Chroma is held at **92% of the gamut edge** at
every step, so 8-bit rounding and display-profile variance never clip. Pushed
to C=0.30, every step clips.

Below 135 reads yellow-green; above 150 reads spring-green/teal.

## Neutral — hue 264

122° from the accent. **Not** the true complement (322) on purpose — that is
Toggl's pink/magenta territory.

264 specifically because the sRGB blue-primary corner causes a chroma
discontinuity at 265 (Cmax at L0.22 jumps 0.0898 → 0.1510). 264 sits just below
it, so the ramp stays smooth instead of kinking mid-scale.

### The curve

`L(i) = 0.145 + 0.830 · t^1.55` — eased, not linear.

A dark UI spends nearly all its surface area between L 0.14–0.32 (background,
elevated card, hover, border), so resolution is concentrated there: steps sit
~0.02 apart at the dark end and ~0.11 at the light end. A linear ramp would
space them a flat 0.075 and make those four surfaces indistinguishable.

## Color vision deficiency — the important finding

**No green hue survives dichromacy.** Every candidate between 125 and 160
collapses to the same yellow (deuteranopia ≈ `#DCDC27`), with ΔE against amber
of only 0.065–0.130 — at or below the discrimination threshold.

Hue rotation cannot fix this. Two consequences are baked into the system:

1. **Separation is solved in the lightness channel.** Warning was moved to
   L 0.76 / h85 because at L 0.78+ it collided with the accent under
   deuteranopia (ΔE 0.084). Worst pair after tuning: 0.105 deuter / 0.183 prot.
2. **Timer state is carried by form and motion, not color alone** — the pulsing
   dot and the running readout signal it independently.

## Semantic colors — success is not green

Green is a **state** channel: continuous, present-tense, "time is accruing
right now." Success is an **outcome** channel: discrete, past-tense, "entry
saved." Two different semantic categories, so two different hues.

**Green never means "done" anywhere in this UI.**

| Token | Dark | Light |
|---|---|---|
| success | `#2CCCEB` (h215 cyan) | `#0E7490` |
| warning | `#DBA929` (h85) | `#A66A00` |
| danger | `#E9504D` (h25) | `#C21725` |
| info | `#6D7FAE` (h268) | `#4A5A85` |

Info is intentionally the dullest (C 0.075) — it is a passive color and low
chroma keeps it from competing.

## Project colors

Eight hues at **fixed L 0.70 and C 0.11**, varying only hue, excluding the
accent zone 142±22°.

Fixed lightness below the accent's 0.87 means a project chip can never
out-bright the running timer; chroma 0.11 against the accent's 0.26 means it
can never out-saturate it. Coherence is automatic because only one dimension
varies.

Minimum pairwise ΔE is 0.075 — fine for labeled chips where text carries the
identity. **For charts, use the two dedicated categoricals** (`#64A3E3` /
`#F6964E`) on the blue/orange axis, the only axis dichromats retain.

## Contrast — three failures, each resolved

Validated in CI by `packages/design-tokens/src/validate.js`. A token change
that breaks these fails the build.

1. **White on accent = 1.37:1** — catastrophic, and the tempting mistake since
   neon green *looks* like it wants white on it. Accent buttons use `n-0`
   (`#090A0D`, 14.48:1), encoded as `--text-on-accent` so it cannot be gotten
   wrong by hand. **This is the specific regression the CI check guards.**
2. **`n-500` as muted text = 4.10:1** — fails AA. The muted floor is `n-600`
   (6.01:1); `n-500` is demoted to borders and icons as `--text-subtle`.
3. **Borders `n-200/300/400` fail 3:1** — *correctly*, and they are exempt.
   WCAG 1.4.11 governs boundaries that convey state, not decorative dividers.
   Any border that *is* a control boundary (input, focus ring, checkbox) uses
   `--border-control` at `n-500`.

## Light theme

Same hues, mirrored curve (`L = 0.985 − 0.840 · t^1.55`).

One forced concession: **the accent drops 35 lightness points** — 0.87 → 0.52,
`#1F7E17`, 4.96:1. Neon green's luminance is intrinsically near white's, so it
cannot carry text contrast on a light ground *at any chroma*. It stops being
neon and becomes signal green.

This is not a compromise to fix later. In light mode the ground provides the
energy. `#289A1E` (3.51:1) is available for large UI and icons where more
vibrancy is wanted.

## Usage discipline

1. **The accent appears in one place at a time: the running timer.** Not
   navigation, not secondary buttons, not links. Scarcity is what makes green
   read as a signal, and it is the entire differentiation from Toggl's
   everywhere-magenta.
2. Green never means success.
3. Timer state is reinforced by form and motion, not color alone.
4. **Only semantic tokens reach components.** Primitives stay in the token
   package.


## Elevation

Shadows are generated tokens (`elevation` in `tokens.json`), not hand-written
`box-shadow` values, for the same reason colours are: a literal in a component
has nothing stopping it drifting.

They are **theme-aware**. An alpha that reads as depth on a near-black ground
looks like soot on a near-white one, so dark uses `rgba(0,0,0,0.34–0.44)` and
light uses `rgba(16,18,26,0.06–0.10)`.

- `shadow-card` — panels, the default.
- `shadow-float` — anything genuinely above the page (menus, dialogs).

**Generator caveat.** The Tailwind theme key and the runtime variable must
differ. `--shadow-card: var(--shadow-card)` inside `@theme inline` is a
self-reference: it resolves to nothing and silently removes every shadow in
the app, with no error. The theme block therefore points at `--tt-shadow-*`,
which is what the light/dark blocks declare.

## Why depth cannot come from surface colour

The neutral ramp is eased (`L = 0.145 + 0.830·t^1.55`) so resolution
concentrates in the dark end where a dark UI lives. That is right for text,
but it means adjacent surface steps are nearly identical:

| pair | contrast |
|---|---|
| `bg-base` → `bg-primary` (dark) | 1.02 : 1 |
| `bg-base` → `bg-elevated` (dark) | 1.19 : 1 |
| `bg-base` → `bg-primary` (light) | 1.06 : 1 |

Layering therefore comes from **shadow and radius**, with surface colour only
reinforcing it. This is a feature: the depth cue is independent of the colour
channel, so it survives dichromacy and high-contrast modes, and it never
competes with the accent.


## The dark floor

The ramp originally started at **L 0.145** (`#090A0D`). That is close enough
to black that the app read as a terminal rather than a product — technically
correct, wrong feeling.

The floor is now **L 0.215** (`#18191C`) with the exponent eased 1.55 → 1.40,
because a higher floor on the old curve bunches the midtones.

Raising the floor compresses everything above it, which pushed muted text to
4.46 — just under AA. Two steps are therefore lifted off the curve
deliberately: `600` by +0.03 (muted back to **5.04**) and `700` by +0.035, so
the ramp stays monotonic and evenly spaced instead of bunching muted and
focus together.

`src/derive-neutrals.mjs` is the script that produces these values, and
`src/oklch.mjs` holds the colour maths. **The palette is derived, not
picked** — changing the ground is a parameter edit, not a round of
eyedropping. Both were verified to reproduce the previous twelve steps
exactly before being used to generate new ones.
