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
    res.body.lineItems[0].unitPrice,
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

/* The period is local dates, and the entries are instants. With a UTC window
   these two sit outside a September period for a New York user even though
   both were worked in September on the clock the user read — the late one
   is 2026-10-01T00:00Z, the early one 2026-08-31T23:00Z.

   The failure was silent: the entry stayed unbilled, the preview agreed with
   the invoice, and nothing said an hour had gone missing. */
test('the period window is resolved in the caller timezone, not UTC', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  // 20:00 on the last day of the period, New York.
  await seedEntry({ id: E(1), task: 'Late', start: '2026-10-01T00:00:00Z' });
  // 19:00 the evening BEFORE the period starts, New York — must stay out.
  await seedEntry({ id: E(2), task: 'Early', start: '2026-08-31T23:00:00Z' });

  const res = await json(
    await preview(
      req('/invoices/preview', {
        clientId: CLIENT,
        ...PERIOD,
        tz: 'America/New_York',
        groupingMode: 'entry',
      }),
    ),
  );

  assert.equal(res.status, 200);
  const tasks = res.body.lineItems.map(
    (li: { description: string }) => li.description,
  );
  assert.deepEqual(tasks, ['Late'], 'includes the local-September entry only');
  assert.equal(res.body.entryCount, 1);
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

/* The zone decides which entries land on the invoice, so a typo cannot be
   coerced to UTC — that would move the period boundary by hours and bill the
   wrong work. It used to reach `Intl` and 500. */
test('an invalid timezone is rejected on both preview and generation', async () => {
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const body = { clientId: CLIENT, ...PERIOD, tz: 'Mars/Olympus_Mons' };

  for (const route of [preview, create]) {
    const res = await json(await route(req('/invoices', body)));
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION_FAILED');
  }
});

// ── generation ─────────────────────────────────────────────────────
/* The same boundary the preview test covers, on the route that actually
   bills: a preview honouring `tz` while generation did not would issue an
   invoice the user never approved. */
test('generation resolves the period in the caller timezone too', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  // 20:00 on the last day of the period, New York.
  await seedEntry({ id: E(1), task: 'Late', start: '2026-10-01T00:00:00Z' });
  // 19:00 the evening BEFORE it starts — must stay out.
  await seedEntry({ id: E(2), task: 'Early', start: '2026-08-31T23:00:00Z' });

  const res = await json(
    await create(
      req('/invoices', { clientId: CLIENT, ...PERIOD, tz: 'America/New_York' }),
    ),
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.entryCount, 1);
  assert.deepEqual(
    res.body.lineItems.map((li: { description: string }) => li.description),
    ['Late'],
  );

  const { rows } = await pool.query(
    'select invoice_id from time_entries where id=$1',
    [E(2)],
  );
  assert.equal(rows[0].invoice_id, null, 'the August entry stays unbilled');
});

// ── charges that are not time ───────────────────────────────────────
test('an invoice of one charge and no time generates', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  // No entries at all: a deposit taken before any work is done.
  const res = await json(
    await create(
      req('/invoices', {
        clientId: CLIENT,
        ...PERIOD,
        manualLines: [{ description: 'Project deposit', amount: 2400 }],
      }),
    ),
  );

  assert.equal(res.status, 201, 'generation does not require time');
  assert.equal(res.body.total, 2400);
  assert.equal(res.body.entryCount, 0);

  const { rows } = await pool.query(
    'select description, unit, quantity, unit_price, amount from invoice_line_items where invoice_id=$1',
    [res.body.id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'Project deposit');
  assert.equal(rows[0].unit, 'fixed');
  assert.equal(Number(rows[0].quantity), 1);
  assert.equal(Number(rows[0].amount), 2400);
});

test('a charge is billed alongside time, after it', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  await seedEntry({ id: E(1), task: 'Design', hours: 2 });

  const res = await json(
    await create(
      req('/invoices', {
        clientId: CLIENT,
        ...PERIOD,
        manualLines: [{ description: 'Stock photos', amount: 49 }],
      }),
    ),
  );

  assert.equal(res.status, 201);
  assert.deepEqual(
    res.body.lineItems.map((li: { description: string }) => li.description),
    ['Design', 'Stock photos'],
    'the charge follows the work',
  );
  assert.equal(res.body.total, 349, '2h at 150 plus the charge');

  // The time entry is still locked; the charge has no entry to lock.
  const { rows } = await pool.query(
    'select invoice_id from time_entries where id=$1',
    [E(1)],
  );
  assert.equal(rows[0].invoice_id, res.body.id);
});

test('a charge cannot be blank or negative', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');

  for (const bad of [
    { description: '', amount: 100 },
    { description: '   ', amount: 100 },
    { description: 'Refund', amount: -50 },
  ]) {
    const res = await json(
      await create(
        req('/invoices', { clientId: CLIENT, ...PERIOD, manualLines: [bad] }),
      ),
    );
    assert.equal(
      res.status,
      422,
      `${JSON.stringify(bad)} must be rejected at the edge`,
    );
    assert.equal(res.body.code, 'VALIDATION_FAILED');
  }
});

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
    'select description, unit, quantity, unit_price, amount from invoice_line_items where invoice_id=$1',
    [res.body.id],
  );
  assert.equal(items.length, 1);
  assert.equal(
    Number(items[0].unit_price),
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
  assert.equal(res.body.lineItems[0].quantity, 2);
  assert.equal(res.body.lineItems[0].unitPrice, 150);

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

/* The date the money actually arrived, not the date the user happened to
   click "mark paid" — otherwise `paid_at` measures the user's habits rather
   than the client's payment behaviour, and every average built on it
   (days-to-pay, collected-by-month) is wrong. */
test('a paid date can be backdated to any time after it was sent', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  // Backdate the send too, so a paid date well before "now" still lands
  // after it — sending and paying can both be recorded after the fact.
  await setStatus(
    req('/s', { status: 'sent', sentAt: '2026-09-01T00:00:00.000Z' }, 'PATCH'),
    { params: Promise.resolve({ id: inv.body.id }) },
  );

  const when = '2026-09-03T00:00:00.000Z';
  const paid = await json(
    await setStatus(req('/s', { status: 'paid', paidAt: when }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(paid.body.status, 'paid');
  assert.equal(new Date(paid.body.paidAt).toISOString(), when);
});

test('an unspecified paid date falls back to now', async () => {
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

  const before = Date.now();
  const paid = await json(
    await setStatus(req('/s', { status: 'paid' }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  const paidAt = new Date(paid.body.paidAt).getTime();
  assert.ok(paidAt >= before && paidAt <= Date.now());
});

/* A payment cannot be recorded as arriving before the invoice was even
   sent — that would report a negative days-to-pay, and the only way to
   produce one client-side would be an interface bug, not a real payment. */
test('a paid date earlier than the invoice was sent is rejected', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { PATCH: setStatus } = await import(
    '../src/app/api/v1/invoices/[id]/status/route.ts'
  );
  await seedEntry({ id: E(1), hours: 1 });
  const inv = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  await setStatus(
    req('/s', { status: 'sent', sentAt: '2026-09-10T00:00:00.000Z' }, 'PATCH'),
    { params: Promise.resolve({ id: inv.body.id }) },
  );

  const res = await json(
    await setStatus(
      req(
        '/s',
        { status: 'paid', paidAt: '2026-09-05T00:00:00.000Z' },
        'PATCH',
      ),
      { params: Promise.resolve({ id: inv.body.id }) },
    ),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
});

/* A payment cannot be recorded as arriving in the future — the date field
   is a record of what already happened, not a reminder to set. */
test('a paid date in the future is rejected', async () => {
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

  const future = new Date(Date.now() + 24 * 3600_000).toISOString();
  const res = await json(
    await setStatus(req('/s', { status: 'paid', paidAt: future }, 'PATCH'), {
      params: Promise.resolve({ id: inv.body.id }),
    }),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
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

/**
 * The `[id]` handlers had no tests at all until now, and PATCH is the one
 * that costs money: it is the only path that can change which bank details
 * an invoice renders.
 */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

test('a profile can be read back by id', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { GET } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const made = await json(
    await createProfile(
      req('/pp', { name: 'ACH', accountNumber: '111', routingNumber: '999' }),
    ),
  );
  const got = await json(await GET(req('/pp'), ctx(made.body.id)));

  assert.equal(got.status, 200);
  assert.equal(got.body.name, 'ACH');
  /* The camelCase boundary is `rows.ts`, and nothing type-checks it for
     payment profiles — a renamed column surfaces as undefined here. */
  assert.equal(got.body.accountNumber, '111');
  assert.equal(got.body.routingNumber, '999');
});

test('an unknown profile id is 404, not an empty 200', async () => {
  const { GET } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );
  const res = await json(
    await GET(req('/pp'), ctx('018f0000-0000-7000-8000-0000000000ff')),
  );
  assert.equal(res.status, 404);
});

test('promoting a profile demotes the one that was default', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { PATCH } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const ach = await json(
    await createProfile(req('/pp', { name: 'ACH', accountNumber: '111' })),
  );
  const wire = await json(
    await createProfile(req('/pp', { name: 'Wire', accountNumber: '222' })),
  );
  assert.equal(ach.body.isDefault, true, 'the first profile is the default');
  assert.equal(wire.body.isDefault, false);

  const promoted = await json(
    await PATCH(req('/pp', { isDefault: true }, 'PATCH'), ctx(wire.body.id)),
  );
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.isDefault, true);

  /* Exactly one, and it is the RIGHT one. Asserting only the count would
     pass if the handler demoted both and promoted neither. */
  const { rows } = await pool.query(
    'select id from payment_profiles where is_default and archived_at is null',
  );
  assert.equal(rows.length, 1, 'promoting demotes the previous default');
  assert.equal(rows[0].id, wire.body.id);
});

test('editing a profile leaves an already-issued invoice alone', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { PATCH } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );
  const { POST: createInvoice } = await import(
    '../src/app/api/v1/invoices/route.ts'
  );

  const profile = await json(
    await createProfile(
      req('/pp', { name: 'ACH', accountNumber: '111', routingNumber: '999' }),
    ),
  );
  await seedEntry({ id: E(1) });
  const inv = await json(
    await createInvoice(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(inv.status, 201);

  await PATCH(
    req('/pp', { accountNumber: '222', routingNumber: '888' }, 'PATCH'),
    ctx(profile.body.id),
  );

  /* The frozen snapshot is the whole point: the client was told to pay
     account 111, and re-downloading the PDF a year later must still say so. */
  const { rows } = await pool.query(
    'select payment_details from invoices where id=$1',
    [inv.body.id],
  );
  type Field = { label: string; value: string };
  const value = (label: string) =>
    (rows[0].payment_details.fields as Field[]).find((f) => f.label === label)
      ?.value;
  assert.equal(value('Account number'), '111');
  assert.equal(value('Routing number (ACH)'), '999');
});

test('archiving the default hands the default to a survivor', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { DELETE } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const ach = await json(
    await createProfile(req('/pp', { name: 'ACH', accountNumber: '111' })),
  );
  await createProfile(req('/pp', { name: 'Wire', accountNumber: '222' }));

  const res = await DELETE(req('/pp', undefined, 'DELETE'), ctx(ach.body.id));
  assert.equal(res.status, 204);

  /* Archiving the default cleared `is_default` and stopped there, leaving a
     user with a live profile and no default — so `loadPaymentProfile` fell
     through to null and the next invoice rendered no bank details at all.
     One profile left means it is the default; there is nothing to choose. */
  const { rows } = await pool.query(
    'select id, is_default from payment_profiles where archived_at is null',
  );
  assert.equal(rows.length, 1, 'the survivor is still live');
  assert.equal(
    rows[0].is_default,
    true,
    'a lone surviving profile is the default',
  );
});

test('the last profile cannot be un-defaulted into silence', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { PATCH } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const only = await json(
    await createProfile(req('/pp', { name: 'ACH', accountNumber: '111' })),
  );

  await json(
    await PATCH(req('/pp', { isDefault: false }, 'PATCH'), ctx(only.body.id)),
  );

  /* PATCH must not take away the guarantee `POST` makes. */
  const { rows } = await pool.query(
    'select count(*)::int n from payment_profiles where is_default and archived_at is null',
  );
  assert.equal(rows[0].n, 1, 'the only profile stays the default');
});

test('the list excludes archived profiles unless asked', async () => {
  const { POST: createProfile, GET: list } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { DELETE } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const ach = await json(
    await createProfile(req('/pp', { name: 'ACH', accountNumber: '111' })),
  );
  await createProfile(req('/pp', { name: 'Wire', accountNumber: '222' }));
  await DELETE(req('/pp', undefined, 'DELETE'), ctx(ach.body.id));

  const live = await json(await list(req('/payment-profiles')));
  assert.equal(live.status, 200);
  assert.deepEqual(
    live.body.paymentProfiles.map((p: { name: string }) => p.name),
    ['Wire'],
  );

  const all = await json(
    await list(req('/payment-profiles?includeArchived=true')),
  );
  assert.equal(all.body.paymentProfiles.length, 2);
});

test('the default sorts first, then by name', async () => {
  const { POST: createProfile, GET: list } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );

  // Created in an order that neither alphabetical nor insertion order fixes.
  await createProfile(req('/pp', { name: 'Zelle', accountNumber: '111' }));
  await createProfile(req('/pp', { name: 'ACH', accountNumber: '222' }));
  await createProfile(req('/pp', { name: 'Mercury', accountNumber: '333' }));

  /* Zelle was created first, so it is the default and leads despite sorting
     last alphabetically — the picker's first entry is the one that applies
     when nothing is chosen. */
  const res = await json(await list(req('/payment-profiles')));
  assert.deepEqual(
    res.body.paymentProfiles.map((p: { name: string }) => p.name),
    ['Zelle', 'ACH', 'Mercury'],
  );
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

test('the invoice detail response matches what the browser expects', async () => {
  const { POST: create } = await import('../src/app/api/v1/invoices/route.ts');
  const { GET: getInvoice } = await import(
    '../src/app/api/v1/invoices/[id]/route.ts'
  );
  await seedEntry({ id: E(1), task: 'Design', hours: 2 });

  const made = await json(
    await create(req('/invoices', { clientId: CLIENT, ...PERIOD })),
  );
  assert.equal(made.status, 201);

  const res = await json(
    await getInvoice(req(`/invoices/${made.body.id}`), {
      params: Promise.resolve({ id: made.body.id }),
    }),
  );
  assert.equal(res.status, 200);

  /* THE SHAPE, not just the values. This route shipped returning the invoice
     FLAT while `api.ts` declared `{ invoice, lineItems, client }`, so
     `data.invoice.status` threw and every invoice detail page rendered the
     error boundary. Nothing caught it: the route tests never asserted the
     envelope, and the UI test stubbed the same wrong shape the component
     read, so both were wrong together and passed.

     Asserting the contract here is what makes that class of bug impossible
     to reintroduce silently. */
  assert.equal(
    res.body.invoice,
    undefined,
    'the invoice is flat, matching every other detail route',
  );
  assert.equal(typeof res.body.invoiceNumber, 'string');
  assert.equal(typeof res.body.status, 'string');
  assert.ok(Array.isArray(res.body.lineItems), 'line items travel alongside');
  assert.equal(typeof res.body.client?.name, 'string', 'so does the client');

  /* A frozen line has no `rateSource`: it is read back from the database and
     there is no `rate_source` column. The preview and generation paths do
     carry it, which is why the schema marks it optional — asserting the
     difference keeps that honest. */
  assert.equal(res.body.lineItems[0].rateSource, undefined);
  assert.equal(res.body.lineItems[0].unitPrice, 150);
});
