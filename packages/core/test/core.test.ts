import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatCompact, elapsedSeconds } from '../src/duration.ts';
import { resolveRate, resolveRateSource } from '../src/rates.ts';
import { uuidv7 } from '../src/uuid.ts';
import {
  formatCurrency,
  formatHours,
  formatLocalTime,
  formatQuantity,
} from '../src/format.ts';

test('formatClock renders the timer format', () => {
  assert.equal(formatClock(0), '0:00:00');
  assert.equal(formatClock(6442), '1:47:22');
  assert.equal(formatClock(59), '0:00:59');
  assert.equal(formatClock(360000), '100:00:00'); // hours never truncate
  assert.equal(formatClock(-5), '0:00:00');
});

test('formatCompact for lists', () => {
  assert.equal(formatCompact(6442), '1h 47m');
  assert.equal(formatCompact(3600), '1h');
  assert.equal(formatCompact(120), '2m');
  assert.equal(formatCompact(45), '45s');
});

test('elapsedSeconds never goes negative on clock skew', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  assert.equal(elapsedSeconds('2026-09-11T11:00:00Z', now), 3600);
  assert.equal(elapsedSeconds('2026-09-11T13:00:00Z', now), 0);
});

test('rate resolution walks all four levels', () => {
  assert.equal(
    resolveRate({
      entryRateOverride: 999,
      projectRate: 175,
      clientRate: 150,
      userDefaultRate: 100,
    }),
    999,
  );
  assert.equal(
    resolveRate({ projectRate: 175, clientRate: 150, userDefaultRate: 100 }),
    175,
  );
  assert.equal(resolveRate({ clientRate: 150, userDefaultRate: 100 }), 150);
  assert.equal(resolveRate({ userDefaultRate: 100 }), 100);
  assert.equal(resolveRate({}), null);
});

test('rate resolution treats 0 as a real rate, not absent', () => {
  // A deliberate 0 (pro bono) must not fall through to a lower level.
  assert.equal(resolveRate({ projectRate: 0, clientRate: 150 }), 0);
  assert.equal(
    resolveRateSource({ projectRate: 0, clientRate: 150 }),
    'project',
  );
});

test('rate source is reported for the UI', () => {
  assert.equal(resolveRateSource({ entryRateOverride: 10 }), 'entry');
  assert.equal(resolveRateSource({ clientRate: 150 }), 'client');
  assert.equal(resolveRateSource({}), 'none');
});

test('uuidv7 is time-ordered and well-formed', () => {
  const a = uuidv7(1000000000000);
  const b = uuidv7(1000000000001);
  assert.match(
    a,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.ok(a < b, 'later timestamp must sort after earlier');
});

test('formatCurrency renders a narrow symbol, defaulting to USD', () => {
  assert.equal(formatCurrency(1200), '$1,200.00');
  assert.equal(formatCurrency(1200, 'USD'), '$1,200.00');
  assert.equal(formatCurrency(0), '$0.00');
  // A missing amount is a blank line item, not a crash.
  assert.equal(formatCurrency(null), '$0.00');
  // An empty currency falls back rather than throwing on an invalid code.
  assert.equal(formatCurrency(5, ''), '$5.00');
});

test('formatQuantity prints a charge as a whole 1, and time as hours', () => {
  assert.equal(formatQuantity('fixed', 1), '1');
  assert.equal(formatQuantity('hour', 1), '1.00');
  assert.equal(formatQuantity('hour', 2.25), '2.25');
});

test('formatHours keeps the 2dp the amount was computed from', () => {
  assert.equal(formatHours(1.5), '1.50');
  assert.equal(formatHours(0), '0.00');
  assert.equal(formatHours(10), '10.00');
});

test('formatLocalTime is 12-hour in the zone it is given', () => {
  const at = new Date('2026-03-10T19:05:00.000Z');
  assert.equal(formatLocalTime(at, 'UTC'), '7:05 PM');
  assert.equal(formatLocalTime(at.toISOString(), 'UTC'), '7:05 PM');
  assert.equal(formatLocalTime(at, 'America/New_York'), '3:05 PM');
  assert.equal(formatLocalTime(at, 'Asia/Tokyo'), '4:05 AM');
  // The cached formatter stays bound to its own zone.
  assert.equal(formatLocalTime(at, 'UTC'), '7:05 PM');
  assert.equal(
    formatLocalTime(new Date('2026-03-10T00:00:00Z'), 'UTC'),
    '12:00 AM',
  );
});
