#!/usr/bin/env node
// Asserts the contrast contract in tokens.json. Exits non-zero on failure
// so CI rejects any token change that breaks accessibility.

import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast } from './contrast.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));

function resolve(ref) {
  if (ref.startsWith('#')) return ref;
  const [group, step] = ref.split('.');
  const hex = tokens.primitive[group]?.[step]?.hex;
  if (!hex) throw new Error(`Unresolvable token reference: ${ref}`);
  return hex;
}

let failed = 0;
const fmt = (n) => n.toFixed(2).padStart(6);

console.log('\n  contrast contract\n');

for (const a of tokens.contract.assertions) {
  const ratio = contrast(resolve(a.fg), resolve(a.bg));
  const pass = ratio >= a.min;
  if (!pass) failed++;
  console.log(
    `  ${pass ? '✓' : '✗'} ${fmt(ratio)} : 1  (min ${a.min})  ${a.note}`,
  );
}

console.log('\n  forbidden pairings — must NOT meet AA\n');

for (const f of tokens.contract.forbidden) {
  const ratio = contrast(resolve(f.fg), resolve(f.bg));
  // These are documented traps. We assert they still fail, so that if a
  // token shift ever made one "pass", we notice the palette moved.
  const stillFails = ratio < 4.5;
  if (!stillFails) failed++;
  console.log(`  ${stillFails ? '✓' : '✗'} ${fmt(ratio)} : 1  ${f.reason}`);
}

/**
 * The neutral ramps must still be what their generators produce.
 *
 * The contrast contract above cannot catch a hand-edited hex — a value typed
 * straight into tokens.json passes every assertion as long as it happens to
 * clear its ratio, and that is exactly how the dark ramp drifted to 8 of 12
 * steps hand-pinned while still looking compliant. Ratios prove a colour is
 * legible; only this proves it was DERIVED.
 *
 * So both generators are re-run and diffed against the live file. A change to
 * the palette is a parameter edit followed by a paste, and if the two ever
 * disagree, CI says which step.
 */
console.log('\n  ramps match their generators\n');

/**
 * A primitive ramp: `{ "50": { "hex": "#…" } }` under `primitive[group]`,
 * pasted one step per line as `"50": { "hex": "#…" }`.
 */
const primitiveRamp = (group, script, args = []) => ({
  group,
  script,
  args,
  live: () =>
    Object.fromEntries(
      Object.entries(tokens.primitive[group]).map(([k, v]) => [k, v.hex]),
    ),
  line: /^"([a-z0-9]+)":\s*\{ "hex": "(#[0-9A-F]{6})"/,
});

/**
 * The light accent is a SEMANTIC ramp, and it drifted unchecked.
 *
 * It is derived by `derive-light-accent.mjs` for the same reason the neutrals
 * are — five hexes kept by hand is the drift this package exists to prevent —
 * but it lives under `semantic.light` as flat strings rather than in
 * `primitive`, so the loop above never saw it and a hand-edited value passed
 * `pnpm tokens:validate` outright.
 *
 * Only the rungs the generator actually prints are compared. Light `success`
 * (#457036) is a legitimate hand-set literal with no rung in the generator,
 * and inventing one to cover it would be the hand-editing this check exists
 * to catch, the other way round.
 */
const lightAccentRamp = {
  group: 'semantic.light accent',
  script: 'derive-light-accent.mjs',
  args: [],
  live: () =>
    Object.fromEntries(
      Object.entries(tokens.semantic.light).filter(
        ([k, v]) =>
          typeof v === 'string' &&
          v.startsWith('#') &&
          (k.startsWith('accent-') || k === 'timer-running'),
      ),
    ),
  line: /^"(accent-[a-z]+|timer-running)":\s*"(#[0-9A-F]{6})"/,
};

const RAMPS = [
  primitiveRamp('neutral', 'derive-neutrals.mjs', ['--gradual']),
  primitiveRamp('lightNeutral', 'derive-light.mjs'),
  lightAccentRamp,
];

for (const { group, script, args, live: readLive, line: pattern } of RAMPS) {
  const out = execFileSync(
    process.execPath,
    [join(root, 'src', script), ...args],
    {
      encoding: 'utf8',
    },
  );

  /* The paste block the generator prints, parsed back. Reading its own output
     rather than importing it keeps this honest about the thing a human
     actually copies. */
  const generated = {};
  for (const l of out.split('\n')) {
    const m = l.match(pattern);
    if (m) generated[m[1]] = m[2];
  }

  const live = readLive();

  /* A generator that printed nothing the pattern matched would otherwise
     report every step as derived — the check passing because it ran on an
     empty set is the one failure mode it cannot report itself. */
  if (Object.keys(generated).length === 0) {
    console.log(`  ✗ ${group} — ${script} printed no paste block to compare`);
    failed += 1;
    continue;
  }

  const drifted = Object.keys(live).filter(
    (step) => generated[step] !== live[step],
  );

  for (const step of drifted) {
    console.log(
      `  ✗ ${group}.${step}  file ${live[step]}  generator ${generated[step] ?? '(absent)'}`,
    );
  }
  failed += drifted.length;
  if (drifted.length === 0)
    console.log(
      `  ✓ ${group} — ${Object.keys(live).length} steps, all derived`,
    );
}

/* ── Design docs must not carry their own palette ──────────────────
 *
 * A hand-copied `:root` is the drift this package exists to prevent, and it
 * fails SILENTLY: a stale hex renders perfectly and merely misrepresents the
 * app. landing.html sat on a `--n-0` of #18191C for weeks while the real one
 * was #111316, so the marketing spec was drawn on a ground the product does
 * not have.
 *
 * Docs link `screens/_mockup.css`, which `pnpm tokens` generates. The one
 * legitimate exception is a surface that genuinely is not app chrome — the
 * invoice PDF is on white paper, and the print palette is not in our tokens.
 * Such a block opens with `not-app-chrome:` naming why, and everything up to
 * the blank line after it is exempt.
 *
 * A marker rather than a lookback window: the invoice block is 45 lines long,
 * so any window wide enough to cover it would also exempt whatever happened
 * to sit above the next one. */
const DOC_DIR = join(root, '../../docs/design');
const MARKER = /not-app-chrome:/i;

console.log('  design docs use generated tokens\n');

const docs = globSync('**/*.html', { cwd: DOC_DIR });
let literals = 0;

for (const rel of docs) {
  const src = readFileSync(join(DOC_DIR, rel), 'utf8');
  // Only the stylesheet: prose naming a hex is documentation, not a palette.
  const styles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('\n');
  /* A hex inside a comment is prose explaining a value, not a palette —
     "the accent faded computes to #285c28" is the argument FOR the rule.
     Blanked rather than dropped, so reported line numbers stay right. */
  const lines = styles
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n');
  const raw = styles.split('\n');
  const bad = [];
  /* The marker opens an exempt region; a blank line closes it, so an
     exception cannot silently annex the rest of the stylesheet. */
  let exempt = false;

  lines.forEach((line, i) => {
    if (MARKER.test(raw[i])) exempt = true;
    else if (exempt && raw[i].trim() === '') exempt = false;
    if (exempt) return;
    if (!/#[0-9A-Fa-f]{3,8}\b/.test(line)) return;
    bad.push(`    ${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
  });

  if (bad.length) {
    console.log(`  ✗ ${rel} — ${bad.length} hex literal(s)`);
    for (const b of bad.slice(0, 6)) console.log(b);
    if (bad.length > 6) console.log(`    …and ${bad.length - 6} more`);
    literals += bad.length;
  }
}

if (literals === 0) console.log(`  ✓ ${docs.length} docs, no hand-copied hex`);
else
  console.log(
    `\n  Link screens/_mockup.css and use the token name. It is generated by\n` +
      `  pnpm tokens, so it cannot go stale.`,
  );
failed += literals;

console.log(
  failed === 0
    ? '\n  all contrast assertions hold\n'
    : `\n  ${failed} assertion(s) FAILED\n`,
);
process.exit(failed === 0 ? 0 : 1);
