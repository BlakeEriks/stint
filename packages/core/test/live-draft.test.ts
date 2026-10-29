import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExpenses,
  draftDates,
  draftSnapshot,
  lateEntries,
  newLines,
  unbilledDue,
  snapshotChanged,
} from '../src/live-draft.ts';

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

/* unbilledDue(): on Oct 3 unless a row says otherwise, Northwind (c1) bills
   monthly and Acme (c2) has no schedule. Each row reads
   "client ids since from..to [one] seconds". */
const work = (id: string, startedAt: string, clientId = 'c1', hours = 1) =>
  entry({ id, startedAt, clientId, durationSeconds: hours * 3600 });
const inv = (
  status: string,
  periodStart: string,
  periodEnd: string,
  clientId = 'c1',
) => ({ clientId, status, periodStart, periodEnd });
const sep = (status: string) => inv(status, '2026-09-01', '2026-09-30');
const NW_SEP = 'Northwind e1 since 2026-09-20 2026-09-01..2026-09-30 one 3600';
const acme = (today: string) => ({
  entries: [work('e1', '2026-10-10T15:00:00Z', 'c2')],
  today,
});

const DUE: {
  name: string;
  entries: ReturnType<typeof entry>[];
  invoices?: ReturnType<typeof inv>[];
  today?: string;
  due: string[];
}[] = [
  {
    name: 'the last ended period',
    entries: [work('e1', '2026-09-20T15:00:00Z', 'c1', 2)],
    due: ['Northwind e1 since 2026-09-20 2026-09-01..2026-09-30 one 7200'],
  },
  {
    name: 'every ended period in one row, not the open one',
    entries: [
      work('e1', '2026-08-03T15:00:00Z'),
      work('e2', '2026-09-20T15:00:00Z'),
      work('e3', '2026-10-01T15:00:00Z'),
    ],
    due: ['Northwind e1,e2 since 2026-08-03 2026-08-01..2026-09-30 7200'],
  },
  {
    name: 'the link spans the oldest adjacent periods, not an invoiced gap',
    entries: [
      work('e1', '2026-07-20T15:00:00Z'),
      work('e2', '2026-08-20T15:00:00Z'),
      work('e4', '2026-10-20T15:00:00Z'),
    ],
    invoices: [sep('sent')],
    today: '2026-11-03',
    due: ['Northwind e1,e2,e4 since 2026-07-20 2026-07-01..2026-08-31 10800'],
  },
  {
    name: 'unscheduled, the link stops at an invoice between the days',
    entries: [
      work('e1', '2026-07-10T15:00:00Z', 'c2'),
      work('e2', '2026-07-12T15:00:00Z', 'c2'),
      work('e3', '2026-08-20T15:00:00Z', 'c2'),
    ],
    invoices: [inv('draft', '2026-08-01', '2026-08-15', 'c2')],
    due: ['Acme e1,e2,e3 since 2026-07-10 2026-07-10..2026-07-12 10800'],
  },
  { name: 'unscheduled at 29 days', ...acme('2026-11-08'), due: [] },
  { name: 'unscheduled at 30 days', ...acme('2026-11-09'), due: [] },
  {
    name: 'unscheduled at 31 days',
    ...acme('2026-11-10'),
    due: ['Acme e1 since 2026-10-10 2026-10-10..2026-10-10 3600'],
  },
  {
    name: 'non-billable work, and work of no client',
    entries: [
      entry({ startedAt: '2026-09-20T15:00:00Z', isBillable: false }),
      entry({ startedAt: '2026-09-20T15:00:00Z', clientId: null }),
    ],
    due: [],
  },
  {
    name: "dated in the user's zone: 03:00 UTC Oct 1 is Sep 30",
    entries: [work('e1', '2026-10-01T03:00:00Z')],
    due: ['Northwind e1 since 2026-09-30 2026-09-01..2026-09-30 one 3600'],
  },
  ...['draft', 'sent', 'paid'].map((status) => ({
    name: `inside a ${status} invoice`,
    entries: [work('e1', '2026-09-20T15:00:00Z')],
    invoices: [sep(status)],
    due: [],
  })),
  {
    name: 'inside a void invoice',
    entries: [work('e1', '2026-09-20T15:00:00Z')],
    invoices: [sep('void')],
    due: [NW_SEP],
  },
  {
    name: "inside another client's invoice",
    entries: [work('e1', '2026-09-20T15:00:00Z')],
    invoices: [inv('paid', '2026-09-01', '2026-09-30', 'c2')],
    due: [NW_SEP],
  },
  {
    name: 'beside an invoice, not inside it',
    entries: [work('e1', '2026-09-20T15:00:00Z')],
    invoices: [inv('paid', '2026-09-01', '2026-09-15')],
    due: [NW_SEP],
  },
  {
    name: "an entry inside a sent period is lateEntries()' alone",
    entries: [entry({})],
    invoices: [inv('sent', '2026-09-16', '2026-09-30')],
    due: [],
  },
  {
    name: 'one row per client, oldest work first',
    entries: [
      work('e1', '2026-08-20T15:00:00Z', 'c1'),
      work('e2', '2026-08-25T15:00:00Z', 'c2'),
    ],
    due: [
      'Northwind e1 since 2026-08-20 2026-08-01..2026-08-31 one 3600',
      'Acme e2 since 2026-08-25 2026-08-25..2026-08-25 3600',
    ],
  },
];

for (const row of DUE)
  test(`work past due to bill: ${row.name}`, () => {
    const rows = unbilledDue(
      {
        clients: [
          { id: 'c1', name: 'Northwind', schedule: { period: 'monthly' } },
          { id: 'c2', name: 'Acme', schedule: null },
        ],
        entries: row.entries,
        invoices: row.invoices ?? [],
      },
      row.today ?? '2026-10-03',
      'America/Chicago',
    );
    assert.deepEqual(
      rows.map(
        (r) =>
          `${r.clientName} ${r.entryIds.join(',')} since ${r.since} ${r.periodStart}..${r.periodEnd}${r.onePeriod ? ' one' : ''} ${r.seconds}`,
      ),
      row.due,
    );
  });
