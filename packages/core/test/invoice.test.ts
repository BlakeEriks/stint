import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLineItems,
  formatInvoiceNumber,
  type BillableEntry,
} from '../src/invoice.ts';

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
  assert.equal(r.lineItems[0]!.unitPrice, 100);
  assert.equal(r.lineItems[0]!.rateSource, 'default');
  assert.equal(r.lineItems[0]!.quantity, 1);
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
    r.lineItems.map((li) => [li.unitPrice, li.rateSource]),
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
  const r = buildLineItems([entry({ projectRate: 0 })], {
    groupingMode: 'entry',
  });
  assert.deepEqual(r.unratedEntryIds, []);
  assert.equal(r.lineItems[0]!.unitPrice, 0);
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
  assert.equal(design.quantity, 1.5);
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
  assert.deepEqual(
    r.lineItems.map((li) => li.unitPrice).sort((x, y) => x - y),
    [150, 200],
  );
  assert.equal(r.subtotal, 350);
});

test('grouping by project, with unassigned work labeled', () => {
  const r = buildLineItems(
    [
      entry({ id: 'a', projectName: 'Lifecycle' }),
      entry({ id: 'b', projectName: 'Lifecycle' }),
      entry({ id: 'c', projectId: null, projectName: null }),
    ],
    { groupingMode: 'project' },
  );
  assert.deepEqual(
    r.lineItems.map((li) => li.description),
    ['Lifecycle', 'Unassigned'],
  );
  assert.equal(r.lineItems[0]!.quantity, 2);
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
  assert.equal(r.lineItems[0]!.quantity, 2);
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
  assert.equal(r.lineItems[0]!.quantity, 1);
  assert.equal(
    r.lineItems[0]!.amount,
    100,
    'exactly 100, not 99.99 from 3 x 33.33',
  );
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
  assert.deepEqual(
    first.lineItems.map((li) => li.description),
    ['Alpha', 'Mango', 'Zebra'],
  );
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
  const r = buildLineItems([entry({ taskName: '' })], {
    groupingMode: 'entry',
  });
  assert.equal(r.lineItems[0]!.description, 'Untitled');
});

// ── charges that are not time ──────────────────────────────────────
test('a flat fee bills its amount with no rate arithmetic', () => {
  const r = buildLineItems([], {
    groupingMode: 'task',
    manualLines: [{ description: 'Fixed-scope build', amount: 2400 }],
  });

  assert.equal(r.lineItems.length, 1);
  const fee = r.lineItems[0]!;
  assert.equal(fee.unit, 'fixed');
  assert.equal(fee.quantity, 1);
  assert.equal(fee.unitPrice, 2400);
  assert.equal(fee.amount, 2400, 'the amount is what was entered');
  assert.equal(fee.rateSource, 'manual');
  assert.deepEqual(fee.entryIds, [], 'no time produced it');
  assert.equal(r.subtotal, 2400);
});

test('an invoice can carry both time and a flat charge', () => {
  const r = buildLineItems(
    [entry({ id: 'a', taskName: 'Build', durationSeconds: 3600 })],
    {
      groupingMode: 'task',
      manualLines: [{ description: 'Figma license', amount: 15 }],
    },
  );

  assert.equal(r.lineItems.length, 2);
  assert.equal(r.lineItems[0]!.unit, 'hour');
  assert.equal(r.lineItems[1]!.unit, 'fixed');
  assert.equal(r.subtotal, 115, 'both kinds reach the subtotal');
  assert.equal(r.entryCount, 1, 'a manual line is not a time entry');
});

test('manual lines keep their given order, after the time lines', () => {
  // Time lines sort by description; manual ones must not join that sort.
  const r = buildLineItems(
    [entry({ id: 'a', taskName: 'Zebra', durationSeconds: 3600 })],
    {
      groupingMode: 'task',
      manualLines: [
        { description: 'Deposit', amount: 500 },
        { description: 'Airfare', amount: 320 },
      ],
    },
  );

  assert.deepEqual(
    r.lineItems.map((li) => li.description),
    ['Zebra', 'Deposit', 'Airfare'],
  );
});

test('a fee rounds to cents once', () => {
  const r = buildLineItems([], {
    groupingMode: 'task',
    manualLines: [{ description: 'Third of a dollar', amount: 0.335 }],
  });
  assert.equal(r.lineItems[0]!.amount, 0.34);
  assert.equal(r.lineItems[0]!.unitPrice, 0.34, 'the printed price matches');
});

test('tax applies to fees as well as time', () => {
  const r = buildLineItems([], {
    groupingMode: 'task',
    taxRate: 10,
    manualLines: [{ description: 'Retainer', amount: 1000 }],
  });
  assert.equal(r.taxAmount, 100);
  assert.equal(r.total, 1100);
});

// ── expenses ───────────────────────────────────────────────────────
const expense = (
  over: Partial<{
    id: string;
    spentOn: string;
    description: string;
    amount: number;
  }> = {},
) => ({
  id: 'x1',
  spentOn: '2026-09-12',
  description: 'JetBrains license',
  amount: 199,
  ...over,
});

test('expenses follow every service line, oldest first', () => {
  const r = buildLineItems(
    [entry({ id: 'a', taskName: 'Build', durationSeconds: 3600 })],
    {
      groupingMode: 'task',
      manualLines: [{ description: 'Deposit', amount: 500 }],
      expenses: [
        expense({ id: 'x2', spentOn: '2026-09-20', description: 'Flight' }),
        expense({ id: 'x1', spentOn: '2026-08-05', description: 'Claude' }),
      ],
    },
  );

  assert.deepEqual(
    r.lineItems.map((li) => [li.description, li.unit]),
    [
      ['Build', 'hour'],
      ['Deposit', 'fixed'],
      ['Claude', 'expense'],
      ['Flight', 'expense'],
    ],
  );
});

test('two expenses on one day print in a stable order', () => {
  const a = expense({ id: 'b', description: 'Second' });
  const b = expense({ id: 'a', description: 'First' });
  const r1 = buildLineItems([], { groupingMode: 'task', expenses: [a, b] });
  const r2 = buildLineItems([], { groupingMode: 'task', expenses: [b, a] });
  assert.deepEqual(
    r1.lineItems.map((li) => li.description),
    ['First', 'Second'],
  );
  assert.deepEqual(r1.lineItems, r2.lineItems);
});

test('an expense line is one of something, dated, and names its expense', () => {
  const r = buildLineItems([], {
    groupingMode: 'task',
    expenses: [expense({ amount: 199 })],
  });
  const [line] = r.lineItems;
  assert.equal(line!.unit, 'expense');
  assert.equal(line!.quantity, 1);
  assert.equal(line!.unitPrice, 199);
  assert.equal(line!.amount, 199);
  assert.equal(line!.spentOn, '2026-09-12');
  assert.equal(line!.expenseId, 'x1');
  assert.deepEqual(line!.entryIds, []);
  assert.equal(r.entryCount, 0, 'an expense is not a time entry');
});

test('expenses have their own subtotal and are never taxed', () => {
  const r = buildLineItems(
    [entry({ id: 'a', durationSeconds: 3600 })], // 100
    {
      groupingMode: 'task',
      taxRate: 10,
      manualLines: [{ description: 'Retainer', amount: 1000 }],
      expenses: [expense({ amount: 200 }), expense({ id: 'x2', amount: 50.5 })],
    },
  );
  assert.equal(r.subtotal, 1100, 'services only');
  assert.equal(r.taxAmount, 110, 'tax on services only');
  assert.equal(r.expensesSubtotal, 250.5);
  assert.equal(r.total, 1460.5);
});

test('the expenses subtotal rounds once, from rounded lines', () => {
  const r = buildLineItems([], {
    groupingMode: 'task',
    expenses: [
      expense({ id: 'a', amount: 0.335 }),
      expense({ id: 'b', amount: 0.335 }),
    ],
  });
  assert.deepEqual(
    r.lineItems.map((li) => li.amount),
    [0.34, 0.34],
  );
  assert.equal(r.expensesSubtotal, 0.68, 'the sum of what is printed');
  assert.equal(r.total, 0.68);
});

test('expenses alone make an invoice', () => {
  const r = buildLineItems([], {
    groupingMode: 'task',
    expenses: [expense()],
  });
  assert.equal(r.lineItems.length, 1);
  assert.equal(r.subtotal, 0);
  assert.equal(r.expensesSubtotal, 199);
  assert.equal(r.total, 199);
});

test('with no expenses, the invoice is what it was before', () => {
  const r = buildLineItems([entry()], { groupingMode: 'entry', taxRate: 10 });
  assert.equal(r.expensesSubtotal, 0);
  assert.equal(r.total, 110);
  assert.equal(
    r.lineItems.every((li) => li.unit === 'hour'),
    true,
  );
});

test('invoice numbers pad to four digits and grow beyond', () => {
  assert.equal(formatInvoiceNumber('INV-', 1), 'INV-0001');
  assert.equal(formatInvoiceNumber('INV-', 42), 'INV-0042');
  assert.equal(formatInvoiceNumber('INV-', 9999), 'INV-9999');
  assert.equal(
    formatInvoiceNumber('INV-', 10000),
    'INV-10000',
    'grows rather than truncating',
  );
  assert.equal(formatInvoiceNumber('2026-', 7), '2026-0007');
});

// ── audit: the invoice is always right ─────────────────────────────
// Reproduces a finding from the 2026-09-30 correctness audit. Expected to
// FAIL until its issue is fixed.

test('AUDIT: a time line’s printed arithmetic holds — quantity × unit price = amount', () => {
  // 7h 29m 56s. The document prints 7.50 h × $100.00 and then charges
  // $749.89, because the amount is computed from seconds and the quantity is
  // rounded separately. A client with a calculator sees a wrong invoice.
  const r = buildLineItems([entry({ durationSeconds: 26_996 })], {
    groupingMode: 'entry',
  });
  const li = r.lineItems[0]!;
  assert.equal(li.quantity, 7.5);
  assert.equal(
    li.amount,
    Math.round(li.quantity * li.unitPrice * 100) / 100,
    `the document says ${li.quantity} × ${li.unitPrice} = ${li.amount}`,
  );
});
