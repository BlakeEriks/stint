import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget } from '../src/target.ts';

test('local is the default and points at the local stack', () => {
  const t = resolveTarget({});
  assert.equal(t.name, 'local');
  assert.equal(t.label, 'Local');
  assert.equal(t.appId, 'dev.stint.mobile.local');
  assert.equal(t.supabaseUrl, 'http://localhost:54321');
  assert.equal(t.appUrl, 'http://localhost:3100');
  assert.equal(t.preview, null);
});

test('local takes another web origin', () => {
  const t = resolveTarget({ STINT_APP_URL: 'http://localhost:3101' });
  assert.equal(t.appUrl, 'http://localhost:3101');
});

test('prod is Stint, unlabeled, on production', () => {
  const t = resolveTarget({ STINT_TARGET: 'prod' });
  assert.equal(t.appName, 'Stint');
  assert.equal(t.appId, 'dev.stint.mobile');
  assert.equal(t.label, null);
  assert.equal(t.appUrl, 'https://app.runstint.com');
  assert.equal(t.supabaseUrl, 'https://zwoceqydagxxmqoaqgbf.supabase.co');
});

test("preview is one PR's, signed in as its seeded account", () => {
  const t = resolveTarget({
    STINT_TARGET: 'preview',
    STINT_PREVIEW_PR: '471',
    STINT_APP_URL: 'https://stint-git-x-blakeeriks-projects.vercel.app',
  });
  assert.equal(t.label, 'PR 471');
  assert.equal(t.appName, 'Stint Preview');
  assert.equal(t.appId, 'dev.stint.mobile.preview');
  assert.equal(t.supabaseUrl, 'https://aywejkegniljsljdzfrk.supabase.co');
  assert.deepEqual(t.preview, {
    email: 'pr-471@preview.test',
    password: 'devpassword123',
  });
  // No secret ships in a build: the bypass is typed into the app (`bypass.ts`).
  assert.equal('bypass' in t, false);
});

test('a preview missing its PR or origin is refused', () => {
  const full = {
    STINT_TARGET: 'preview',
    STINT_PREVIEW_PR: '471',
    STINT_APP_URL: 'https://x.vercel.app',
  };
  for (const key of ['STINT_PREVIEW_PR', 'STINT_APP_URL'] as const) {
    assert.throws(() => resolveTarget({ ...full, [key]: undefined }), {
      message: new RegExp(key),
    });
  }
  assert.throws(
    () => resolveTarget({ ...full, STINT_PREVIEW_PR: 'abc' }),
    /STINT_PREVIEW_PR/,
  );
});

test('an unknown target is refused', () => {
  assert.throws(() => resolveTarget({ STINT_TARGET: 'staging' }), /staging/);
});
