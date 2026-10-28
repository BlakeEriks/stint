import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExpenses,
  draftDates,
  draftSnapshot,
  lateEntries,
  newLines,
  periodsDue,
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

// Northwind bills monthly; on Oct 3 its last ended period is September.
const due = (over: Partial<Parameters<typeof periodsDue>[0]> = {}) =>
  periodsDue(
    {
      clients: [
        { id: 'c1', name: 'Northwind', schedule: { period: 'monthly' } },
      ],
      entries: [entry({})],
      expenses: [],
      invoices: [],
      ...over,
    },
    '2026-10-03',
    'America/Chicago',
  );

const september = {
  clientId: 'c1',
  clientName: 'Northwind',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  seconds: 9000,
};

test('a scheduled period that ended with unbilled work and no invoice is due', () => {
  assert.deepEqual(due(), [september]);
});

test('a period with nothing billable in it is not due', () => {
  assert.deepEqual(due({ entries: [] }), []);
  assert.deepEqual(due({ entries: [entry({ isBillable: false })] }), []);
  // Another client's work, and work in the open period, bill nothing here.
  assert.deepEqual(due({ entries: [entry({ clientId: 'c2' })] }), []);
  assert.deepEqual(
    due({ entries: [entry({ startedAt: '2026-10-02T15:00:00Z' })] }),
    [],
  );
});

test('work is dated in the user zone', () => {
  // 03:00 UTC on Oct 1 is still Sep 30 in Chicago.
  assert.deepEqual(
    due({ entries: [entry({ startedAt: '2026-10-01T03:00:00Z' })] }),
    [september],
  );
});

test('a one-off expense spent in the period is due; a recurring one alone is not', () => {
  const expense = { clientId: 'c1', spentOn: '2026-09-12', recurring: false };
  assert.deepEqual(due({ entries: [], expenses: [expense] }), [
    { ...september, seconds: 0 },
  ]);
  assert.deepEqual(
    due({ entries: [], expenses: [{ ...expense, spentOn: '2026-08-12' }] }),
    [],
  );
  assert.deepEqual(
    due({
      entries: [],
      expenses: [{ ...expense, spentOn: null, recurring: true }],
    }),
    [],
  );
});

test('any invoice but a void one sharing a day with the period covers it', () => {
  const invoice = (status: string, periodStart: string, periodEnd: string) => ({
    clientId: 'c1',
    status,
    periodStart,
    periodEnd,
  });
  for (const status of ['draft', 'sent', 'paid'])
    assert.deepEqual(
      due({ invoices: [invoice(status, '2026-09-01', '2026-09-30')] }),
      [],
    );
  assert.deepEqual(
    due({ invoices: [invoice('draft', '2026-09-20', '2026-10-05')] }),
    [],
  );
  assert.deepEqual(
    due({ invoices: [invoice('void', '2026-09-01', '2026-09-30')] }),
    [september],
  );
  assert.deepEqual(
    due({ invoices: [invoice('paid', '2026-08-01', '2026-08-31')] }),
    [september],
  );
  assert.deepEqual(
    due({
      invoices: [
        { ...invoice('paid', '2026-09-01', '2026-09-30'), clientId: 'c2' },
      ],
    }),
    [september],
  );
});

test("the period is the last one ended, even on the open one's last day", () => {
  const semimonthly = (today: string) =>
    periodsDue(
      {
        clients: [
          { id: 'c1', name: 'Northwind', schedule: { period: 'semimonthly' } },
        ],
        entries: [entry({ startedAt: '2026-10-10T15:00:00Z' })],
        expenses: [],
        invoices: [],
      },
      today,
      'America/Chicago',
    );
  assert.deepEqual(semimonthly('2026-10-15'), []);
  assert.deepEqual(semimonthly('2026-10-16'), [
    { ...september, periodStart: '2026-10-01', periodEnd: '2026-10-15' },
  ]);
});

test('each client due gets a row, oldest period first', () => {
  assert.deepEqual(
    due({
      clients: [
        { id: 'c2', name: 'Acme', schedule: { period: 'monthly' } },
        {
          id: 'c1',
          name: 'Northwind',
          schedule: { period: 'weekly', anchor: '2026-09-26' },
        },
      ],
      entries: [
        entry({ id: 'e1', clientId: 'c1', startedAt: '2026-09-29T15:00:00Z' }),
        entry({ id: 'e2', clientId: 'c2', startedAt: '2026-09-29T15:00:00Z' }),
      ],
    }),
    [
      { ...september, clientId: 'c2', clientName: 'Acme' },
      { ...september, periodStart: '2026-09-26', periodEnd: '2026-10-02' },
    ],
  );
});
