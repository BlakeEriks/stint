import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftDates,
  lateEntries,
  newWork,
  unbilledDue,
} from '../src/live-draft.ts';

const built = (id: string, durationSeconds: number, isBillable = true) => ({
  id,
  isBillable,
  durationSeconds,
});

/* Each row: what the draft holds, what a build of its period takes, and the
   new work it offers. */
test('new work is what a build takes that the draft does not hold', () => {
  for (const [what, held, build, want] of [
    [
      'nothing new',
      { entryIds: ['a'], expenseIds: [], total: 150 },
      { entries: [built('a', 3600)], expenseIds: [], total: 150 },
      null,
    ],
    [
      'two entries and an expense',
      { entryIds: ['a'], expenseIds: [], total: 150 },
      {
        entries: [built('a', 3600), built('b', 5400), built('c', 3600)],
        expenseIds: ['x'],
        total: 560,
      },
      { entries: 2, expenses: 1, hours: 2.5, amount: 410 },
    ],
    [
      'a non-billable entry is not new work',
      { entryIds: [], expenseIds: [], total: 0 },
      { entries: [built('n', 3600, false)], expenseIds: [], total: 0 },
      null,
    ],
  ] as const) {
    assert.deepEqual(newWork(held, build), want, what);
  }
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
      printed,
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
   "client from..to seconds". */
const work = (startedAt: string, clientId = 'c1', hours = 1) =>
  entry({ startedAt, clientId, durationSeconds: hours * 3600 });
const inv = (
  periodStart: string,
  periodEnd: string,
  clientId = 'c1',
  status = 'sent',
) => ({ clientId, periodStart, periodEnd, status });
const draft = (periodStart: string, periodEnd: string) =>
  inv(periodStart, periodEnd, 'c1', 'draft');
const NW_SEP = 'Northwind 2026-09-01..2026-09-30 3600';
const IN_SEP = '2026-09-20T15:00:00Z';

const DUE: {
  name: string;
  entries: ReturnType<typeof entry>[];
  invoices?: ReturnType<typeof inv>[];
  today?: string;
  due: string[];
}[] = [
  {
    name: 'the most recent ended period, its work added up',
    entries: [work(IN_SEP, 'c1', 2), work('2026-09-21T15:00:00Z')],
    due: ['Northwind 2026-09-01..2026-09-30 10800'],
  },
  {
    name: 'not an earlier period, nor the open one',
    entries: [work('2026-08-20T15:00:00Z'), work('2026-10-01T15:00:00Z')],
    due: [],
  },
  {
    name: 'gone once the next period ends',
    entries: [work(IN_SEP)],
    today: '2026-11-03',
    due: [],
  },
  { name: 'a client with no schedule', entries: [work(IN_SEP, 'c2')], due: [] },
  {
    name: 'non-billable work, and work of no client',
    entries: [
      entry({ startedAt: IN_SEP, isBillable: false }),
      entry({ startedAt: IN_SEP, clientId: null }),
    ],
    due: [],
  },
  {
    name: "dated in the user's zone: 03:00 UTC Oct 1 is Sep 30",
    entries: [work('2026-10-01T03:00:00Z')],
    due: [NW_SEP],
  },
  {
    name: 'an invoice over the whole period',
    entries: [work(IN_SEP)],
    invoices: [inv('2026-09-01', '2026-09-30')],
    due: [],
  },
  {
    name: "inside another client's invoice",
    entries: [work(IN_SEP)],
    invoices: [inv('2026-09-01', '2026-09-30', 'c2')],
    due: [NW_SEP],
  },
  {
    name: 'a sent invoice over part of the period, the work beside it',
    entries: [work(IN_SEP)],
    invoices: [inv('2026-09-01', '2026-09-15')],
    due: [],
  },
  {
    name: 'a draft over the whole period',
    entries: [work(IN_SEP)],
    invoices: [draft('2026-08-25', '2026-10-05')],
    due: [],
  },
  {
    name: 'a draft over part of the period, the work beside it',
    entries: [work(IN_SEP)],
    invoices: [draft('2026-09-01', '2026-09-15')],
    due: [NW_SEP],
  },
  {
    name: "a sent invoice sharing only the period's last day",
    entries: [work(IN_SEP)],
    invoices: [inv('2026-09-30', '2026-10-15')],
    due: [],
  },
  {
    name: "a sent invoice sharing only the period's first day",
    entries: [work(IN_SEP)],
    invoices: [inv('2026-08-15', '2026-09-01')],
    due: [],
  },
  {
    name: "a draft sharing only the period's last day",
    entries: [work(IN_SEP)],
    invoices: [draft('2026-09-30', '2026-10-15')],
    due: [NW_SEP],
  },
  {
    name: 'an invoice ending the day before the period',
    entries: [work(IN_SEP)],
    invoices: [inv('2026-08-01', '2026-08-31')],
    due: [NW_SEP],
  },
  {
    name: 'an invoice starting the day after the period',
    entries: [work(IN_SEP)],
    invoices: [inv('2026-10-01', '2026-10-15')],
    due: [NW_SEP],
  },
  {
    name: "a draft sharing only the period's first day",
    entries: [work(IN_SEP)],
    invoices: [draft('2026-08-15', '2026-09-01')],
    due: [NW_SEP],
  },
];

for (const row of DUE)
  test(`ready to invoice: ${row.name}`, () => {
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
        (r) => `${r.clientName} ${r.periodStart}..${r.periodEnd} ${r.seconds}`,
      ),
      row.due,
    );
  });
