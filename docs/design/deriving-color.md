# Deriving the palette

How the colors are computed. The *rules for using them* — what green means,
the four planes, client colors — are `brand.html`, where they can be seen.

Both neutral ramps are **derived, not hand-picked**. Change a parameter in
`src/derive-neutrals.mjs` (dark) or `src/derive-light.mjs` (light) and paste
the output. Never eyedrop a gray: `pnpm tokens:validate` re-runs both
generators and diffs them against `tokens.json`, so a hand-edited hex fails CI
naming the step. `src/oklch.mjs` holds the OKLCH↔sRGB math with gamut
mapping, plus `rgbToOklch` for auditing a hex you did not generate.

That check exists because contrast ratios prove a color is *legible* and only
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

Rotating the hue is free in OKLCH — lightness is held, so every contract
assertion still passes — which makes a warm ground cheap to try. It reads as
brown or red long before it reads as inviting, and a neutral with an opinion
of its own stops receding behind the content. The floor is
`$meta.hueSeparation`: the obvious warm choices (60–75) collapse 122° to
67–82° and put the ground in the accent's own family.

**Chroma is held nearly flat across the planes** — dark runs 0.0060 → 0.0140
across the six, interpolated linearly rather than tracking lightness. Chroma
climbing with L washed the blue-gray cast out exactly where the ladder jumps
hardest, and the middle of the app read as a different palette from its frame.
Light carries about a third of dark's at the same nominal cast: the same
chroma is a larger share of the remaining distance to white, so a tint that
reads as a considered neutral at L 0.25 reads as a color at L 0.95.

**Hover and active are surfaces, not ink.** They are painted on top of a card,
so they sit at the card's end of the surface scale; on the ink curve they
landed *below* the card they were hovering.

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
surface an override, and the curve still governing only 300, 400, 850, and 975
— none of which are backgrounds.

**Thresholds, not nudges.** The ink steps that owe a ratio are lifted (dark) or
dropped (light) by however much it takes to clear it *against whatever card the
surface plan produced*. Fixed `OFFSET` values tuned against one specific card
silently stop meaning anything when the card moves. Making the threshold the
constant is what makes "let's try a bigger card step" safe: the ink follows.

**A separation sweep runs after.** Pushing a step to clear a threshold can
drive it into its neighbor, since both move toward the same card and the one
owing less catches up. Anything closer than ΔL 0.035 is pushed the rest of the
way — a floor, never a ceiling, so a step that earned more distance keeps it.
Without it, `500` and `600` landed 0.0087 apart: two names for one gray.

**Lowering `FLOOR` is wrong.** It drags the entire eased curve down, taking the
text steps with it: muted falls to 4.40 (under AA) and the border to 2.63. Two
contract assertions broken to solve a problem that lives in the surfaces. Give
the surfaces their own scale; leave the curve alone. `FLOOR` is 0.215 while the
darkest painted plane is 0.150 — the surfaces no longer pass through the ink
curve, which is what lets the floor stay where the contrast math wants it.

### What each ink step owes

| step | owes | against |
|---|---|---|
| `400` | 3:1 | `border-control`, taken off 500 |
| `500` | 4.5 (AA text) | the card — it is body copy in over a hundred places |
| `600` | 5.5 | the card |
| `700` | 3:1, and clear of 600 | the focus ring |

`600` owes **5.5**, not 4.5: held to the same ratio as 500 against the same
card, both are pushed to the same place and the curve's own separation is lost
— they came out ΔL 0.0087 apart, two names for one gray. The hierarchy is
strong > primary > muted > subtle, so muted owes more than subtle.

`400` exists because one primitive cannot owe two ratios: 500 had been
carrying `text-subtle`, `border-control` and `timer-idle` at once, which is
why that step could not be derived for any of them.

## Judge adjacent surfaces by ΔL, not WCAG

**WCAG is compressive near black** and reports a near-invisible pair as 1.03:1
whether it is invisible or not. The four planes are an even ΔL 0.035 apart:

| plane | token | L |
|---|---|---|
| header, timer bar | `bg-recessed` | 0.150 |
| nav rail, dock | `bg-base` | 0.185 |
| content column | `bg-primary` | 0.220 |
| cards | `bg-elevated` | 0.255 |

## Color vision deficiency

**No green hue survives dichromacy.** Every candidate between 125 and 160
collapses to the same yellow (deuteranopia ≈ `#DCDC27`), with ΔE against amber
of only 0.065–0.130 — at or below the discrimination threshold.

Hue rotation cannot fix this *within the warm half of the wheel*. Two
consequences are baked into the system:

1. **Warning is blue, and that is what buys the separation.** A hue on the
   other side of the wheel cannot collapse toward the accent the way an amber
   does, so warning leaves the warm family rather than being tuned inside it.
2. **Timer state is carried by form and motion, not color alone** — the
   pulsing dot and the running readout signal it independently.

## The project hues are authored, not derived

The eight are hand-set literals in `tokens.json`, each a hex and a hue angle
at **L 0.700, C 0.111**, 40° apart. There is no generator for them, and a
scale per hue would need one — `roadmap.md` carries that work.

## Warning and danger

Both are hand-set literals — there is no generator for them yet. They are
**constructed** the way the accent is, at a fixed fraction of the gamut edge,
and every value owes the table below.

| token | theme | value | L | C | h |
|---|---|---|---|---|---|
| `warning`, `timer-warning` | dark | `#5CABF2` | 0.721 | 0.130 | 248 |
| `danger` | dark | `#F64B66` | 0.661 | 0.206 | 16 |
| `warning`, `timer-warning` | light | `#1C6DAD` | 0.521 | 0.126 | 248 |
| `danger` | light | `#C21F43` | 0.529 | 0.194 | 16 |

**Danger sits at hue 16, not 25.** At 25 it is a red already leaning orange,
60° from an amber warning — two hues in a region the eye discriminates poorly,
which reads as one muddy family rather than two decisions. 16 is a clean
scarlet with the blue warning 232° away.

What each value owes, all four verified by simulation (Viénot-Brettel-Mollon,
which reproduces this document's own 0.105 figure to within 0.002):

| | dark | light |
|---|---|---|
| danger on the card | 4.59 | 5.79 |
| warning on the card | 6.43 | 5.38 |
| `text-on-danger` | 5.42 | 5.88 |
| warning vs accent, worst CVD | 0.265 | 0.449 |
| danger vs accent, worst CVD | 0.167 | 0.108 |
| warning vs danger, worst CVD | 0.215 | 0.380 |

0.10 is the discrimination floor. **Light danger-vs-accent is 0.108, the
tightest pair in either theme** — a forest accent and a red both sit dark and
mid-chroma, so they converge under simulation more than the light pairs do.
It is a property of the light accent and moves when that does: an accent
lifted in lightness or dropped in chroma tightens it toward the floor.

`danger-muted` is a tinted surface rather than ink: it keeps the L and C of the
fill it replaced, moved to hue 16 — `#471F23` dark, `#FFEBEB` light.

## Light theme is not the dark script with the numbers flipped

The frame rises toward the card in both themes — the nearest plane is the
lightest either way. Only the **ink** inverts, darkening to gain contrast where
dark ink brightens. `L = 0.985 − 0.840 · t^1.55`. `liftFor` and `dropFor` are
two functions rather than one with a sign flag, for that reason.

**The planes descend from a ceiling.** The card is the anchor in light where
the bars are the anchor in dark: there is headroom below white and none above
it. `ceiling` is 0.975, not 1.0 — pure white leaves nothing above the content
column, and a card any nearer to it reads as a lit screen rather than as
paper. The light steps are 0.020 where dark's are 0.035, because perceptual
distance compresses toward white.

**Light's neutrals are warm at `HUE` 82 where dark's are blue-violet at 264.**
The two grounds share no hue: one is paper and the other is a lit screen.
Chroma runs four times dark's share for the same reason — at this hue it is
what reads as stock rather than as a gray with a cast.

## The light accent

`#52FC43` is ~1.6:1 on cream and unusable as anything but a fill, so light
derives its own five rungs in `src/derive-light-accent.mjs`: a forest green at
`HUE` 138, rotated off dark's 142 toward yellow so it sits with the paper
rather than on top of it.

**White is the only ink that clears AA on it.** Dark puts near-black on its
accent; across the whole forest/olive range dark ink tops out near 3:1, so
`accent-default` must stay dark enough to carry white. That caps the ladder —
an olive lifted much above L 0.5 fails the assertion guarding it.

**`success` is the accent hue one step off `accent-default`, and the direction
is the theme's** — each moves toward its own ground, so the paid badge recedes
where the running timer does not. The step is what separates them, not which
side of it `success` sits on.

| theme | `accent-default` | `success` | step |
|---|---|---|---|
| dark | `accent.300`, L 0.870 | `accent.500`, L 0.720 | down, toward the ground |
| light | L 0.455 | `#457036`, L 0.499 | up, toward the paper |

Light `success` is a **hand-set literal with no rung in
`derive-light-accent.mjs`** — the generator prints the five accent rungs, and
inventing a sixth to cover this one would be the hand-editing the ramp check
exists to catch, the other way round.

## Contract assertions

`pnpm tokens:validate` checks both directions:

- Required pairings that **must** meet AA — muted text, subtle text (it is
  body copy, so AA not AA-large), control borders, focus rings, text on accent,
  text on danger.
- Forbidden pairings that **must not** — white on the accent is 1.37:1, and
  the assertion exists so a well-meaning change cannot quietly make it legal.
- Every generated ramp re-derived and diffed against `tokens.json`: both
  neutrals, and the **light accent**, which lives under `semantic.light` as
  flat strings rather than in `primitive` and so needs its own check. Only the
  rungs the generator prints are compared, which is why light `success` is
  outside it.
