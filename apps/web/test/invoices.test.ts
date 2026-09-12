/**
 * Integration tests for the invoicing routes.
 *
 * Same approach as routes.test.ts: the REAL handlers against a REAL Postgres
 * with the real migrations, so gapless numbering, the immutability trigger
 * and rate resolution are genuinely exercised.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { makeDb } from './shim.mjs';

const USER = '11111111-1111-1111-1111-111111111111';
const CLIENT = 'cc000000-0000-4000-8000-000000000001';
const PROJECT = 'bb000000-0000-4000-8000-000000000001';

let pool: pg.Pool;
(globalThis as any).__TEST_DB__ = null;

before(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into auth.users (id,email) values ($1,'me@test') on conflict do nothing`,
    [USER],
  );
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('delete from invoice_line_items');
  await pool.query('update time_entries set invoice_id = null');
  await pool.query('delete from time_entries');
  await pool.query('delete from invoices');
  await pool.query('delete from projects');
  await pool.query('update clients set payment_profile_id = null');
  await pool.query('delete from payment_profiles');
  await pool.query('delete from clients');
  await pool.query(
    `update user_settings set default_hourly_rate=100, currency='USD',
     invoice_number_prefix='INV-', next_invoice_number=1,
     default_payment_terms='Net 30', business_name='Blake Eriks'
     where user_id=$1`,
    [USER],
  );
  await pool.query(
    `insert into clients (id,user_id,name,email,hourly_rate,tax_rate)
     values ($1,$2,'Northwind','ap@northwind.test',150,null)`,
    [CLIENT, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name,hourly_rate)
     values ($1,$2,$3,'Lifecycle',null)`,
    [PROJECT, USER, CLIENT],
  );
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
});

const req = (url: string, body?: unknown, method = 'GET') =>
  new Request(`http://t${url}`, {
    method: body !== undefined ? (method === 'GET' ? 'POST' : method) : method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const json = async (r: Response) => ({
  status: r.status,
  body: r.status === 204 ? null : await r.json(),
});

/** Seeds a completed, billable entry. */
async function seedEntry(opts: {
  id: string;
  task?: string;
  start?: string;
  hours?: number;
  billable?: boolean;
  rateOverride?: number | null;
}) {
  const start = opts.start ?? '2026-09-10T09:00:00Z';
  const end = new Date(
    new Date(start).getTime() + (opts.hours ?? 1) * 3600_000,
  );
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,is_billable,rate_override)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      opts.id,
      USER,
      PROJECT,
      opts.task ?? 'Work',
      start,
      end.toISOString(),
      opts.billable ?? true,
      opts.rateOverride ?? null,
    ],
  );
}

const PERIOD = { periodStart: '2026-09-01', periodEnd: '2026-09-30' };
const E = (n: number) => `018f0000-0000-7000-8000-00000000000${n}`;

// ── preview ────────────────────────────────────────────────────────
test('preview resolves rates and has no side effects', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  await seedEntry({ id: E(1), task: 'Design', hours: 2 });

  const res = await json(
    await preview(req('/invoices/preview', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.lineItems.length, 1);
  assert.equal(
    res.body.lineItems[0].resolvedRate,
    150,
    'falls back to the client rate',
  );
  assert.equal(res.body.lineItems[0].rateSource, 'client');
  assert.equal(res.body.subtotal, 300);
  assert.equal(res.body.total, 300);

  const { rows } = await pool.query('select count(*)::int n from invoices');
  assert.equal(rows[0].n, 0, 'no invoice was created');
  const { rows: seq } = await pool.query(
    'select next_invoice_number n from user_settings where user_id=$1',
    [USER],
  );
  assert.equal(seq[0].n, 1, 'no number was consumed');
});

test('preview reports unrated entries instead of billing them at zero', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  await pool.query('update clients set hourly_rate=null where id=$1', [CLIENT]);
  await pool.query(
    'update user_settings set default_hourly_rate=null where user_id=$1',
    [USER],
  );
  await seedEntry({ id: E(1) });

  const res = await json(
    await preview(req('/invoices/preview', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.unratedEntryIds, [E(1)]);
  assert.equal(res.body.lineItems.length, 0);
});

test('preview excludes non-billable and already-invoiced entries', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  await seedEntry({ id: E(2), hours: 1, billable: false });

  await pool.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status)
     values ($1,$2,$3,'INV-9000',9000,'sent')`,
    ['ff000000-0000-4000-8000-00000000000a', USER, CLIENT],
  );
  await seedEntry({ id: E(3), hours: 5 });
  await pool.query('update time_entries set invoice_id=$1 where id=$2', [
    'ff000000-0000-4000-8000-00000000000a',
    E(3),
  ]);

  const res = await json(
    await preview(req('/invoices/preview', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.body.entryCount, 1, 'only the one unbilled billable entry');
  assert.equal(res.body.subtotal, 150);
});

test('preview excludes a running timer — you cannot bill time still accruing', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     values ($1,$2,$3,'Running','2026-09-15T09:00:00Z',null)`,
    [E(2), USER, PROJECT],
  );

  const res = await json(
    await preview(req('/invoices/preview', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.body.entryCount, 1);
});

test('preview honours the period boundaries inclusively', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  await seedEntry({ id: E(1), start: '2026-09-30T22:00:00Z', hours: 1 }); // last day, in
  await seedEntry({ id: E(2), start: '2026-10-01T09:00:00Z', hours: 1 }); // next month, out
  await seedEntry({ id: E(3), start: '2026-08-31T09:00:00Z', hours: 1 }); // prior month, out

  const res = await json(
    await preview(req('/invoices/preview', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.body.entryCount, 1, 'the last-day entry is included');
});

test('preview rejects an inverted period', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  const res = await json(
    await preview(
      req('/invoices/preview', {
        clientId: CLIENT,
        periodStart: '2026-09-30',
        periodEnd: '2026-09-01',
      }),
    ),
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_PERIOD');
});

// ── generation ─────────────────────────────────────────────────────
test('generating allocates a number, freezes line items and locks entries', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await seedEntry({ id: E(1), task: 'Design', hours: 2 });

  const res = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.invoiceNumber, 'INV-0001');
  assert.equal(res.body.status, 'draft');
  assert.equal(res.body.total, 300);
  assert.equal(res.body.paymentTerms, 'Net 30', 'inherited from settings');

  const { rows: items } = await pool.query(
    'select description, resolved_rate, amount from invoice_line_items where invoice_id=$1',
    [res.body.id],
  );
  assert.equal(items.length, 1);
  assert.equal(
    Number(items[0].resolved_rate),
    150,
    'the rate is frozen onto the line',
  );

  const { rows: entries } = await pool.query(
    'select invoice_id from time_entries where id=$1',
    [E(1)],
  );
  assert.equal(entries[0].invoice_id, res.body.id, 'the entry is attached');
});

test('a generated invoice is immune to a later client rate change', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await seedEntry({ id: E(1), hours: 2 });

  const res = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.body.total, 300);

  await pool.query('update clients set hourly_rate=500 where id=$1', [CLIENT]);

  const { rows } = await pool.query('select total from invoices where id=$1', [
    res.body.id,
  ]);
  assert.equal(Number(rows[0].total), 300, 'the issued total did not move');
});

test('generation refuses when any billable entry has no rate', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await pool.query('update clients set hourly_rate=null where id=$1', [CLIENT]);
  await pool.query(
    'update user_settings set default_hourly_rate=null where user_id=$1',
    [USER],
  );
  await seedEntry({ id: E(1) });

  const res = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'NO_RATE_CONFIGURED');
  assert.deepEqual(res.body.details.unratedEntryIds, [E(1)]);

  const { rows } = await pool.query(
    'select next_invoice_number n from user_settings where user_id=$1',
    [USER],
  );
  assert.equal(rows[0].n, 1, 'a refused generation consumes no number');
});

test('generation refuses an empty period rather than issuing a zero invoice', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const res = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_PERIOD');
});

test('sequential generations produce gapless numbers', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const numbers: string[] = [];

  for (let i = 1; i <= 3; i++) {
    await seedEntry({ id: E(i), start: `2026-09-0${i}T09:00:00Z`, hours: 1 });
    const res = await json(
      await create(
        req('/invoices', {
          clientId: CLIENT,
          periodStart: `2026-09-0${i}`,
          periodEnd: `2026-09-0${i}`,
        }),
      ),
    );
    assert.equal(res.status, 201);
    numbers.push(res.body.invoiceNumber);
  }

  assert.deepEqual(numbers, ['INV-0001', 'INV-0002', 'INV-0003']);
});

test('entries billed on a DRAFT invoice stay editable', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await seedEntry({ id: E(1), hours: 1 });
  await create(req('/invoices', { clientId: CLIENT, ...PERIOD }));

  await pool.query('update time_entries set task_name=$1 where id=$2', [
    'Edited',
    E(1),
  ]);
  const { rows } = await pool.query(
    'select task_name from time_entries where id=$1',
    [E(1)],
  );
  assert.equal(rows[0].task_name, 'Edited');
});

test('tax from the client flows onto the invoice', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await pool.query('update clients set tax_rate=20 where id=$1', [CLIENT]);
  await seedEntry({ id: E(1), hours: 2 });

  const res = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(res.body.subtotal, 300);
  assert.equal(res.body.taxRate, 20);
  assert.equal(res.body.taxAmount, 60);
  assert.equal(res.body.total, 360);
});

test('grouping mode is applied and frozen onto the invoice', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await seedEntry({ id: E(1), task: 'Design', hours: 1 });
  await seedEntry({
    id: E(2),
    task: 'Design',
    start: '2026-09-11T09:00:00Z',
    hours: 1,
  });
  await seedEntry({
    id: E(3),
    task: 'Build',
    start: '2026-09-12T09:00:00Z',
    hours: 1,
  });

  const res = await json(
    await create(
      req('/invoices', {
        clientId: CLIENT,
        ...PERIOD,
        groupingMode: 'task',
      }),
    ),
  );
  assert.equal(res.body.groupingMode, 'task');
  assert.equal(res.body.lineItems.length, 2, 'the two Design entries merged');
  assert.equal(res.body.total, 450);
});

// ── status ─────────────────────────────────────────────────────────
test('status moves draft -> sent -> paid', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  const ctx = { params: Promise.resolve({ id: inv.body.id }) };

  const sent = await json(
    await setStatus(req('/s', { status: 'sent' }, 'PATCH'), ctx),
  );
  assert.equal(sent.body.status, 'sent');
  assert.ok(sent.body.sentAt);

  const paid = await json(
    await setStatus(req('/s', { status: 'paid' }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(paid.body.status, 'paid');
  assert.ok(paid.body.paidAt);
});

test('an invoice cannot return to draft once issued', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  await setStatus(req('/s', { status: 'sent' }, 'PATCH'), {
    params: Promise.resolve({ id: inv.body.id }),
  });
  const back = await json(
    await setStatus(req('/s', { status: 'draft' }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );

  assert.equal(back.status, 422);
  assert.equal(back.body.code, 'VALIDATION_FAILED');
});

test('voiding releases the entries so they can be re-billed', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  await setStatus(req('/s', { status: 'sent' }, 'PATCH'), {
    params: Promise.resolve({ id: inv.body.id }),
  });
  const voided = await json(
    await setStatus(req('/s', { status: 'void' }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(voided.body.status, 'void');

  const { rows } = await pool.query(
    'select invoice_id from time_entries where id=$1',
    [E(1)],
  );
  assert.equal(rows[0].invoice_id, null, 'the entry is free again');

  // And the voided number stays on record, so numbering has no gap.
  const { rows: inv2 } = await pool.query(
    'select invoice_number from invoices where id=$1',
    [inv.body.id],
  );
  assert.equal(inv2[0].invoice_number, 'INV-0001');
});

// ── deletion ───────────────────────────────────────────────────────
test('a draft can be deleted and releases its entries', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { DELETE: del } = await import(
    '../src/app/api/v1/invoices/[id]/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  const res = await json(
    await del(req('/i', undefined, 'DELETE'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(res.status, 204);

  const { rows } = await pool.query(
    'select invoice_id from time_entries where id=$1',
    [E(1)],
  );
  assert.equal(rows[0].invoice_id, null);
});

test('an issued invoice cannot be deleted — it must be voided', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { DELETE: del } = await import(
    '../src/app/api/v1/invoices/[id]/route.ts'
  );
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  await setStatus(req('/s', { status: 'sent' }, 'PATCH'), {
    params: Promise.resolve({ id: inv.body.id }),
  });
  const res = await json(
    await del(req('/i', undefined, 'DELETE'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );

  assert.equal(res.status, 422);
  assert.match(res.body.message, /void it instead/);
});

// ── detail & listing ───────────────────────────────────────────────
test('detail returns the frozen line items with the client', async () => {
  const { POST: create, GET: list } = await import(
    '../src/app/api/v1/invoices/route.ts'
  );
  const { GET: detail } = await import(
    '../src/app/api/v1/invoices/[id]/route.ts'
  );
  await seedEntry({ id: E(1), task: 'Design', hours: 2 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  const res = await json(
    await detail(req('/i'), { params: Promise.resolve({ id: inv.body.id }) }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.client.name, 'Northwind');
  assert.equal(res.body.lineItems.length, 1);
  assert.equal(res.body.lineItems[0].quantityHours, 2);
  assert.equal(res.body.lineItems[0].resolvedRate, 150);

  const all = await json(await list(req('/invoices', undefined, 'GET')));
  assert.equal(all.body.invoices.length, 1);
});

test('a missing invoice is 404', async () => {
  const { GET: detail } = await import(
    '../src/app/api/v1/invoices/[id]/route.ts'
  );
  const res = await json(
    await detail(req('/i'), {
      params: Promise.resolve({ id: 'ff000000-0000-4000-8000-0000000000ff' }),
    }),
  );
  assert.equal(res.status, 404);
});

// ── pdf ────────────────────────────────────────────────────────────
test('the PDF renders from the frozen line items', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { GET: pdf } = await import(
    '../src/app/api/v1/invoices/[id]/pdf/route.ts'
  );
  await seedEntry({ id: E(1), task: 'Design work', hours: 2 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  const res = await pdf(req('/pdf'), {
    params: Promise.resolve({ id: inv.body.id }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition') ?? '', /INV-0001\.pdf/);

  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(
    bytes.length > 1000,
    `expected a real PDF, got ${bytes.length} bytes`,
  );
  assert.deepEqual(
    [...bytes.slice(0, 5)],
    [0x25, 0x50, 0x44, 0x46, 0x2d],
    'starts with %PDF-',
  );
});

// ── marking sent ───────────────────────────────────────────────────
// The app does not email invoices; `PATCH /status` is how a user records
// that they sent one themselves.
test('an invoice is marked sent through the status route', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  const sent = await json(
    await setStatus(req('/s', { status: 'sent' }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(sent.body.status, 'sent');
  assert.ok(sent.body.sentAt);
});

test('a send date can be backdated', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  const when = '2026-09-05T14:00:00.000Z';
  const sent = await json(
    await setStatus(req('/s', { status: 'sent', sentAt: when }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(new Date(sent.body.sentAt).toISOString(), when);
});

// ── payment details ────────────────────────────────────────────────
test('an invoice freezes the payment profile at generation', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { GET: detail } = await import(
    '../src/app/api/v1/invoices/[id]/route.ts'
  );

  await pool.query(
    `insert into payment_profiles (id,user_id,name,is_default,account_holder_name,
       bank_name,account_number,routing_number,account_type)
     values ($1,$2,'USD ACH',true,'Blake Eriks','First Republic','1234567890','021000021','checking')`,
    ['dd000000-0000-4000-8000-000000000001', USER],
  );
  await seedEntry({ id: E(1), hours: 1 });

  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(inv.status, 201);

  const { rows } = await pool.query(
    'select payment_details from invoices where id=$1',
    [inv.body.id],
  );
  const frozen = rows[0].payment_details;
  assert.ok(frozen, 'the snapshot is written at generation');
  assert.equal(frozen.title, 'USD ACH');
  // JSONB comes back untyped from pg.
  type Field = { label: string; value: string };
  const labels = (frozen.fields as Field[]).map((f) => f.label);
  assert.deepEqual(labels, [
    'Account holder',
    'Bank',
    'Account number',
    'Routing number (ACH)',
    'Account type',
    'Payment reference',
  ]);
  assert.equal(
    (frozen.fields as Field[]).find((f) => f.label === 'Payment reference')!
      .value,
    'INV-0001',
    'the invoice number is the reference',
  );

  // Changing the profile must not alter an issued invoice.
  await pool.query(
    `update payment_profiles set account_number='9999999999' where id=$1`,
    ['dd000000-0000-4000-8000-000000000001'],
  );
  const after = await json(
    await detail(req('/i'), { params: Promise.resolve({ id: inv.body.id }) }),
  );
  const acct = (after.body.paymentDetails.fields as Field[]).find(
    (f) => f.label === 'Account number',
  )!;
  assert.equal(acct.value, '1234567890', 'the frozen snapshot did not move');
});

test('a client profile preference overrides the user default', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');

  await pool.query(
    `insert into payment_profiles (id,user_id,name,is_default,account_number)
     values ($1,$2,'Default',true,'111'), ($3,$2,'EUR wire',false,'222')`,
    [
      'dd000000-0000-4000-8000-000000000001',
      USER,
      'dd000000-0000-4000-8000-000000000002',
    ],
  );
  await pool.query('update clients set payment_profile_id=$1 where id=$2', [
    'dd000000-0000-4000-8000-000000000002',
    CLIENT,
  ]);
  await seedEntry({ id: E(1), hours: 1 });

  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  const { rows } = await pool.query(
    'select payment_details from invoices where id=$1',
    [inv.body.id],
  );
  assert.equal(rows[0].payment_details.title, 'EUR wire');
});

test('an invoice generates fine with no payment profile configured', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await seedEntry({ id: E(1), hours: 1 });

  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(inv.status, 201, 'payment details are useful, not required');

  const { rows } = await pool.query(
    'select payment_details from invoices where id=$1',
    [inv.body.id],
  );
  assert.equal(rows[0].payment_details, null);
});

test('only one payment profile can be the default', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );

  const first = await json(
    await createProfile(req('/pp', { name: 'ACH', accountNumber: '111' })),
  );
  assert.equal(first.status, 201);
  assert.equal(
    first.body.isDefault,
    true,
    'the first profile becomes the default',
  );

  const second = await json(
    await createProfile(
      req('/pp', { name: 'Wire', accountNumber: '222', isDefault: true }),
    ),
  );
  assert.equal(second.status, 201);

  const { rows } = await pool.query(
    'select count(*)::int n from payment_profiles where is_default and archived_at is null',
  );
  assert.equal(rows[0].n, 1, 'the partial unique index holds');
});

test('the PDF renders the payment block', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { GET: pdf } = await import(
    '../src/app/api/v1/invoices/[id]/pdf/route.ts'
  );

  await pool.query(
    `insert into payment_profiles (id,user_id,name,is_default,account_number,routing_number)
     values ($1,$2,'USD ACH',true,'1234567890','021000021')`,
    ['dd000000-0000-4000-8000-000000000001', USER],
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );

  const res = await pdf(req('/pdf'), {
    params: Promise.resolve({ id: inv.body.id }),
  });
  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(bytes.length > 1000);
});
