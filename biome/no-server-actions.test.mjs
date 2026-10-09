import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..');

// Lints a file outside the repo against the repo's biome.jsonc, so the test
// proves the plugin is wired in, not only that its pattern matches. VCS is off
// because Biome's gitignore walk rejects a path outside the root.
function lint(source) {
  const file = join(mkdtempSync(join(tmpdir(), 'grit-')), 'action.ts');
  writeFileSync(file, source);
  return spawnSync(
    join(root, 'node_modules/.bin/biome'),
    ['lint', '--vcs-enabled=false', `--config-path=${root}`, file],
    { encoding: 'utf8' },
  );
}

test('a file-level use server directive fails lint', () => {
  const run = lint("'use server';\n\nexport async function save() {}\n");
  assert.equal(run.status, 1);
  assert.match(run.stderr + run.stdout, /A Server Action/);
});

test('an inline use server directive fails lint', () => {
  const run = lint("export async function save() {\n  'use server';\n}\n");
  assert.equal(run.status, 1);
  assert.match(run.stderr + run.stdout, /A Server Action/);
});

test('use client passes', () => {
  const run = lint("'use client';\n\nexport function View() {}\n");
  assert.equal(run.status, 0, run.stderr + run.stdout);
});
