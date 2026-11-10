/**
 * `POST /api/v1/auth/code` against an Auth server with the CAPTCHA on, as
 * production's is: the route must get past it to mail an existing account,
 * and must never create one.
 *
 * `pnpm test:auth:captcha` runs it; CI turns the CAPTCHA on first with
 * Turnstile's always-pass test secret, which still rejects a missing token.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  deleteUser,
  freshUser,
  publishable,
  url,
  usersNamed,
} from './auth-server.ts';

const EMAIL = 'auth-code@test.local';
const STRANGER = 'auth-code-stranger@test.local';
// Its own address each run, so a rerun within the hour is not throttled.
const IP = `test-${randomUUID()}`;

let POST: typeof import('../src/app/api/v1/auth/code/route.ts').POST;
let userId: string;

const ask = (email: string) =>
  POST(
    new Request('http://localhost/api/v1/auth/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': IP },
      body: JSON.stringify({ email }),
    }),
  );

before(async () => {
  ({ POST } = await import('../src/app/api/v1/auth/code/route.ts'));
  userId = await freshUser(EMAIL);
  for (const u of await usersNamed(STRANGER)) await deleteUser(u.id);
});

after(async () => {
  if (userId) await deleteUser(userId);
  for (const u of await usersNamed(STRANGER)) await deleteUser(u.id);
});

test('the CAPTCHA is on: GoTrue refuses a code asked without a token', async () => {
  const res = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: publishable, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, create_user: false }),
  });
  assert.equal((await res.json()).error_code, 'captcha_failed');
});

test('an existing account is sent a code past the CAPTCHA', async () => {
  const res = await ask(EMAIL);
  assert.equal(res.status, 200, await res.clone().text());
});

test('an unknown address gets the same answer, and no account', async () => {
  const res = await ask(STRANGER);
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await usersNamed(STRANGER), []);
});
