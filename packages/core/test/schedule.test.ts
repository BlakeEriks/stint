import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLineItems, type BillableEntry } from '../src/invoice.ts';
import {
  buildSchedules,
  offeredSchedules,
  paginateSchedules,
  pickSchedules,
  type Schedules,
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

test('pages break by the rules', () => {
  const anyRows = (n: number) => rows(n) as never;
  // Each block is [kind, rows, total, continued]; a page is a list of blocks.
  const cases: [string, Schedules, number, unknown[][][]][] = [
    [
      'a table that runs over fills the page, then continues to its total',
      { project: rows(10), totalHours: 10 },
      8,
      [[['project', 6, null, false]], [['project', 4, 10, true]]],
    ],
    [
      'a total never starts a page alone',
      { project: rows(6), totalHours: 6 },
      8,
      [[['project', 5, null, false]], [['project', 1, 6, true]]],
    ],
    [
      'a heading is never stranded at the foot of a page',
      { project: rows(5), week: anyRows(3), totalHours: 5 },
      10,
      [[['project', 5, 5, false]], [['week', 3, 5, false]]],
    ],
    [
      "a table's last row waits for a page with room for its total",
      { project: rows(4), week: anyRows(1), date: anyRows(1), totalHours: 4 },
      10,
      [
        [['project', 4, 4, false]],
        [
          ['week', 1, 4, false],
          ['date', 1, 4, false],
        ],
      ],
    ],
  ];
  for (const [rule, schedules, perPage, expected] of cases) {
    const pages = paginateSchedules(schedules, perPage);
    assert.deepEqual(
      pages.map((page) =>
        page.map((b) => [b.kind, b.rows.length, b.total, b.continued]),
      ),
      expected,
      rule,
    );
  }
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

test('page 2 offers each table the grouping does not already print', () => {
  const offered = {
    summary: ['project', 'week', 'date'],
    project: ['week', 'date'],
    day: ['project', 'week'],
    task: ['project', 'week', 'date'],
    entry: ['project', 'week', 'date'],
  } as const;
  for (const [mode, kinds] of Object.entries(offered))
    assert.deepEqual(offeredSchedules(mode as keyof typeof offered), kinds);
});
