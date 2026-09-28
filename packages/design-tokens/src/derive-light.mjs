#!/usr/bin/env node
/**
 * Re-derives the LIGHT neutral ramp and prints it for tokens.json.
 *
 *   node src/derive-light.mjs             # the ramp
 *   node src/derive-light.mjs --surfaces  # just the painted planes
 *
 * The companion to `derive-neutrals.mjs`, with the same two scales. The card
 * is the anchor here, and ink is pushed DOWN to gain contrast where dark ink
 * is lifted. `docs/design/deriving-color.md` has why.
 */
import { readFileSync } from 'node:fs';
import { contrast, hex } from './oklch.mjs';

/**
 * Warm, where dark's neutrals are blue-violet. Light is paper and dark is a
 * lit screen, so the two grounds have no reason to share a hue — 82 is the
 * folder-stock cream the planes are cut from.
 */
const HUE = 82;

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
 * @param chroma  [card, bars], interpolated linearly. Four times dark's share
 *                of the distance left to white: at this hue chroma is what
 *                reads as paper stock rather than as a gray with a cast.
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
 * toward white, so 0.020 at L 0.975 is a comparable read to dark's 0.035 at
 * L 0.20.
 *
 * The ceiling is 0.975, not near-white. A card at 0.995 is a screen turned
 * up; the 0.02 it gives back is what lets the cream read as stock the app is
 * printed on, and every ink ratio below is judged against that card.
 */
const SURFACE_PLAN = {
  ceiling: 0.975,
  steps: [0.02, 0.02, 0.02, 0.032, 0.042],
  chroma: [0.01, 0.018],
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
const TOP = 0.955;
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
 * What each ink step owes, matching dark's.
 *
 * - `400` is `border-control`, 1.4.11's 3:1 against the card.
 * - `500` is subtle text, AA at 4.5 on every ground text is set on — it is
 *   body copy.
 * - `600` is the muted floor at 5.5 on the same grounds: held to 4.5
 *   alongside 500 both land on the same gray. Muted is stronger than subtle,
 *   and the ratios say so.
 * - `700` is the focus ring, 3:1 under WCAG 1.4.11 against the card.
 */
const INK_MINIMA = { 400: 3, 500: 4.5, 600: 5.5, 700: 3 };
const TEXT_STEPS = [500, 600];

/**
 * The accent tint a running calendar block is filled with, from
 * `derive-light-accent.mjs` by way of tokens.json. Text is set on it.
 */
const ACCENT_MUTED = JSON.parse(
  readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'),
).semantic.light['accent-muted'];

/**
 * Every surface text is set on: the four planes, `hover` (a calendar block's
 * fill, a hovered row) and the accent tint. `active` is only a pointer's
 * press on a block, and is left out.
 */
const textGrounds = (s) => [
  ...s.filter((p) => p.name !== 'active').map((p) => p.hex),
  ACCENT_MUTED,
];

/** Smallest push DOWN (to 4dp) that clears `min` against every one of `grounds`. */
function dropFor(baseL, C, grounds, min) {
  for (let drop = 0; drop <= 0.4; drop += 0.0001) {
    const ink = hex(baseL - drop, C, HUE);
    if (grounds.every((g) => contrast(ink, g) >= min)) return +drop.toFixed(4);
  }
  return 0;
}

function inkRamp(card, grounds) {
  const rows = Object.entries(CHROMA).map(([s, C]) => {
    const step = Number(s);
    const base = TOP - (TOP - FLOOR) * (step / 975) ** EXPONENT;
    const min = INK_MINIMA[step];
    const against = TEXT_STEPS.includes(step) ? grounds : [card];
    const L = base - (min ? dropFor(base, C, against, min) : 0);
    return { step, L: +L.toFixed(4), C, hex: hex(L, C, HUE) };
  });

  /* Pushing a step down to clear a threshold can drive it into the next: they
     descend toward the same card, so the one owing less catches up. 0.035 is
     roughly where two grays stop reading as the same color, and it is a
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

/** Text against the worst ground it is set on; rings and borders the card. */
function verify(ink, card, grounds) {
  const at = (s) => ink.find((r) => r.step === s).hex;
  const worst = (fg) => Math.min(...grounds.map((g) => contrast(fg, g)));
  console.log(`\n// text on its worst ground, rings and borders on ${card}:`);
  let ok = true;
  for (const [label, min, v] of [
    ['body   (850)', 4.5, worst(at(850))],
    ['muted  (600)', 4.5, worst(at(600))],
    ['subtle (500)', 4.5, worst(at(500))],
    ['focus  (700)', 3, contrast(at(700), card)],
    ['border (400)', 3, contrast(at(400), card)],
  ]) {
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

  const grounds = textGrounds(s);
  const ink = inkRamp(s[0].hex, grounds);
  if (!verify(ink, s[0].hex, grounds))
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
