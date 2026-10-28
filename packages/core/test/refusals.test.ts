import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryOrderRefusal,
  invoiceRequestRefusal,
  nextNumberRefusal,
  paidAtRefusal,
  pricedInvoiceRefusal,
  refusals,
  replayRefusal,
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

test('the next number stays past the highest used and under the cap', () => {
  const highest = { sequenceNo: 15, invoiceNumber: 'INV-0015' };
  assert.equal(nextNumberRefusal(20, 20, 999, highest), null);
  assert.equal(nextNumberRefusal(16, 20, 999, highest), null, 'back down');
  assert.equal(nextNumberRefusal(1, 1, 999, null), null, 'no invoices yet');
  assert.equal(
    nextNumberRefusal(1000, 16, 999, highest)?.message,
    "The next number can't go above 999.",
  );
  const held = nextNumberRefusal(15, 20, 999, highest);
  assert.equal(
    held?.message,
    'Must be higher than INV-0015, your latest invoice.',
  );
  assert.deepEqual(held?.details, { field: 'nextInvoiceNumber', current: 20 });
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

test('a replayed create matches what is stored, or is refused', () => {
  const stored = {
    taskName: 'Drawn',
    projectId: null,
    startedAt: '2026-09-17T09:00:00+00:00',
    endedAt: '2026-09-17T10:00:00+00:00',
    isBillable: true,
    rateOverride: null,
  };
  const sent = {
    taskName: 'Drawn',
    startedAt: nine,
    endedAt: ten,
  };
  // The same instants written another way, and omitted fields, are a replay.
  assert.equal(replayRefusal(sent, stored), null);
  assert.equal(replayRefusal({ ...sent, isBillable: true }, stored), null);

  for (const changed of [
    { taskName: 'Drawn, renamed' },
    { endedAt: '2026-09-17T10:15:00.000Z' },
    { projectId: '018f0000-0000-7000-8000-000000000009' },
    { isBillable: false },
    { rateOverride: 90 },
  ])
    assert.equal(
      replayRefusal({ ...sent, ...changed }, stored)?.code,
      'ENTRY_ALREADY_SAVED',
      JSON.stringify(changed),
    );
});
