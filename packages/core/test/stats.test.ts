import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAwaitingPayment,
  buildBillableRatio,
  buildMonthTotals,
  buildOverdueInvoices,
  buildPace,
  buildStaleDrafts,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  clientNamesFrom,
  type DurationRow,
  type InvoiceRow,
  projectNamesFrom,
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
    { duration_seconds: 3600, is_billable: true },
    { duration_seconds: 1800, is_billable: false },
    { duration_seconds: null, is_billable: true },
  ]);
  assert.deepEqual(t, { monthSeconds: 5400, billableSeconds: 3600 });
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

test('a revenue target reports the figure and withholds the pace', () => {
  const p = buildPace({
    target: '5000',
    unit: 'revenue',
    monthSeconds: 36_000,
    monthRevenue: 1200,
    now,
    tz: 'UTC',
  });
  assert.equal(p?.actual, 1200);
  assert.equal(p?.expected, null);
  assert.equal(p?.delta, null);
});

// ── scalar ──────────────────────────────────────────────────────────

test('scalar reads both rpc shapes and a numeric string', () => {
  assert.equal(scalar('1234.50'), 1234.5);
  assert.equal(scalar([{ month_revenue: '99.00' }]), 99);
  assert.equal(scalar(null), 0);
  assert.equal(scalar([]), 0);
});
