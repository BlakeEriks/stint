import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lint } from './lint.mjs';

const lintAction = (source) => lint(source, 'apps/web/src/action.ts');

test('a file-level use server directive fails lint', () => {
  const run = lintAction("'use server';\n\nexport async function save() {}\n");
  assert.equal(run.status, 1);
  assert.match(run.stderr + run.stdout, /A Server Action/);
});

test('an inline use server directive fails lint', () => {
  const run = lintAction(
    "export async function save() {\n  'use server';\n}\n",
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr + run.stdout, /A Server Action/);
});

test('use client passes', () => {
  const run = lintAction("'use client';\n\nexport function View() {}\n");
  assert.equal(run.status, 0, run.stderr + run.stdout);
});
