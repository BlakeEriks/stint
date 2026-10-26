import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@stint/client';
import { startSession } from '../src/launch.ts';
import type { Session } from '../src/session.ts';

const session: Session = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 0,
  email: 'pr-4@preview.test',
};

/** An auth whose listeners fire on sign-in and sign-out, as `createAuth`'s do. */
function fakeAuth(stored: Session | null, signIn: () => Promise<void>) {
  const listeners = new Set<(s: Session | null) => void>();
  const emit = (s: Session | null) => {
    for (const l of listeners) l(s);
  };
  return {
    emit,
    signedInWith: [] as string[],
    load: async () => stored,
    subscribe(l: (s: Session | null) => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    async signInWithPassword(email: string) {
      this.signedInWith.push(email);
      await signIn();
      emit(session);
    },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('a stored session is shown as it is', async () => {
  const shown: Array<Session | null> = [];
  const auth = fakeAuth(session, async () => {});
  startSession({
    auth,
    preview: null,
    show: (s) => shown.push(s),
    clear: () => {},
  });
  await flush();
  assert.deepEqual(shown, [session]);
});

test('no session, no preview: sign-in', async () => {
  const shown: Array<Session | null> = [];
  startSession({
    auth: fakeAuth(null, async () => {}),
    preview: null,
    show: (s) => shown.push(s),
    clear: () => {},
  });
  await flush();
  assert.deepEqual(shown, [null]);
});

test("a preview build signs in as its PR's account on launch", async () => {
  const shown: Array<Session | null> = [];
  const auth = fakeAuth(null, async () => {});
  startSession({
    auth,
    preview: { email: 'pr-4@preview.test', password: 'pw' },
    show: (s) => shown.push(s),
    clear: () => {},
  });
  await flush();
  assert.deepEqual(auth.signedInWith, ['pr-4@preview.test']);
  assert.deepEqual(shown, [session]);
});

test('a preview account not seeded yet falls back to sign-in', async () => {
  for (const failure of [
    new ApiError(400, { code: 'invalid_credentials', message: 'no' }),
    new TypeError('Network request failed'),
  ]) {
    const shown: Array<Session | null> = [];
    startSession({
      auth: fakeAuth(null, async () => {
        throw failure;
      }),
      preview: { email: 'pr-4@preview.test', password: 'pw' },
      show: (s) => shown.push(s),
      clear: () => {},
    });
    await flush();
    assert.deepEqual(shown, [null]);
  }
});

test("sign-out clears the cache, so the next account never sees the last one's", async () => {
  let cleared = 0;
  const auth = fakeAuth(session, async () => {});
  startSession({ auth, preview: null, show: () => {}, clear: () => cleared++ });
  await flush();
  auth.emit(session);
  assert.equal(cleared, 0);
  auth.emit(null);
  assert.equal(cleared, 1);
});

test('the returned function stops listening', async () => {
  let cleared = 0;
  const auth = fakeAuth(session, async () => {});
  const stop = startSession({
    auth,
    preview: null,
    show: () => {},
    clear: () => cleared++,
  });
  stop();
  auth.emit(null);
  assert.equal(cleared, 0);
});
