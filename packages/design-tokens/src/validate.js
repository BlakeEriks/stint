#!/usr/bin/env node
// Asserts the contrast contract in tokens.json. Exits non-zero on failure
// so CI rejects any token change that breaks accessibility.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const RAMPS = [
  { group: 'neutral', script: 'derive-neutrals.mjs', args: ['--gradual'] },
  { group: 'lightNeutral', script: 'derive-light.mjs', args: [] },
];

for (const { group, script, args } of RAMPS) {
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
  for (const line of out.split('\n')) {
    const m = line.match(/^"([a-z0-9]+)":\s*\{ "hex": "(#[0-9A-F]{6})"/);
    if (m) generated[m[1]] = m[2];
  }

  const live = tokens.primitive[group];
  const drifted = Object.keys(live).filter(
    (step) => generated[step] !== live[step].hex,
  );

  for (const step of drifted) {
    console.log(
      `  ✗ ${group}.${step}  file ${live[step].hex}  generator ${generated[step] ?? '(absent)'}`,
    );
  }
  failed += drifted.length;
  if (drifted.length === 0)
    console.log(
      `  ✓ ${group} — ${Object.keys(live).length} steps, all derived`,
    );
}

console.log(
  failed === 0
    ? '\n  all contrast assertions hold\n'
    : `\n  ${failed} assertion(s) FAILED\n`,
);
process.exit(failed === 0 ? 0 : 1);
