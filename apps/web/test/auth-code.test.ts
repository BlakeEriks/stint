/**
 * `POST /api/v1/auth/code`, against a real Auth server: the native apps'
 * only way to ask for a sign-in code once production's CAPTCHA guards
 * GoTrue's `/otp`. It must mail an existing account and never create one.
 *
 * Needs the same three variables as `auth.test.ts`; `pnpm test:auth` runs both.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishable || !secret) {
  throw new Error(
    'The sign-in code test needs a running Auth server. Run `pnpm test:auth`.',
  );
}

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishable;
process.env.SUPABASE_SECRET_KEY = secret;

const EMAIL = 'auth-code@test.local';
const STRANGER = 'auth-code-stranger@test.local';

let POST: typeof import('../src/app/api/v1/auth/code/route.ts').POST;
let userId: string;

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const usersNamed = async (email: string): Promise<{ id: string }[]> =>
  ((
    await admin(`/admin/users?filter=${encodeURIComponent(email)}`).then((r) =>
      r.json(),
    )
  ).users ?? []) as { id: string }[];

const ask = (body: unknown) =>
  POST(
    new Request('http://localhost/api/v1/auth/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

before(async () => {
  ({ POST } = await import('../src/app/api/v1/auth/code/route.ts'));
  for (const email of [EMAIL, STRANGER])
    for (const u of await usersNamed(email))
      await admin(`/admin/users/${u.id}`, { method: 'DELETE' });

  const created = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, email_confirm: true }),
  }).then((r) => r.json());
  userId = created.id;
  assert.ok(
    userId,
    `could not create the test user: ${JSON.stringify(created)}`,
  );
});

after(async () => {
  if (userId) await admin(`/admin/users/${userId}`, { method: 'DELETE' });
  for (const u of await usersNamed(STRANGER))
    await admin(`/admin/users/${u.id}`, { method: 'DELETE' });
});

test('an existing account is sent a code', async () => {
  const res = await ask({ email: EMAIL });
  assert.equal(res.status, 200, await res.clone().text());
});

test('an unknown address is told it has no account, and none is made', async () => {
  const res = await ask({ email: STRANGER });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'NO_ACCOUNT');
  assert.deepEqual(await usersNamed(STRANGER), []);
});

test('a body that is not an email is refused before GoTrue', async () => {
  const res = await ask({ email: 'not-an-email' });
  assert.equal(res.status, 422);
});
