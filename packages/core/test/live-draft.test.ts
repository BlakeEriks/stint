import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExpenses,
  draftDates,
  draftSnapshot,
  lateEntries,
  newLines,
  UNBILLED_DUE_DAYS,
  unbilledDue,
  snapshotChanged,
} from '../src/live-draft.ts';
import { addDays as addDaysTo } from '../src/calendar.ts';

const hour = (description: string, quantity: number, amount: number) => ({
  description,
  unit: 'hour' as const,
  quantity,
  amount,
});
const fee = {
  description: 'Setup',
  unit: 'fixed' as const,
  quantity: 1,
  amount: 200,
};

test('a snapshot sums the hours of time lines only', () => {
  assert.deepEqual(
    draftSnapshot([hour('A', 2.5, 375), hour('B', 1.25, 187.5), fee], 762.5),
    {
      total: 762.5,
      hours: 3.75,
      lines: [
        { description: 'A', quantity: 2.5, amount: 375 },
        { description: 'B', quantity: 1.25, amount: 187.5 },
        { description: 'Setup', quantity: 1, amount: 200 },
      ],
    },
  );
});

test('a draft never rendered, or rendered as it is, has not changed', () => {
  const now = draftSnapshot([hour('A', 2, 300)], 300);
  assert.equal(snapshotChanged(null, now), null);
  assert.equal(
    snapshotChanged(now, draftSnapshot([hour('A', 2, 300)], 300)),
    null,
  );
});

test('added work is a change, with hours and totals before and after', () => {
  const before = draftSnapshot([hour('A', 2, 300)], 300);
  const after = draftSnapshot(
    [hour('A', 2, 300), hour('A · Oct 9', 2.5, 375)],
    675,
  );
  assert.deepEqual(snapshotChanged(before, after), {
    hours: { from: 2, to: 4.5 },
    total: { from: 300, to: 675 },
  });
});

test('a renamed line with the same figures is still a change', () => {
  const before = draftSnapshot([hour('A', 2, 300)], 300);
  const after = draftSnapshot([hour('B', 2, 300)], 300);
  assert.deepEqual(snapshotChanged(before, after), {
    hours: { from: 2, to: 2 },
    total: { from: 300, to: 300 },
  });
});

test('new lines are those the snapshot did not show, counted once each', () => {
  const before = draftSnapshot([hour('A', 2, 300)], 300);
  assert.deepEqual(
    newLines(before, [hour('A', 2, 300), hour('A', 2, 300), fee]),
    [false, true, true],
  );
  assert.deepEqual(newLines(null, [hour('A', 2, 300)]), [false]);
});

const invoices = [
  {
    id: 'i1',
    invoiceNumber: 'INV-0041',
    clientId: 'c1',
    periodStart: '2026-09-16',
    periodEnd: '2026-09-30',
  },
];
const entry = (over: Partial<Parameters<typeof lateEntries>[0][number]>) => ({
  id: 'e1',
  taskName: 'Fix',
  startedAt: '2026-09-20T15:00:00Z',
  durationSeconds: 9000,
  isBillable: true,
  clientId: 'c1',
  ...over,
});

test('unbilled billable work dated in a sent period is late', () => {
  assert.deepEqual(lateEntries([entry({})], invoices, 'America/Chicago'), [
    {
      entryId: 'e1',
      taskName: 'Fix',
      startedAt: '2026-09-20T15:00:00Z',
      hours: 2.5,
      clientId: 'c1',
      invoiceId: 'i1',
      invoiceNumber: 'INV-0041',
      periodStart: '2026-09-16',
      periodEnd: '2026-09-30',
    },
  ]);
});

test('work outside the period, for another client, or not billable is not late', () => {
  const tz = 'America/Chicago';
  assert.deepEqual(
    lateEntries([entry({ isBillable: false })], invoices, tz),
    [],
  );
  assert.deepEqual(lateEntries([entry({ clientId: 'c2' })], invoices, tz), []);
  assert.deepEqual(lateEntries([entry({ clientId: null })], invoices, tz), []);
  // 02:00 UTC on Oct 1 is still Sep 30 in Chicago: late.
  assert.equal(
    lateEntries([entry({ startedAt: '2026-10-01T02:00:00Z' })], invoices, tz)
      .length,
    1,
  );
  assert.deepEqual(
    lateEntries([entry({ startedAt: '2026-10-01T12:00:00Z' })], invoices, tz),
    [],
  );
});

test('late work is listed oldest first', () => {
  const rows = lateEntries(
    [
      entry({ id: 'b', startedAt: '2026-09-25T15:00:00Z' }),
      entry({ id: 'a', startedAt: '2026-09-17T15:00:00Z' }),
    ],
    invoices,
    'UTC',
  );
  assert.deepEqual(
    rows.map((r) => r.entryId),
    ['a', 'b'],
  );
});

const draft = (id: string, periodEnd: string, excluded: string[] = []) => ({
  id,
  periodEnd,
  excludedExpenseIds: excluded,
});

test('an expense goes to the open draft whose period ends first on or after it', () => {
  const got = assignExpenses(
    [
      { id: 'jul', spentOn: '2026-07-15' },
      { id: 'aug', spentOn: '2026-08-20' },
      { id: 'sep30', spentOn: '2026-09-30' },
      { id: 'oct', spentOn: '2026-10-02' },
    ],
    [draft('S', '2026-09-30'), draft('A', '2026-08-31')],
  );
  assert.deepEqual(Object.fromEntries(got), {
    jul: 'A',
    aug: 'A',
    sep30: 'S',
  });
});

test('an expense an earlier draft left off goes down the chain', () => {
  const got = assignExpenses(
    [{ id: 'x', spentOn: '2026-08-20' }],
    [
      draft('A', '2026-08-31', ['x']),
      draft('S', '2026-09-30', ['x']),
      draft('O', '2026-10-31'),
    ],
  );
  assert.deepEqual(Object.fromEntries(got), { x: 'O' });
  assert.equal(
    assignExpenses(
      [{ id: 'x', spentOn: '2026-08-20' }],
      [draft('A', '2026-08-31', ['x'])],
    ).size,
    0,
    'left off every draft, it shows on none',
  );
});

test('draftDates: due on the typed date, else after the terms, else the default', () => {
  const at = (dueDate: string | null, paymentTerms: string | null) =>
    draftDates({
      issueDate: '2026-09-17',
      dueDate,
      paymentTerms,
      defaultTermsDays: 30,
      printed: null,
    }).dueDate;
  assert.equal(at('2026-10-01', 'Net 15'), '2026-10-01');
  assert.equal(at(null, 'Net 15'), '2026-10-02');
  assert.equal(at(null, null), '2026-10-17');
});

test('draftDates: sending keeps the dates its last PDF printed', () => {
  const dates = (printed: { issueDate?: string; dueDate?: string | null }) =>
    draftDates({
      issueDate: '2026-09-17',
      dueDate: null,
      paymentTerms: 'Net 30',
      defaultTermsDays: 30,
      printed: { total: 0, hours: 0, lines: [], ...printed },
    }).sent;
  assert.deepEqual(dates({}), {
    issueDate: '2026-09-17',
    dueDate: '2026-10-17',
  });
  assert.deepEqual(dates({ issueDate: '2026-09-10', dueDate: '2026-10-10' }), {
    issueDate: '2026-09-10',
    dueDate: '2026-10-10',
  });
  assert.deepEqual(dates({ issueDate: '2026-09-10', dueDate: null }), {
    issueDate: '2026-09-10',
    dueDate: '2026-10-17',
  });
});

// On Oct 3, Northwind bills monthly and Acme has no schedule.
const TODAY = '2026-10-03';
const clients = [
  { id: 'c1', name: 'Northwind', schedule: { period: 'monthly' as const } },
  { id: 'c2', name: 'Acme', schedule: null },
];
const work = (id: string, startedAt: string, clientId = 'c1', hours = 1) =>
  entry({ id, startedAt, clientId, durationSeconds: hours * 3600 });
const due = (
  entries: ReturnType<typeof entry>[],
  invoiceRows: Parameters<typeof unbilledDue>[0]['invoices'] = [],
  today = TODAY,
) =>
  unbilledDue(
    { clients, entries, invoices: invoiceRows },
    today,
    'America/Chicago',
  );

test('a scheduled client with work in its last ended period is due for that period', () => {
  assert.deepEqual(due([work('e1', '2026-09-20T15:00:00Z', 'c1', 2)]), [
    {
      clientId: 'c1',
      clientName: 'Northwind',
      entryIds: ['e1'],
      seconds: 7200,
      since: '2026-09-20',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      onePeriod: true,
    },
  ]);
});

test('work from every ended period is due, in one row spanning them', () => {
  assert.deepEqual(
    due([
      work('e1', '2026-08-03T15:00:00Z'),
      work('e2', '2026-09-20T15:00:00Z'),
      // The open period has not ended.
      work('e3', '2026-10-01T15:00:00Z'),
    ]),
    [
      {
        clientId: 'c1',
        clientName: 'Northwind',
        entryIds: ['e1', 'e2'],
        seconds: 7200,
        since: '2026-08-03',
        periodStart: '2026-08-01',
        periodEnd: '2026-09-30',
        onePeriod: false,
      },
    ],
  );
});

test('Create invoice spans only the oldest run of adjacent due periods', () => {
  assert.deepEqual(
    due(
      [
        work('e1', '2026-07-20T15:00:00Z'),
        work('e2', '2026-08-20T15:00:00Z'),
        work('e4', '2026-10-20T15:00:00Z'),
      ],
      [
        {
          clientId: 'c1',
          status: 'sent',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        },
      ],
      '2026-11-03',
    ).map(({ entryIds, since, periodStart, periodEnd, onePeriod }) => ({
      entryIds,
      since,
      periodStart,
      periodEnd,
      onePeriod,
    })),
    [
      {
        entryIds: ['e1', 'e2', 'e4'],
        since: '2026-07-20',
        periodStart: '2026-07-01',
        periodEnd: '2026-08-31',
        onePeriod: false,
      },
    ],
  );
});

test('for an unscheduled client, the run stops at an invoice between the work', () => {
  const [row] = due(
    [
      work('e1', '2026-07-10T15:00:00Z', 'c2'),
      work('e2', '2026-07-12T15:00:00Z', 'c2'),
      work('e3', '2026-08-20T15:00:00Z', 'c2'),
    ],
    [
      {
        clientId: 'c2',
        status: 'draft',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-15',
      },
    ],
    '2026-10-03',
  );
  assert.deepEqual(
    [row?.periodStart, row?.periodEnd, row?.entryIds.length],
    ['2026-07-10', '2026-07-12', 3],
  );
});

test(`unscheduled work is due once it is more than ${UNBILLED_DUE_DAYS} days old`, () => {
  assert.equal(UNBILLED_DUE_DAYS, 30);
  const at = (daysAgo: number) =>
    due(
      [work('e1', '2026-10-10T15:00:00Z', 'c2')],
      [],
      addDaysTo('2026-10-10', daysAgo),
    );
  assert.deepEqual(at(29), []);
  assert.deepEqual(at(30), []);
  assert.deepEqual(at(31), [
    {
      clientId: 'c2',
      clientName: 'Acme',
      entryIds: ['e1'],
      seconds: 3600,
      since: '2026-10-10',
      periodStart: '2026-10-10',
      periodEnd: '2026-10-10',
      onePeriod: false,
    },
  ]);
});

test('non-billable work, and work of no client, is never due', () => {
  assert.deepEqual(
    due([
      entry({ startedAt: '2026-09-20T15:00:00Z', isBillable: false }),
      entry({ startedAt: '2026-09-20T15:00:00Z', clientId: null }),
    ]),
    [],
  );
});

test('work is dated in the user zone', () => {
  // 03:00 UTC on Oct 1 is still Sep 30 in Chicago.
  assert.equal(due([work('e1', '2026-10-01T03:00:00Z')]).length, 1);
});

test('work inside any invoice but a void one is not due', () => {
  const inv = (status: string, periodStart: string, periodEnd: string) => ({
    clientId: 'c1',
    status,
    periodStart,
    periodEnd,
  });
  const e = [work('e1', '2026-09-20T15:00:00Z')];
  for (const status of ['draft', 'sent', 'paid'])
    assert.deepEqual(due(e, [inv(status, '2026-09-01', '2026-09-30')]), []);
  assert.equal(due(e, [inv('void', '2026-09-01', '2026-09-30')]).length, 1);
  // Another client's invoice, or one beside the work, covers nothing.
  assert.equal(
    due(e, [{ ...inv('paid', '2026-09-01', '2026-09-30'), clientId: 'c2' }])
      .length,
    1,
  );
  assert.equal(due(e, [inv('paid', '2026-09-01', '2026-09-15')]).length, 1);
});

test('an entry the late row flags is never due as well', () => {
  const sent = [{ ...invoices[0]!, status: 'sent' }];
  const late = entry({});
  assert.equal(lateEntries([late], invoices, 'America/Chicago').length, 1);
  assert.deepEqual(due([late], sent), []);
});

test('each client due gets one row, oldest work first', () => {
  assert.deepEqual(
    due([
      work('e1', '2026-09-20T15:00:00Z', 'c1'),
      work('e2', '2026-08-20T15:00:00Z', 'c2'),
    ]).map((r) => r.clientName),
    ['Acme', 'Northwind'],
  );
});
