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

test('preview and production builds read Firebase from one fixed path; local has none', async () => {
  for (const STINT_TARGET of ['preview', 'prod']) {
    const config = await load({ ...project, STINT_TARGET });
    assert.equal(config.android.googleServicesFile, './google-services.json');
    assert.equal(config.extra.push, true);
  }
  const local = await load({ ...project, STINT_TARGET: 'local' });
  assert.equal(local.android.googleServicesFile, undefined);
  assert.equal(local.extra.push, false);
});

const sentry = { SENTRY_DSN: 'https://key@o1.ingest.us.sentry.io/2' };

test('only a production build reports to Sentry', async () => {
  const prod = await load({ ...project, ...sentry, STINT_TARGET: 'prod' });
  assert.equal(prod.extra.sentryDsn, sentry.SENTRY_DSN);
  assert.ok(sentryPlugin(prod));
  for (const STINT_TARGET of ['preview', 'local']) {
    const config = await load({ ...project, ...sentry, STINT_TARGET });
    assert.equal(config.extra.sentryDsn, undefined);
    assert.equal(sentryPlugin(config), undefined);
  }
});

test('a production build uploads its symbols only when it holds the token', async () => {
  const env = { ...project, ...sentry, STINT_TARGET: 'prod' };
  const without = await load(env);
  assert.equal(sentryPlugin(without)?.[1].disableAutoUpload, true);
  const withToken = await load({ ...env, SENTRY_AUTH_TOKEN: 'sntrys_x' });
  assert.equal(sentryPlugin(withToken)?.[1].disableAutoUpload, false);
  // The token stays in EAS's environment, never in the config a bundle carries.
  assert.equal(sentryPlugin(withToken)?.[1].authToken, undefined);
});

function sentryPlugin(config: { plugins: unknown[] }) {
  return config.plugins.find(
    (p): p is [string, Record<string, unknown>] =>
      Array.isArray(p) && p[0] === '@sentry/react-native',
  );
}
