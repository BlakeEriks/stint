import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@stint/client';
import { createRequest } from '../src/request.ts';

type Call = { url: string; headers: Record<string, string> };

/** An auth whose token is `token-<n>`, bumped by each refresh. */
function fakeAuth(refreshFails = false) {
  let n = 1;
  let signedOut = false;
  return {
    get signedOut() {
      return signedOut;
    },
    accessToken: async () => `token-${n}`,
    refresh: async () => {
      if (refreshFails)
        throw new ApiError(401, { code: 'UNAUTHORIZED', message: 'gone' });
      n += 1;
      return { accessToken: `token-${n}` };
    },
    signOut: async () => {
      signedOut = true;
    },
  };
}

function server(replies: Array<() => Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
    });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return reply();
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}
const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status });
const unauthorized = json(401, { code: 'UNAUTHORIZED', message: 'no' });

test('a request carries the bearer token to the app origin', async () => {
  const s = server([json(200, { ok: true })]);
  const request = createRequest({
    origin: 'http://localhost:3100',
    auth: fakeAuth(),
    bypass: () => null,
    fetch: s.fetch,
  });
  assert.deepEqual(await request('GET', '/summary?tz=UTC'), { ok: true });
  assert.equal(s.calls[0]?.url, 'http://localhost:3100/api/v1/summary?tz=UTC');
  assert.equal(s.calls[0]?.headers.authorization, 'Bearer token-1');
  assert.equal(s.calls[0]?.headers['x-vercel-protection-bypass'], undefined);
});

test('a preview build sends the bypass the reviewer typed in, as it is now', async () => {
  const s = server([json(200, {}), json(200, {})]);
  let typed: string | null = null;
  const request = createRequest({
    origin: 'https://x.vercel.app',
    auth: fakeAuth(),
    bypass: () => typed,
    fetch: s.fetch,
  });
  await request('GET', '/summary');
  typed = 'secret';
  await request('GET', '/summary');
  assert.equal(s.calls[0]?.headers['x-vercel-protection-bypass'], undefined);
  assert.equal(s.calls[1]?.headers['x-vercel-protection-bypass'], 'secret');
});

test('a 401 refreshes and retries once', async () => {
  const s = server([unauthorized, json(200, { ok: 1 })]);
  const auth = fakeAuth();
  const request = createRequest({
    origin: '',
    auth,
    bypass: () => null,
    fetch: s.fetch,
  });
  assert.deepEqual(await request('POST', '/timer/stop', {}), { ok: 1 });
  assert.equal(s.calls[1]?.headers.authorization, 'Bearer token-2');
  assert.equal(auth.signedOut, false);
});

test('a 401 after the retry signs out', async () => {
  const s = server([unauthorized, unauthorized]);
  const auth = fakeAuth();
  const request = createRequest({
    origin: '',
    auth,
    bypass: () => null,
    fetch: s.fetch,
  });
  await assert.rejects(request('GET', '/summary'), (e: unknown) => {
    return e instanceof ApiError && e.isUnauthorized;
  });
  assert.equal(auth.signedOut, true);
  assert.equal(s.calls.length, 2);
});

test('a rejected refresh fails the request without a retry', async () => {
  const s = server([unauthorized]);
  const request = createRequest({
    origin: '',
    auth: fakeAuth(true),
    bypass: () => null,
    fetch: s.fetch,
  });
  await assert.rejects(request('GET', '/summary'), /gone/);
  assert.equal(s.calls.length, 1);
});

test('an error body becomes an ApiError with its code and details', async () => {
  const s = server([
    json(409, {
      code: 'TIMER_ALREADY_RUNNING',
      message: 'A timer is already running.',
      details: { running: { id: 'e1' } },
    }),
  ]);
  const request = createRequest({
    origin: '',
    auth: fakeAuth(),
    bypass: () => null,
    fetch: s.fetch,
  });
  await assert.rejects(request('POST', '/timer/start', {}), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.isTimerConflict, true);
    assert.deepEqual(e.details, { running: { id: 'e1' } });
    return true;
  });
});

test('a JSON body is sent as JSON', async () => {
  const sent: RequestInit[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    sent.push(init);
    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;
  const request = createRequest({
    origin: '',
    auth: fakeAuth(),
    bypass: () => null,
    fetch,
  });
  assert.equal(
    await request('POST', '/timer/start', { taskName: 'x' }),
    undefined,
  );
  assert.equal(sent[0]?.body, '{"taskName":"x"}');
  const headers = sent[0]?.headers as Record<string, string>;
  assert.equal(headers['content-type'], 'application/json');
});

test("Vercel's own 401 is the bypass, not the session: no refresh, and it asks again", async () => {
  // Vercel's protection page, not one of ours: no JSON `code`.
  const s = server([
    () => new Response('<html>Authentication Required</html>', { status: 401 }),
  ]);
  const auth = fakeAuth();
  let refreshed = false;
  let protectedCalls = 0;
  const request = createRequest({
    origin: 'https://x.vercel.app',
    auth: {
      ...auth,
      refresh: async () => {
        refreshed = true;
        return auth.refresh();
      },
    },
    bypass: () => 'stale',
    onProtected: () => protectedCalls++,
    fetch: s.fetch,
  });
  await assert.rejects(request('GET', '/summary'), (e: unknown) => {
    return e instanceof ApiError && e.code === 'VERCEL_PROTECTED';
  });
  assert.equal(refreshed, false);
  assert.equal(auth.signedOut, false);
  assert.equal(protectedCalls, 1);
});
