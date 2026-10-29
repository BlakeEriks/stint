import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  instantAt,
  snapMs,
  movedTo,
  resized,
  resizedWithinDay,
  movedByDays,
  windowFor,
  drawnRange,
  zoomed,
  fillPxPerHour,
  clickMinutes,
  hourMarks,
  hourStep,
  MIN_PX_PER_HOUR,
  MAX_PX_PER_HOUR,
  SNAP_MINUTES,
  MIN_ENTRY_MINUTES,
} from '../src/grid.ts';
import { startOfLocalDay, startOfLocalDayOffset } from '../src/calendar.ts';

const MIN = 60_000;

/** The wall clock in a zone, for asserting where a drag actually landed. */
function clock(at: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

/** The column a day occupies, the way the calendar computes it. */
function column(iso: string, tz: string) {
  const start = startOfLocalDay(new Date(iso), tz);
  return { start, end: startOfLocalDayOffset(start, tz, -1) };
}

test('a fraction resolves to the matching wall-clock time', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'America/New_York');

  assert.equal(clock(instantAt(0, start, end), 'America/New_York'), '00:00');
  assert.equal(clock(instantAt(0.5, start, end), 'America/New_York'), '12:00');
  assert.equal(clock(instantAt(0.25, start, end), 'America/New_York'), '06:00');
});

test('a fraction outside the column clamps to its edges', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'UTC');

  assert.equal(instantAt(-1, start, end).getTime(), start.getTime());
  assert.equal(instantAt(2, start, end).getTime(), end.getTime());
});

test('an arbitrary pointer position snaps to the quarter hour', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'UTC');

  // 09:07 is 0.3799… of the way through a 24h day.
  const at = instantAt((9 * 60 + 7) / 1440, start, end);
  assert.equal(clock(at, 'UTC'), '09:00');

  // 09:08 is past the midpoint, so it rounds up.
  const up = instantAt((9 * 60 + 8) / 1440, start, end);
  assert.equal(clock(up, 'UTC'), '09:15');
});

/**
 * The reason this module exists. A spring-forward day is 23 hours, so
 * multiplying a fraction by 24 hours would land every drag an hour out by
 * the end of the column.
 */
test('a fraction resolves against a 23-hour spring-forward column', () => {
  const tz = 'America/New_York';
  // 2026-03-08: 02:00 jumps to 03:00, so the local day is 23 hours.
  const { start, end } = column('2026-03-08T16:00:00Z', tz);
  assert.equal(end.getTime() - start.getTime(), 23 * 60 * MIN);

  /* Asserting the WALL CLOCK, not merely that minutes divide by 15. A fixed
     24-hour denominator also lands on quarter hours — it just lands on the
     wrong ones — so a divisibility check cannot tell the two apart, which is
     the whole failure this module exists to prevent.

     Halfway through a 23-hour day is 11.5 elapsed hours. The transition has
     already happened by then, so the wall clock reads 12:30, not 12:00. */
  assert.equal(clock(instantAt(0.5, start, end), tz), '12:30');
  assert.equal(clock(instantAt(0, start, end), tz), '00:00');
  // The last instant of the column is the next midnight.
  assert.equal(clock(instantAt(1, start, end), tz), '00:00');

  for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const minutes = Number(clock(instantAt(f, start, end), tz).slice(3));
    assert.equal(
      minutes % SNAP_MINUTES,
      0,
      `fraction ${f} landed on :${minutes}`,
    );
  }
});

test('a fraction resolves against a 25-hour fall-back column', () => {
  const tz = 'America/New_York';
  // 2026-11-01: 02:00 repeats, so the local day is 25 hours.
  const { start, end } = column('2026-11-01T16:00:00Z', tz);
  assert.equal(end.getTime() - start.getTime(), 25 * 60 * MIN);

  // Halfway through a 25-hour day is 12.5 elapsed hours, and the repeated
  // hour is behind us, so the wall clock reads 11:30.
  assert.equal(clock(instantAt(0.5, start, end), tz), '11:30');
  assert.equal(clock(instantAt(0, start, end), tz), '00:00');
  assert.equal(clock(instantAt(1, start, end), tz), '00:00');

  for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const minutes = Number(clock(instantAt(f, start, end), tz).slice(3));
    assert.equal(
      minutes % SNAP_MINUTES,
      0,
      `fraction ${f} landed on :${minutes}`,
    );
  }
});

test('snapMs rounds to the nearest step in both directions', () => {
  assert.equal(snapMs(7 * MIN), 0);
  assert.equal(snapMs(8 * MIN), 15 * MIN);
  // `+ 0` normalizes -0, which is the same instant but not strictly equal.
  assert.equal(snapMs(-7 * MIN) + 0, 0);
  assert.equal(snapMs(-8 * MIN), -15 * MIN);
});

test('moving a block preserves its duration exactly', () => {
  const startedAt = new Date('2026-09-09T09:00:00Z');
  const endedAt = new Date('2026-09-09T11:30:00Z');
  const moved = movedTo(startedAt, endedAt, new Date('2026-09-09T14:00:00Z'));

  assert.equal(moved.startedAt.toISOString(), '2026-09-09T14:00:00.000Z');
  assert.equal(
    moved.endedAt.getTime() - moved.startedAt.getTime(),
    endedAt.getTime() - startedAt.getTime(),
  );
});

/**
 * A move is not a resize. Two and a half hours of billable work dragged
 * across a DST boundary is still two and a half hours — re-deriving the end
 * from a wall clock would make it one and a half or three and a half.
 */
test('moving across a DST boundary keeps the duration, not the wall clock', () => {
  const startedAt = new Date('2026-03-08T05:00:00Z');
  const endedAt = new Date('2026-03-08T07:30:00Z');
  const moved = movedTo(startedAt, endedAt, new Date('2026-03-08T10:00:00Z'));

  assert.equal(
    moved.endedAt.getTime() - moved.startedAt.getTime(),
    150 * MIN,
    'duration changed while moving a block',
  );
});

test('resizing the end moves only the end', () => {
  const startedAt = new Date('2026-09-09T09:00:00Z');
  const endedAt = new Date('2026-09-09T11:00:00Z');
  const out = resized(
    startedAt,
    endedAt,
    'end',
    new Date('2026-09-09T12:00:00Z'),
  );

  assert.equal(out.startedAt.getTime(), startedAt.getTime());
  assert.equal(out.endedAt.toISOString(), '2026-09-09T12:00:00.000Z');
});

test('resizing the start moves only the start', () => {
  const startedAt = new Date('2026-09-09T09:00:00Z');
  const endedAt = new Date('2026-09-09T11:00:00Z');
  const out = resized(
    startedAt,
    endedAt,
    'start',
    new Date('2026-09-09T08:00:00Z'),
  );

  assert.equal(out.startedAt.toISOString(), '2026-09-09T08:00:00.000Z');
  assert.equal(out.endedAt.getTime(), endedAt.getTime());
});

/**
 * Dragging an edge past the other one is not an overnight shift — that
 * reading belongs to typed times, where 22:00–02:00 is a real shift. Here the
 * gesture means "this block ends here" and inverting it has no meaning.
 */
test('dragging the end above the start clamps instead of inverting', () => {
  const startedAt = new Date('2026-09-09T09:00:00Z');
  const endedAt = new Date('2026-09-09T11:00:00Z');
  const out = resized(
    startedAt,
    endedAt,
    'end',
    new Date('2026-09-09T07:00:00Z'),
  );

  assert.ok(
    out.endedAt > out.startedAt,
    'resize produced an entry ending before it starts',
  );
  assert.equal(
    out.endedAt.getTime() - out.startedAt.getTime(),
    MIN_ENTRY_MINUTES * MIN,
  );
});

test('dragging the start below the end clamps instead of inverting', () => {
  const startedAt = new Date('2026-09-09T09:00:00Z');
  const endedAt = new Date('2026-09-09T11:00:00Z');
  const out = resized(
    startedAt,
    endedAt,
    'start',
    new Date('2026-09-09T13:00:00Z'),
  );

  assert.ok(out.endedAt > out.startedAt);
  assert.equal(
    out.endedAt.getTime() - out.startedAt.getTime(),
    MIN_ENTRY_MINUTES * MIN,
  );
});

/**
 * The dialog strip's window: padded by two hours or the entry's length,
 * rounded out to the hour (to the half hour under five hours), and run past
 * midnight rather than kept inside one day. Rounding counts elapsed time from
 * the start's local midnight, so a DST change keeps the ends on the hour.
 */
const WINDOWS = [
  [
    'a short entry, to whole hours',
    'America/New_York',
    '2026-09-09T13:30:00Z',
    '2026-09-09T15:00:00Z',
    '2026-09-09T11:00:00Z',
    '2026-09-09T17:00:00Z',
  ],
  [
    'a long entry, by its own length',
    'UTC',
    '2026-09-09T08:00:00Z',
    '2026-09-09T20:00:00Z',
    '2026-09-08T20:00:00Z',
    '2026-09-10T08:00:00Z',
  ],
  [
    'under five hours, to the half hour',
    'UTC',
    '2026-09-09T09:15:00Z',
    '2026-09-09T09:30:00Z',
    '2026-09-09T07:00:00Z',
    '2026-09-09T11:30:00Z',
  ],
  [
    'near midnight, past it',
    'UTC',
    '2026-09-09T00:00:00Z',
    '2026-09-09T00:30:00Z',
    '2026-09-08T22:00:00Z',
    '2026-09-09T02:30:00Z',
  ],
  [
    'overnight, whole',
    'UTC',
    '2026-09-09T22:00:00Z',
    '2026-09-10T02:00:00Z',
    '2026-09-09T18:00:00Z',
    '2026-09-10T06:00:00Z',
  ],
  // 2026-03-08 is the US spring forward: a 23-hour local day.
  [
    'after a spring forward, on the hour',
    'America/New_York',
    '2026-03-08T14:00:00Z',
    '2026-03-08T15:00:00Z',
    '2026-03-08T12:00:00Z',
    '2026-03-08T17:00:00Z',
  ],
  // 2026-11-01 is the US fall back: 23:00 EDT to 03:00 EST is five hours.
  [
    'overnight across a fall back, on the hour',
    'America/New_York',
    '2026-11-01T03:00:00Z',
    '2026-11-01T08:00:00Z',
    '2026-10-31T22:00:00Z',
    '2026-11-01T13:00:00Z',
  ],
] as const;

test('the dialog window for each kind of entry', () => {
  for (const [name, tz, startedAt, endedAt, from, to] of WINDOWS) {
    const w = windowFor(new Date(startedAt), new Date(endedAt), tz);
    assert.deepEqual(
      [w.from.toISOString(), w.to.toISOString()],
      [new Date(from).toISOString(), new Date(to).toISOString()],
      name,
    );
  }
});

/**
 * A resize in the dialog stops a snap short of the other end's wall time a
 * day away: the fields cannot hold a day or more. Across a spring forward
 * that day is 23 elapsed hours.
 */
const WITHIN_A_DAY = [
  [
    'an end a day out',
    'UTC',
    '2026-09-09T09:00:00Z',
    '2026-09-09T17:00:00Z',
    'end',
    '2026-09-10T15:00:00Z',
    '2026-09-09T09:00:00Z',
    '2026-09-10T08:45:00Z',
  ],
  [
    'a start a day back',
    'UTC',
    '2026-09-09T22:00:00Z',
    '2026-09-10T02:00:00Z',
    'start',
    '2026-09-08T20:00:00Z',
    '2026-09-09T02:15:00Z',
    '2026-09-10T02:00:00Z',
  ],
  [
    'an end across a spring forward',
    'America/New_York',
    '2026-03-07T15:00:00Z',
    '2026-03-07T17:00:00Z',
    'end',
    '2026-03-08T16:00:00Z',
    '2026-03-07T15:00:00Z',
    '2026-03-08T13:45:00Z',
  ],
] as const;

test('a dialog resize stops short of a day', () => {
  for (const [
    name,
    tz,
    startedAt,
    endedAt,
    edge,
    to,
    start,
    end,
  ] of WITHIN_A_DAY) {
    const out = resizedWithinDay(
      new Date(startedAt),
      new Date(endedAt),
      edge,
      new Date(to),
      tz,
    );
    assert.deepEqual(
      [out.startedAt.toISOString(), out.endedAt.toISOString()],
      [new Date(start).toISOString(), new Date(end).toISOString()],
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
    const out = movedByDays(
      new Date(startedAt),
      new Date(endedAt),
      days,
      'America/New_York',
    );
    assert.deepEqual(
      [out.startedAt.toISOString(), out.endedAt.toISOString()],
      [new Date(start).toISOString(), new Date(end).toISOString()],
      name,
    );
  }
});

test('a drawn range snaps both ends and reads the same in either direction', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'UTC');
  const at = (h: number, m: number) => (h * 60 + m) / 1440;

  const down = drawnRange(at(17, 7), at(17, 58), start, end);
  assert.equal(clock(down.startedAt, 'UTC'), '17:00');
  assert.equal(clock(down.endedAt, 'UTC'), '18:00');

  const up = drawnRange(at(17, 58), at(17, 7), start, end);
  assert.deepEqual(up, down);
});

test('a drawn range is never shorter than the shortest entry, even at midnight', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'UTC');

  const short = drawnRange(0.5, 0.5, start, end);
  assert.equal(
    short.endedAt.getTime() - short.startedAt.getTime(),
    MIN_ENTRY_MINUTES * MIN,
  );

  const last = drawnRange(1, 1, start, end);
  assert.equal(last.endedAt.getTime(), end.getTime());
  assert.equal(
    last.endedAt.getTime() - last.startedAt.getTime(),
    MIN_ENTRY_MINUTES * MIN,
  );
});

test('a drawn range on a 23-hour day lands on the wall clock drawn', () => {
  const tz = 'America/New_York';
  const { start, end } = column('2026-03-08T12:00:00Z', tz);
  const span = end.getTime() - start.getTime();
  // 17:00 local is 16 elapsed hours on a spring-forward day.
  const f = (elapsedHours: number) => (elapsedHours * 3_600_000) / span;

  const r = drawnRange(f(16), f(17), start, end);
  assert.equal(clock(r.startedAt, tz), '17:00');
  assert.equal(clock(r.endedAt, tz), '18:00');
});

test('zoom scales by the wheel delta, in and out, inside its limits', () => {
  assert.ok(zoomed(44, -10) > 44);
  assert.ok(zoomed(44, 10) < 44);
  assert.equal(zoomed(44, 0), 44);
  // In then out by the same delta comes back to where it started.
  assert.ok(Math.abs(zoomed(zoomed(44, -10), 10) - 44) < 1e-9);
  assert.equal(zoomed(MAX_PX_PER_HOUR, -100), MAX_PX_PER_HOUR);
  assert.equal(zoomed(MIN_PX_PER_HOUR, 100), MIN_PX_PER_HOUR);
});

test('one mouse-wheel notch is capped, so it never jumps a whole range', () => {
  assert.equal(zoomed(44, -1000), zoomed(44, -100));
  assert.ok(zoomed(44, -1000) < 2 * 44);
});

test('the label step widens as hours shrink and narrows as they grow', () => {
  assert.equal(hourStep(44, 132), 3);
  assert.equal(hourStep(88, 132), 2);
  assert.equal(hourStep(176, 132), 1);
  assert.equal(hourStep(22, 132), 6);
  assert.equal(hourStep(44, 44), 1);
  assert.equal(hourStep(22, 44), 2);
});

test('zoom out stops where the day still fills its scroll area', () => {
  // A 24-hour week in a 720px area: 30px an hour fills it exactly.
  assert.equal(fillPxPerHour(720, 24), 30);
  assert.equal(zoomed(30, 100, fillPxPerHour(720, 24)), 30);
  // A level stored below it starts from it rather than from below.
  assert.equal(zoomed(22, 0, 30), 30);
  // Zooming in is unaffected.
  assert.ok(zoomed(30, -50, 30) > 30);
});

test('the fill floor never drops below the least zoom or tops the most', () => {
  assert.equal(fillPxPerHour(200, 24), MIN_PX_PER_HOUR);
  assert.equal(fillPxPerHour(0, 24), MIN_PX_PER_HOUR);
  assert.equal(fillPxPerHour(5000, 10), MAX_PX_PER_HOUR);
  assert.equal(fillPxPerHour(720, 0), MIN_PX_PER_HOUR);
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

test('a click draws its length from where it landed, inside the day', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'UTC');
  const at = (9 * 60 + 7) / 1440;

  const r = drawnRange(at, at, start, end, 30);
  assert.equal(clock(r.startedAt, 'UTC'), '09:00');
  assert.equal(clock(r.endedAt, 'UTC'), '09:30');

  const last = drawnRange(1, 1, start, end, 60);
  assert.equal(last.endedAt.getTime(), end.getTime());
  assert.equal(last.endedAt.getTime() - last.startedAt.getTime(), 60 * MIN);
});

test('hour marks fall on the step across an ordinary day, ends included', () => {
  const { start, end } = column('2026-09-09T12:00:00Z', 'America/New_York');
  const marks = hourMarks(start, end, 3, 'America/New_York');
  assert.deepEqual(
    marks.map((m) => m.hour),
    [0, 3, 6, 9, 12, 15, 18, 21, 0],
  );
  assert.equal(marks[1]?.pct, 12.5);
  assert.equal(marks.at(-1)?.pct, 100);
});

/* A 25-hour day repeats 01:00. Counting elapsed hours as wall hours would
   label 02:00 as "03" and end the day on "01". */
test('hour marks on a fall-back day name the hour the clock reads', () => {
  const tz = 'America/New_York';
  const { start, end } = column('2026-11-01T12:00:00Z', tz);
  const marks = hourMarks(start, end, 3, tz);
  assert.deepEqual(
    marks.map((m) => m.hour),
    [0, 3, 6, 9, 12, 15, 18, 21, 0],
  );
  // 03:00 is four elapsed hours into the 25.
  assert.equal(marks[1]?.pct, (4 / 25) * 100);
  assert.equal(marks.at(-1)?.pct, 100);
});

test('hour marks on a spring-forward day skip the hour that never was', () => {
  const tz = 'America/New_York';
  const { start, end } = column('2026-03-08T12:00:00Z', tz);
  const hours = hourMarks(start, end, 1, tz).map((m) => m.hour);
  assert.equal(hours.length, 24);
  assert.ok(!hours.includes(2));
});
