import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryOrderRefusal,
  invoiceRequestRefusal,
  nextNumberRefusal,
  paidAtRefusal,
  pricedInvoiceRefusal,
  refusals,
  stopOrderRefusal,
  unratedRefusal,
} from '../src/refusals.ts';

const nine = '2026-09-17T09:00:00.000Z';
const ten = '2026-09-17T10:00:00.000Z';

test('an entry ends after it starts, or is still running', () => {
  assert.equal(entryOrderRefusal(nine, ten), null);
  assert.equal(entryOrderRefusal(nine, null), null);
  assert.deepEqual(entryOrderRefusal(ten, ten), {
    code: 'VALIDATION_FAILED',
    message: 'endedAt must be after startedAt',
    details: { startedAt: ten, endedAt: ten },
  });
});

test('a stop lands after the start', () => {
  assert.equal(stopOrderRefusal(nine, ten), null);
  assert.equal(stopOrderRefusal(ten, nine)?.code, 'VALIDATION_FAILED');
});

test('a paid date is between the send and now', () => {
  const now = new Date(ten);
  assert.equal(paidAtRefusal(nine, nine, now), null);
  assert.equal(paidAtRefusal(nine, null, now), null);
  assert.equal(
    paidAtRefusal('2026-09-18T00:00:00.000Z', null, now)?.message,
    'paidAt cannot be in the future',
  );
  assert.deepEqual(paidAtRefusal(nine, ten, now)?.details, {
    paidAt: nine,
    sentAt: ten,
  });
});

test('an invoice request needs its period in order and a due date not past', () => {
  const today = '2026-09-17';
  const r = { periodStart: '2026-09-01', periodEnd: '2026-09-15' };
  assert.equal(invoiceRequestRefusal(r, today), null);
  assert.equal(invoiceRequestRefusal({ ...r, dueDate: today }, today), null);
  assert.equal(
    invoiceRequestRefusal({ ...r, periodEnd: '2026-08-31' }, today)?.code,
    'INVALID_PERIOD',
  );
  assert.deepEqual(
    invoiceRequestRefusal({ ...r, dueDate: '2026-09-16' }, today)?.details,
    { field: 'dueDate' },
  );
});

test('a priced invoice needs every entry rated, then a line', () => {
  const period = { periodStart: '2026-09-01', periodEnd: '2026-09-15' };
  assert.equal(
    pricedInvoiceRefusal({ unratedEntryIds: [], lineItems: [{}] }, period),
    null,
  );
  assert.equal(
    pricedInvoiceRefusal({ unratedEntryIds: ['a'], lineItems: [] }, period)
      ?.code,
    'NO_RATE_CONFIGURED',
  );
  assert.deepEqual(
    pricedInvoiceRefusal({ unratedEntryIds: [], lineItems: [] }, {
      ...period,
      dueDate: '2026-10-01',
    } as typeof period)?.details,
    period,
  );
});

test('the unrated count reads as one or many', () => {
  assert.match(unratedRefusal(['a']).message, /^1 billable entry has/);
  assert.match(unratedRefusal(['a', 'b']).message, /^2 billable entries have/);
});

test('the next number moves forward and stays under the cap', () => {
  assert.equal(nextNumberRefusal(20, 16, 999), null);
  assert.equal(nextNumberRefusal(16, 16, 999), null);
  assert.equal(
    nextNumberRefusal(1000, 16, 999)?.message,
    "The next number can't go above 999.",
  );
  assert.deepEqual(nextNumberRefusal(3, 16, 999)?.details, {
    field: 'nextInvoiceNumber',
    current: 16,
  });
});

test('the refusals the database decides name themselves', () => {
  assert.deepEqual(refusals.transition('paid', 'sent').details, {
    from: 'paid',
    to: 'sent',
  });
  assert.match(refusals.entryLocked('deleted').message, /cannot be deleted$/);
  assert.match(
    refusals.expenseLocked('modified').message,
    /cannot be modified$/,
  );
  assert.deepEqual(refusals.timerRunning(null).details, { running: null });
});
