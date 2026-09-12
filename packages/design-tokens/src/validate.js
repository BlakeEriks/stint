#!/usr/bin/env node
// Asserts the contrast contract in tokens.json. Exits non-zero on failure
// so CI rejects any token change that breaks accessibility.

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

console.log(
  failed === 0
    ? '\n  all contrast assertions hold\n'
    : `\n  ${failed} assertion(s) FAILED\n`,
);
process.exit(failed === 0 ? 0 : 1);
