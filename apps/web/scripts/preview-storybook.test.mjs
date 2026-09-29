import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const web = join(import.meta.dirname, '..');
const out = join(web, 'public/storybook');

/* Production must never ship Storybook: its mocks and fixtures would be
   public on the live site. The preview path needs no test of its own —
   every PR's preview runs it, and Try it links into what it built. */
for (const env of ['production', 'development', undefined]) {
  test(`builds nothing when VERCEL_ENV is ${env ?? 'unset'}`, () => {
    const { VERCEL_ENV: _, ...rest } = process.env;
    execFileSync('bash', ['scripts/preview-storybook.sh'], {
      cwd: web,
      env: env ? { ...rest, VERCEL_ENV: env } : rest,
    });
    assert.equal(existsSync(out), false);
  });
}
