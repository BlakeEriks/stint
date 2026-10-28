import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('scripts/doc-refs.mjs');

const run = (claude, api) => {
  const dir = mkdtempSync(join(tmpdir(), 'doc-refs-'));
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'scripts/real.mjs'), '');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ scripts: { lint: 'x' } }),
  );
  writeFileSync(join(dir, 'CLAUDE.md'), claude);
  if (api) {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/api.md'), api);
  }
  spawnSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, '.gitignore'), '*.local\n');
  return spawnSync('node', [script], { cwd: dir, encoding: 'utf8' });
};

test('names a path that no longer exists', () => {
  const r = run('See `scripts/gone.mjs` and `scripts/real.mjs`.');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /CLAUDE\.md: `scripts\/gone\.mjs` — not found/);
  assert.doesNotMatch(r.stderr, /real\.mjs/);
});

test('names a pnpm script that no longer exists', () => {
  const r = run('Run `pnpm lint`, then `pnpm vanished`.');
  assert.match(r.stderr, /`pnpm vanished` — no such script/);
  assert.doesNotMatch(r.stderr, /pnpm lint/);
});

test('leaves package specifiers and utilities alone', () => {
  const r = run('Use `next/link`, not `bg-black/50` or `application/pdf`.');
  assert.doesNotMatch(r.stderr, /next\/link|bg-black|application/);
});

test('skips a gitignored file, which CI never has', () => {
  const r = run(
    'Set `apps/web/.env.development.local`, not `apps/web/gone.ts`.',
  );
  assert.doesNotMatch(r.stderr, /env\.development\.local/);
  assert.match(r.stderr, /`apps\/web\/gone\.ts` — not found/);
});

test("names an error the API's table gets wrong", () => {
  const r = run(
    '',
    '| `NO_TIMER_RUNNING` | 410 | |\n| `NOT_A_CODE` | 400 | |\n',
  );
  assert.match(
    r.stderr,
    /`NO_TIMER_RUNNING` is 410 there, 409 in ERROR_STATUS/,
  );
  assert.match(r.stderr, /no row for the error `TIMER_ALREADY_RUNNING`/);
  assert.match(r.stderr, /`NOT_A_CODE` is not in ERROR_STATUS/);
});
