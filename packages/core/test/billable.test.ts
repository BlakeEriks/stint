import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billableExpenses,
  billingWindow,
  billingZone,
  earlierWork,
  earlierWorkFrom,
  isBillableEntry,
} from '../src/billable.ts';

const device = 'Europe/Lisbon';
const account = { billingTimeZone: 'America/Los_Angeles' };
const unset = { billingTimeZone: null };
for (const [acct, zone] of [
  [account, 'America/Los_Angeles'],
  [unset, device],
  [undefined, device],
] as const)
  test(`an invoice reads the account's zone, else the device's: ${zone}`, () => {
    assert.equal(billingZone(acct, device), zone);
  });

test('a period of local dates covers its first day to the start of the day after its last', () => {
  const w = billingWindow('2026-03-01', '2026-03-31', 'America/New_York');
  assert.equal(w.start.toISOString(), '2026-03-01T05:00:00.000Z');
  // DST began on March 8, so April 1 starts an hour earlier in UTC.
  assert.equal(w.end.toISOString(), '2026-04-01T04:00:00.000Z');
});

const window = billingWindow('2026-09-01', '2026-09-30', 'UTC');
const entry = {
  invoiceId: null,
  invoicedElsewhere: false,
  endedAt: '2026-09-10T11:00:00Z',
  startedAt: '2026-09-10T10:00:00Z',
};

test('an invoice bills a stopped, unbilled entry started in its window', () => {
  assert.equal(isBillableEntry(entry, window), true);
  assert.equal(
    isBillableEntry({ ...entry, startedAt: '2026-09-01T00:00:00Z' }, window),
    true,
  );
});

test('an invoice leaves out what is running, billed, or outside its window', () => {
  for (const over of [
    { endedAt: null },
    { invoiceId: 'inv' },
    { invoicedElsewhere: true },
    { startedAt: '2026-08-31T23:59:59Z' },
    { startedAt: '2026-10-01T00:00:00Z' },
  ])
    assert.equal(isBillableEntry({ ...entry, ...over }, window), false);
});

const expense = (
  id: string,
  over: {
    recurring?: boolean;
    spentOn?: string | null;
    invoiceId?: string | null;
    draftId?: string | null;
  } = {},
) => ({
  id,
  recurring: false,
  spentOn: '2026-08-20' as string | null,
  description: id,
  amount: 10,
  invoiceId: null as string | null,
  draftId: null as string | null,
  ...over,
});
const draft = (
  id: string,
  periodEnd: string,
  excludedExpenseIds: string[] = [],
) => ({
  id,
  periodEnd,
  excludedExpenseIds,
});

test('a draft bills every recurring expense, dated its period end, less the excluded', () => {
  assert.deepEqual(
    billableExpenses(
      [
        expense('monthly', { recurring: true, spentOn: null }),
        expense('left-off', { recurring: true, spentOn: null }),
      ],
      draft('new', '2026-09-30', ['left-off']),
      false,
    ),
    [
      {
        id: 'monthly',
        recurring: true,
        spentOn: '2026-09-30',
        description: 'monthly',
        amount: 10,
      },
    ],
  );
});

test('a build takes one-offs no other draft holds; a read takes only its own', () => {
  const rows = [
    expense('free'),
    expense('mine', { draftId: 'A' }),
    expense('theirs', { draftId: 'B' }),
  ];
  const ids = (held: boolean) =>
    billableExpenses(rows, draft('A', '2026-09-30'), held).map((e) => e.id);
  assert.deepEqual(ids(false), ['free', 'mine']);
  assert.deepEqual(ids(true), ['mine']);
});

test('a billed expense, or a one-off after the period, is not billed', () => {
  assert.deepEqual(
    billableExpenses(
      [
        expense('billed', { invoiceId: 'inv' }),
        expense('billed-monthly', { recurring: true, invoiceId: 'inv' }),
        expense('later', { spentOn: '2026-10-02' }),
      ],
      draft('new', '2026-09-30'),
      false,
    ),
    [],
  );
});

const inv = (periodStart: string, periodEnd: string) => ({
  periodStart,
  periodEnd,
});
for (const [invoices, from, why] of [
  [
    [inv('2026-08-01', '2026-08-31'), inv('2026-09-01', '2026-09-29')],
    '2026-09-30',
    'the day after the last invoice',
  ],
  [
    [inv('2026-08-01', '2026-08-31'), inv('2026-09-01', '2026-10-15')],
    null,
    'nowhere: an invoice spanning the start leaves nothing to offer',
  ],
  [
    [inv('2026-08-01', '2026-08-31'), inv('2026-10-01', '2026-10-31')],
    '2026-09-01',
    'after the last invoice before it, not one in the period',
  ],
  [[], '2026-09-01', '30 days back on a first invoice'],
] as const)
  test(`the look-back for an Oct 1 period starts ${why}`, () => {
    assert.equal(earlierWorkFrom('2026-10-01', [...invoices]), from);
  });

const at = (startedAt: string, draftId: string | null = null) => ({
  startedAt,
  draftId,
});
for (const [entries, tz, expected, why] of [
  [[], 'UTC', null, 'none'],
  [
    [at('2026-09-30T15:00:00Z')],
    'UTC',
    { entryCount: 1, from: '2026-09-30', to: '2026-09-30', draftId: null },
    'one',
  ],
  [
    [
      at('2026-09-30T15:00:00Z'),
      at('2026-09-28T15:00:00Z'),
      at('2026-09-29T15:00:00Z'),
    ],
    'UTC',
    { entryCount: 3, from: '2026-09-28', to: '2026-09-30', draftId: null },
    'several, by their first and last dates',
  ],
  [
    [at('2026-09-30T15:00:00Z', 'd1')],
    'UTC',
    { entryCount: 1, from: '2026-09-30', to: '2026-09-30', draftId: 'd1' },
    'one behind a draft, which it names',
  ],
  [
    [
      at('2026-09-30T15:00:00Z', 'd1'),
      at('2026-09-28T15:00:00Z', 'd2'),
      at('2026-09-29T15:00:00Z', 'd1'),
    ],
    'UTC',
    { entryCount: 1, from: '2026-09-28', to: '2026-09-28', draftId: 'd2' },
    'two drafts holding it: the one holding the earliest',
  ],
  [
    [at('2026-09-28T15:00:00Z', 'd1'), at('2026-09-30T15:00:00Z')],
    'UTC',
    { entryCount: 1, from: '2026-09-30', to: '2026-09-30', draftId: null },
    'work no draft holds, ahead of work one does',
  ],
  [
    // 23:30 EDT on Oct 31, the night DST ends: Nov 1 in UTC.
    [at('2026-11-01T03:30:00Z')],
    'America/New_York',
    { entryCount: 1, from: '2026-10-31', to: '2026-10-31', draftId: null },
    'dated by its day in the zone, across a DST change',
  ],
] as const)
  test(`earlier work: ${why}`, () => {
    assert.deepEqual(earlierWork([...entries], tz), expected);
  });
