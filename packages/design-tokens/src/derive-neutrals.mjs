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
import { printRamp, textGrounds, verify } from './ramp.mjs';
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

/** Each plane's step in `primitive.neutral`, in `surfaces()` order. */
const SURFACE_KEYS = ['recessed', '0', '25', '50', '100', '200'];

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
 * What each ink step owes. The threshold is the constant, so a step follows
 * whatever surfaces the plan produced.
 *
 * - `400` is `border-control`, 1.4.11's 3:1 against the card.
 * - `500` is `text-subtle`, AA at 4.5 on every ground text is set on — it is
 *   body copy.
 * - `600` is the muted floor at 5.5 on the same grounds: held to 4.5
 *   alongside 500 both land on the same gray. Muted is stronger than subtle,
 *   and the ratios say so.
 * - `700` is the focus ring, 3:1 under WCAG 1.4.11 against the card.
 */
const INK_MINIMA = { 400: 3, 500: 4.5, 600: 5.5, 700: 3 };
const TEXT_STEPS = [500, 600];

/** Smallest lift (to 4dp) that clears `min` against every one of `grounds`. */
function liftFor(baseL, C, grounds, min) {
  for (let lift = 0; lift <= 0.4; lift += 0.0001) {
    const ink = hex(baseL + lift, C, HUE);
    if (grounds.every((g) => contrast(ink, g) >= min)) return +lift.toFixed(4);
  }
  return 0;
}

function inkRamp(card, grounds) {
  const rows = Object.entries(CHROMA).map(([s, C]) => {
    const step = Number(s);
    const base = FLOOR + (TOP - FLOOR) * (step / 975) ** EXPONENT;
    const min = INK_MINIMA[step];
    const against = TEXT_STEPS.includes(step) ? grounds : [card];
    const L = base + (min ? liftFor(base, C, against, min) : 0);
    return { step, L: +L.toFixed(4), C, hex: hex(L, C, HUE) };
  });

  /* Lifting a step to clear a threshold can drive it into the next: they climb
     away from the same grounds, so the one owing less catches up. 0.035 is
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

  const planes = Object.fromEntries(s.map((p, i) => [SURFACE_KEYS[i], p.hex]));
  const grounds = textGrounds('dark', 'neutral', planes);
  const ink = inkRamp(s[3].hex, grounds);
  const ok = verify(ink, s[3].hex, grounds);
  if (!ok) console.log('//   ^ ink needs re-tuning against this card value');
  return { surfaces: s, ink };
}

const arg = process.argv[2];

if (arg === '--surfaces') {
  for (const name of Object.keys(SURFACE_PLANS)) printPlan(name);
} else {
  const plan = arg?.replace('--', '') ?? 'pop';
  const { surfaces: s, ink } = printPlan(plan);

  printRamp('neutral', HUE, [
    ...s.map((p, i) => ({ ...p, step: SURFACE_KEYS[i] })),
    ...ink,
  ]);
}
