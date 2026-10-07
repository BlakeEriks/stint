/**
 * What `derive-neutrals.mjs` and `derive-light.mjs` share: the grounds text is
 * set on, read from the contract CI checks, and the report of how the derived
 * ink fares on them.
 */
import { readFileSync } from 'node:fs';
import { contrast } from './oklch.mjs';

const tokens = JSON.parse(
  readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'),
);

/**
 * The hex of each ground `contract.text.on` names in `theme`. One on `ramp`,
 * the ramp being derived, comes from `planes` (step to hex), since the
 * derivation is what moves it; any other is read from tokens.json.
 */
export function textGrounds(theme, ramp, planes) {
  return tokens.contract.text.on.map((name) => {
    const ref = tokens.semantic[theme][name];
    if (ref.startsWith('#')) return ref;
    const [group, step] = ref.split('.');
    const hex =
      group === ramp ? planes[step] : tokens.primitive[group][step].hex;
    if (!hex) throw new Error(`${name} (${ref}) is not a derived plane`);
    return hex;
  });
}

/** Text against the worst ground it is set on; rings and borders the card. */
export function verify(ink, card, grounds) {
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
