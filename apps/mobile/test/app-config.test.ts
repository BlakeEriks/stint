import assert from 'node:assert/strict';
import { test } from 'node:test';

// app.config.ts reads the environment as it loads, so each case loads a fresh copy.
async function load(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    const url = new URL(
      `../app.config.ts?${JSON.stringify(env)}`,
      import.meta.url,
    );
    return (await import(url.href)).default;
  } finally {
    process.env = saved;
  }
}

const project = { EAS_PROJECT_ID: '00000000-0000-0000-0000-000000000000' };

test('a preview build takes updates for its fingerprint, with no PR of its own', async () => {
  const config = await load({ ...project, STINT_TARGET: 'preview' });
  assert.equal(config.name, 'Stint Preview');
  assert.equal(
    config.updates.url,
    `https://u.expo.dev/${project.EAS_PROJECT_ID}`,
  );
  assert.equal(config.updates.enabled, undefined);
  assert.deepEqual(config.runtimeVersion, { policy: 'fingerprint' });
});

test("a PR's update carries its PR and preview", async () => {
  const env = {
    ...project,
    STINT_TARGET: 'preview',
    STINT_PREVIEW_PR: '7',
    STINT_APP_URL: 'https://stint-git-x.vercel.app',
  };
  const config = await load(env);
  assert.equal(config.extra.env.STINT_PREVIEW_PR, '7');
  assert.equal(config.extra.env.STINT_APP_URL, env.STINT_APP_URL);
});

test('production and local builds take no updates', async () => {
  for (const STINT_TARGET of ['prod', 'local']) {
    const config = await load({ ...project, STINT_TARGET });
    assert.deepEqual(config.updates, { enabled: false });
    assert.equal(config.runtimeVersion, undefined);
  }
});
