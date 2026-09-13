#!/usr/bin/env node
/**
 * Re-derives the dark neutral ramp and prints it for tokens.json.
 *
 *   node src/derive-neutrals.mjs            # the ramp
 *   node src/derive-neutrals.mjs --surfaces # just the four painted planes
 *
 * The palette is DERIVED, not picked. This is the script that does it, kept
 * in the repo so a change to the ground is a parameter edit rather than a
 * round of eyedropping hex codes.
 *
 * ## Two scales, not one
 *
 * This file used to force every step through one eased curve plus a growing
 * pile of per-step overrides. By the time it was noticed, **8 of 12 steps
 * were hand-pinned and every surface the app actually paints was an
 * override** — the curve still governed only steps 300, 400, 850 and 975,
 * none of which are backgrounds. It had become a lookup table wearing a
 * curve's clothes, and each new layout idea meant editing four hexes.
 *
 * The cause was a real conflict, not carelessness. The two halves of a
 * neutral ramp want opposite things:
 *
 * - **Surfaces** want EVEN PERCEPTUAL SPACING. They are compared to each
 *   other, directly and side by side, so what matters is that each step feels
 *   like the same size move. An eased curve deliberately bunches them.
 * - **Text and borders** want RESOLUTION WHERE THE CONTRAST RATIOS ARE. They
 *   are compared to the surface behind them, never to each other, and the
 *   eased curve concentrates steps exactly where a dark UI needs them.
 *
 * So they are now generated separately. `surfaces()` is a linear ladder —
 * every plane the app paints comes out of it, and "make cards pop" is one
 * argument rather than four edited values. `inkRamp()` keeps the eased curve
 * for everything text and borders sit on, where it was doing real work and
 * where the contract assertions live.
 */
import { contrast, hex } from './oklch.mjs';

/**
 * Hue 264 — the blue-grey the palette was derived for.
 *
 * Warm grounds were tried and rejected. Rotating the neutral is free in OKLCH
 * (lightness is held constant, so every `contract` assertion still passes),
 * which makes the change tempting and cheap to evaluate — but a warm ground
 * reads as brown or red long before it reads as "inviting", and a neutral
 * that has an opinion of its own stops receding behind the content.
 *
 * The hard floor is the accent at 142: `$meta.hueSeparation` is a real
 * constraint, and 264 keeps 122° of it. The obvious warm choices (60-75)
 * collapse it to 67-82°, which puts the ground in the accent's own family and
 * stops the green reading as a separate signal.
 */
const HUE = 264;

/* ── surfaces ──────────────────────────────────────────────────────────
 *
 * The four planes the app paints, darkest first: the header and timer bar,
 * then the nav rail and dock, then the content column, then cards. Depth
 * increases toward what is actually being read.
 */

/**
 * @param floor  L of the darkest plane (the bars).
 * @param steps  ΔL from each plane to the next, in order. Five entries for
 *               six planes. Equal values through the first three give a
 *               gradual ladder; a larger third value makes cards pop off the
 *               content behind them.
 *
 *               The last two carry hover and active. They are surfaces the
 *               app paints — on top of a card — so they belong on this scale
 *               rather than the ink curve, which is where they used to sit
 *               and which put them BELOW the card once it moved.
 * @param chroma [start, end] — chroma is interpolated linearly across the
 *               planes rather than tracking lightness.
 *
 *               Holding it nearly flat is deliberate. When chroma climbed
 *               with L (0.0060 -> 0.0107 across these four), the blue-grey
 *               cast washed out exactly where the ladder also jumped hardest,
 *               and the middle of the app read as a different palette from
 *               its frame — "dark blue to grey", as it was described. Flat
 *               chroma carries the cast all the way up.
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
 * The two candidates under consideration.
 *
 * `gradual` is an even ladder — every step the same perceptual size.
 * `pop` holds the frame gradual and spends the extra on the last step, so a
 * card lifts off the content column rather than easing off it.
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
 * Text, borders and hover states. These sit ON a surface and are judged
 * against it by WCAG contrast, which is what the eased curve is tuned for.
 */

/**
 * Floor lifted from 0.145 to 0.215: at 0.145 the ramp started at #090A0D,
 * near enough to black that the app read as a terminal rather than a product.
 * The exponent eased from 1.55 to 1.40 to compensate — a higher floor with
 * the old curve bunches the midtones.
 *
 * These now describe the INK scale only. The surfaces no longer pass through
 * here, which is why the floor can stay where the contrast maths wants it
 * while the painted ground sits far below at 0.150.
 */
const FLOOR = 0.215;
const EXPONENT = 1.4;
const TOP = 0.985;

/** Chroma per step — peaks mid-ramp so mid greys carry the cast. */
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
 * The three ink steps that must clear a ratio against the card behind them,
 * and the ratio each one owes.
 *
 * These used to be fixed `OFFSET` nudges — +0.013, +0.03, +0.035 — tuned by
 * hand against a card at L 0.2468. That is exactly the coupling that made the
 * old file a lookup table: move the card and the numbers silently stop
 * meaning anything, because nothing re-derives them.
 *
 * So the THRESHOLD is the constant now, not the nudge. Each step is lifted
 * off the curve by however much it takes to clear its ratio against whatever
 * card the surface plan produced — which makes "make cards pop" safe to try,
 * because the ink follows.
 *
 * - `500` is `text-subtle`, and it owes **AA at 4.5** — not the 3:1 it used to.
 *   `docs/design/color.md` demoted it to "borders and icons" when it measured
 *   4.10 against the card, and the app then set body copy in it in over a
 *   hundred places regardless. A rule that lives only in prose is not a rule;
 *   deriving it at a text ratio settles it in the direction the app already
 *   went. `border-control` keeps the 3:1 boundary job under its own name.
 * - `600` is the muted floor at **5.5**. Held to 4.5 alongside 500 it lands on
 *   the same value — both are pushed to the same threshold against the same
 *   card, so the curve's own separation is lost and two names describe one
 *   grey. The hierarchy is muted stronger than subtle; the ratios say so.
 * - `700` is the focus ring, 3:1 under WCAG 1.4.11, and is additionally held
 *   above 600 so the ramp stays monotonic instead of bunching them.
 * - `400` is `border-control`, 1.4.11's 3:1.
 *
 *   It took that job **from 500**, which was carrying three at once —
 *   `text-subtle`, `border-control` and `timer-idle` — and that is why the
 *   step could not be derived for any of them. Holding it to AA as text
 *   immediately made it far too bright for a control boundary; holding it to
 *   3:1 as a boundary is what had body copy failing AA. One primitive cannot
 *   owe two different ratios, so the roles split, and dark now matches light
 *   where they were already separate.
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

  /* Lifting steps to clear a threshold can drive one INTO the next: they climb
     away from the same card, so the one that owes less catches up. Sweeping the
     whole ramp handles that generally, where the old guard only watched the
     600/700 pair it had already been bitten by.

     A minimum, not a nudge — 0.035 is roughly where two greys stop reading as
     the same colour — and a floor, never a ceiling: a step that earned more
     distance by owing a stricter ratio keeps it. */
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
