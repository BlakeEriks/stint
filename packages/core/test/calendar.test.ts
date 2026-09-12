import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfLocalDay,
  startOfLocalWeek,
  localDateKey,
  localDayOfWeek,
  isValidTimeZone,
} from '../src/calendar.ts';

/** Renders an instant in a zone, for asserting it really is local midnight. */
function render(at: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(at);
}

const cases: Array<[string, string]> = [
  ['2026-09-11T14:30:00Z', 'UTC'],
  ['2026-09-11T14:30:00Z', 'America/Sao_Paulo'],
  ['2026-09-11T02:30:00Z', 'America/Sao_Paulo'],
  ['2026-09-11T14:30:00Z', 'America/New_York'],
  ['2026-09-11T23:30:00Z', 'Asia/Tokyo'],
  ['2026-09-11T14:30:00Z', 'Asia/Kolkata'], // +5:30
  ['2026-09-11T14:30:00Z', 'Pacific/Chatham'], // +12:45
  ['2026-10-18T12:00:00Z', 'America/Santiago'],
];

test('startOfLocalDay lands on local midnight of the same local date', () => {
  for (const [iso, tz] of cases) {
    const now = new Date(iso);
    const out = render(startOfLocalDay(now, tz), tz);
    assert.ok(out.includes('00:00:00'), `${tz}: ${out} is not midnight`);
    assert.equal(
      out.slice(0, 10),
      render(now, tz).slice(0, 10),
      `${tz}: wrong date`,
    );
  }
});

/**
 * The regression this module exists for: computing midnight with the
 * CURRENT offset is an hour wrong on DST transition days, which silently
 * files entries under the wrong date twice a year.
 */
test('startOfLocalDay is correct across DST transitions', () => {
  const dst: Array<[string, string]> = [
    ['2026-03-08T12:00:00Z', 'America/New_York'], // spring forward
    ['2026-03-08T06:00:00Z', 'America/New_York'],
    ['2026-11-01T12:00:00Z', 'America/New_York'], // fall back
    ['2026-11-01T05:30:00Z', 'America/New_York'],
    ['2026-03-29T10:00:00Z', 'Europe/London'],
    ['2026-04-05T14:00:00Z', 'Australia/Sydney'],
    ['2026-09-06T03:00:00Z', 'Pacific/Chatham'],
  ];
  for (const [iso, tz] of dst) {
    const now = new Date(iso);
    const out = render(startOfLocalDay(now, tz), tz);
    assert.ok(out.includes('00:00:00'), `${tz} @ ${iso}: got ${out}`);
    assert.equal(out.slice(0, 10), render(now, tz).slice(0, 10));
  }
});

test('startOfLocalWeek honours weekStartsOn', () => {
  // 2026-09-11 is a Friday.
  const now = new Date('2026-09-11T14:30:00Z');
  const monday = startOfLocalWeek(now, 'UTC', 1);
  const sunday = startOfLocalWeek(now, 'UTC', 0);
  assert.equal(localDateKey(monday, 'UTC'), '2026-09-07');
  assert.equal(localDateKey(sunday, 'UTC'), '2026-09-06');
  assert.ok(monday <= now && sunday <= now);
});

test('startOfLocalWeek spans a DST boundary without drift', () => {
  // Week containing the US spring-forward (2026-03-08).
  const now = new Date('2026-03-11T12:00:00Z');
  const start = startOfLocalWeek(now, 'America/New_York', 1);
  const out = render(start, 'America/New_York');
  assert.ok(out.includes('00:00:00'), `got ${out}`);
  assert.equal(out.slice(0, 10), '2026-03-09');
});

test('localDayOfWeek reflects the local date, not UTC', () => {
  // 23:30 UTC Friday is already Saturday in Tokyo.
  const at = new Date('2026-09-11T23:30:00Z');
  assert.equal(localDayOfWeek(at, 'UTC'), 5);
  assert.equal(localDayOfWeek(at, 'Asia/Tokyo'), 6);
});

test('localDateKey buckets a late-night entry by local date', () => {
  const at = new Date('2026-09-12T02:30:00Z');
  assert.equal(localDateKey(at, 'UTC'), '2026-09-12');
  assert.equal(localDateKey(at, 'America/Sao_Paulo'), '2026-09-11');
});

test('isValidTimeZone rejects garbage before it reaches a query', () => {
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone('Not/AZone'), false);
  assert.equal(isValidTimeZone(''), false);
});
