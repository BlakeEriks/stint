import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfLocalDay,
  startOfLocalWeek,
  localDateKey,
  localDayOfWeek,
  isValidTimeZone,
  startOfLocalDate,
  startOfLocalMonthsBack,
  localMonthKeys,
  localDateTimeToInstant,
  addDays,
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

test('startOfLocalWeek honors weekStartsOn', () => {
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

test('localDateTimeToInstant round-trips a wall clock across DST', () => {
  const tz = 'America/New_York';
  const at = (date: string, time: string) =>
    render(localDateTimeToInstant(date, time, tz), tz);

  // An ordinary day, and the hour after each transition — the entry editor's
  // inputs are wall-clock, so 03:00 must come back as 03:00 on every one.
  assert.match(at('2026-06-15', '14:05'), /^2026-06-15, 14:05/);
  assert.match(at('2026-03-08', '03:00'), /^2026-03-08, 03:00/);
  assert.match(at('2026-11-01', '03:00'), /^2026-11-01, 03:00/);
});

test('localDateTimeToInstant at midnight is startOfLocalDate', () => {
  for (const tz of ['UTC', 'America/Denver', 'Australia/Lord_Howe']) {
    assert.equal(
      localDateTimeToInstant('2026-03-08', '00:00', tz).getTime(),
      startOfLocalDate('2026-03-08', tz).getTime(),
    );
  }
});

/** The overnight-shift roll-forward and the invoice period end both step here. */
test('addDays steps the calendar, including over month and year ends', () => {
  assert.equal(addDays('2026-09-11', 1), '2026-09-12');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-08', -1), '2026-03-07');
});

/* A DST day is 23 or 25 hours, so the step has to be on the calendar: the
   day after a spring-forward date is still exactly one date later. */
test('addDays is unaffected by a DST transition in the range', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
});

// ── the Collected window ────────────────────────────────────────────

/* `Date.UTC` normalizes a negative month index into the previous year, which
   is the whole mechanism — a twelve-month window looked at from January
   reaches back through two of them. */
test('startOfLocalMonthsBack wraps the year going back past January', () => {
  const jan = new Date('2026-01-15T12:00:00Z');

  assert.equal(
    render(startOfLocalMonthsBack(jan, 'UTC', 0), 'UTC').slice(0, 10),
    '2026-01-01',
  );
  assert.equal(
    render(startOfLocalMonthsBack(jan, 'UTC', 1), 'UTC').slice(0, 10),
    '2025-12-01',
  );
  // The figure's own window: eleven back from the month containing `now`.
  assert.equal(
    render(startOfLocalMonthsBack(jan, 'UTC', 11), 'UTC').slice(0, 10),
    '2025-02-01',
  );
  assert.equal(
    render(startOfLocalMonthsBack(jan, 'UTC', 13), 'UTC').slice(0, 10),
    '2024-12-01',
  );
});

/* Midnight ON the 1st in the caller's zone, not an offset assumed from today:
   a window boundary an hour out puts a payment in the wrong month, and these
   zones each transition inside the range walked back over. */
test('startOfLocalMonthsBack lands on local midnight of the 1st', () => {
  for (const tz of [
    'UTC',
    'America/New_York',
    'Australia/Lord_Howe',
    'Pacific/Chatham',
  ]) {
    for (const back of [0, 1, 4, 7, 11]) {
      const out = render(
        startOfLocalMonthsBack(new Date('2026-07-15T12:00:00Z'), tz, back),
        tz,
      );
      assert.ok(
        out.includes('00:00:00'),
        `${tz} -${back}: ${out} is not midnight`,
      );
      assert.equal(
        out.slice(8, 10),
        '01',
        `${tz} -${back}: ${out} is not the 1st`,
      );
    }
  }
});

/* One instant is two different local months either side of a boundary, so
   the window is keyed in the caller's zone like the rollup that fills it. */
test('startOfLocalMonthsBack reads the local month, not UTC', () => {
  // 23:00 UTC on the 31st is already the 1st in Tokyo.
  const at = new Date('2026-08-31T23:00:00Z');
  assert.equal(
    render(startOfLocalMonthsBack(at, 'UTC', 0), 'UTC').slice(0, 10),
    '2026-08-01',
  );
  assert.equal(
    render(startOfLocalMonthsBack(at, 'Asia/Tokyo', 0), 'Asia/Tokyo').slice(
      0,
      10,
    ),
    '2026-09-01',
  );
});

/* The keys the Collected series is built from: the rollup returns only months
   that HAVE payments, so a quiet month is a real zero rather than a hole. */
test('localMonthKeys ends with this month and wraps the year', () => {
  const jan = new Date('2026-01-15T12:00:00Z');
  assert.deepEqual(localMonthKeys(jan, 'UTC', 3), [
    '2025-11',
    '2025-12',
    '2026-01',
  ]);
  assert.equal(localMonthKeys(jan, 'UTC', 12).length, 12);
  assert.equal(localMonthKeys(jan, 'UTC', 12)[0], '2025-02');
  assert.equal(localMonthKeys(jan, 'UTC', 12).at(-1), '2026-01');
  assert.deepEqual(localMonthKeys(jan, 'UTC', 1), ['2026-01']);
});

/* Keyed off the local month, and unaffected by a DST transition inside the
   window: the keys step on the calendar, never by a fixed span. */
test('localMonthKeys reads the local month and is unmoved by DST', () => {
  const at = new Date('2026-08-31T23:00:00Z');
  assert.equal(localMonthKeys(at, 'UTC', 1)[0], '2026-08');
  assert.equal(localMonthKeys(at, 'Asia/Tokyo', 1)[0], '2026-09');

  // March and November each hold a US transition; the walk crosses both.
  assert.deepEqual(
    localMonthKeys(new Date('2026-04-15T12:00:00Z'), 'America/New_York', 6),
    ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'],
  );
});
