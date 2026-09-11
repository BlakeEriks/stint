import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLineItems, formatInvoiceNumber, type BillableEntry } from '../src/invoice.ts';

const entry = (over: Partial<BillableEntry> = {}): BillableEntry => ({
  id: 'e1',
  taskName: 'Task',
  projectId: 'p1',
  projectName: 'Project',
  startedAt: '2026-09-11T09:00:00Z',
  durationSeconds: 3600,
  isBillable: true,
  rateOverride: null,
  projectRate: null,
  clientRate: null,
  userDefaultRate: 100,
  ...over,
});

test('one entry, one line, rate from the user default', () => {
  const r = buildLineItems([entry()], { groupingMode: 'entry' });
  assert.equal(r.lineItems.length, 1);
  assert.equal(r.lineItems[0]!.resolvedRate, 100);
  assert.equal(r.lineItems[0]!.rateSource, 'default');
  assert.equal(r.lineItems[0]!.quantityHours, 1);
  assert.equal(r.lineItems[0]!.amount, 100);
  assert.equal(r.subtotal, 100);
  assert.equal(r.total, 100);
});

test('rate precedence flows through to the line item', () => {
  const r = buildLineItems(
    [
      entry({ id: 'a', rateOverride: 999, projectRate: 175, clientRate: 150 }),
      entry({ id: 'b', projectRate: 175, clientRate: 150 }),
      entry({ id: 'c', clientRate: 150 }),
      entry({ id: 'd' }),
    ],
    { groupingMode: 'entry' },
  );
  assert.deepEqual(
    r.lineItems.map((li) => [li.resolvedRate, li.rateSource]),
    [
      [999, 'entry'],
      [175, 'project'],
      [150, 'client'],
      [100, 'default'],
    ],
  );
});

test('non-billable entries never reach an invoice', () => {
  const r = buildLineItems(
    [entry({ id: 'a' }), entry({ id: 'b', isBillable: false })],
    { groupingMode: 'entry' },
  );
  assert.equal(r.lineItems.length, 1);
  assert.equal(r.entryCount, 1);
  assert.equal(r.subtotal, 100);
});

test('an entry with no rate anywhere is reported, not billed at zero', () => {
  const r = buildLineItems(
    [entry({ id: 'a' }), entry({ id: 'b', userDefaultRate: null })],
    { groupingMode: 'entry' },
  );
  assert.deepEqual(r.unratedEntryIds, ['b']);
  assert.equal(r.lineItems.length, 1, 'the unrated entry produced no line');
  assert.equal(r.entryCount, 1);
});

test('a deliberate zero rate bills at zero rather than being flagged unrated', () => {
  const r = buildLineItems([entry({ projectRate: 0 })], { groupingMode: 'entry' });
  assert.deepEqual(r.unratedEntryIds, []);
  assert.equal(r.lineItems[0]!.resolvedRate, 0);
  assert.equal(r.lineItems[0]!.amount, 0);
  assert.equal(r.lineItems[0]!.rateSource, 'project');
});

test('grouping by task sums matching entries into one line', () => {
  const r = buildLineItems(
    [
      entry({ id: 'a', taskName: 'Design', durationSeconds: 3600 }),
      entry({ id: 'b', taskName: 'Design', durationSeconds: 1800 }),
      entry({ id: 'c', taskName: 'Build', durationSeconds: 3600 }),
    ],
    { groupingMode: 'task' },
  );
  assert.equal(r.lineItems.length, 2);
  const design = r.lineItems.find((li) => li.description === 'Design')!;
  assert.equal(design.quantitySeconds, 5400);
  assert.equal(design.quantityHours, 1.5);
  assert.equal(design.amount, 150);
  assert.deepEqual(design.entryIds, ['a', 'b']);
});

/**
 * The important one: collapsing two different rates into a single line would
 * misstate what the client is being charged.
 */
test('same task name at different rates stays on separate lines', () => {
  const r = buildLineItems(
    [
      entry({ id: 'a', taskName: 'Consulting', rateOverride: 200 }),
      entry({ id: 'b', taskName: 'Consulting', rateOverride: 150 }),
    ],
    { groupingMode: 'task' },
  );
  assert.equal(r.lineItems.length, 2, 'rates must not be merged');
  assert.deepEqual(r.lineItems.map((li) => li.resolvedRate).sort((x, y) => x - y), [150, 200]);
  assert.equal(r.subtotal, 350);
});

test('grouping by project, with unassigned work labelled', () => {
  const r = buildLineItems(
    [
      entry({ id: 'a', projectName: 'Lifecycle' }),
      entry({ id: 'b', projectName: 'Lifecycle' }),
      entry({ id: 'c', projectId: null, projectName: null }),
    ],
    { groupingMode: 'project' },
  );
  assert.deepEqual(r.lineItems.map((li) => li.description), ['Lifecycle', 'Unassigned']);
  assert.equal(r.lineItems[0]!.quantityHours, 2);
});

test('grouping by day uses the LOCAL date', () => {
  // 02:30Z on the 12th is still the 11th in Sao Paulo (UTC-3).
  const r = buildLineItems(
    [
      entry({ id: 'a', startedAt: '2026-09-12T02:30:00Z' }),
      entry({ id: 'b', startedAt: '2026-09-11T15:00:00Z' }),
    ],
    { groupingMode: 'day', tz: 'America/Sao_Paulo' },
  );
  assert.equal(r.lineItems.length, 1, 'both fall on the same local day');
  assert.equal(r.lineItems[0]!.description, '2026-09-11');
  assert.equal(r.lineItems[0]!.quantityHours, 2);
});

test('tax is applied to the subtotal', () => {
  const r = buildLineItems([entry({ durationSeconds: 7200 })], {
    groupingMode: 'entry',
    taxRate: 20,
  });
  assert.equal(r.subtotal, 200);
  assert.equal(r.taxAmount, 40);
  assert.equal(r.total, 240);
});

test('tax rounds to cents', () => {
  const r = buildLineItems([entry({ durationSeconds: 3730 })], {
    groupingMode: 'entry',
    taxRate: 8.25,
  });
  // 3730s @ 100/h = 103.611... -> 103.61
  assert.equal(r.subtotal, 103.61);
  assert.equal(r.taxAmount, 8.55);
  assert.equal(r.total, 112.16);
});

/**
 * Rounding per-entry then summing drifts from rounding the summed total.
 * Grouped lines must round once, at the line.
 */
test('grouped amounts round once per line, not per entry', () => {
  const thirdOfHour = 1200; // 20 min = 33.333... at 100/h
  const r = buildLineItems(
    [
      entry({ id: 'a', taskName: 'T', durationSeconds: thirdOfHour }),
      entry({ id: 'b', taskName: 'T', durationSeconds: thirdOfHour }),
      entry({ id: 'c', taskName: 'T', durationSeconds: thirdOfHour }),
    ],
    { groupingMode: 'task' },
  );
  assert.equal(r.lineItems.length, 1);
  assert.equal(r.lineItems[0]!.quantitySeconds, 3600);
  assert.equal(r.lineItems[0]!.amount, 100, 'exactly 100, not 99.99 from 3 x 33.33');
});

test('line order is deterministic for grouped modes', () => {
  const mk = () => [
    entry({ id: 'a', taskName: 'Zebra' }),
    entry({ id: 'b', taskName: 'Alpha' }),
    entry({ id: 'c', taskName: 'Mango' }),
  ];
  const first = buildLineItems(mk(), { groupingMode: 'task' });
  const second = buildLineItems(mk().reverse(), { groupingMode: 'task' });
  assert.deepEqual(
    first.lineItems.map((li) => li.description),
    second.lineItems.map((li) => li.description),
    'input order must not change the invoice',
  );
  assert.deepEqual(first.lineItems.map((li) => li.description), ['Alpha', 'Mango', 'Zebra']);
});

test('an empty entry set produces a zero invoice, not a crash', () => {
  const r = buildLineItems([], { groupingMode: 'entry', taxRate: 20 });
  assert.deepEqual(r.lineItems, []);
  assert.equal(r.subtotal, 0);
  assert.equal(r.taxAmount, 0);
  assert.equal(r.total, 0);
  assert.equal(r.entryCount, 0);
});

test('an untitled task still gets a description', () => {
  const r = buildLineItems([entry({ taskName: '' })], { groupingMode: 'entry' });
  assert.equal(r.lineItems[0]!.description, 'Untitled');
});

test('invoice numbers pad to four digits and grow beyond', () => {
  assert.equal(formatInvoiceNumber('INV-', 1), 'INV-0001');
  assert.equal(formatInvoiceNumber('INV-', 42), 'INV-0042');
  assert.equal(formatInvoiceNumber('INV-', 9999), 'INV-9999');
  assert.equal(formatInvoiceNumber('INV-', 10000), 'INV-10000', 'grows rather than truncating');
  assert.equal(formatInvoiceNumber('2026-', 7), '2026-0007');
});
