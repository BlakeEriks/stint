import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, keys } from '@stint/client';
import { QueryClient } from '@tanstack/react-query';
import {
  createPushDevice,
  isTimerPush,
  onTimerPush,
  TokenUnavailable,
  tokenUnavailable,
} from '../src/push.ts';

test('a timer push is the data message the server sends, and nothing else', () => {
  assert.equal(
    isTimerPush({ data: { kind: 'timer', dataString: null } }),
    true,
  );
  assert.equal(isTimerPush({ data: { kind: 'other' } }), false);
  assert.equal(isTimerPush({ actionIdentifier: 'tap' }), false);
  assert.equal(isTimerPush(undefined), false);
});

/** A client holding a fetched timer, and whether the next push refetched it. */
function cached() {
  const client = new QueryClient();
  const key = keys.summary('UTC');
  client.setQueryData(key, { running: null });
  return { client, stale: () => client.getQueryState(key)?.isInvalidated };
}

test('a push refetches the timer', async () => {
  const { client, stale } = cached();
  await onTimerPush(client);
  assert.equal(stale(), true);
});

test('a push while a press is in flight leaves the prediction alone', async () => {
  const { client, stale } = cached();
  let land = () => {};
  const press = client
    .getMutationCache()
    .build(client, { mutationFn: () => new Promise<void>((r) => (land = r)) })
    .execute(undefined);
  await onTimerPush(client);
  assert.equal(stale(), false);
  land();
  await press;
});

/** The phone's token, which a test can rotate. */
function tokens(first: string) {
  let listener: ((t: string) => void) | null = null;
  let current = first;
  return {
    get: async () => current,
    onChange(l: (t: string) => void) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    rotate(next: string) {
      current = next;
      listener?.(next);
    },
  };
}

function device(first = 'tok-1') {
  const calls: string[] = [];
  const os = tokens(first);
  const failing = { next: null as unknown };
  const answer = async (call: string) => {
    calls.push(call);
    const error = failing.next;
    failing.next = null;
    if (error) throw error;
  };
  const phone = createPushDevice({
    tokens: os,
    register: (t) => answer(`register ${t}`),
  });
  const unregister = (t: string) => answer(`unregister ${t}`);
  return { phone, calls, os, failing, unregister };
}

const tick = () => new Promise((r) => setImmediate(r));

test('a signed-in phone registers its token, and a new one when it changes', async () => {
  const { phone, calls, os } = device();
  await phone.join();
  os.rotate('tok-2');
  await tick();
  os.rotate('tok-2');
  await tick();
  assert.deepEqual(calls, ['register tok-1', 'register tok-2']);
});

test('signing out unregisters the token, and stops following it', async () => {
  const { phone, calls, os, unregister } = device();
  await phone.join();
  phone.leave(unregister);
  os.rotate('tok-2');
  await tick();
  assert.deepEqual(calls, ['register tok-1', 'unregister tok-1']);
});

test('the next account to sign in registers the same phone', async () => {
  const { phone, calls } = device();
  await phone.join();
  await phone.join();
  assert.deepEqual(calls, ['register tok-1', 'register tok-1']);
});

test('a phone that cannot reach the server registers on the next try', async () => {
  const { phone, calls, failing } = device();
  failing.next = new TypeError('Network request failed');
  await phone.join();
  await phone.join();
  assert.deepEqual(calls, ['register tok-1', 'register tok-1']);
});

test('signing out never waits on the server', async () => {
  const { phone, calls } = device();
  await phone.join();
  const left = phone.leave(() => {
    calls.push('unregister tok-1');
    return new Promise(() => {});
  });
  assert.equal(left, undefined, 'leave returns before the server answers');
  assert.deepEqual(calls, ['register tok-1', 'unregister tok-1']);
});

test('an unregister the server refuses is dropped', async () => {
  const { phone, calls, failing, unregister } = device();
  await phone.join();
  failing.next = new ApiError(503, { code: 'INTERNAL', message: 'down' });
  phone.leave(unregister);
  await tick();
  assert.deepEqual(calls, ['register tok-1', 'unregister tok-1']);
});

test('an unexpected failure is not swallowed', async () => {
  const { phone, failing } = device();
  failing.next = new RangeError('bug');
  await assert.rejects(() => phone.join(), RangeError);
});

test('a phone that cannot get its token yet registers on the next try', async () => {
  const { phone, calls, os } = device();
  const get = os.get;
  os.get = () => Promise.reject(new TokenUnavailable('SERVICE_NOT_AVAILABLE'));
  await phone.join();
  os.get = get;
  await phone.join();
  assert.deepEqual(calls, ['register tok-1']);
});

test('an unexpected failure getting the token is not swallowed', async () => {
  const { phone, os } = device();
  os.get = () => Promise.reject(new RangeError('bug'));
  await assert.rejects(() => phone.join(), RangeError);
});

/** What expo-notifications rejects with when Firebase refuses a token. */
const registrationFailed = (reason: string) =>
  Object.assign(
    new Error(`Fetching the token failed: java.io.IOException: ${reason}`),
    {
      code: 'E_REGISTRATION_FAILED',
    },
  );

test("a token Firebase can't issue offline, or while its server errs, is unavailable for now", () => {
  assert.equal(
    tokenUnavailable(registrationFailed('SERVICE_NOT_AVAILABLE')),
    true,
  );
  assert.equal(
    tokenUnavailable(registrationFailed('INTERNAL_SERVER_ERROR')),
    true,
  );
});

test('a broken Firebase setup is not mistaken for offline', () => {
  for (const reason of [
    'AUTHENTICATION_FAILED',
    'FIS_AUTH_ERROR',
    'MISSING_INSTANCEID_SERVICE',
  ]) {
    assert.equal(tokenUnavailable(registrationFailed(reason)), false, reason);
  }
  assert.equal(
    tokenUnavailable(
      Object.assign(new Error('SERVICE_NOT_AVAILABLE'), { code: 'E_OTHER' }),
    ),
    false,
  );
  assert.equal(tokenUnavailable(new RangeError('bug')), false);
});
