/**
 * The bearer-token path through `requireSession`.
 *
 * This is the one code path in the app that NOTHING else exercises. The
 * route suites inject `__TEST_DB__`, which short-circuits `requireSession`
 * before it reads a header; the browser suite signs in with a cookie. So the
 * branch that Expo and the macOS app depend on had no test at all, and it
 * shipped broken: `getClaims()` reads the stored session rather than the
 * `Authorization` header `bearerClient` sets, and with no stored session it
 * returns `{ data: null, error: null }` — succeeding while yielding no
 * claims, so every bearer request 401s and nothing raises.
 *
 * It therefore needs a real Auth server, not a Postgres instance: the point
 * is that a genuinely signed token resolves to the right user. Asserting
 * that `getClaims` was called with an argument would restate the fix rather
 * than test it, and would pass against a token the server rejects.
 *
 * Requires the local stack (`pnpm dev:up`) and SUPABASE_URL +
 * SUPABASE_PUBLISHABLE_KEY + SUPABASE_SECRET_KEY, which `pnpm test:auth`
 * reads from `supabase status`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishable || !secret) {
  throw new Error(
    'The bearer-token test needs a running Auth server: SUPABASE_URL, ' +
      'SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY. Run `pnpm test:auth`, ' +
      'which reads all three from `supabase status`.',
  );
}

// `requireSession` builds its client from these at call time.
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishable;

const EMAIL = 'bearer-path@test.local';
const PASSWORD = 'bearer-path-test-password';

let requireSession: typeof import('../src/lib/auth.ts').requireSession;
let userId: string;
let token: string;

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

before(async () => {
  ({ requireSession } = await import('../src/lib/auth.ts'));

  // Left behind by an interrupted run; the address must be free to re-create.
  const existing = await admin(
    `/admin/users?filter=${encodeURIComponent(EMAIL)}`,
  ).then((r) => r.json());
  for (const u of existing.users ?? []) {
    await admin(`/admin/users/${u.id}`, { method: 'DELETE' });
  }

  const created = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  }).then((r) => r.json());
  userId = created.id;
  assert.ok(
    userId,
    `could not create the test user: ${JSON.stringify(created)}`,
  );

  const signedIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishable, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  token = signedIn.access_token;
  assert.ok(token, `could not sign in: ${JSON.stringify(signedIn)}`);
});

after(async () => {
  if (userId) await admin(`/admin/users/${userId}`, { method: 'DELETE' });
});

const withHeader = (authorization: string) =>
  new Request('http://localhost/api/v1/timer/current', {
    headers: { authorization },
  });

test('a signed token resolves to the user who owns it', async () => {
  const session = await requireSession(withHeader(`Bearer ${token}`));

  // The assertion that fails when the token is not passed to `getClaims()`:
  // without it the call succeeds with no claims and this throws UNAUTHORIZED.
  assert.equal(
    session.userId,
    userId,
    'the bearer path must resolve the token’s own subject',
  );
  assert.ok(session.db, 'the session carries an RLS-scoped client');
});

test('the resolved client is scoped to that user', async () => {
  const { db } = await requireSession(withHeader(`Bearer ${token}`));

  // A new account has exactly one settings row, created by trigger. Reaching
  // it proves the token rides on the client's own requests, not just that it
  // parsed — a client built without the header would see nothing under RLS.
  const { data, error } = await db.from('user_settings').select('user_id');
  assert.equal(error, null, `the scoped query failed: ${error?.message}`);
  assert.deepEqual(
    data?.map((r) => r.user_id),
    [userId],
    'the client sees its own row and no other',
  );
});

test('a malformed token is refused', async () => {
  await assert.rejects(
    () => requireSession(withHeader('Bearer not-a-jwt')),
    /Invalid or expired token/,
  );
});

test('a token signed by someone else is refused', async () => {
  // Structurally valid, correct claims, wrong signature — the case a local
  // signature check exists to catch.
  const [header, payload] = token.split('.');
  await assert.rejects(
    () => requireSession(withHeader(`Bearer ${header}.${payload}.fake`)),
    /Invalid or expired token/,
  );
});

test('a request with no Authorization header does not take this path', async () => {
  // It falls through to the cookie client, which has no `cookies()` outside a
  // request scope. The assertion is that it is NOT silently treated as a
  // bearer request — the failure must come from the cookie branch.
  await assert.rejects(
    () => requireSession(new Request('http://localhost/api/v1/timer/current')),
    (err: Error) => !/Invalid or expired token/.test(err.message),
    'an absent header must not be read as an invalid token',
  );
});
