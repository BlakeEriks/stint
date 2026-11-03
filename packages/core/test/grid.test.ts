import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  instantAt,
  movedTo,
  resized,
  movedByDays,
  drawnRange,
  zoomed,
  fillPxPerHour,
  clickMinutes,
  hourMarks,
  hourStep,
  MIN_PX_PER_HOUR,
  MAX_PX_PER_HOUR,
} from '../src/grid.ts';
import { startOfLocalDay, startOfLocalDayOffset } from '../src/calendar.ts';

const NY = 'America/New_York';
const HOUR = 3_600_000;

/** The wall clock in New York, for asserting where a drag actually landed. */
function clock(at: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NY,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

/** The column a day occupies, the way the calendar computes it. */
function column(iso: string) {
  const start = startOfLocalDay(new Date(iso), NY);
  return { start, end: startOfLocalDayOffset(start, NY, -1) };
}

/**
 * A local day is 23, 24 or 25 hours long, and the reason this module exists:
 * multiplying a fraction by 24 hours would land every drag on a DST day up to
 * an hour out. Asserting the wall clock, not merely that minutes divide by 15,
 * because a 24-hour denominator also lands on quarter hours — the wrong ones.
 */
const DAY = {
  ordinary: column('2026-09-09T12:00:00Z'),
  springForward: column('2026-03-08T12:00:00Z'), // 02:00 jumps to 03:00
  fallBack: column('2026-11-01T12:00:00Z'), // 01:00 repeats
};

/** The fraction of `day` that `hours` elapsed from its start reach. */
const at = (day: { start: Date; end: Date }, hours: number) =>
  (hours * HOUR) / (day.end.getTime() - day.start.getTime());

/** Each row: name, day, its hours, then fractions and the wall clock each snaps to. */
const INSTANTS = [
  [
    'an ordinary day',
    DAY.ordinary,
    24,
    [
      [0, '00:00'],
      [0.25, '06:00'],
      [0.5, '12:00'],
      [(9 * 60 + 7) / 1440, '09:00'], // a stray minute snaps down
      [(9 * 60 + 8) / 1440, '09:15'], // past the midpoint, it rounds up
      [1, '00:00'], // the last instant is the next midnight
    ],
  ],
  [
    'a spring forward',
    DAY.springForward,
    23,
    [
      [0, '00:00'],
      [0.1, '03:15'], // 2.3 elapsed hours, snapped to 2.25
      [0.5, '12:30'], // 11.5 elapsed hours, past the skipped one
      [1, '00:00'],
    ],
  ],
  [
    'a fall back',
    DAY.fallBack,
    25,
    [
      [0, '00:00'],
      [0.5, '11:30'], // 12.5 elapsed hours, past the repeated one
      [1, '00:00'],
    ],
  ],
] as const;

test('a fraction resolves to the wall clock on every length of day', () => {
  for (const [name, { start, end }, hours, cases] of INSTANTS) {
    assert.equal(end.getTime() - start.getTime(), hours * HOUR, name);
    for (const [f, wall] of cases)
      assert.equal(clock(instantAt(f, start, end)), wall, `${name} at ${f}`);
    // Outside the column clamps to its edges.
    assert.equal(instantAt(-1, start, end).getTime(), start.getTime(), name);
    assert.equal(instantAt(2, start, end).getTime(), end.getTime(), name);
  }
});

/**
 * A move is not a resize. Two and a half hours of billable work dragged
 * across a DST boundary is still two and a half hours — re-deriving the end
 * from a wall clock would make it one and a half or three and a half.
 */
test('moving a block keeps its duration, not its wall clock', () => {
  for (const [name, startedAt, endedAt, to, end] of [
    [
      'within a day',
      '2026-09-09T09:00:00Z',
      '2026-09-09T11:30:00Z',
      '2026-09-09T14:00:00Z',
      '2026-09-09T16:30:00Z',
    ],
    [
      'across a spring forward',
      '2026-03-08T05:00:00Z',
      '2026-03-08T07:30:00Z',
      '2026-03-08T10:00:00Z',
      '2026-03-08T12:30:00Z',
    ],
  ] as const) {
    const out = movedTo(new Date(startedAt), new Date(endedAt), new Date(to));
    assert.deepEqual(
      [out.startedAt.toISOString(), out.endedAt.toISOString()],
      [new Date(to).toISOString(), new Date(end).toISOString()],
      name,
    );
  }
});

/**
 * Dragging an edge past the other one is not an overnight shift — that
 * reading belongs to typed times, where 22:00–02:00 is a real shift. Here the
 * gesture means "this block ends here", so it clamps to the shortest entry.
 * Each row resizes 09:00–11:00 UTC: name, edge, where it went, the result.
 */
test('resizing moves only the dragged edge, and never inverts', () => {
  for (const [name, edge, to, start, end] of [
    ['the end, later', 'end', '12:00', '09:00', '12:00'],
    ['the start, earlier', 'start', '08:00', '08:00', '11:00'],
    ['the end above the start', 'end', '07:00', '09:00', '09:15'],
    ['the start below the end', 'start', '13:00', '10:45', '11:00'],
  ] as const) {
    const utc = (t: string) => new Date(`2026-09-09T${t}:00Z`);
    const out = resized(utc('09:00'), utc('11:00'), edge, utc(to));
    assert.deepEqual(
      [out.startedAt.toISOString(), out.endedAt.toISOString()],
      [utc(start).toISOString(), utc(end).toISOString()],
      name,
    );
  }
});

/**
 * A week-view drag across columns: the entry lands on the new day at the
 * wall clock it had, DST between or not, overnight entries as one block.
 * Each row: name, start, end, days moved, then the new start and end, all
 * in New York.
 */
const ACROSS_DAYS = [
  [
    'a day later',
    '2026-09-09T13:00:00Z', // Wed 09:00
    '2026-09-09T15:00:00Z', // Wed 11:00
    1,
    '2026-09-10T13:00:00Z',
    '2026-09-10T15:00:00Z',
  ],
  [
    'two days back',
    '2026-09-09T13:00:00Z',
    '2026-09-09T15:00:00Z',
    -2,
    '2026-09-07T13:00:00Z',
    '2026-09-07T15:00:00Z',
  ],
  [
    'overnight, as one block',
    '2026-09-10T02:00:00Z', // Wed 22:00
    '2026-09-10T06:00:00Z', // Thu 02:00
    1,
    '2026-09-11T02:00:00Z',
    '2026-09-11T06:00:00Z',
  ],
  [
    'onto a fall back, by the wall clock',
    '2026-10-31T13:00:00Z', // Sat 09:00 EDT
    '2026-10-31T15:00:00Z', // Sat 11:00 EDT
    1,
    '2026-11-01T14:00:00Z', // Sun 09:00 EST
    '2026-11-01T16:00:00Z',
  ],
  [
    'across a spring forward, overnight',
    '2026-03-07T04:00:00Z', // Fri 23:00 EST
    '2026-03-07T08:00:00Z', // Sat 03:00 EST
    1,
    '2026-03-08T04:00:00Z', // Sat 23:00 EST
    '2026-03-08T07:00:00Z', // Sun 03:00 EDT: the skipped hour is gone
  ],
  [
    'into a skipped hour, keeping its length',
    '2026-03-07T06:45:00Z', // Sat 01:45 EST
    '2026-03-07T07:00:00Z', // Sat 02:00 EST
    1,
    '2026-03-08T06:45:00Z', // Sun 01:45 EST
    '2026-03-08T07:00:00Z', // 02:00 does not exist; 15 minutes on
  ],
] as const;

test('a move across days keeps the wall clock', () => {
  for (const [name, startedAt, endedAt, days, start, end] of ACROSS_DAYS) {
    const out = movedByDays(new Date(startedAt), new Date(endedAt), days, NY);
    assert.deepEqual(
      [out.startedAt.toISOString(), out.endedAt.toISOString()],
      [new Date(start).toISOString(), new Date(end).toISOString()],
      name,
    );
  }
});

/**
 * Each row: name, day, the elapsed hours the pointer went from and to, the
 * least length in minutes (a click passes its own), then the range drawn.
 */
const DRAWN = [
  [
    'snaps both ends',
    DAY.ordinary,
    17 + 7 / 60,
    17 + 58 / 60,
    undefined,
    '17:00',
    '18:00',
  ],
  [
    'never shorter than the shortest entry',
    DAY.ordinary,
    12,
    12,
    undefined,
    '12:00',
    '12:15',
  ],
  [
    'kept inside the day at midnight',
    DAY.ordinary,
    24,
    24,
    undefined,
    '23:45',
    '00:00',
  ],
  [
    'a click, from where it landed',
    DAY.ordinary,
    9 + 7 / 60,
    9 + 7 / 60,
    30,
    '09:00',
    '09:30',
  ],
  ['a click at midnight', DAY.ordinary, 24, 24, 60, '23:00', '00:00'],
  [
    'on a spring forward',
    DAY.springForward,
    16,
    17,
    undefined,
    '17:00',
    '18:00',
  ],
  ['on a fall back', DAY.fallBack, 17, 18, undefined, '16:00', '17:00'],
] as const;

test('a drawn range lands on the wall clock drawn, in either direction', () => {
  for (const [name, day, from, to, minutes, start, end] of DRAWN) {
    const { start: s, end: e } = day;
    const down = drawnRange(at(day, from), at(day, to), s, e, minutes);
    assert.deepEqual(
      [clock(down.startedAt), clock(down.endedAt)],
      [start, end],
      name,
    );
    const up = drawnRange(at(day, to), at(day, from), s, e, minutes);
    assert.deepEqual(up, down, `${name}, drawn upward`);
  }
});

test('zoom scales by the wheel delta, capped per notch, inside its limits', () => {
  assert.ok(zoomed(44, -10) > 44);
  assert.ok(zoomed(44, 10) < 44);
  assert.equal(zoomed(44, 0), 44);
  // In then out by the same delta comes back to where it started.
  assert.ok(Math.abs(zoomed(zoomed(44, -10), 10) - 44) < 1e-9);
  assert.equal(zoomed(MAX_PX_PER_HOUR, -100), MAX_PX_PER_HOUR);
  assert.equal(zoomed(MIN_PX_PER_HOUR, 100), MIN_PX_PER_HOUR);
  // One mouse-wheel notch never jumps a whole range.
  assert.equal(zoomed(44, -1000), zoomed(44, -100));
  assert.ok(zoomed(44, -1000) < 2 * 44);
  // Out stops at a raised floor, a level stored below it starts from it,
  // and zooming in is unaffected.
  assert.equal(zoomed(30, 100, 30), 30);
  assert.equal(zoomed(22, 0, 30), 30);
  assert.ok(zoomed(30, -50, 30) > 30);
});

test('the fill floor is where the day fills its area, inside the zoom range', () => {
  for (const [viewport, hours, px] of [
    [720, 24, 30], // a 24-hour week in a 720px area fills it exactly
    [200, 24, MIN_PX_PER_HOUR],
    [0, 24, MIN_PX_PER_HOUR],
    [5000, 10, MAX_PX_PER_HOUR],
    [720, 0, MIN_PX_PER_HOUR],
  ] as const)
    assert.equal(
      fillPxPerHour(viewport, hours),
      px,
      `${viewport}px, ${hours}h`,
    );
});

test('the label step widens as hours shrink and narrows as they grow', () => {
  assert.equal(hourStep(44, 132), 3);
  assert.equal(hourStep(88, 132), 2);
  assert.equal(hourStep(176, 132), 1);
  assert.equal(hourStep(22, 132), 6);
  assert.equal(hourStep(44, 44), 1);
  assert.equal(hourStep(22, 44), 2);
});

test('a click makes the shortest block its label fits, across the zoom range', () => {
  const label = 17;
  assert.equal(clickMinutes(MIN_PX_PER_HOUR, label), 60); // 22px an hour
  assert.equal(clickMinutes(33, label), 60);
  assert.equal(clickMinutes(44, label), 30); // the default
  assert.equal(clickMinutes(67, label), 30);
  assert.equal(clickMinutes(68, label), 15);
  assert.equal(clickMinutes(MAX_PX_PER_HOUR, label), 15);
  // Shorter than the label even at an hour: still an hour.
  assert.equal(clickMinutes(10, label), 60);
});

/**
 * Counting elapsed hours as wall hours would label a fall back's 02:00 as
 * "03" and end its day on "01". Each row: name, day, step, the hours
 * labeled, and where the second label sits.
 */
const MARKS = [
  ['an ordinary day', DAY.ordinary, 3, [0, 3, 6, 9, 12, 15, 18, 21, 0], 12.5],
  [
    'a fall back',
    DAY.fallBack,
    3,
    [0, 3, 6, 9, 12, 15, 18, 21, 0],
    (4 / 25) * 100,
  ],
  [
    'a spring forward, without the hour that never was',
    DAY.springForward,
    1,
    [0, 1, ...Array.from({ length: 21 }, (_, i) => i + 3), 0],
    (1 / 23) * 100,
  ],
] as const;

test('hour marks name the hour the clock reads, ends included', () => {
  for (const [name, { start, end }, step, hours, second] of MARKS) {
    const marks = hourMarks(start, end, step, NY);
    assert.deepEqual(
      marks.map((m) => m.hour),
      hours,
      name,
    );
    assert.equal(marks[1]?.pct, second, name);
    assert.equal(marks.at(-1)?.pct, 100, name);
  }
});
