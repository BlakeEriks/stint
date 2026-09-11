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
import { hex, contrast } from './oklch.mjs';

const HUE = 264;

/** Chroma per step — peaks mid-ramp so mid greys carry the blue cast. */
const CHROMA = {
  0: 0.006, 25: 0.0078, 50: 0.0107, 100: 0.0139, 200: 0.017, 300: 0.0196,
  400: 0.0214, 500: 0.022, 600: 0.021, 700: 0.0181, 850: 0.0129, 975: 0.004,
};

/**
 * Floor lifted from 0.145 to 0.215: at 0.145 the ground was #090A0D, near
 * enough to black that the app read as a terminal rather than a product.
 * The exponent eased from 1.55 to 1.40 to compensate — a higher floor with
 * the old curve bunches the midtones.
 */
const FLOOR = 0.215;
const EXPONENT = 1.4;
const TOP = 0.985;

/**
 * Two steps are lifted off the curve deliberately.
 *
 * `600` is the muted-text floor: raising the ground compresses the ramp, and
 * at the curve value it lands on 4.46 against a card — just under AA. `700`
 * moves with it so the ramp stays monotonic and evenly spaced instead of
 * bunching muted and focus together.
 */
const OFFSET = { 600: 0.03, 700: 0.035 };

const lightness = (step) =>
  FLOOR +
  (TOP - FLOOR) * Math.pow(step / 975, EXPONENT) +
  (OFFSET[step] ?? 0);

const ramp = Object.keys(CHROMA).map((s) => {
  const step = Number(s);
  const L = lightness(step);
  return { step, L: +L.toFixed(4), C: CHROMA[step], hex: hex(L, CHROMA[step], HUE) };
});

for (const { step, L, C, hex: h } of ramp) {
  console.log(
    `"${step}":`.padEnd(8),
    `{ "hex": "${h}", "oklch": [${L.toFixed(4)}, ${C.toFixed(4)}, ${HUE}] },`,
  );
}

const card = ramp.find((r) => r.step === 25).hex;
const at = (s) => ramp.find((r) => r.step === s).hex;
console.log('\n// against the card surface:');
for (const [label, fg, min] of [
  ['body   (850)', at(850), 4.5],
  ['muted  (600)', at(600), 4.5],
  ['focus  (700)', at(700), 3],
  ['border (500)', at(500), 3],
]) {
  const v = contrast(fg, card);
  console.log(`//   ${label} ${v.toFixed(2)} (min ${min})${v >= min ? '' : '  FAILS'}`);
}
