import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAwaitingPayment,
  buildCollected,
  buildEarnedPace,
  buildHoursByDay,
  buildMonthTotals,
  buildOpenInvoiceCount,
  buildOverdueInvoices,
  buildStaleDrafts,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  clientNamesFrom,
  type CollectedRow,
  daysSincePaid,
  type DurationRow,
  type InvoiceRow,
  projectNamesFrom,
  revenueByDay,
  buildWeek,
  scalar,
  type UnbilledRow,
} from '../src/stats.ts';

const now = new Date('2026-03-18T12:00:00Z');

const unbilledRow = (o: Partial<UnbilledRow> = {}): UnbilledRow => ({
  client_id: 'c1',
  client_name: 'Acme',
  currency: 'USD',
  seconds: 3600,
  amount: '100.00',
  unrated_count: 0,
  oldest_at: '2026-03-01T00:00:00Z',
  ...o,
});

const invoice = (o: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: 'i1',
  invoice_number: '0001',
  client_id: 'c1',
  status: 'sent',
  due_date: '2026-03-01',
  total: '250.00',
  currency: 'USD',
  issue_date: '2026-02-01',
  ...o,
});

// ── unbilled ────────────────────────────────────────────────────────

test('the unbilled total rounds once, so a sum of rounded lines is money', () => {
  const rows = [
    unbilledRow({ amount: '33.33' }),
    unbilledRow({ amount: '33.33' }),
    unbilledRow({ amount: '33.34' }),
  ];
  const { total } = buildUnbilled(rows, 'USD', now);
  assert.equal(total, 100);
  assert.equal(Math.round(total * 100) % 1, 0);
});

test('unbilled caps byClient at five and counts the rest', () => {
  const rows = Array.from({ length: 8 }, () => unbilledRow());
  const u = buildUnbilled(rows, 'USD', now);
  assert.equal(u.byClient.length, 5);
  assert.equal(u.moreClients, 3);
  assert.equal(u.seconds, 8 * 3600);
});

test('unbilled names internal work rather than rendering a blank', () => {
  const [row] = buildUnbilled(
    [unbilledRow({ client_id: null, client_name: null, currency: null })],
    'EUR',
    now,
  ).byClient;
  assert.equal(row?.clientName, 'No client');
  assert.equal(row?.currency, 'EUR');
});

test('oldestDays ages from the oldest entry', () => {
  const [row] = buildUnbilled(
    [unbilledRow({ oldest_at: '2026-03-08T12:00:00Z' })],
    'USD',
    now,
  ).byClient;
  assert.equal(row?.oldestDays, 10);
});

test('revenueByDay keeps the day SQL grouped by, not a shifted ISO date', () => {
  /* The `pg` driver parses a `date` into a local Date at LOCAL midnight — the
     calendar day SQL grouped by, in the runner's zone. Reading the key off
     `toISOString` instead moves that day's money into the day before wherever
     the offset is positive, which is every zone east of Greenwich.

     It therefore only goes red on a runner east of Greenwich — west of it the
     two readings agree. `TZ=Europe/Berlin pnpm core:test` is where breaking
     this is visible. */
  const local = new Date(2026, 2, 18);
  const m = revenueByDay([
    { day: local as unknown as string, seconds: 7200, amount: '120.00' },
  ]);

  assert.equal(m.size, 1);
  assert.equal(m.get('2026-03-18'), 120, 'the day SQL grouped by');
  assert.equal(m.get('2026-03-17'), undefined, 'never its UTC eve');
});

test('revenueByDay reads a null amount as earning nothing nameable', () => {
  // A day of purely unrated work: the rollup returns its seconds with a null
  // amount, and the money line holds flat rather than going NaN.
  const m = revenueByDay([{ day: '2026-03-18', seconds: 3600, amount: null }]);
  assert.equal(m.get('2026-03-18'), 0);
});

// ── the week's bars ─────────────────────────────────────────────────

test('buildWeek returns a column per key, zero where nothing was worked', () => {
  const keys = [
    '2026-03-16',
    '2026-03-17',
    '2026-03-18',
    '2026-03-19',
    '2026-03-20',
    '2026-03-21',
    '2026-03-22',
  ];
  const week = buildWeek(
    [
      { day: '2026-03-16', seconds: 7200, amount: '300.00' },
      { day: '2026-03-18', seconds: 3600, amount: '150.00' },
    ],
    keys,
  );

  assert.equal(week.length, 7, 'seven columns, always');
  assert.deepEqual(
    week.map((d) => d.date),
    keys,
    'in the order asked for',
  );
  assert.deepEqual(week[0], {
    date: '2026-03-16',
    seconds: 7200,
    amount: 300,
  });
  assert.deepEqual(
    week[1],
    { date: '2026-03-17', seconds: 0, amount: null },
    'a day with no work is a zero column, not a missing one',
  );
  assert.equal(week[2]?.amount, 150);
});

test('buildWeek keeps an unrated day’s height and prints no figure', () => {
  // Seconds and amount do not share a filter: the time was worked, so the
  // bar has its real height, and the head prints nothing rather than $0.
  const [day] = buildWeek(
    [{ day: '2026-03-16', seconds: 5400, amount: null }],
    ['2026-03-16'],
  );
  assert.equal(day?.seconds, 5400, 'the height is the honest record');
  assert.equal(day?.amount, null, 'never 0 — that would claim it was free');
});

test('buildWeek reads the pg driver’s Date like revenueByDay does', () => {
  const local = new Date(2026, 2, 18);
  const [day] = buildWeek(
    [{ day: local as unknown as string, seconds: 3600, amount: '90.00' }],
    ['2026-03-18'],
  );
  assert.equal(day?.seconds, 3600, 'matched on the day SQL grouped by');
  assert.equal(day?.amount, 90);
});

// ── awaiting payment ────────────────────────────────────────────────

test('awaitingPayment counts sent invoices only, rounded once', () => {
  const total = buildAwaitingPayment([
    invoice({ total: '33.33' }),
    invoice({ total: '33.34' }),
    invoice({ status: 'draft', total: '999.00' }),
  ]);
  assert.equal(total, 66.67);
});

// ── attention rows ──────────────────────────────────────────────────

const names = clientNamesFrom([unbilledRow()]);

test('an invoice inside the grace period is not overdue', () => {
  const rows = buildOverdueInvoices(
    [invoice({ due_date: '2026-03-15' })],
    names,
    'USD',
    '2026-03-18',
    '2026-03-11',
  );
  assert.deepEqual(rows, []);
});

test('overdue invoices lead with the most overdue', () => {
  const rows = buildOverdueInvoices(
    [
      invoice({ id: 'a', due_date: '2026-03-01' }),
      invoice({ id: 'b', due_date: '2026-01-01' }),
    ],
    names,
    'USD',
    '2026-03-18',
    '2026-03-11',
  );
  assert.deepEqual(
    rows.map((r) => r.invoiceId),
    ['b', 'a'],
  );
  assert.equal(rows[0]?.daysLate, 76);
  assert.equal(rows[0]?.clientName, 'Acme');
});

test('a sent invoice is never a stale draft', () => {
  const rows = buildStaleDrafts(
    [
      invoice({ id: 'a', status: 'draft', issue_date: '2026-02-01' }),
      invoice({ id: 'b', status: 'sent', issue_date: '2026-01-01' }),
    ],
    names,
    'USD',
    '2026-03-18',
    '2026-03-11',
  );
  assert.deepEqual(
    rows.map((r) => r.invoiceId),
    ['a'],
  );
  assert.equal(rows[0]?.ageDays, 45);
});

// ── unprojected ─────────────────────────────────────────────────────

test('unprojected is one row per entry, with a null duration as zero', () => {
  const rows = buildUnprojected([
    {
      id: 'e1',
      task_name: 'Deploy',
      started_at: '2026-03-01T09:00:00Z',
      duration_seconds: null,
    },
  ]);
  assert.deepEqual(rows, [
    {
      entryId: 'e1',
      taskName: 'Deploy',
      startedAt: '2026-03-01T09:00:00Z',
      seconds: 0,
    },
  ]);
});

// ── strange durations ───────────────────────────────────────────────

const entry = (o: Partial<DurationRow> = {}): DurationRow => ({
  id: 'e1',
  task_name: 'Deploy',
  started_at: '2026-03-01T09:00:00Z',
  duration_seconds: 30,
  project_id: 'p1',
  ...o,
});

const projects = projectNamesFrom(
  [{ id: 'p1', name: 'Website', client_id: 'c1' }],
  names,
);

test('no thresholds retires the row entirely', () => {
  assert.deepEqual(
    buildStrangeDurations([entry()], null, null, projects, new Set()),
    [],
  );
});

test('each threshold governs its own side', () => {
  const rows = [
    entry({ id: 'short' }),
    entry({ id: 'long', duration_seconds: 40_000 }),
  ];
  assert.deepEqual(
    buildStrangeDurations(rows, 60, null, projects, new Set()).map((r) => [
      r.entryId,
      r.kind,
    ]),
    [['short', 'short']],
  );
  assert.deepEqual(
    buildStrangeDurations(rows, null, 10, projects, new Set()).map((r) => [
      r.entryId,
      r.kind,
    ]),
    [['long', 'long']],
  );
});

test('an entry already shown as unprojected does not repeat here', () => {
  assert.deepEqual(
    buildStrangeDurations([entry()], 60, null, projects, new Set(['e1'])),
    [],
  );
});

test('a strange row carries its project and client qualifier', () => {
  const [row] = buildStrangeDurations([entry()], 60, null, projects, new Set());
  assert.equal(row?.projectName, 'Website');
  assert.equal(row?.clientName, 'Acme');
});

test('an entry with no project has no qualifier rather than a blank one', () => {
  const [row] = buildStrangeDurations(
    [entry({ project_id: null })],
    60,
    null,
    projects,
    new Set(),
  );
  assert.equal(row?.projectName, null);
  assert.equal(row?.clientName, null);
});

// ── month totals and pace ───────────────────────────────────────────

test('month totals separate billable from tracked', () => {
  const t = buildMonthTotals([
    {
      duration_seconds: 3600,
      is_billable: true,
      started_at: '2026-03-02T09:00:00Z',
    },
    {
      duration_seconds: 1800,
      is_billable: false,
      started_at: '2026-03-02T11:00:00Z',
    },
    {
      duration_seconds: null,
      is_billable: true,
      started_at: '2026-03-03T09:00:00Z',
    },
  ]);
  assert.deepEqual(t, { monthSeconds: 5400, billableSeconds: 3600 });
});

test('hours bucket by LOCAL day, not by UTC', () => {
  // 02:00Z on the 18th is still the 17th in Los Angeles.
  const rows = [
    {
      duration_seconds: 7200,
      is_billable: true,
      started_at: '2026-03-18T02:00:00Z',
    },
  ];
  assert.equal(buildHoursByDay(rows, 'UTC').get('2026-03-18'), 2);
  assert.equal(
    buildHoursByDay(rows, 'America/Los_Angeles').get('2026-03-17'),
    2,
    'an evening’s work must not move into the next day',
  );
});

// ── the month's trailing pace ───────────────────────────────────────

test('the trailing rate is carried to the last business day', () => {
  // March 2026: 22 business days, the 18th is a Wednesday and the 13th
  // elapsed business day. $200 a day so far projects to $4,400.
  const byDay = new Map<string, number>();
  for (const d of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18]) {
    byDay.set(`2026-03-${String(d).padStart(2, '0')}`, 200);
  }

  const p = buildEarnedPace({ byDay, now, tz: 'UTC' });
  assert.equal(p.businessDaysElapsed, 13);
  assert.equal(p.businessDaysTotal, 22);
  assert.equal(p.earned, 2600);
  assert.equal(p.projected, 4400, '200 a day across 22 days');
});

test('the projection is withheld while the month is too young to have a rate', () => {
  // The 2nd of March 2026 is the month's first business day. A single long
  // day must not project a month of thousands off one divisor.
  const p = buildEarnedPace({
    byDay: new Map([['2026-03-02', 4000]]),
    now: new Date('2026-03-02T12:00:00Z'),
    tz: 'UTC',
  });
  assert.equal(p.businessDaysElapsed, 1);
  assert.equal(p.earned, 4000, 'the line still shows what was earned');
  assert.equal(p.projected, null, 'but nothing is extrapolated from one day');
  assert.equal(p.projection, null, 'and there is no dashed segment');
});

test('a month whose 1st is a weekend projects nothing on day one', () => {
  // August 2026 opens on a Saturday: zero business days elapsed, and a
  // divisor of zero would make any earned figure infinite.
  const p = buildEarnedPace({
    byDay: new Map([['2026-08-01', 500]]),
    now: new Date('2026-08-01T12:00:00Z'),
    tz: 'UTC',
  });
  assert.equal(p.businessDaysElapsed, 0);
  assert.equal(p.projected, null);
  assert.ok(Number.isFinite(p.earned), 'no division by zero leaks out');
  assert.equal(
    p.series[0]?.date,
    '2026-08-03',
    'the first point is the Monday',
  );
});

test('at month end the projection equals what was earned', () => {
  const byDay = new Map<string, number>();
  for (const d of [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20]) {
    byDay.set(`2026-03-${String(d).padStart(2, '0')}`, 100);
  }
  byDay.set('2026-03-23', 100);
  byDay.set('2026-03-24', 100);
  byDay.set('2026-03-25', 100);
  byDay.set('2026-03-26', 100);
  byDay.set('2026-03-27', 100);
  byDay.set('2026-03-30', 100);
  byDay.set('2026-03-31', 100);

  const p = buildEarnedPace({
    byDay,
    now: new Date('2026-03-31T12:00:00Z'),
    tz: 'UTC',
  });
  assert.equal(p.businessDaysElapsed, p.businessDaysTotal);
  assert.equal(p.earned, 2200);
  assert.equal(p.projected, 2200, 'nothing left to extrapolate across');
  assert.equal(p.projection?.from.date, '2026-03-31');
  assert.equal(p.projection?.to.date, '2026-03-31');
});

test('a month with nothing earned projects zero, not null', () => {
  // 0 is a valid rate: an empty month has a trailing pace, and it is zero.
  const p = buildEarnedPace({ byDay: new Map(), now, tz: 'UTC' });
  assert.equal(p.earned, 0);
  assert.equal(p.projected, 0, '0 is a rate, not a missing one');
  assert.ok(p.series.every((s) => s.actual === 0 || s.actual === null));
});

test('the line only ever goes up', () => {
  const p = buildEarnedPace({
    byDay: new Map([
      ['2026-03-02', 300],
      ['2026-03-05', 0],
      ['2026-03-11', 125.5],
      ['2026-03-17', 40],
    ]),
    now,
    tz: 'UTC',
  });

  let last = 0;
  for (const point of p.series) {
    if (point.actual == null) continue;
    assert.ok(
      point.actual >= last,
      `${point.date} fell from ${last} to ${point.actual}`,
    );
    last = point.actual;
  }
  assert.equal(last, 465.5, 'and ends at the month’s earned');
});

// ── the month's cumulative series ───────────────────────────────────

test('the series steps on business days only, never through the weekend', () => {
  // March 2026: the 18th is a Wednesday, and the 21st/22nd are a weekend.
  const p = buildEarnedPace({ now, tz: 'UTC' });

  const dates = p.series.map((s) => s.date);
  assert.ok(!dates.includes('2026-03-21'), 'Saturday is not a point');
  assert.ok(!dates.includes('2026-03-22'), 'nor Sunday');
  assert.equal(dates.length, 22, 'March 2026 has 22 business days');
});

test('the series has exactly as many points as the month has business days', () => {
  // Two loops count the month's business days — this one and
  // `businessDaysInLocalMonth`. The projection divides one by the other.
  for (const iso of [
    '2026-01-15T12:00:00Z', // starts on a Thursday
    '2026-02-15T12:00:00Z', // 28 days
    '2026-03-18T12:00:00Z',
    '2026-08-15T12:00:00Z', // starts on a Saturday
    '2028-02-15T12:00:00Z', // a leap February
  ]) {
    const p = buildEarnedPace({ now: new Date(iso), tz: 'UTC' });
    assert.equal(p.series.length, p.businessDaysTotal, iso);
  }
});

test('weekend work is carried onto the next business day, never lost', () => {
  const p = buildEarnedPace({
    // The 21st is a Saturday, so its money has no point of its own.
    byDay: new Map([
      ['2026-03-20', 400],
      ['2026-03-21', 300],
    ]),
    now: new Date('2026-03-31T12:00:00Z'),
    tz: 'UTC',
  });

  assert.equal(p.series.find((s) => s.date === '2026-03-20')?.actual, 400);
  assert.equal(
    p.series.find((s) => s.date === '2026-03-23')?.actual,
    700,
    'Saturday’s $300 lands on Monday',
  );
  assert.equal(p.earned, 700, 'and the total keeps it');
});

test('a month ending on a Saturday keeps that Saturday’s work', () => {
  // January 2026 ends on Saturday the 31st, so there is no business day left
  // to carry it onto. The last point absorbs it rather than dropping it.
  const p = buildEarnedPace({
    byDay: new Map([
      ['2026-01-15', 1000],
      ['2026-01-31', 500],
    ]),
    now: new Date('2026-01-31T12:00:00Z'),
    tz: 'UTC',
  });

  assert.equal(p.earned, 1500, 'the 31st is not lost');
  assert.equal(p.series.at(-1)?.date, '2026-01-30', 'still no weekend point');
  assert.equal(p.series.at(-1)?.actual, 1500);
});

test('a month ending on a Sunday keeps the whole closing weekend', () => {
  // May 2026 ends on Sunday the 31st; the 30th is the Saturday before it.
  const p = buildEarnedPace({
    byDay: new Map([
      ['2026-05-29', 200],
      ['2026-05-30', 100],
      ['2026-05-31', 50],
    ]),
    now: new Date('2026-05-31T12:00:00Z'),
    tz: 'UTC',
  });

  assert.equal(p.earned, 350, 'both weekend days land');
  assert.equal(p.series.at(-1)?.date, '2026-05-29', 'the Friday is the last');
  assert.equal(p.series.at(-1)?.actual, 350);
});

test('the last non-null point equals the month’s full total', () => {
  // Whatever weekday the month ends on, the line ends where the figure does.
  for (const [iso, days] of [
    ['2026-01-31T12:00:00Z', ['2026-01-02', '2026-01-30', '2026-01-31']],
    ['2026-05-31T12:00:00Z', ['2026-05-01', '2026-05-30', '2026-05-31']],
    ['2026-08-31T12:00:00Z', ['2026-08-03', '2026-08-29', '2026-08-31']],
    ['2026-03-31T12:00:00Z', ['2026-03-02', '2026-03-21', '2026-03-31']],
  ] as [string, string[]][]) {
    const byDay = new Map(days.map((d) => [d, 100]));
    const p = buildEarnedPace({ byDay, now: new Date(iso), tz: 'UTC' });
    const lastActual = p.series.reduce<number>((a, s) => s.actual ?? a, 0);
    assert.equal(p.earned, 300, iso);
    assert.equal(lastActual, p.earned, `${iso}: the line ends at the figure`);
  }
});

test('earned sums the month itself, not the neighbouring one', () => {
  const p = buildEarnedPace({
    byDay: new Map([
      ['2026-01-31', 500],
      ['2026-02-02', 999],
    ]),
    now: new Date('2026-01-31T12:00:00Z'),
    tz: 'UTC',
  });
  assert.equal(p.earned, 500, 'February is not January’s money');
  assert.equal(p.series.at(-1)?.actual, 500);
});

test('the cumulative line stops at today rather than running flat', () => {
  const p = buildEarnedPace({
    byDay: new Map([['2026-03-02', 600]]),
    now,
    tz: 'UTC',
  });

  assert.equal(p.series.find((s) => s.date === '2026-03-18')?.actual, 600);
  assert.equal(
    p.series.find((s) => s.date === '2026-03-19')?.actual,
    null,
    'tomorrow has not happened',
  );
  // The dashed segment is what runs to month end, not the solid line.
  assert.equal(p.projection?.to.date, '2026-03-31');
});

// ── days since paid ─────────────────────────────────────────────────

/* The screen says "paid today", which is a calendar word. Elapsed 24-hour
   spans make last night's payment ten hours old this morning, so it floors
   to 0 and the line claims today's money about yesterday's. */
test('daysSincePaid counts calendar days, not elapsed 24-hour spans', () => {
  const morning = new Date('2026-03-18T13:00:00Z'); // 09:00 New York
  const lastNight = '2026-03-18T03:00:00Z'; // 23:00 New York, the 17th

  assert.equal(daysSincePaid(lastNight, morning, 'America/New_York'), 1);
  assert.equal(
    daysSincePaid('2026-03-18T12:00:00Z', morning, 'America/New_York'),
    0,
    'the same local date is today',
  );
});

/* Bucketed in the caller's zone like every other figure here: one instant is
   two different calendar dates either side of the date line. */
test('daysSincePaid reads the local date, not UTC', () => {
  const now = new Date('2026-03-18T12:00:00Z');
  const paid = '2026-03-17T23:30:00Z';

  assert.equal(daysSincePaid(paid, now, 'UTC'), 1);
  assert.equal(
    daysSincePaid(paid, now, 'Asia/Tokyo'),
    0,
    'already the 18th in Tokyo',
  );
});

/* A future payment date is a data error, not a state the line has copy for.
   Clamping it to 0 is what would make the screen say "paid today" about
   money that has not arrived, so it reports nothing instead. */
test('a future paid_at is null rather than “paid today”', () => {
  const now = new Date('2026-03-18T12:00:00Z');
  assert.equal(daysSincePaid('2026-03-19T12:00:00Z', now, 'UTC'), null);
  assert.equal(daysSincePaid('2026-03-18T23:00:00Z', now, 'UTC'), 0);
});

// ── collected ───────────────────────────────────────────────────────

const collectedRow = (o: Partial<CollectedRow> = {}): CollectedRow => ({
  month: '2026-03',
  currency: 'USD',
  amount: '500.00',
  ...o,
});

/* The rollup returns one row per (month, currency). The response carries ONE
   currency and the screen prints it beside the figure, so a euro added in is
   a euro reported as a dollar. */
test('collected counts only rows in the response’s currency', () => {
  const c = buildCollected(
    [
      collectedRow({ month: '2026-03', currency: 'USD', amount: '500.00' }),
      collectedRow({ month: '2026-03', currency: 'EUR', amount: '1000.00' }),
    ],
    ['2026-02', '2026-03'],
    null,
    'USD',
  );

  assert.equal(c.trailing12, 500);
  assert.equal(c.thisMonth, 500);
  assert.equal(c.byMonth.at(-1)?.amount, 500, 'nor does it reach the plot');
});

/* Summed over the WINDOW rather than over the rows. The rollup is asked for
   the window, but a row outside it — a boundary the caller and SQL bucket
   differently — would otherwise inflate the figure Home leads with. */
test('a month outside the window reaches neither the figure nor the plot', () => {
  const c = buildCollected(
    [
      collectedRow({ month: '2026-03', amount: '500.00' }),
      collectedRow({ month: '2025-01', amount: '9000.00' }),
    ],
    ['2026-02', '2026-03'],
    null,
    'USD',
  );

  assert.equal(c.trailing12, 500);
  assert.deepEqual(
    c.byMonth.map((m) => m.month),
    ['2026-02', '2026-03'],
  );
});

/* The plot draws the last six of the same series the figure sums. A shorter
   window is every month it has, not six padded with invented ones. */
test('a window shorter than the plot draws only the months it has', () => {
  const c = buildCollected(
    [collectedRow({ month: '2026-03', amount: '500.00' })],
    ['2026-02', '2026-03'],
    null,
    'USD',
  );

  assert.equal(c.byMonth.length, 2);
  assert.deepEqual(
    c.byMonth.map((m) => m.amount),
    [0, 500],
    'a month nobody paid in is a real zero, not a hole',
  );
});

/* No window is no figure. `thisMonth` has no month to read, and reporting
   the rows' own total would be a figure for a period nobody asked about. */
test('an empty window is zero, not the rows’ total', () => {
  const c = buildCollected(
    [collectedRow({ month: '2026-03', amount: '500.00' })],
    [],
    null,
    'USD',
  );

  assert.equal(c.trailing12, 0);
  assert.equal(c.thisMonth, 0);
  assert.deepEqual(c.byMonth, []);
});

/* Rounded once on the sum like every other total here: adding rounded lines
   lands fractions of a cent below the last place and the response would not
   be `money`. */
test('collected rounds its sums to cents', () => {
  const c = buildCollected(
    [
      collectedRow({ month: '2026-02', amount: '33.333' }),
      collectedRow({ month: '2026-03', amount: '33.333' }),
      collectedRow({ month: '2026-03', amount: '33.334' }),
    ],
    ['2026-02', '2026-03'],
    null,
    'USD',
  );

  assert.equal(c.trailing12, 100);
  assert.equal(c.thisMonth, 66.67);
  assert.equal(c.byMonth.at(-1)?.amount, 66.67);
  assert.equal(c.byMonth.at(0)?.amount, 33.33);
});

// ── open invoices ───────────────────────────────────────────────────

/* The count of what makes up `awaitingPayment`, so it counts exactly what
   that figure sums: a draft has not been asked for and a paid one has
   arrived. */
test('the open count is the sent invoices, and only those', () => {
  const rows = [
    invoice({ id: 'a', status: 'sent' }),
    invoice({ id: 'b', status: 'sent' }),
    invoice({ id: 'c', status: 'draft' }),
    invoice({ id: 'd', status: 'paid' }),
    invoice({ id: 'e', status: 'void' }),
  ];

  assert.equal(buildOpenInvoiceCount(rows), 2);
  assert.equal(buildOpenInvoiceCount([]), 0);
  assert.equal(
    buildOpenInvoiceCount(rows),
    rows.filter((i) => Number(buildAwaitingPayment([i])) > 0).length,
    'it counts what awaitingPayment sums',
  );
});

// ── scalar ──────────────────────────────────────────────────────────

test('scalar reads both rpc shapes and a numeric string', () => {
  assert.equal(scalar('1234.50'), 1234.5);
  assert.equal(scalar([{ month_revenue: '99.00' }]), 99);
  assert.equal(scalar(null), 0);
  assert.equal(scalar([]), 0);
});
