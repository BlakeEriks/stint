import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPeriod,
  lastEndedPeriod,
  periodContaining,
  type BillingSchedule,
} from '../src/billing-period.ts';

const monthly: BillingSchedule = { period: 'monthly' };
const semimonthly: BillingSchedule = { period: 'semimonthly' };
// Monday, October 5, 2026.
const weekly: BillingSchedule = { period: 'weekly', anchor: '2026-10-05' };
const biweekly: BillingSchedule = { period: 'biweekly', anchor: '2026-10-05' };

const p = (periodStart: string, periodEnd: string) => ({
  periodStart,
  periodEnd,
});

test('a monthly period is the calendar month, to its last day', () => {
  assert.deepEqual(
    periodContaining('2026-10-21', monthly),
    p('2026-10-01', '2026-10-31'),
  );
  assert.deepEqual(
    periodContaining('2026-02-01', monthly),
    p('2026-02-01', '2026-02-28'),
  );
  assert.deepEqual(
    periodContaining('2028-02-29', monthly),
    p('2028-02-01', '2028-02-29'),
  );
});

test('a twice-a-month period splits on the 15th and ends on the last day', () => {
  assert.deepEqual(
    periodContaining('2026-10-15', semimonthly),
    p('2026-10-01', '2026-10-15'),
  );
  assert.deepEqual(
    periodContaining('2026-10-16', semimonthly),
    p('2026-10-16', '2026-10-31'),
  );
  assert.deepEqual(
    periodContaining('2028-02-20', semimonthly),
    p('2028-02-16', '2028-02-29'),
  );
});

test('a weekly or biweekly period counts from its anchor, before and after it', () => {
  assert.deepEqual(
    periodContaining('2026-10-21', weekly),
    p('2026-10-19', '2026-10-25'),
  );
  assert.deepEqual(
    periodContaining('2026-10-05', weekly),
    p('2026-10-05', '2026-10-11'),
  );
  assert.deepEqual(
    periodContaining('2026-10-04', weekly),
    p('2026-09-28', '2026-10-04'),
  );
  assert.deepEqual(
    periodContaining('2026-10-21', biweekly),
    p('2026-10-19', '2026-11-01'),
  );
  assert.deepEqual(
    periodContaining('2026-10-04', biweekly),
    p('2026-09-21', '2026-10-04'),
  );
  // Across a year boundary, one period.
  assert.deepEqual(
    periodContaining('2027-01-01', weekly),
    p('2026-12-28', '2027-01-03'),
  );
});

test('the last ended period is the one before the period holding today', () => {
  assert.deepEqual(
    lastEndedPeriod('2026-10-21', semimonthly),
    p('2026-10-01', '2026-10-15'),
  );
  // On its last day a period has not ended.
  assert.deepEqual(
    lastEndedPeriod('2026-10-15', semimonthly),
    p('2026-09-16', '2026-09-30'),
  );
  assert.deepEqual(
    lastEndedPeriod('2026-10-31', monthly),
    p('2026-09-01', '2026-09-30'),
  );
  assert.deepEqual(
    lastEndedPeriod('2026-11-01', monthly),
    p('2026-10-01', '2026-10-31'),
  );
  assert.deepEqual(
    lastEndedPeriod('2027-01-02', monthly),
    p('2026-12-01', '2026-12-31'),
  );
  assert.deepEqual(
    lastEndedPeriod('2026-10-21', weekly),
    p('2026-10-12', '2026-10-18'),
  );
  assert.deepEqual(
    lastEndedPeriod('2026-10-21', biweekly),
    p('2026-10-05', '2026-10-18'),
  );
});

test('a range is a period only when it is exactly one', () => {
  assert.equal(isPeriod(monthly, '2026-10-01', '2026-10-31'), true);
  assert.equal(isPeriod(monthly, '2026-10-01', '2026-10-15'), false);
  assert.equal(isPeriod(semimonthly, '2026-10-16', '2026-10-31'), true);
  assert.equal(isPeriod(semimonthly, '2026-10-10', '2026-10-25'), false);
  assert.equal(isPeriod(weekly, '2026-10-12', '2026-10-18'), true);
  assert.equal(isPeriod(weekly, '2026-10-12', '2026-10-25'), false);
  assert.equal(isPeriod(biweekly, '2026-10-12', '2026-10-25'), false);
});
