import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lint } from './lint.mjs';

const core = 'packages/core/src/probe.ts';

for (const specifier of [
  'next/server',
  'next/dist/server/web/spec-extension/request',
  '@supabase/supabase-js',
  '@supabase/ssr/dist/main',
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:http2',
  'fs/promises',
  'net',
  'dns',
  'tls',
  'undici',
]) {
  test(`core importing ${specifier} fails lint`, () => {
    const run = lint(
      `import * as m from '${specifier}';\n\nexport { m };\n`,
      core,
    );
    assert.equal(run.status, 1);
    assert.match(run.stderr + run.stdout, /does no I\/O/);
  });
}

for (const global of ['fetch', 'XMLHttpRequest', 'WebSocket']) {
  test(`core using global ${global} fails lint`, () => {
    const run = lint(`export const m = ${global};\n`, core);
    assert.equal(run.status, 1);
    assert.match(run.stderr + run.stdout, /does no I\/O/);
  });
}

test('core importing a sibling passes', () => {
  const run = lint("import * as m from './rates';\n\nexport { m };\n", core);
  assert.equal(run.status, 0, run.stderr + run.stdout);
});

test('outside core, node:fs and fetch pass', () => {
  const run = lint(
    "import * as m from 'node:fs';\n\nexport const f = fetch;\nexport { m };\n",
    'apps/web/scripts/probe.ts',
  );
  assert.equal(run.status, 0, run.stderr + run.stdout);
});
