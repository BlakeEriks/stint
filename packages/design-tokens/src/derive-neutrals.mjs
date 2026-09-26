#!/usr/bin/env node
/**
 * Re-derives the dark neutral ramp and prints it for tokens.json.
 *
 *   node src/derive-neutrals.mjs            # the ramp
 *   node src/derive-neutrals.mjs --surfaces # just the painted planes
 *
 * Two independent scales: `surfaces()` is a linear ladder, `inkRamp()` an
 * eased curve. `docs/design/deriving-color.md` has why.
 */
import { contrast, hex } from './oklch.mjs';

/** The blue-gray the palette was derived for, held across every step. */
const HUE = 264;

/* ── surfaces ──────────────────────────────────────────────────────────
 *
 * The planes the app paints, darkest first. Depth increases toward what is
 * being read; hover and active are painted on a card, so they sit here.
 */

/**
 * @param floor  L of the darkest plane (the bars).
 * @param steps  ΔL from each plane to the next. Five entries for six planes;
 *               a larger third value makes cards pop off the content behind
 *               them.
 * @param chroma [start, end], interpolated linearly across the planes rather
 *               than tracking lightness.
 */
function surfaces({ floor, steps, chroma: [c0, c1] }) {
  const names = ['bars', 'rail+dock', 'content', 'cards', 'hover', 'active'];
  let L = floor;
  return names.map((name, i) => {
    if (i > 0) L += steps[i - 1];
    const C = +(c0 + ((c1 - c0) * i) / (names.length - 1)).toFixed(4);
    return { name, L: +L.toFixed(4), C, hex: hex(L, C, HUE) };
  });
}

/**
 * `gradual` is an even ladder. `pop` holds the frame gradual and spends the
 * extra on the last step, so a card lifts off the content column.
 */
const SURFACE_PLANS = {
  gradual: {
    floor: 0.15,
    steps: [0.035, 0.035, 0.035, 0.03, 0.035],
    chroma: [0.006, 0.014],
  },
  pop: {
    floor: 0.15,
    steps: [0.035, 0.033, 0.067, 0.03, 0.035],
    chroma: [0.006, 0.014],
  },
};

/* ── ink ───────────────────────────────────────────────────────────────
 *
 * Text and borders. These sit ON a surface and are judged against it by WCAG
 * contrast, which is what the eased curve is tuned for.
 */

/** The ink curve alone — the painted ground sits far below, at L 0.150. */
const FLOOR = 0.215;
const EXPONENT = 1.4;
const TOP = 0.985;

/** Chroma per step — peaks mid-ramp so mid grays carry the cast. */
const CHROMA = {
  300: 0.0196,
  400: 0.0214,
  500: 0.022,
  600: 0.021,
  700: 0.0181,
  850: 0.0129,
  975: 0.004,
};

/**
 * What each ink step owes the card behind it. The threshold is the constant,
 * so a step follows whatever card the surface plan produced.
 *
 * - `400` is `border-control`, 1.4.11's 3:1.
 * - `500` is `text-subtle`, AA at 4.5 — it is body copy.
 * - `600` is the muted floor at 5.5: held to 4.5 alongside 500 both land on
 *   the same gray. Muted is stronger than subtle, and the ratios say so.
 * - `700` is the focus ring, 3:1 under WCAG 1.4.11.
 */
const INK_MINIMA = { 400: 3, 500: 4.5, 600: 5.5, 700: 3 };

/** Smallest lift (to 4dp) that clears `min` against `card`. */
function liftFor(baseL, C, card, min) {
  for (let lift = 0; lift <= 0.4; lift += 0.0001) {
    if (contrast(hex(baseL + lift, C, HUE), card) >= min)
      return +lift.toFixed(4);
  }
  return 0;
}

function inkRamp(card) {
  const rows = Object.entries(CHROMA).map(([s, C]) => {
    const step = Number(s);
    const base = FLOOR + (TOP - FLOOR) * (step / 975) ** EXPONENT;
    const min = INK_MINIMA[step];
    const L = base + (min ? liftFor(base, C, card, min) : 0);
    return { step, L: +L.toFixed(4), C, hex: hex(L, C, HUE) };
  });

  /* Lifting a step to clear a threshold can drive it into the next: they climb
     away from the same card, so the one owing less catches up. 0.035 is
     roughly where two grays stop reading as the same color, and it is a
     floor — a step that earned more distance by owing a stricter ratio keeps
     it. */
  const MIN_SEPARATION = 0.035;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].L - rows[i - 1].L;
    if (gap >= MIN_SEPARATION) continue;
    rows[i].L = +(rows[i - 1].L + MIN_SEPARATION).toFixed(4);
    rows[i].hex = hex(rows[i].L, rows[i].C, HUE);
  }
  return rows;
}

/* ── output ────────────────────────────────────────────────────────────── */

/** Ink is judged against the surface it sits on, which is the card. */
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

function printPlan(planName) {
  const plan = SURFACE_PLANS[planName];
  const s = surfaces(plan);

  console.log(`\n${'='.repeat(58)}\n${planName.toUpperCase()}\n`);
  console.log('plane        L        C        hex       dL');
  s.forEach((p, i) => {
    const dL = i ? `+${(p.L - s[i - 1].L).toFixed(4)}` : '  -';
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

  const ink = inkRamp(s[3].hex);
  const ok = verify(ink, s[3].hex);
  if (!ok) console.log('//   ^ ink needs re-tuning against this card value');
  return { surfaces: s, ink };
}

const arg = process.argv[2];

if (arg === '--surfaces') {
  for (const name of Object.keys(SURFACE_PLANS)) printPlan(name);
} else {
  const plan = arg?.replace('--', '') ?? 'pop';
  const { surfaces: s, ink } = printPlan(plan);

  console.log('\n// ---- paste into tokens.json primitive.neutral ----');
  const SURFACE_KEYS = ['recessed', '0', '25', '50', '100', '200'];
  s.forEach((p, i) => {
    console.log(
      `"${SURFACE_KEYS[i]}":`.padEnd(12),
      `{ "hex": "${p.hex}", "oklch": [${p.L.toFixed(4)}, ${p.C.toFixed(4)}, ${HUE}] },`,
    );
  });
  for (const { step, L, C, hex: h } of ink) {
    console.log(
      `"${step}":`.padEnd(12),
      `{ "hex": "${h}", "oklch": [${L.toFixed(4)}, ${C.toFixed(4)}, ${HUE}] },`,
    );
  }
}
