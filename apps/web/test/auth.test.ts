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
import { createHash, randomBytes } from 'node:crypto';
import { deleteUser, freshUser, publishable, url } from './auth-server.ts';

const EMAIL = 'bearer-path@test.local';
const PASSWORD = 'bearer-path-test-password';

let requireSession: typeof import('../src/lib/auth.ts').requireSession;
let toolCall: typeof import('../src/lib/auth.ts').toolCall;
let userId: string;
let token: string;

before(async () => {
  ({ requireSession, toolCall } = await import('../src/lib/auth.ts'));
  userId = await freshUser(EMAIL, { password: PASSWORD });

  const signedIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishable, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  token = signedIn.access_token;
  assert.ok(token, `could not sign in: ${JSON.stringify(signedIn)}`);
});

after(async () => {
  if (userId) await deleteUser(userId);
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

// ── Connected apps (Supabase's OAuth server) ───────────────────────

/** A connected app's token for the test user: registered, approved and
 *  exchanged, as Claude does it. */
const connect = async () => {
  const auth = `${url}/auth/v1`;
  const redirect = 'http://localhost:9999/callback';
  const app = await fetch(`${auth}/oauth/clients/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test Claude',
      redirect_uris: [redirect],
      token_endpoint_auth_method: 'none',
    }),
  }).then((r) => r.json());
  assert.ok(app.client_id, `could not register: ${JSON.stringify(app)}`);

  const verifier = randomBytes(32).toString('base64url');
  const authorize = await fetch(
    `${auth}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: app.client_id,
      redirect_uri: redirect,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    })}`,
    { redirect: 'manual', headers: { apikey: publishable } },
  );
  const consent = new URL(authorize.headers.get('location') ?? '');
  const id = consent.searchParams.get('authorization_id');
  const asUser = {
    apikey: publishable,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  // Read first, as the approval page does: it binds the request to the user.
  await fetch(`${auth}/oauth/authorizations/${id}`, { headers: asUser });
  const approved = await fetch(`${auth}/oauth/authorizations/${id}/consent`, {
    method: 'POST',
    headers: asUser,
    body: JSON.stringify({ action: 'approve' }),
  }).then((r) => r.json());
  const code = new URL(approved.redirect_url).searchParams.get('code') ?? '';

  const exchanged = await fetch(`${auth}/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id: app.client_id,
      code_verifier: verifier,
    }),
  }).then((r) => r.json());
  assert.ok(exchanged.access_token, JSON.stringify(exchanged));
  return {
    clientId: app.client_id as string,
    appToken: exchanged.access_token as string,
  };
};

test('a connected app’s token reaches the MCP tools and nothing else', async () => {
  const { appToken } = await connect();

  await assert.rejects(
    () => requireSession(withHeader(`Bearer ${appToken}`)),
    /only reaches its MCP tools/,
  );
  const session = await requireSession(
    toolCall(withHeader(`Bearer ${appToken}`)),
  );
  assert.equal(session.userId, userId);
});

test('Connected apps lists an approved app, and revoking it cuts it off', async () => {
  const { clientId, appToken } = await connect();
  const apps = await import('../src/app/api/v1/connected-apps/route.ts');
  const app = await import(
    '../src/app/api/v1/connected-apps/[clientId]/route.ts'
  );
  const { POST: mcp } = await import('../src/app/api/mcp/route.ts');
  const call = () =>
    mcp(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${appToken}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'list_projects', arguments: {} },
        }),
      }),
    );

  const listed = await apps.GET(withHeader(`Bearer ${token}`));
  const { apps: connected } = await listed.json();
  assert.ok(
    connected.some(
      (a: { clientId: string; name: string }) =>
        a.clientId === clientId && a.name === 'Test Claude',
    ),
  );
  assert.equal((await call()).status, 200, 'the app reaches its tools');

  const revoked = await app.DELETE(withHeader(`Bearer ${token}`), {
    params: Promise.resolve({ clientId }),
  });
  assert.equal(revoked.status, 204);
  assert.equal((await call()).status, 401, 'a revoked app is refused at once');
});
