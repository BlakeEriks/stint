import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryOrderRefusal,
  invoiceRequestRefusal,
  nextNumberRefusal,
  paidAtRefusal,
  pricedInvoiceRefusal,
  type Refusal,
  refusals,
  stopOrderRefusal,
  unratedRefusal,
} from '../src/refusals.ts';

const nine = '2026-09-17T09:00:00.000Z';
const ten = '2026-09-17T10:00:00.000Z';
const tomorrow = '2026-09-18T00:00:00.000Z';
const now = new Date(ten);
const today = '2026-09-17';
const period = { periodStart: '2026-09-01', periodEnd: '2026-09-15' };
const highest = { sequenceNo: 15, invoiceNumber: 'INV-0015' };

/* What each refusal decides: whether it refuses, its code and the details a
   form reads. A message is asserted only where it is computed; fixed words
   are copy, and a route test compares against the refusal itself. */
type Want = { code?: Refusal['code']; message?: RegExp; details?: unknown };
const cases: [string, Refusal | null, Want | null][] = [
  ['an entry ending after it starts', entryOrderRefusal(nine, ten), null],
  ['a running entry', entryOrderRefusal(nine, null), null],
  [
    'an entry ending as it starts',
    entryOrderRefusal(ten, ten),
    { code: 'VALIDATION_FAILED', details: { startedAt: ten, endedAt: ten } },
  ],
  ['a stop after the start', stopOrderRefusal(nine, ten), null],
  [
    'a stop before the start',
    stopOrderRefusal(ten, nine),
    { code: 'VALIDATION_FAILED' },
  ],
  ['paid as it was sent', paidAtRefusal(nine, nine, now), null],
  ['paid, never sent', paidAtRefusal(nine, null, now), null],
  [
    'paid in the future',
    paidAtRefusal(tomorrow, null, now),
    { code: 'VALIDATION_FAILED', details: { paidAt: tomorrow } },
  ],
  [
    'paid before it was sent',
    paidAtRefusal(nine, ten, now),
    { code: 'VALIDATION_FAILED', details: { paidAt: nine, sentAt: ten } },
  ],
  ['a period in order', invoiceRequestRefusal(period, today), null],
  [
    'due today',
    invoiceRequestRefusal({ ...period, dueDate: today }, today),
    null,
  ],
  [
    'a period ending before it starts',
    invoiceRequestRefusal({ ...period, periodEnd: '2026-08-31' }, today),
    { code: 'INVALID_PERIOD' },
  ],
  [
    'due before today',
    invoiceRequestRefusal({ ...period, dueDate: '2026-09-16' }, today),
    { code: 'VALIDATION_FAILED', details: { field: 'dueDate' } },
  ],
  [
    'every entry rated, with a line',
    pricedInvoiceRefusal({ unratedEntryIds: [], lineItems: [{}] }, period),
    null,
  ],
  [
    'an unrated entry',
    pricedInvoiceRefusal({ unratedEntryIds: ['a'], lineItems: [] }, period),
    { code: 'NO_RATE_CONFIGURED', details: { unratedEntryIds: ['a'] } },
  ],
  [
    'no lines, naming only the period',
    pricedInvoiceRefusal({ unratedEntryIds: [], lineItems: [] }, {
      ...period,
      dueDate: '2026-10-01',
    } as typeof period),
    { code: 'INVALID_PERIOD', details: period },
  ],
  [
    'one unrated entry',
    unratedRefusal(['a']),
    { message: /^1 billable entry has/ },
  ],
  [
    'two unrated entries',
    unratedRefusal(['a', 'b']),
    { message: /^2 billable entries have/ },
  ],
  ['the next number unchanged', nextNumberRefusal(20, 20, 999, highest), null],
  [
    'the next number back down, past the highest',
    nextNumberRefusal(16, 20, 999, highest),
    null,
  ],
  [
    'the next number, no invoices yet',
    nextNumberRefusal(1, 1, 999, null),
    null,
  ],
  [
    'the next number over the cap',
    nextNumberRefusal(1000, 16, 999, highest),
    { code: 'VALIDATION_FAILED', message: /above 999\.$/ },
  ],
  [
    'the next number onto the highest',
    nextNumberRefusal(15, 20, 999, highest),
    {
      message: /than INV-0015,/,
      details: { field: 'nextInvoiceNumber', current: 20 },
    },
  ],
  [
    'a transition the database refuses',
    refusals.transition('paid', 'sent'),
    { details: { from: 'paid', to: 'sent' } },
  ],
  [
    'a billed entry deleted',
    refusals.entryLocked('deleted'),
    { code: 'ENTRY_LOCKED', message: /cannot be deleted$/ },
  ],
  [
    'a billed expense modified',
    refusals.expenseLocked('modified'),
    { code: 'EXPENSE_LOCKED', message: /cannot be modified$/ },
  ],
  [
    'a second timer',
    refusals.timerRunning(null),
    { code: 'TIMER_ALREADY_RUNNING', details: { running: null } },
  ],
];

test('each refusal refuses only what it names, with its code and details', () => {
  for (const [name, got, want] of cases) {
    if (want === null) {
      assert.equal(got, null, name);
      continue;
    }
    assert.ok(got, name);
    if (want.code) assert.equal(got.code, want.code, name);
    if (want.message) assert.match(got.message, want.message, name);
    if ('details' in want) assert.deepEqual(got.details, want.details, name);
  }
});
