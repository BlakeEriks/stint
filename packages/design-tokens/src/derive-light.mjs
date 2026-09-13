#!/usr/bin/env node
/**
 * Re-derives the LIGHT neutral ramp and prints it for tokens.json.
 *
 *   node src/derive-light.mjs             # the ramp
 *   node src/derive-light.mjs --surfaces  # just the painted planes
 *
 * The companion to `derive-neutrals.mjs`, and it exists for the same reason:
 * `lightNeutral` was twelve hand-picked hexes with **no generator at all** and
 * no `oklch` field on any of them, so nothing could be re-derived and nothing
 * could be measured. Auditing it found what that always costs:
 *
 * - **The hue wandered 262.3° to 271.4°** across the ramp. Dark holds 264
 *   exactly. Light was not one neutral, it was twelve slightly different ones,
 *   and the drift is largest at the pale end where the surfaces live.
 * - **The frame narrowed toward the card**: ΔL 0.039, 0.021, 0.015 across
 *   recessed -> base -> primary -> elevated, versus dark's even 0.035 each. The
 *   ladder ran out of room because `bg-elevated` was pinned at `#FFFFFF`,
 *   which is a ceiling you cannot build on.
 * - **`text-subtle` measured 4.498:1** against that white card — failing AA by
 *   rounding, in the direction nobody checks.
 *
 * ## Why this is not `derive-neutrals.mjs` with the numbers flipped
 *
 * Mirroring is what the old doc claimed ("same hues, mirrored curve") and it
 * is wrong in two specific ways:
 *
 * 1. **Ink moves the other way.** Dark text is LIFTED off the curve to gain
 *    contrast against its card; light text must be PUSHED DOWN. `liftFor` and
 *    `dropFor` are the same search in opposite directions, and sharing one
 *    function would need a sign parameter that reads as cleverness.
 * 2. **The planes descend from a ceiling, not up from a floor.** There is
 *    headroom below white and none above it, so the card is the anchor here
 *    where the bars are the anchor in dark. That inverts which end the plan
 *    pins, which is a different shape of input, not a different constant.
 *
 * What DOES transfer is the thing the dark refactor was actually about: two
 * independent scales, because surfaces want even perceptual spacing and ink
 * wants resolution where the contrast ratios are. One eased curve cannot
 * serve both, and pretending otherwise is what turns a generator into a
 * lookup table.
 */
import { contrast, hex } from './oklch.mjs';

/** Held constant, exactly as dark holds it. See the hue note in derive-neutrals.mjs. */
const HUE = 264;

/* ── surfaces ──────────────────────────────────────────────────────────
 *
 * The same four planes, in the same order of depth: bars, rail+dock, content,
 * cards. Depth still increases toward what is being read — but in light that
 * means each plane is LIGHTER than the one behind it, so the ladder descends
 * from the card rather than climbing to it.
 */

/**
 * @param ceiling L of the card — the nearest plane, and the anchor.
 *
 *                Not 1.0. Pure white leaves nothing above the content column,
 *                which is how the old ramp ended up spending only ΔL 0.015 on
 *                its last step: there was no room left. 0.995 costs nothing
 *                visible and buys the whole ladder somewhere to stand.
 * @param steps   ΔL down from each plane to the one behind it, card-first.
 *                Five entries for six planes, mirroring the dark plan's shape.
 * @param chroma  [card, bars] — interpolated linearly, card first since that
 *                is the anchor.
 *
 *                Light carries LESS chroma than dark at the same nominal cast.
 *                A blue-grey tint that reads as a considered neutral at L 0.25
 *                reads as a colour at L 0.95, because the same chroma is a
 *                larger share of the remaining distance to white. Dark runs
 *                0.0060 -> 0.0140; this runs a third of that.
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
 * `steps` reads card -> content -> rail+dock -> bars, then hover and active.
 *
 * The first three are 0.022, larger than they look: perceptual distance
 * compresses toward white, so a 0.022 step at L 0.97 is a comparable read to
 * dark's 0.035 at L 0.20. They were measured against the old ramp's three
 * steps (0.015 / 0.021 / 0.039, narrowing the wrong way) and set even instead,
 * which is the same argument `gradual` won on the dark side.
 *
 * Hover and active descend from the CARD, not from the bars — they are painted
 * on top of a card, so they belong on this scale at the card's end of it. That
 * is the same correction the dark plan needed when its hover sat below the
 * surface it was hovering.
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
 * The curve descends from just below the card to near-black.
 *
 * `TOP` is where step 0 would sit and is never painted as text; `FLOOR` is
 * step 975, the strongest ink. The exponent bunches steps toward the dark end,
 * where light-mode contrast ratios actually separate — the pale half of a
 * light ramp is all within a point or two of each other against a white card,
 * so spending resolution there buys nothing.
 */
const TOP = 0.975;
const FLOOR = 0.145;
const EXPONENT = 1.4;

/**
 * Chroma peaks mid-ramp, as dark's does, and for the same reason: mid greys
 * are where a neutral cast is legible. It is scaled down from dark's for the
 * reason given on `surfaces` — the same chroma reads stronger on a light
 * ground.
 */
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
 * What each ink step owes the card behind it.
 *
 * **`500` owes 4.5, not 3, and that is the substantive change here.** In dark
 * it is a 3:1 token — `docs/design/color.md` demotes it to "borders and icons"
 * because `n-500` on the card measured 4.10 and failed AA. The app then used
 * `text-subtle` as body text in over a hundred places anyway, so the rule
 * existed only in prose while every screen quietly broke it.
 *
 * Deriving it at 4.5 resolves that in the direction the app already went: the
 * token is text, so it is held to a text ratio. `border-control` keeps the 3:1
 * job under its own name, which is what the doc was really protecting.
 *
 * - `500` is subtle text, now AA at 4.5.
 * - `600` is the muted floor at **5.5, not 4.5**. Both held to the same ratio
 *   against the same card is a contradiction, not a contract: the threshold
 *   pins them to the same place and the curve's own separation is lost. Run
 *   that way they came out ΔL 0.0087 apart — two names for one grey. The app's
 *   hierarchy is strong > primary > muted > subtle, so muted owes MORE than
 *   subtle and the ratios say so.
 * - `700` is the focus ring, 3:1 under WCAG 1.4.11, held below 600 so the
 *   ramp stays monotonic.
 * - `400` is `border-control` — a genuine control boundary, so 1.4.11's 3:1.
 */
const INK_MINIMA = { 400: 3, 500: 4.5, 600: 5.5, 700: 3 };

/**
 * Smallest push DOWN (to 4dp) that clears `min` against `card`.
 *
 * The mirror of `liftFor` in `derive-neutrals.mjs`. Light ink darkens to gain
 * contrast where dark ink brightens, which is why these are two functions and
 * not one with a sign flag.
 */
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

  /* Pushing steps down to clear a threshold can drive one INTO the next: they
     descend toward the same card, so the one that owes less catches up. The
     first run of this file produced 500 and 600 at ΔL 0.0087 — two names for
     one grey, which is worse than either being slightly light.

     So the ramp is swept dark-ward and any step that failed to stay clear of
     the one above it is pushed the rest of the way. A minimum, not a nudge:
     0.035 is roughly where two greys stop reading as the same colour, and it
     is what the dark generator uses for the same job.

     This is a floor on separation, never a ceiling — a step that earned more
     distance by owing a stricter ratio keeps it. */
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
  /* Card-first order in the plan, but the ramp is written light-to-dark the
     way every other ramp in the file is, so 0 is the card. */
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
