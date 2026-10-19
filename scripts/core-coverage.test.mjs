import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the core coverage floor never drops below 98% lines, 92% branches', () => {
  const script = JSON.parse(read('packages/core/package.json')).scripts.test;
  const floor = (kind) =>
    Number(script.match(new RegExp(`--test-coverage-${kind}=(\\d+)`))?.[1]);
  assert.ok(floor('lines') >= 98, 'lines floor');
  assert.ok(floor('branches') >= 92, 'branches floor');
});

test('CI runs the core suite through its package script', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /run: pnpm --filter @stint\/core test\n/);
  assert.doesNotMatch(ci, /node --test[^\n]*packages\/core\/test/);
});
