import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLineItems, type BillableEntry } from '../src/invoice.ts';
import {
  buildSchedules,
  paginateSchedules,
  pickSchedules,
} from '../src/schedule.ts';

const entry = (over: Partial<BillableEntry> = {}): BillableEntry => ({
  id: 'e1',
  taskName: 'Task',
  projectId: 'p1',
  projectName: 'Portal',
  startedAt: '2026-09-10T15:00:00Z',
  durationSeconds: 3600,
  isBillable: true,
  rateOverride: null,
  projectRate: null,
  clientRate: null,
  userDefaultRate: 80,
  ...over,
});

const SEPT = {
  tz: 'America/New_York',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
};

test('by project: one row each, Unassigned for none, most hours first', () => {
  const s = buildSchedules(
    [
      entry({ id: 'a', projectName: 'Portal', durationSeconds: 3600 }),
      entry({ id: 'b', projectName: 'Audit', durationSeconds: 7200 }),
      entry({ id: 'c', projectName: 'Portal', durationSeconds: 3600 }),
      entry({ id: 'd', projectId: null, projectName: null }),
      entry({ id: 'e', projectName: 'Billing', durationSeconds: 3600 }),
    ],
    SEPT,
  );
  assert.deepEqual(s.project, [
    { project: 'Audit', hours: 2 },
    { project: 'Portal', hours: 2 },
    { project: 'Billing', hours: 1 },
    { project: 'Unassigned', hours: 1 },
  ]);
  assert.equal(s.totalHours, 6);
});

test('by week: Monday-start in the zone, clipped to the period', () => {
  const s = buildSchedules(
    [
      // Tue Sep 1 — the period cuts the week of Mon Aug 31 short.
      entry({ id: 'a', startedAt: '2026-09-01T15:00:00Z' }),
      // Sun Sep 6 23:30 in New York is Mon Sep 7 UTC: still week one.
      entry({ id: 'b', startedAt: '2026-09-07T03:30:00Z' }),
      entry({ id: 'c', startedAt: '2026-09-08T15:00:00Z' }),
      // Wed Sep 30: the last week ends with the period.
      entry({ id: 'd', startedAt: '2026-09-30T15:00:00Z' }),
    ],
    SEPT,
  );
  assert.deepEqual(s.week, [
    { start: '2026-09-01', end: '2026-09-06', hours: 2 },
    { start: '2026-09-07', end: '2026-09-13', hours: 1 },
    { start: '2026-09-28', end: '2026-09-30', hours: 1 },
  ]);
});

test('by date: per local start day and project, in order', () => {
  const s = buildSchedules(
    [
      entry({ id: 'a', startedAt: '2026-09-11T15:00:00Z', projectName: 'B' }),
      entry({ id: 'b', startedAt: '2026-09-10T15:00:00Z', projectName: 'B' }),
      entry({ id: 'c', startedAt: '2026-09-10T16:00:00Z', projectName: 'A' }),
      // Starts 11:30pm on the 10th in New York and runs past midnight: the
      // 10th, as By day counts it.
      entry({
        id: 'd',
        startedAt: '2026-09-11T03:30:00Z',
        durationSeconds: 7200,
        projectName: 'A',
      }),
    ],
    SEPT,
  );
  assert.deepEqual(s.date, [
    { date: '2026-09-10', project: 'A', hours: 3 },
    { date: '2026-09-10', project: 'B', hours: 1 },
    { date: '2026-09-11', project: 'B', hours: 1 },
  ]);
});

test('rows use the invoice hours rule, so the total is the summary line', () => {
  const entries = [
    entry({ id: 'a', durationSeconds: 1200, projectName: 'A' }),
    entry({ id: 'b', durationSeconds: 1200, projectName: 'B' }),
    entry({ id: 'c', durationSeconds: 1200, projectName: 'C' }),
    entry({ id: 'd', durationSeconds: 26_999, projectName: 'A' }),
  ];
  const s = buildSchedules(entries, SEPT);
  const [line] = buildLineItems(entries, {
    groupingMode: 'summary',
    summaryText: 'Services',
    tz: SEPT.tz,
  }).lineItems;
  assert.equal(s.totalHours, line!.quantity);
  assert.equal(
    Math.round(s.project!.reduce((n, r) => n + r.hours, 0) * 100) / 100,
    s.totalHours,
  );
});

test('only what the invoice bills is counted', () => {
  const s = buildSchedules(
    [
      entry({ id: 'a' }),
      entry({ id: 'b', isBillable: false }),
      entry({ id: 'c', userDefaultRate: null }),
    ],
    SEPT,
  );
  assert.deepEqual(s.project, [{ project: 'Portal', hours: 1 }]);
  assert.equal(s.totalHours, 1);
});

test('one row is still a schedule', () => {
  const s = buildSchedules([entry()], SEPT);
  assert.equal(s.project!.length, 1);
  assert.equal(s.week!.length, 1);
  assert.equal(s.date!.length, 1);
});

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ project: `P${i}`, hours: 1 }));

test('pages keep the order project, week, date, whatever was given', () => {
  const pages = paginateSchedules(
    {
      date: [{ date: '2026-09-10', project: 'A', hours: 1 }],
      project: rows(1),
      totalHours: 1,
    },
    40,
  );
  assert.deepEqual(
    pages.flat().map((b) => b.kind),
    ['project', 'date'],
  );
});

test('a table that runs over a page continues, with its total at the end', () => {
  const pages = paginateSchedules({ project: rows(10), totalHours: 10 }, 8);
  assert.equal(pages.length, 2);
  const [first, second] = [pages[0]![0]!, pages[1]![0]!];
  assert.equal(first.continued, false);
  assert.equal(first.total, null);
  assert.equal(second.continued, true);
  assert.equal(second.total, 10);
  assert.equal(first.rows.length + second.rows.length, 10);
});

test('a total never starts a page alone', () => {
  // Header (2) + 6 rows fill 8 exactly, so the total would be orphaned.
  const pages = paginateSchedules({ project: rows(6), totalHours: 6 }, 8);
  const last = pages.at(-1)![0]!;
  assert.equal(last.total, 6);
  assert.ok(last.rows.length >= 1);
});

test('a heading is never stranded at the foot of a page', () => {
  const pages = paginateSchedules(
    { project: rows(5), week: rows(3) as never, totalHours: 5 },
    10,
  );
  for (const page of pages)
    for (const block of page) assert.ok(block.rows.length >= 1);
});

test('nothing chosen is no pages', () => {
  assert.deepEqual(paginateSchedules({ totalHours: 3 }, 40), []);
});

test('an invoice keeps only the tables ticked, in print order', () => {
  const all = buildSchedules([entry()], SEPT);
  const picked = pickSchedules(all, ['date', 'project'])!;
  assert.deepEqual(Object.keys(picked), ['totalHours', 'project', 'date']);
  assert.equal(pickSchedules(all, []), null);
});

test('no billed time is no detail, ticked or not', () => {
  // The PDF prints no page for an empty table, so storing one would promise
  // a page 2 that never comes.
  assert.equal(pickSchedules(buildSchedules([], SEPT), ['project']), null);
});
