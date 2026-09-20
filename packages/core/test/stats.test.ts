import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAwaitingPayment,
  buildBillableRatio,
  buildByProject,
  buildCollected,
  buildHoursByDay,
  buildMonthTotals,
  buildOpenInvoiceCount,
  buildOverdueInvoices,
  buildPace,
  buildStaleDrafts,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  buildVelocity,
  type ByProjectRow,
  clientNamesFrom,
  type CollectedRow,
  daysSincePaid,
  type DurationRow,
  type InvoiceRow,
  projectNamesFrom,
  revenueByDay,
  roundMoney,
  scalar,
  type UnbilledRow,
  type VelocityRow,
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

// ── velocity ────────────────────────────────────────────────────────

const velocityRow = (o: Partial<VelocityRow> = {}): VelocityRow => ({
  client_id: 'c1',
  client_name: 'Acme',
  currency: 'USD',
  seconds: 3600,
  invoiced: '0',
  unbilled: '0',
  unrated_count: 0,
  ...o,
});

test('velocity totals the split and rounds once, so the sum is money', () => {
  const v = buildVelocity(
    [
      velocityRow({ invoiced: '33.33', unbilled: '11.11' }),
      velocityRow({ invoiced: '33.34', unbilled: '11.12' }),
    ],
    'USD',
    3,
  );
  assert.equal(v.invoiced, 66.67);
  assert.equal(v.unbilled, 22.23);
  assert.equal(v.total, 88.9, 'total is the two sides, not a third figure');
  assert.equal(v.months, 3);
});

test('velocity divides per month here, so the screen reconciles', () => {
  /* A total that does not divide evenly is the whole case. Divided at the
     render instead, `Intl` rounded the quotient for display and the headline
     multiplied back to a figure other than the split printed beneath it — a
     billing screen disagreeing with itself by cents. */
  const v = buildVelocity(
    [velocityRow({ invoiced: '2000.00', unbilled: '1000.01' })],
    'USD',
    3,
  );
  assert.equal(v.total, 3000.01);
  assert.equal(v.perMonth, 1000, 'rounded to cents, like every other money');
  assert.equal(
    Math.round(v.perMonth * 100) / 100,
    v.perMonth,
    'already money: nothing downstream needs to round it again',
  );
});

test('velocity names internal work rather than rendering a blank', () => {
  const [row] = buildVelocity(
    [velocityRow({ client_id: null, client_name: null, currency: null })],
    'EUR',
    3,
  ).byClient;
  assert.equal(row?.clientName, 'No client');
  assert.equal(row?.currency, 'EUR');
});

test('velocity caps byClient at five and counts the rest', () => {
  const v = buildVelocity(
    Array.from({ length: 8 }, () => velocityRow()),
    'USD',
    3,
  );
  assert.equal(v.byClient.length, 5);
  assert.equal(v.moreClients, 3);
  assert.equal(v.seconds, 8 * 3600, 'the total still covers every client');
});

// ── by project ──────────────────────────────────────────────────────

const byProjectRow = (o: Partial<ByProjectRow> = {}): ByProjectRow => ({
  project_id: 'p1',
  project_name: 'Redesign',
  client_id: 'c1',
  client_name: 'Acme',
  currency: 'USD',
  seconds: 3600,
  billable_seconds: 3600,
  invoiced: '0',
  unbilled: '0',
  unrated_count: 0,
  ...o,
});

/** The invariant the footer rests on, asserted wherever a case can break it. */
const reconciles = (b: ReturnType<typeof buildByProject>) => {
  const columnSeconds = b.byProject.reduce((a, r) => a + r.seconds, 0);
  const columnAmount = b.byProject.reduce((a, r) => a + r.amount, 0);
  assert.equal(columnSeconds + b.tailSeconds, b.seconds, 'seconds reconcile');
  assert.equal(
    roundMoney(columnAmount + b.tailAmount),
    b.amount,
    'amount reconciles',
  );
};

test('byProject totals the split and rounds once, so the sum is money', () => {
  const b = buildByProject(
    [
      byProjectRow({ project_id: 'p1', invoiced: '33.33', unbilled: '11.11' }),
      byProjectRow({ project_id: 'p2', invoiced: '33.34', unbilled: '11.12' }),
    ],
    'USD',
  );
  assert.equal(b.amount, 88.9, 'the gross, not a third figure');
  assert.equal(Math.round(b.amount * 100) / 100, b.amount, 'already money');
  reconciles(b);
});

test('byProject caps the columns at four and counts the rest into the tail', () => {
  const b = buildByProject(
    Array.from({ length: 7 }, (_, i) =>
      byProjectRow({ project_id: `p${i}`, invoiced: '10.00' }),
    ),
    'USD',
  );
  assert.equal(b.byProject.length, 4);
  assert.equal(b.moreProjects, 3);
  assert.equal(b.tailSeconds, 3 * 3600);
  assert.equal(b.tailAmount, 30);
  assert.equal(b.seconds, 7 * 3600, 'the total still covers every project');
  reconciles(b);
});

test('byProject leaves a null client unnamed rather than inventing a label', () => {
  const [row] = buildByProject(
    [byProjectRow({ client_id: null, client_name: null, currency: null })],
    'EUR',
  ).byProject;
  assert.equal(row?.clientName, null, 'the client renders the qualifier');
  assert.equal(row?.currency, 'EUR');
});

test('unfiled work is never a column, however many hours it carries', () => {
  /* The decision the whole region rests on. A bar for work that is not a
     project would take a slot from work that is, and the unprojected card
     already owns that subject — but dropping the row instead would put a
     total on screen that omits unfiled hours. So: out of the columns, into
     the tail, inside the total. */
  const b = buildByProject(
    [
      byProjectRow({
        project_id: null,
        project_name: null,
        client_id: null,
        client_name: null,
        seconds: 99 * 3600,
        billable_seconds: 99 * 3600,
        invoiced: '990.00',
      }),
      byProjectRow({ project_id: 'p1', seconds: 3600, invoiced: '10.00' }),
      byProjectRow({ project_id: 'p2', seconds: 3600, invoiced: '10.00' }),
    ],
    'USD',
  );
  assert.deepEqual(
    b.byProject.map((r) => r.projectId),
    ['p1', 'p2'],
    'it outranks both and is still absent',
  );
  assert.equal(b.moreProjects, 1, 'it is the tail, not a fifth project');
  assert.equal(b.tailSeconds, 99 * 3600);
  assert.equal(b.tailAmount, 990);
  assert.equal(b.seconds, 101 * 3600, 'the window total is the real total');
  assert.equal(b.amount, 1010);
  reconciles(b);
});

test('byProject reports unbillable work as hours with no money', () => {
  const b = buildByProject(
    [byProjectRow({ billable_seconds: 0, invoiced: '0', unbilled: '0' })],
    'USD',
  );
  assert.equal(b.byProject[0]?.seconds, 3600);
  assert.equal(b.byProject[0]?.billableSeconds, 0);
  assert.equal(b.amount, 0);
  reconciles(b);
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
    { day: local as unknown as string, amount: '120.00' },
  ]);

  assert.equal(m.size, 1);
  assert.equal(m.get('2026-03-18'), 120, 'the day SQL grouped by');
  assert.equal(m.get('2026-03-17'), undefined, 'never its UTC eve');
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

test('a month with nothing tracked has no ratio — 0/0 is not 0%', () => {
  assert.equal(buildBillableRatio(0, 0), null);
  assert.equal(buildBillableRatio(5400, 3600), 2 / 3);
});

test('no target means no pace card', () => {
  assert.equal(
    buildPace({
      target: null,
      unit: 'hours',
      monthSeconds: 0,
      monthRevenue: 0,
      now,
      tz: 'UTC',
    }),
    null,
  );
});

test('an hours target reports the delta', () => {
  const p = buildPace({
    target: 100,
    unit: 'hours',
    monthSeconds: 36_000,
    monthRevenue: 0,
    now,
    tz: 'UTC',
  });
  assert.equal(p?.actual, 10);
  assert.ok(p?.expected != null && p.expected > 0);
  assert.equal(p?.delta, p.actual! - p.expected!);
});

test('a revenue target gets a ray, the same as an hours one', () => {
  const p = buildPace({
    target: '5000',
    unit: 'revenue',
    monthSeconds: 36_000,
    monthRevenue: 1200,
    now,
    tz: 'UTC',
  });
  assert.equal(p?.actual, 1200);
  assert.ok(p?.expected != null && p.expected > 0, 'revenue projects too');
  assert.equal(p?.delta, p.actual! - p.expected!);
  assert.equal(p?.series.at(-1)?.expected, 5000, 'the ray reaches the target');
});

// ── the month's cumulative series ───────────────────────────────────

test('the ray steps on business days only, never through the weekend', () => {
  // March 2026: the 18th is a Wednesday, and the 21st/22nd are a weekend.
  const p = buildPace({
    target: 220,
    unit: 'hours',
    monthSeconds: 0,
    monthRevenue: 0,
    now,
    tz: 'UTC',
  });

  const dates = p?.series.map((s) => s.date) ?? [];
  assert.ok(!dates.includes('2026-03-21'), 'Saturday is not a point');
  assert.ok(!dates.includes('2026-03-22'), 'nor Sunday');
  assert.equal(dates.length, 22, 'March 2026 has 22 business days');

  // The ray rises by exactly one step between adjacent points, including
  // across the weekend gap: Friday the 20th to Monday the 23rd.
  const step = 220 / 22;
  const fri = p?.series.find((s) => s.date === '2026-03-20');
  const mon = p?.series.find((s) => s.date === '2026-03-23');
  assert.ok(
    Math.abs((mon?.expected ?? 0) - (fri?.expected ?? 0) - step) < 1e-9,
    'the weekend adds no slope',
  );
  assert.equal(p?.series.at(-1)?.expected, 220);
});

test('the series has exactly as many points as the month has business days', () => {
  // Two loops count the month's business days — this one and
  // `businessDaysInLocalMonth`. The card divides one by the other.
  for (const iso of [
    '2026-01-15T12:00:00Z', // starts on a Thursday
    '2026-02-15T12:00:00Z', // 28 days
    '2026-03-18T12:00:00Z',
    '2026-08-15T12:00:00Z', // starts on a Saturday
    '2028-02-15T12:00:00Z', // a leap February
  ]) {
    const p = buildPace({
      target: 100,
      unit: 'hours',
      monthSeconds: 0,
      monthRevenue: 0,
      now: new Date(iso),
      tz: 'UTC',
    });
    assert.equal(p?.series.length, p?.businessDaysTotal, iso);
  }
});

test('weekend work is carried onto the next business day, never lost', () => {
  const p = buildPace({
    target: 220,
    unit: 'hours',
    monthSeconds: 0,
    monthRevenue: 0,
    // The 21st is a Saturday, so its hours have no point of their own.
    byDay: new Map([
      ['2026-03-20', 4],
      ['2026-03-21', 3],
    ]),
    now: new Date('2026-03-31T12:00:00Z'),
    tz: 'UTC',
  });

  assert.equal(p?.series.find((s) => s.date === '2026-03-20')?.actual, 4);
  assert.equal(
    p?.series.find((s) => s.date === '2026-03-23')?.actual,
    7,
    'Saturday’s 3 hours land on Monday',
  );
});

test('the cumulative line stops at today rather than running flat', () => {
  const p = buildPace({
    target: 220,
    unit: 'hours',
    monthSeconds: 0,
    monthRevenue: 0,
    byDay: new Map([['2026-03-02', 6]]),
    now,
    tz: 'UTC',
  });

  assert.equal(p?.series.find((s) => s.date === '2026-03-18')?.actual, 6);
  assert.equal(
    p?.series.find((s) => s.date === '2026-03-19')?.actual,
    null,
    'tomorrow has not happened',
  );
  // The ray still runs the whole month — where the target lands is the point.
  assert.ok(p?.series.every((s) => s.expected > 0));
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
