import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAwaitingPayment,
  buildBillableRatio,
  buildHoursByDay,
  buildMonthTotals,
  buildOverdueInvoices,
  buildPace,
  buildStaleDrafts,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  buildVelocity,
  clientNamesFrom,
  type DurationRow,
  type InvoiceRow,
  projectNamesFrom,
  revenueByDay,
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

// ── scalar ──────────────────────────────────────────────────────────

test('scalar reads both rpc shapes and a numeric string', () => {
  assert.equal(scalar('1234.50'), 1234.5);
  assert.equal(scalar([{ month_revenue: '99.00' }]), 99);
  assert.equal(scalar(null), 0);
  assert.equal(scalar([]), 0);
});
