#!/usr/bin/env node
/**
 * Re-derives the LIGHT accent ramp and prints it for tokens.json.
 *
 *   node src/derive-light-accent.mjs
 *
 * Dark's accent is a primitive ladder at `accentHue` 142 and light cannot
 * borrow it: `#52FC43` is ~1.6:1 on cream and unusable as anything but a
 * fill. The five light values are these, and they are derived for the same
 * reason the neutrals are — five hexes kept by hand is the drift the token
 * package exists to prevent. `docs/design/deriving-color.md` has why.
 */
import { contrast, hex } from './oklch.mjs';

/**
 * Forest, not dark's neon. Rotated off 142 toward yellow so the green sits
 * with a hue-82 paper rather than on top of it — at these lightnesses 142
 * reads cold against cream.
 */
const HUE = 138;

/**
 * WHITE is the ink on the accent, which is what caps the ladder.
 *
 * Dark puts near-black on its accent, and light cannot: across the whole
 * forest/olive range dark ink tops out near 3:1, so white is the only ink
 * that clears AA and `default` must stay dark enough to carry it. L 0.455 is
 * inside that ceiling with room to spare — see `verify` below, which fails
 * the build rather than letting a lighter olive through.
 */
const ON_ACCENT = '#FFFFFF';

/**
 * Five rungs, each with a job:
 *
 * - `default`  the running timer and the primary confirm action.
 * - `hover`    and `active`, descending — light darkens under the cursor
 *              where dark brightens, because the ground is paper.
 * - `subtle`   a step UP, for accent-colored text and marks on the card.
 * - `muted`    the tinted surface: a paid badge, a selected row.
 *
 * Chroma eases off as the rungs darken, where the gamut narrows, and drops
 * hard at `muted`, which is a surface rather than a color.
 */
const RAMP = {
  default: { L: 0.455, C: 0.095 },
  hover: { L: 0.405, C: 0.085 },
  active: { L: 0.37, C: 0.078 },
  subtle: { L: 0.525, C: 0.105 },
  muted: { L: 0.935, C: 0.03 },
};

/* ── output ────────────────────────────────────────────────────────────── */

/**
 * What the ramp owes the surfaces around it. `card` is lightNeutral.0 and
 * `ink` is lightNeutral.850 — both are read from tokens.json rather than
 * repeated here, so retuning the neutrals re-checks the accent against them.
 */
function verify(ramp, { card, ink }) {
  console.log(`\n// accent against the card surface (${card}):`);
  let ok = true;
  for (const [label, fg, bg, min] of [
    ['white on default ', ON_ACCENT, ramp.default.hex, 4.5],
    ['default on card  ', ramp.default.hex, card, 4.5],
    ['subtle on card   ', ramp.subtle.hex, card, 4.5],
    ['body ink on muted', ink, ramp.muted.hex, 4.5],
  ]) {
    const v = contrast(fg, bg);
    if (v < min) ok = false;
    console.log(
      `//   ${label} ${v.toFixed(2)} (min ${min})${v >= min ? '' : '  FAILS'}`,
    );
  }
  return ok;
}

const ramp = Object.fromEntries(
  Object.entries(RAMP).map(([name, { L, C }]) => [
    name,
    { L, C, hex: hex(L, C, HUE) },
  ]),
);

console.log(`\n${'='.repeat(58)}\nLIGHT ACCENT\n`);
console.log('rung      L        C        hex');
for (const [name, r] of Object.entries(ramp))
  console.log(name.padEnd(9), r.L.toFixed(4), ' ', r.C.toFixed(4), ' ', r.hex);

const { lightNeutral } = JSON.parse(
  await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../tokens.json', import.meta.url), 'utf8'),
  ),
).primitive;

if (
  !verify(ramp, { card: lightNeutral['0'].hex, ink: lightNeutral['850'].hex })
)
  console.log('//   ^ accent needs re-tuning against this card value');

console.log('\n// ---- paste into tokens.json semantic.light ----');
for (const [name, r] of Object.entries(ramp))
  console.log(
    `"accent-${name}":`.padEnd(20),
    `"${r.hex}",`,
    `// oklch(${r.L.toFixed(4)} ${r.C.toFixed(4)} ${HUE})`,
  );
console.log(
  '"timer-running":'.padEnd(20),
  `"${ramp.default.hex}",`,
  '// accent-default',
);
