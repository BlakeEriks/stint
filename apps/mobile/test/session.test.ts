import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, type Store } from '../src/session.ts';
import { ApiError } from '@stint/client';

const URL = 'http://localhost:54321';
const NOW = 1_800_000_000_000;

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

const gotrue = (n: number, over: object = {}) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  expires_at: NOW / 1000 + 3600,
  user: { email: 'builder@localhost.test' },
  ...over,
});

type Call = { url: string; init: RequestInit };
function server(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return reply(call);
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function auth(fetch: typeof globalThis.fetch, store = memoryStore()) {
  return {
    store,
    auth: createAuth({
      supabaseUrl: URL,
      supabaseKey: 'key',
      store,
      fetch,
      now: () => NOW,
    }),
  };
}

test('a code is asked for an existing account only', async () => {
  const s = server(() => json(200, {}));
  await auth(s.fetch).auth.sendCode('builder@localhost.test');
  assert.equal(s.calls[0]?.url, `${URL}/auth/v1/otp`);
  assert.deepEqual(JSON.parse(String(s.calls[0]?.init.body)), {
    email: 'builder@localhost.test',
    create_user: false,
  });
});

test('no account reads as invite-only, not as a server setting', async () => {
  const s = server(() =>
    json(422, {
      error_code: 'otp_disabled',
      msg: 'Signups not allowed for otp',
    }),
  );
  await assert.rejects(auth(s.fetch).auth.sendCode('who@x.test'), {
    message: /invite-only/,
  });
});

test('a typed code is verified as type email and the session kept', async () => {
  const s = server(() => json(200, gotrue(1)));
  const { auth: a, store } = auth(s.fetch);
  await a.verifyCode('builder@localhost.test', '123 456');
  assert.deepEqual(JSON.parse(String(s.calls[0]?.init.body)), {
    type: 'email',
    email: 'builder@localhost.test',
    token: '123456',
  });
  assert.equal(await a.accessToken(), 'access-1');
  assert.ok(store.data.get('stint.session.localhost_54321'));
});

test('a code that is not six digits never reaches the server', async () => {
  const s = server(() => json(200, gotrue(1)));
  await assert.rejects(auth(s.fetch).auth.verifyCode('a@b.test', '12345'), {
    message: /six digits/,
  });
  assert.equal(s.calls.length, 0);
});

test('a wrong code says so', async () => {
  const s = server(() => json(403, { msg: 'Token has expired or is invalid' }));
  await assert.rejects(auth(s.fetch).auth.verifyCode('a@b.test', '123456'), {
    message: /expired or is invalid/,
  });
});

test('a token about to expire is refreshed, once for concurrent callers', async () => {
  let n = 1;
  const s = server(() => json(200, gotrue(++n)));
  const store = memoryStore();
  store.data.set(
    'stint.session.localhost_54321',
    JSON.stringify({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: NOW / 1000 + 30,
      email: 'builder@localhost.test',
    }),
  );
  const { auth: a } = auth(s.fetch, store);
  const tokens = await Promise.all([a.accessToken(), a.accessToken()]);
  assert.deepEqual(tokens, ['access-2', 'access-2']);
  assert.equal(s.calls.length, 1);
  assert.match(s.calls[0]?.url ?? '', /grant_type=refresh_token/);
  assert.deepEqual(JSON.parse(String(s.calls[0]?.init.body)), {
    refresh_token: 'refresh-1',
  });
});

test('only GoTrue rejecting the refresh token signs out', async () => {
  for (const status of [400, 401, 403]) {
    const s = server(() => json(status, { msg: 'Invalid Refresh Token' }));
    const { auth: a, store } = auth(s.fetch);
    await a.signInWithSession(gotrue(1));
    let signedOut = 0;
    a.subscribe(() => signedOut++);
    await assert.rejects(a.refresh(), (e: unknown) => {
      return e instanceof ApiError && e.isUnauthorized;
    });
    assert.equal(store.data.size, 0, `${status} removes the session`);
    assert.equal(await a.load(), null);
    assert.equal(signedOut, 1);
  }
});

test('offline, a timeout or a 5xx keeps the session', async () => {
  const replies = [
    () => {
      throw new TypeError('Network request failed');
    },
    () => json(503, {}),
    () => json(408, {}),
    () => json(429, {}),
  ];
  for (const reply of replies) {
    const s = server(reply);
    const { auth: a, store } = auth(s.fetch);
    await a.signInWithSession(gotrue(1));
    await assert.rejects(a.refresh());
    assert.equal(store.data.size, 1);
    assert.ok(await a.load());
  }
});

test('a preview build signs in with its seeded password', async () => {
  const s = server(() => json(200, gotrue(1)));
  const { auth: a } = auth(s.fetch);
  await a.signInWithPassword('pr-4@preview.test', 'pw');
  assert.match(s.calls[0]?.url ?? '', /token\?grant_type=password$/);
  assert.equal((await a.load())?.email, 'builder@localhost.test');
});

test('sign out removes the session', async () => {
  const s = server(() => json(200, gotrue(1)));
  const { auth: a, store } = auth(s.fetch);
  await a.signInWithSession(gotrue(1));
  await a.signOut();
  assert.equal(store.data.size, 0);
  await assert.rejects(a.accessToken(), (e: unknown) => {
    return e instanceof ApiError && e.isUnauthorized;
  });
});

test('each backend keeps its own session', async () => {
  const store = memoryStore();
  const s = server(() => json(200, gotrue(1)));
  const local = createAuth({
    supabaseUrl: URL,
    supabaseKey: 'k',
    store,
    fetch: s.fetch,
  });
  const prod = createAuth({
    supabaseUrl: 'https://zwoceqydagxxmqoaqgbf.supabase.co',
    supabaseKey: 'k',
    store,
    fetch: s.fetch,
  });
  await local.signInWithSession(gotrue(1));
  assert.equal(await prod.load(), null);
});
