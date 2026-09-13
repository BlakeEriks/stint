# Deriving the palette

How the colours are computed. The *rules for using them* — what green means,
the four planes, client colours — are `brand.html`, where they can be seen.

Both neutral ramps are **derived, not hand-picked**. Change a parameter in
`src/derive-neutrals.mjs` (dark) or `src/derive-light.mjs` (light) and paste
the output. Never eyedrop a grey: `pnpm tokens:validate` re-runs both
generators and diffs them against `tokens.json`, so a hand-edited hex fails CI
naming the step. `src/oklch.mjs` holds the OKLCH↔sRGB maths with gamut
mapping, plus `rgbToOklch` for auditing a hex you did not generate.

That check exists because contrast ratios prove a colour is *legible* and only
this proves it was *derived*. The dark ramp had drifted to 8 of 12 steps
hand-pinned while passing every contrast assertion.

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
discontinuity at 265 (Cmax at L0.22 jumps 0.0898 → 0.1510). 264 sits just
below it, so the ramp stays smooth instead of kinking mid-scale.

## Two scales, because one curve cannot serve both

The two halves of a neutral ramp want opposite things:

- **Surfaces** want **even perceptual spacing**. They are compared to each
  other, side by side, so every step should feel like the same size move. An
  eased curve deliberately bunches them.
- **Text and borders** want **resolution where the contrast ratios are**. They
  are compared to the card behind them, never to each other.

So surfaces come off `surfaces()`, a linear ladder, and ink off `inkRamp()`,
an eased curve: `L(i) = 0.215 + 0.770 · t^1.40`, with steps 600 and 700 lifted
above the curve to clear their AA ratios. `$meta.neutralCurve` in
`tokens.json` carries the same formula.

Forcing both through one curve is what produced the drift above: every painted
surface an override, and the curve still governing only 300, 400, 850 and 975
— none of which are backgrounds.

**Thresholds, not nudges.** The ink steps that owe a ratio are lifted (dark) or
dropped (light) by however much it takes to clear it *against whatever card the
surface plan produced*. Fixed `OFFSET` values tuned against one specific card
silently stop meaning anything when the card moves. Making the threshold the
constant is what makes "let's try a bigger card step" safe: the ink follows.

**A separation sweep runs after.** Pushing a step to clear a threshold can
drive it into its neighbour, since both move toward the same card and the one
owing less catches up. Anything closer than ΔL 0.035 is pushed the rest of the
way — a floor, never a ceiling, so a step that earned more distance keeps it.
Without it, `500` and `600` landed 0.0087 apart: two names for one grey.

**Lowering `FLOOR` is wrong.** It drags the entire eased curve down, taking the
text steps with it: muted falls to 4.40 (under AA) and the border to 2.63. Two
contract assertions broken to solve a problem that lives in the surfaces. Give
the surfaces their own scale; leave the curve alone.

## Judge adjacent surfaces by ΔL, not WCAG

**WCAG is compressive near black** and reports a near-invisible pair as 1.03:1
whether it is invisible or not. The four planes are an even ΔL 0.035 apart:

| plane | token | L |
|---|---|---|
| header, timer bar | `bg-recessed` | 0.150 |
| nav rail, dock | `bg-base` | 0.185 |
| content column | `bg-primary` | 0.220 |
| cards | `bg-elevated` | 0.255 |

## Colour vision deficiency

**No green hue survives dichromacy.** Every candidate between 125 and 160
collapses to the same yellow (deuteranopia ≈ `#DCDC27`), with ΔE against amber
of only 0.065–0.130 — at or below the discrimination threshold.

Hue rotation cannot fix this. Two consequences are baked into the system:

1. **Separation is solved in the lightness channel.** Warning sits at
   L 0.76 / h85 because at L 0.78+ it collided with the accent under
   deuteranopia (ΔE 0.084). Worst pair after tuning: 0.105 deuter / 0.183 prot.
2. **Timer state is carried by form and motion, not colour alone** — the
   pulsing dot and the running readout signal it independently.

## Light theme is not the dark script with the numbers flipped

The frame rises toward the card in both themes — the nearest plane is the
lightest either way. Only the **ink** inverts, darkening to gain contrast where
dark ink brightens. `L = 0.985 − 0.840 · t^1.55`.

The light accent drops to `#1F7E17`: `#52FC43` is ~1.6:1 on white and unusable
as anything but a fill.

## Contract assertions

`pnpm tokens:validate` checks both directions:

- Required pairings that **must** meet AA — muted text, subtle text (it is
  body copy, so AA not AA-large), control borders, focus rings, text on accent,
  text on danger.
- Forbidden pairings that **must not** — white on the accent is 1.37:1, and
  the assertion exists so a well-meaning change cannot quietly make it legal.
- Both ramps re-derived and diffed against `tokens.json`.
