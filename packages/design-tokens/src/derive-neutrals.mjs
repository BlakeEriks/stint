#!/usr/bin/env node
/**
 * Re-derives the dark neutral ramp and prints it for tokens.json.
 *
 * The palette is DERIVED, not picked — this is the script that does it, kept
 * in the repo so a future change to the ground lightness is a parameter edit
 * rather than a round of eyedropping hex codes.
 *
 *   node src/derive-neutrals.mjs
 *
 * Verify it still reproduces the committed values before trusting a change:
 * every step it prints should match tokens.json unless a parameter moved.
 */
import { contrast, hex } from "./oklch.mjs";

/**
 * Hue 264 — the blue-grey the palette was derived for.
 *
 * Warm grounds were tried and rejected. Rotating the neutral is free in OKLCH
 * (lightness is held constant, so every `contract` assertion still passes),
 * which makes the change tempting and cheap to evaluate — but a warm ground
 * reads as brown or red long before it reads as "inviting", and a neutral
 * that has an opinion of its own stops receding behind the content. See
 * `CHROMA_SCALE` for the dial if it is ever revisited.
 *
 * The hard floor is the accent at 142: `$meta.hueSeparation` is a real
 * constraint, and 264 keeps 122° of it. The obvious warm choices (60-75)
 * collapse it to 67-82°, which puts the ground in the accent's own family and
 * stops the green reading as a separate signal.
 */
const HUE = 264;

/**
 * Multiplier over the per-step chroma below, so the ramp's saturation is one
 * parameter rather than twelve.
 *
 * 1.0 is the derived ramp. It exists because chroma and hue have to move
 * together to judge a cast: a warm hue needs roughly 1.5x to read as warm at
 * all, and past ~2x any hue stops being a neutral and becomes a tint over the
 * whole app. Leave it at 1.0 unless deliberately re-evaluating the ground.
 */
const CHROMA_SCALE = 1.0;

/** Chroma per step — peaks mid-ramp so mid greys carry the cast. */
const CHROMA = {
  0: 0.006,
  25: 0.0078,
  50: 0.0107,
  100: 0.0139,
  200: 0.017,
  300: 0.0196,
  400: 0.0214,
  500: 0.022,
  600: 0.021,
  700: 0.0181,
  850: 0.0129,
  975: 0.004,
};

/**
 * Floor lifted from 0.145 to 0.215: at 0.145 the ground was #090A0D, near
 * enough to black that the app read as a terminal rather than a product.
 * The exponent eased from 1.55 to 1.40 to compensate — a higher floor with
 * the old curve bunches the midtones.
 *
 * It stays at 0.215 and the ground is lowered by pinning step 0 instead —
 * see `SURFACE_SPREAD`. Lowering FLOOR itself was tried and is wrong: it
 * drags the whole eased curve down with it, and the text steps go too. Muted
 * fell to 4.40 (under AA) and the control border to 2.63, breaking two
 * contract assertions to solve a problem that lives in three steps.
 */
const FLOOR = 0.215;
const EXPONENT = 1.4;
const TOP = 0.985;

/**
 * The three surface steps are spread by hand, and this is the fix for the
 * app reading flat.
 *
 * The curve is eased to concentrate resolution at the dark end, which is
 * correct for *text* steps. But it put the ground and the card 0.0046 apart
 * in L — `bg-base` 0.2150 and `bg-primary` 0.2196 — so a card had no edge of
 * its own and the entire sense of depth rested on `shadow-card`, which has
 * almost nothing to darken against on a near-black ground.
 *
 * WCAG contrast is the wrong instrument for judging this and is why it went
 * unnoticed: it is compressive near black, so it reported 1.02:1 for the old
 * pair and 1.16:1 for the new one — a difference that reads as trivial while
 * the perceptual gap (OKLCH ΔL) is 14x larger. Judge adjacent dark surfaces
 * by ΔL; keep WCAG for text, which is what it measures.
 *
 * Targets: ground 0.180, card 0.2468, elevated 0.2850. ΔL 0.067 and 0.038 —
 * enough that a card is a surface rather than a shadow, and still far too
 * little to compete with the accent or read as a separate colour.
 *
 * `100` and `200` are pinned too, only to keep the ramp monotonic: the spread
 * lifts `50` to 0.285, past where the curve was putting both of them. They
 * carry elevated and hover, which have to stay above the surface they appear
 * on.
 */
const SURFACE_SPREAD = {
  0: 0.18,
  25: 0.2468,
  50: 0.285,
  100: 0.315,
  200: 0.35,
};

/**
 * Steps lifted off the curve deliberately, to hold a contract assertion.
 *
 * `600` is the muted-text floor: raising the ground compresses the ramp, and
 * at the curve value it lands on 4.46 against a card — just under AA. `700`
 * moves with it so the ramp stays monotonic and evenly spaced instead of
 * bunching muted and focus together.
 *
 * `500` is the control border, and it moved when the card did. Lifting the
 * card to L 0.2468 (see `SURFACE_SPREAD`) narrowed the gap to the border that
 * sits on it: 3.09 -> 2.88, just under the 3:1 that WCAG 1.4.11 requires of a
 * control boundary. +0.013 restores it to 3.05. This is the cost of the
 * lighter card and it is the right trade — a border is one hairline, the card
 * is most of the screen.
 */
const OFFSET = { 500: 0.013, 600: 0.03, 700: 0.035 };

const lightness = (step) =>
  SURFACE_SPREAD[step] ??
  FLOOR + (TOP - FLOOR) * (step / 975) ** EXPONENT + (OFFSET[step] ?? 0);

const ramp = Object.keys(CHROMA).map((s) => {
  const step = Number(s);
  const L = lightness(step);
  const C = +(CHROMA[step] * CHROMA_SCALE).toFixed(4);
  return {
    step,
    L: +L.toFixed(4),
    C,
    hex: hex(L, C, HUE),
  };
});

for (const { step, L, C, hex: h } of ramp) {
  console.log(
    `"${step}":`.padEnd(8),
    `{ "hex": "${h}", "oklch": [${L.toFixed(4)}, ${C.toFixed(4)}, ${HUE}] },`,
  );
}

const card = ramp.find((r) => r.step === 25).hex;
const at = (s) => ramp.find((r) => r.step === s).hex;
console.log("\n// against the card surface:");
for (const [label, fg, min] of [
  ["body   (850)", at(850), 4.5],
  ["muted  (600)", at(600), 4.5],
  ["focus  (700)", at(700), 3],
  ["border (500)", at(500), 3],
]) {
  const v = contrast(fg, card);
  console.log(
    `//   ${label} ${v.toFixed(2)} (min ${min})${v >= min ? "" : "  FAILS"}`,
  );
}
