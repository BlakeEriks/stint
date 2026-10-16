import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the core suite runs with a line and branch coverage floor', () => {
  const { test: script } = JSON.parse(
    read('packages/core/package.json'),
  ).scripts;
  assert.match(script, /--experimental-test-coverage/);
  assert.match(script, /--test-coverage-lines=\d+/);
  assert.match(script, /--test-coverage-branches=\d+/);
});

test('CI runs the core suite through its package script, floor included', () => {
  const step = read('.github/workflows/ci.yml').match(
    /- name: Core logic tests\n\s+run: (.+)/,
  );
  assert.ok(step, 'CI has a Core logic tests step');
  assert.equal(step[1], 'pnpm --filter @stint/core test');
});
