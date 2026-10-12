import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasEnded,
  paymentFailed,
  planOf,
  SUBSCRIPTION_STATUSES,
} from '../src/billing.ts';

test('paid while active, trialing, or past due and being retried', () => {
  for (const s of ['active', 'trialing', 'past_due'] as const)
    assert.equal(planOf(s), 'paid', s);
});

test('free for every other status, and with no subscription', () => {
  for (const s of [
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'canceled',
    'paused',
  ] as const)
    assert.equal(planOf(s), 'free', s);
  assert.equal(planOf(null), 'free');
});

test('every status Stripe sends has a plan', () => {
  assert.equal(SUBSCRIPTION_STATUSES.length, 8);
  for (const s of SUBSCRIPTION_STATUSES) assert.ok(planOf(s));
});

test('a payment has failed while past due or unpaid', () => {
  assert.equal(paymentFailed('past_due'), true);
  assert.equal(paymentFailed('unpaid'), true);
  assert.equal(paymentFailed('active'), false);
  assert.equal(paymentFailed('canceled'), false);
  assert.equal(paymentFailed(null), false);
});

test('only a canceled or expired subscription has ended', () => {
  const ended = SUBSCRIPTION_STATUSES.filter(hasEnded);
  assert.deepEqual(ended, ['incomplete_expired', 'canceled']);
});
