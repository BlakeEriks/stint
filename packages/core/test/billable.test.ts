import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billableExpenses,
  billingWindow,
  isBillableEntry,
} from '../src/billable.ts';

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
  } = {},
) => ({
  id,
  recurring: false,
  spentOn: '2026-08-20' as string | null,
  description: id,
  amount: 10,
  invoiceId: null as string | null,
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
      [],
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

test('a one-off an earlier open draft holds is not billed again', () => {
  const rows = [expense('aug'), expense('sep', { spentOn: '2026-09-05' })];
  const open = [draft('A', '2026-08-31')];
  assert.deepEqual(
    billableExpenses(rows, draft('new', '2026-09-30'), open).map((e) => e.id),
    ['sep'],
  );
  // The earlier draft, read on its own, still bills it.
  assert.deepEqual(
    billableExpenses(rows, draft('A', '2026-08-31'), open).map((e) => e.id),
    ['aug'],
  );
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
      [],
    ),
    [],
  );
});
