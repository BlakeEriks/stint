import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fcmOutcome,
  fcmTimerMessage,
  timerBroadcast,
  userTopic,
} from '../src/push.ts';

test('a timer push names nothing but the change, and collapses', () => {
  assert.deepEqual(fcmTimerMessage('tok'), {
    message: {
      token: 'tok',
      data: { kind: 'timer' },
      android: { priority: 'HIGH', collapse_key: 'timer' },
    },
  });
});

test('a timer broadcast names nothing but the change, on the user’s private topic', () => {
  assert.equal(userTopic('u1'), 'user:u1');
  assert.deepEqual(timerBroadcast('u1'), {
    messages: [
      { topic: 'user:u1', event: 'timer', payload: {}, private: true },
    ],
  });
});

const fcmError = (code: number, errorCode?: string) => ({
  error: {
    code,
    details: errorCode
      ? [
          {
            '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
            errorCode,
          },
        ]
      : [],
  },
});

test('a 200 is sent', () => {
  assert.equal(fcmOutcome(200, { name: 'projects/p/messages/1' }), 'sent');
});

test('an unregistered token is dead, whatever the status says', () => {
  assert.equal(fcmOutcome(404, fcmError(404, 'UNREGISTERED')), 'dead');
  assert.equal(fcmOutcome(400, fcmError(400, 'UNREGISTERED')), 'dead');
});

test('a 404 for any other reason is not a dead token', () => {
  assert.equal(fcmOutcome(404, fcmError(404)), 'failed');
  assert.equal(fcmOutcome(404, null), 'failed');
});

test('a rate limit or a server error is worth one retry', () => {
  for (const status of [429, 500, 503]) {
    assert.equal(fcmOutcome(status, fcmError(status, 'UNAVAILABLE')), 'retry');
  }
});

test('anything else fails', () => {
  assert.equal(fcmOutcome(400, fcmError(400, 'INVALID_ARGUMENT')), 'failed');
  assert.equal(fcmOutcome(403, fcmError(403, 'SENDER_ID_MISMATCH')), 'failed');
  assert.equal(fcmOutcome(401, 'not json'), 'failed');
});
