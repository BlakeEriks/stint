#!/usr/bin/env node
/**
 * Re-derives the LIGHT neutral ramp and prints it for tokens.json.
 *
 *   node src/derive-light.mjs             # the ramp
 *   node src/derive-light.mjs --surfaces  # just the painted planes
 *
 * The companion to `derive-neutrals.mjs`, with the same two scales. The card
 * is the anchor here, and ink is pushed DOWN to gain contrast where dark ink
 * is lifted. `docs/design/deriving-colour.md` has why.
 */
import { contrast, hex } from './oklch.mjs';

/** Held constant, exactly as dark holds it. */
const HUE = 264;

/* ── surfaces ──────────────────────────────────────────────────────────
 *
 * The same planes, in the same order of depth — but each is LIGHTER than the
 * one behind it, so the ladder descends from the card rather than climbing.
 */

/**
 * @param ceiling L of the card — the nearest plane, and the anchor. Below 1.0,
 *                so the ladder has somewhere to stand.
 * @param steps   ΔL down from each plane to the one behind it, card-first.
 *                Five entries for six planes.
 * @param chroma  [card, bars], interpolated linearly. A third of dark's: the
 *                same chroma is a larger share of the distance left to white.
 */
function surfaces({ ceiling, steps, chroma: [c0, c1] }) {
  // Card first: it is the anchor, and the frame is built away from it.
  const names = ['cards', 'content', 'rail+dock', 'bars', 'hover', 'active'];
  let L = ceiling;
  return names.map((name, i) => {
    if (i > 0) L -= steps[i - 1];
    const C = +(c0 + ((c1 - c0) * i) / (names.length - 1)).toFixed(4);
    return { name, L: +L.toFixed(4), C, hex: hex(L, C, HUE) };
  });
}

/**
 * `steps` reads card -> content -> rail+dock -> bars, then hover and active,
 * which descend from the CARD because they are painted on one.
 *
 * The first three are larger than they look: perceptual distance compresses
 * toward white, so 0.022 at L 0.97 is a comparable read to dark's 0.035 at
 * L 0.20.
 */
const SURFACE_PLAN = {
  ceiling: 0.995,
  steps: [0.022, 0.022, 0.022, 0.035, 0.045],
  chroma: [0.0025, 0.0055],
};

/* ── ink ───────────────────────────────────────────────────────────────
 *
 * Text and borders. Judged by WCAG contrast against the card, which is what
 * the eased curve is for.
 */

/**
 * The curve descends from just below the card (`TOP`, never painted as text)
 * to the strongest ink (`FLOOR`, step 975). The exponent bunches steps toward
 * the dark end, where light-mode contrast ratios actually separate.
 */
const TOP = 0.975;
const FLOOR = 0.145;
const EXPONENT = 1.4;

/** Peaks mid-ramp, where a neutral cast is legible. Scaled down from dark's. */
const CHROMA = {
  300: 0.012,
  400: 0.014,
  500: 0.015,
  600: 0.0145,
  700: 0.0128,
  850: 0.0092,
  975: 0.003,
};

/**
 * What each ink step owes the card behind it, matching dark's.
 *
 * - `400` is `border-control`, 1.4.11's 3:1.
 * - `500` is subtle text, AA at 4.5 — it is body copy.
 * - `600` is the muted floor at 5.5: held to 4.5 alongside 500 both land on
 *   the same grey. Muted is stronger than subtle, and the ratios say so.
 * - `700` is the focus ring, 3:1 under WCAG 1.4.11.
 */
const INK_MINIMA = { 400: 3, 500: 4.5, 600: 5.5, 700: 3 };

/** Smallest push DOWN (to 4dp) that clears `min` against `card`. */
function dropFor(baseL, C, card, min) {
  for (let drop = 0; drop <= 0.4; drop += 0.0001) {
    if (contrast(hex(baseL - drop, C, HUE), card) >= min)
      return +drop.toFixed(4);
  }
  return 0;
}

function inkRamp(card) {
  const rows = Object.entries(CHROMA).map(([s, C]) => {
    const step = Number(s);
    const base = TOP - (TOP - FLOOR) * (step / 975) ** EXPONENT;
    const min = INK_MINIMA[step];
    const L = base - (min ? dropFor(base, C, card, min) : 0);
    return { step, L: +L.toFixed(4), C, hex: hex(L, C, HUE) };
  });

  /* Pushing a step down to clear a threshold can drive it into the next: they
     descend toward the same card, so the one owing less catches up. 0.035 is
     roughly where two greys stop reading as the same colour, and it is a
     floor — a step that earned more distance by owing a stricter ratio keeps
     it. */
  const MIN_SEPARATION = 0.035;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i - 1].L - rows[i].L;
    if (gap >= MIN_SEPARATION) continue;
    rows[i].L = +(rows[i - 1].L - MIN_SEPARATION).toFixed(4);
    rows[i].hex = hex(rows[i].L, rows[i].C, HUE);
  }
  return rows;
}

/* ── output ────────────────────────────────────────────────────────────── */

function verify(ink, card) {
  const at = (s) => ink.find((r) => r.step === s).hex;
  console.log(`\n// ink against the card surface (${card}):`);
  let ok = true;
  for (const [label, fg, min] of [
    ['body   (850)', at(850), 4.5],
    ['muted  (600)', at(600), 4.5],
    ['subtle (500)', at(500), 4.5],
    ['focus  (700)', at(700), 3],
    ['border (400)', at(400), 3],
  ]) {
    const v = contrast(fg, card);
    if (v < min) ok = false;
    console.log(
      `//   ${label} ${v.toFixed(2)} (min ${min})${v >= min ? '' : '  FAILS'}`,
    );
  }
  return ok;
}

function printPlan() {
  const s = surfaces(SURFACE_PLAN);

  console.log(`\n${'='.repeat(58)}\nLIGHT\n`);
  console.log('plane        L        C        hex       dL');
  s.forEach((p, i) => {
    const dL = i ? `-${(s[i - 1].L - p.L).toFixed(4)}` : '  -';
    console.log(
      p.name.padEnd(12),
      p.L.toFixed(4),
      ' ',
      p.C.toFixed(4),
      ' ',
      p.hex,
      dL,
    );
  });

  const ink = inkRamp(s[0].hex);
  if (!verify(ink, s[0].hex))
    console.log('//   ^ ink needs re-tuning against this card value');
  return { surfaces: s, ink };
}

if (process.argv[2] === '--surfaces') {
  printPlan();
} else {
  const { surfaces: s, ink } = printPlan();

  console.log('\n// ---- paste into tokens.json primitive.lightNeutral ----');
  /* The plan runs card-first; the ramp is written light-to-dark, so 0 is the
     card. */
  const SURFACE_KEYS = ['0', '25', '50', '100', 'hover', 'active'];
  const painted = s.map((p, i) => ({ ...p, key: SURFACE_KEYS[i] }));
  for (const p of painted.filter((p) => !['hover', 'active'].includes(p.key))) {
    console.log(
      `"${p.key}":`.padEnd(12),
      `{ "hex": "${p.hex}", "oklch": [${p.L.toFixed(4)}, ${p.C.toFixed(4)}, ${HUE}] },`,
    );
  }
  for (const p of painted.filter((p) => ['hover', 'active'].includes(p.key))) {
    console.log(
      `"${p.key === 'hover' ? '150' : '200'}":`.padEnd(12),
      `{ "hex": "${p.hex}", "oklch": [${p.L.toFixed(4)}, ${p.C.toFixed(4)}, ${HUE}] },`,
    );
  }
  for (const { step, L, C, hex: h } of ink) {
    console.log(
      `"${step}":`.padEnd(12),
      `{ "hex": "${h}", "oklch": [${L.toFixed(4)}, ${C.toFixed(4)}, ${HUE}] },`,
    );
  }
}
