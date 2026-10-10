import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..');

// Writes the probe under `dir` in the repo, since the override matches by
// path; Biome's stdin mode reports no diagnostics, so it cannot stand in.
function lint(source, dir = 'packages/core/src') {
  const tmp = mkdtempSync(join(root, dir, 'probe-'));
  try {
    const file = join(tmp, 'probe.ts');
    writeFileSync(file, source);
    return spawnSync(join(root, 'node_modules/.bin/biome'), ['lint', file], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    rmSync(tmp, { recursive: true });
  }
}

for (const specifier of [
  'next/server',
  '@supabase/supabase-js',
  'node:fs',
  'fs/promises',
  'node:http',
  'net',
]) {
  test(`core importing ${specifier} fails lint`, () => {
    const run = lint(`import * as m from '${specifier}';\n\nexport { m };\n`);
    assert.equal(run.status, 1);
    assert.match(run.stderr + run.stdout, /does no I\/O/);
  });
}

test('core importing a sibling passes', () => {
  const run = lint("import * as m from './rates';\n\nexport { m };\n");
  assert.equal(run.status, 0, run.stderr + run.stdout);
});

test('outside core, node:fs passes', () => {
  const run = lint(
    "import * as m from 'node:fs';\n\nexport { m };\n",
    'apps/web/scripts',
  );
  assert.equal(run.status, 0, run.stderr + run.stdout);
});
