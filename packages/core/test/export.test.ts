import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entriesCsv,
  invoicesCsv,
  toCsv,
  type ExportEntry,
  type ExportInvoice,
} from '../src/export.ts';
import { billedAmount } from '../src/invoice.ts';

/** The rows of a file, BOM and CRLF removed, split on commas (no quoting). */
const lines = (csv: string) => csv.slice(1).split('\r\n').slice(0, -1);
const cells = (csv: string, row: number) => lines(csv)[row]!.split(',');

// ── toCsv ──────────────────────────────────────────────────────────

test('a file starts with a BOM and ends every row with CRLF', () => {
  const csv = toCsv(['A', 'B'], [['x', 'y']]);
  assert.equal(csv, '﻿A,B\r\nx,y\r\n');
});

test('a cell holding a comma, quote, CR or LF is quoted, quotes doubled', () => {
  const csv = toCsv(['A'], [['a,b'], ['say "hi"'], ['two\nlines'], ['cr\r']]);
  assert.equal(csv, '﻿A\r\n"a,b"\r\n"say ""hi"""\r\n"two\nlines"\r\n"cr\r"\r\n');
});

test('a text cell a spreadsheet would run is prefixed with a quote', () => {
  for (const c of ['=SUM(A1)', '+1', '-fix', '@me', '\tx', '\rx']) {
    const out = toCsv(['A'], [[c]]).split('\r\n')[1]!;
    assert.ok(out.replace(/^"/, '').startsWith(`'${c[0]}`), JSON.stringify(c));
  }
});

test('numbers are two-place decimals and never prefixed; null is empty', () => {
  const csv = toCsv(['A', 'B', 'C', 'D'], [[0, -12.5, 1200, null]]);
  assert.equal(csv, '﻿A,B,C,D\r\n0.00,-12.50,1200.00,\r\n');
});

// ── invoices ───────────────────────────────────────────────────────

const invoice = (over: Partial<ExportInvoice> = {}): ExportInvoice => ({
  id: 'i1',
  clientId: 'c1',
  invoiceNumber: 'INV-0001',
  sequenceNo: 1,
  status: 'sent',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  subtotal: 1000,
  taxRate: 0,
  taxAmount: 0,
  expensesSubtotal: 25,
  total: 1025,
  currency: 'USD',
  sentAt: '2026-09-01T16:00:00Z',
  paidAt: null,
  ...over,
});
const clients = [
  { id: 'c1', name: 'Northwind, Inc.', hourlyRate: 150, currency: null },
  { id: 'c2', name: 'Meridian', hourlyRate: null, currency: 'CAD' },
];

test('the invoices file has its header, and the header alone when empty', () => {
  assert.equal(
    invoicesCsv({ invoices: [], clients }, 'UTC'),
    '﻿Invoice,Client,Status,Issue date,Due date,Sent date,Paid date,' +
      'Period start,Period end,Subtotal,Tax rate,Tax,Expenses,Total,Currency\r\n',
  );
});

test('an invoice row carries its dates US style and its frozen totals', () => {
  const csv = invoicesCsv({ invoices: [invoice()], clients }, 'UTC');
  assert.equal(
    lines(csv)[1],
    'INV-0001,"Northwind, Inc.",Sent,09/01/2026,10/01/2026,09/01/2026,,' +
      '08/01/2026,08/31/2026,1000.00,0.00,0.00,25.00,1025.00,USD',
  );
});

test('every status exports, newest issue date first, then highest number', () => {
  const csv = invoicesCsv(
    {
      invoices: [
        invoice({
          id: 'a',
          invoiceNumber: 'INV-0001',
          sequenceNo: 1,
          status: 'void',
        }),
        invoice({
          id: 'b',
          invoiceNumber: 'INV-0002',
          sequenceNo: 2,
          status: 'paid',
          paidAt: '2026-09-20T12:00:00Z',
        }),
        invoice({
          id: 'c',
          invoiceNumber: 'INV-0003',
          sequenceNo: 3,
          status: 'draft',
          issueDate: '2026-09-15',
          sentAt: null,
        }),
        invoice({
          id: 'd',
          invoiceNumber: 'INV-0004',
          sequenceNo: 4,
          status: 'sent',
          clientId: 'c2',
        }),
      ],
      clients,
    },
    'UTC',
  );
  assert.deepEqual(
    lines(csv)
      .slice(1)
      .map((l) => l.split(',')[0]),
    ['INV-0003', 'INV-0004', 'INV-0002', 'INV-0001'],
  );
  assert.match(csv, /INV-0003,"Northwind, Inc.",Draft,/);
  assert.match(csv, /INV-0002,"Northwind, Inc.",Paid,.*,09\/20\/2026,/);
  assert.match(csv, /INV-0001,"Northwind, Inc.",Void,/);
  assert.match(csv, /INV-0004,Meridian,Sent,/);
});

test('a payment made in the evening is dated where the user is', () => {
  const csv = invoicesCsv(
    {
      invoices: [invoice({ status: 'paid', paidAt: '2026-09-21T02:30:00Z' })],
      clients,
    },
    'America/Los_Angeles',
  );
  assert.equal(cells(csv, 1)[7], '09/20/2026');
});

// ── entries ────────────────────────────────────────────────────────

const entry = (over: Partial<ExportEntry> = {}): ExportEntry => ({
  startedAt: '2026-09-11T13:05:00Z',
  endedAt: '2026-09-11T14:05:00Z',
  durationSeconds: 3600,
  projectId: 'p1',
  taskName: 'Design review',
  isBillable: true,
  rateOverride: null,
  invoiceId: null,
  invoicedElsewhere: false,
  ...over,
});
const projects = [
  { id: 'p1', clientId: 'c1', name: 'Warehouse', hourlyRate: null },
  { id: 'p2', clientId: 'c1', name: 'Pro bono', hourlyRate: 0 },
  { id: 'p3', clientId: null, name: 'Admin', hourlyRate: null },
  { id: 'p4', clientId: 'c2', name: 'Pipeline', hourlyRate: null },
];
const data = (entries: ExportEntry[], over = {}) => ({
  entries,
  projects,
  clients: clients.map((c) => ({ ...c, name: c.name.replace(', Inc.', '') })),
  invoices: [invoice({ id: 'i9', invoiceNumber: 'INV-0009' })],
  defaultRate: 100 as number | null,
  currency: 'USD',
  ...over,
});
const row = (e: Partial<ExportEntry>, tz = 'UTC', over = {}) =>
  cells(entriesCsv(data([entry(e)], over), tz), 1);
const COL = {
  date: 0,
  start: 1,
  end: 2,
  hours: 3,
  client: 4,
  project: 5,
  task: 6,
  billable: 7,
  rate: 8,
  source: 9,
  amount: 10,
  currency: 11,
  invoice: 12,
};

test('the entries file has its header', () => {
  assert.equal(
    lines(entriesCsv(data([]), 'UTC'))[0],
    'Date,Start,End,Hours,Client,Project,Task,Billable,Rate,Rate source,Amount,Currency,Invoice',
  );
});

test('an entry row reads US style, in the user’s zone', () => {
  assert.deepEqual(row({}, 'America/New_York'), [
    '09/11/2026',
    '9:05 AM',
    '10:05 AM',
    '1.00',
    'Northwind',
    'Warehouse',
    'Design review',
    'Yes',
    '150.00',
    'client',
    '150.00',
    'USD',
    '',
  ]);
});

test('times use a plain space before AM/PM, not Intl’s narrow one', () => {
  const csv = entriesCsv(data([entry()]), 'UTC');
  assert.ok(!csv.includes(' '));
  assert.equal(row({})[COL.start], '1:05 PM');
});

test('the date is the local day the entry started', () => {
  assert.equal(
    row(
      { startedAt: '2026-09-12T02:00:00Z', endedAt: '2026-09-12T03:00:00Z' },
      'America/Los_Angeles',
    )[COL.date],
    '09/11/2026',
  );
});

test('rate precedence: entry, then project, then client, then default', () => {
  const r = (e: Partial<ExportEntry>) => {
    const c = row(e);
    return [c[COL.rate], c[COL.source]];
  };
  assert.deepEqual(r({ rateOverride: 90 }), ['90.00', 'entry']);
  assert.deepEqual(r({ projectId: 'p2' }), ['0.00', 'project']);
  assert.deepEqual(r({}), ['150.00', 'client']);
  assert.deepEqual(r({ projectId: 'p3' }), ['100.00', 'default']);
});

test('a rate of 0 exports as 0.00 with an amount of 0.00, never empty', () => {
  const c = row({ projectId: 'p2' });
  assert.equal(c[COL.rate], '0.00');
  assert.equal(c[COL.amount], '0.00');
});

test('no rate anywhere exports empty rate and amount, source none', () => {
  const c = row({ projectId: 'p3' }, 'UTC', { defaultRate: null });
  assert.equal(c[COL.rate], '');
  assert.equal(c[COL.source], 'none');
  assert.equal(c[COL.amount], '');
});

test('a non-billable entry is included, marked No, with no amount', () => {
  const c = row({ projectId: 'p3', isBillable: false });
  assert.equal(c[COL.billable], 'No');
  assert.equal(c[COL.rate], '100.00');
  assert.equal(c[COL.amount], '');
});

test('hours and amount are what an invoice bills: 20 minutes at 100 is 0.33', () => {
  const c = row({ projectId: 'p3', durationSeconds: 1200 });
  assert.equal(c[COL.hours], '0.33');
  assert.equal(c[COL.amount], '33.00');
  assert.equal(billedAmount(1200, 100), 33);
});

test('the invoice column names the invoice, or that it was billed elsewhere', () => {
  assert.equal(
    row({ projectId: 'p3', invoiceId: 'i9' })[COL.invoice],
    'INV-0009',
  );
  assert.equal(
    row({ projectId: 'p3', invoicedElsewhere: true })[COL.invoice],
    'Invoiced elsewhere',
  );
});

test('no project means empty client and project; currency follows the client', () => {
  const none = row({ projectId: null });
  assert.equal(none[COL.client], '');
  assert.equal(none[COL.project], '');
  assert.equal(none[COL.currency], 'USD');
  assert.equal(row({ projectId: 'p4' })[COL.currency], 'CAD');
});

test('running entries are left out, and the rest run oldest first', () => {
  const csv = entriesCsv(
    data([
      entry({
        taskName: 'second',
        startedAt: '2026-09-12T13:00:00Z',
        endedAt: '2026-09-12T14:00:00Z',
      }),
      entry({
        taskName: 'running',
        startedAt: '2026-09-13T13:00:00Z',
        endedAt: null,
        durationSeconds: null,
      }),
      entry({ taskName: 'first', startedAt: '2026-09-11T13:00:00+00:00' }),
    ]),
    'UTC',
  );
  assert.deepEqual(
    lines(csv)
      .slice(1)
      .map((l) => l.split(',')[COL.task]),
    ['first', 'second'],
  );
});
