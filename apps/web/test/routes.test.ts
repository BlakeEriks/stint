/**
 * Integration tests for the route handlers.
 *
 * These call the REAL exported handlers against a REAL Postgres instance
 * with the real migrations applied, so triggers and the partial unique
 * index are genuinely exercised. Only the transport is substituted: a
 * supabase-js-shaped query builder stands in for PostgREST.
 *
 * Run with: node --test --experimental-strip-types apps/web/test/routes.test.ts
 * Requires DATABASE_URL pointing at a migrated database.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import util from 'node:util';
import pg from 'pg';
import { makeDb } from './shim.mjs';
import { fill } from './fill.ts';
import Stripe from 'stripe';
import { fakeStripe, subscription } from './fake-stripe.ts';
import { fakeFcm, serviceAccount, UNREGISTERED } from './fake-fcm.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
let pool: pg.Pool;

// Injected before importing the routes, so requireSession resolves to our shim.
(globalThis as any).__TEST_DB__ = null;

before(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into auth.users (id,email) values ($1,'me@test'),($2,'other@test')
                    on conflict do nothing`,
    [USER, OTHER],
  );
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  // A push the last test's write scheduled finishes before its rows go.
  await settled();
  await pool.query('delete from push_devices');
  await pool.query('delete from feedback');
  await pool.query('delete from subscriptions');
  await pool.query('update expenses set invoice_id = null');
  await pool.query('delete from expenses');
  // Detach first: the immutability trigger refuses to delete an entry that
  // is still billed on a non-draft invoice — which is the behavior under
  // test elsewhere, so the fixture works around it rather than disabling it.
  await pool.query('update time_entries set invoice_id = null');
  await pool.query('delete from time_entries');
  await pool.query('delete from invoices');
  await pool.query('delete from projects');
  await pool.query('delete from clients');
  await pool.query('delete from payment_profiles');
  await pool.query(
    `update user_settings set default_hourly_rate=100,
                    week_starts_on=1, next_invoice_number=1,
                    payment_terms_days=30, legacy_payment_terms=null,
                    -- Off, so a long fixture elsewhere does not also raise the
                    -- strange-duration row; its own tests set a threshold.
                    min_entry_seconds=null, max_entry_hours=null,
                    invoice_template='standard'
     where user_id=$1`,
    [USER],
  );
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
  // Billing starts unconfigured, as every deploy does; `configureBilling()`
  // turns it on per test.
  for (const k of STRIPE_ENV) delete process.env[k];
  stripeFake = fakeStripe();
  (globalThis as any).__TEST_STRIPE__ = stripeFake.client;
  // Push starts unconfigured too; `configurePush()` turns it on.
  delete process.env.FCM_SERVICE_ACCOUNT;
  fcmFake = fakeFcm();
  (globalThis as any).__TEST_FCM__ = fcmFake.fetch;
});

let fcmFake: ReturnType<typeof fakeFcm>;

/** Whatever the handlers scheduled with `after()`, finished. */
const settled = () =>
  Promise.all((globalThis as any).__AFTER__?.splice(0) ?? []);

const STRIPE_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
] as const;
const WEBHOOK_SECRET = 'whsec_test';
let stripeFake: ReturnType<typeof fakeStripe>;

const configureBilling = () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_unused';
  process.env.STRIPE_PRICE_ID = 'price_yearly';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
};

const req = (url: string, body?: unknown, method = 'GET') =>
  new Request(`http://t${url}`, {
    method: body ? 'POST' : method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

const json = async (r: Response) => ({
  status: r.status,
  body: r.status === 204 ? null : await r.json(),
});

// ── timer ──────────────────────────────────────────────────────────
test('start → current → stop round trip', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { GET: current } = await import(
    '../src/app/api/v1/timer/current/route.ts'
  );
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');

  const started = await json(
    await start(req('/timer/start', { taskName: 'Write tests' })),
  );
  assert.equal(started.status, 201);
  assert.equal(started.body.taskName, 'Write tests');
  assert.equal(started.body.endedAt, null, 'a started timer is running');

  const now = await json(await current(req('/timer/current')));
  assert.equal(now.status, 200);
  assert.equal(now.body.entry.id, started.body.id);
  assert.ok(now.body.serverTime, 'serverTime lets clients correct clock skew');

  const stopped = await json(await stop(req('/timer/stop', {})));
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.entry.id, started.body.id);
  assert.ok(stopped.body.entry.endedAt, 'stopping sets endedAt');
  assert.ok(stopped.body.entry.durationSeconds >= 0);

  const after = await json(await current(req('/timer/current')));
  assert.equal(after.body.entry, null, 'no timer running after stop');
});

test('stop leaves Unbilled where the running entry had it, as /stats has it', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // An hour at the user default of 100, unbilled while it runs.
  const startedAt = new Date(Date.now() - 3600 * 1000).toISOString();
  await start(req('/timer/start', { taskName: 'Billable', startedAt }));
  const before = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(
    before.body.unbilled.total,
    100,
    'a running entry is unbilled so far',
  );

  const endedAt = new Date(Date.parse(startedAt) + 3600 * 1000).toISOString();
  const stopped = await json(await stop(req('/timer/stop', { endedAt })));
  assert.equal(stopped.status, 200);
  assert.deepEqual(Object.keys(stopped.body).sort(), [
    'currency',
    'entry',
    'unbilled',
  ]);
  assert.equal(stopped.body.currency, 'USD');
  assert.equal(stopped.body.unbilled.total, 100, 'the stop moves nothing');

  const after = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(stopped.body.unbilled, after.body.unbilled);
});

test('a timer write returns what it changed, read after it, with ?include', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // A minute back, so the entry is today's in any hour of the UTC day.
  const startedAt = new Date(Date.now() - 60 * 1000).toISOString();
  const started = await json(
    await start(
      req('/timer/start?include=summary,stats&tz=UTC', {
        taskName: 'Included',
        startedAt,
      }),
    ),
  );
  assert.equal(started.status, 201);
  assert.equal(started.body.entry.taskName, 'Included');
  assert.equal(
    started.body.included.summary.running.id,
    started.body.entry.id,
    'the summary is read after the start',
  );
  assert.ok(started.body.included.summary.todaySeconds >= 60);
  const fresh = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(
    Object.keys(started.body.included.stats).sort(),
    Object.keys(fresh.body).sort(),
    'the included stats are /stats',
  );

  const stopped = await json(
    await stop(req('/timer/stop?include=summary&tz=UTC', {})),
  );
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.included.summary.running, null);
  assert.ok(stopped.body.included.summary.todaySeconds >= 60);
  assert.deepEqual(
    Object.keys(stopped.body.included),
    ['summary'],
    'only what was asked for',
  );
});

test('an entry PATCH returns what it changed with ?include', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { PATCH: patch } = await import(
    '../src/app/api/v1/entries/[id]/route.ts'
  );

  const id = '018f0000-0000-7000-8000-0000000000a1';
  const endedAt = new Date().toISOString();
  const startedAt = new Date(Date.now() - 3600 * 1000).toISOString();
  await create(
    req('/entries', { id, taskName: 'An hour', startedAt, endedAt }),
  );

  const plain = await json(
    await patch(req(`/entries/${id}`, { taskName: 'Renamed' }, 'PATCH'), {
      params: Promise.resolve({ id }),
    }),
  );
  assert.equal(plain.body.id, id, 'without include, the entry alone');

  const edited = await json(
    await patch(
      req(
        `/entries/${id}?include=stats&tz=UTC`,
        { isBillable: false },
        'PATCH',
      ),
      { params: Promise.resolve({ id }) },
    ),
  );
  assert.equal(edited.status, 200);
  assert.equal(edited.body.entry.isBillable, false);
  assert.equal(
    edited.body.included.stats.unbilled.total,
    0,
    'the stats are read after the edit',
  );
});

test('an unknown include is refused before the write', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );

  const refused = await json(
    await start(req('/timer/start?include=invoices&tz=UTC', { taskName: 'X' })),
  );
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'VALIDATION_FAILED');
  const { rows } = await pool.query(
    'select count(*)::int as n from time_entries',
  );
  assert.equal(rows[0].n, 0, 'nothing was started');
});

test('THE INVARIANT: a second start is rejected with 409 and returns the running entry', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );

  const first = await json(
    await start(req('/timer/start', { taskName: 'First' })),
  );
  assert.equal(first.status, 201);

  const second = await json(
    await start(req('/timer/start', { taskName: 'Second' })),
  );
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'TIMER_ALREADY_RUNNING');
  assert.equal(
    second.body.details.running.id,
    first.body.id,
    'the client gets the running entry, so it need not re-fetch',
  );
});

test('stopping when nothing runs is 409, not a silent success', async () => {
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');
  const res = await json(await stop(req('/timer/stop', {})));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'NO_TIMER_RUNNING');
});

test('a backdated stop before the start is rejected with a clear message', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');

  await start(
    req('/timer/start', { taskName: 'x', startedAt: '2026-09-11T12:00:00Z' }),
  );
  const res = await json(
    await stop(req('/timer/stop', { endedAt: '2026-09-11T11:00:00Z' })),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
});

test('a running timer can be retitled and reassigned mid-run', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { PATCH: patch } = await import(
    '../src/app/api/v1/timer/current/route.ts'
  );

  await start(req('/timer/start', { taskName: 'Old name' }));
  const res = await json(
    await patch(req('/timer/current', { taskName: 'New name' }, 'PATCH')),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.taskName, 'New name');
});

test("a start without isBillable takes the project's billable default", async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');
  const { POST: createProject } = await import(
    '../src/app/api/v1/projects/route.ts'
  );
  const { projectId: billable } = await seedClientAndProject();
  const internal = await json(
    await createProject(
      req('/projects', { name: 'Internal', isBillableDefault: false }),
    ),
  );

  const startOn = async (body: object) => {
    const res = await json(
      await start(
        req('/timer/start', {
          taskName: 'x',
          // Backdated, or a stop in the same millisecond is rejected as
          // ending at its start and the next start finds the timer running.
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          ...body,
        }),
      ),
    );
    await stop(req('/timer/stop', {}));
    return res.body.isBillable;
  };

  assert.equal(await startOn({ projectId: internal.body.id }), false);
  assert.equal(await startOn({ projectId: billable }), true);
  assert.equal(await startOn({}), true, 'no project stays billable');
  assert.equal(
    await startOn({ projectId: internal.body.id, isBillable: true }),
    true,
    'a sent flag wins over the default',
  );
});

// ── entries ────────────────────────────────────────────────────────
test('a manual entry replayed with the same id is idempotent', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const body = {
    id: '018f0000-0000-7000-8000-000000000001',
    taskName: 'Offline work',
    startedAt: '2026-09-11T09:00:00Z',
    endedAt: '2026-09-11T10:00:00Z',
  };

  const first = await json(await create(req('/entries', body)));
  assert.equal(first.status, 201);
  assert.equal(first.body.durationSeconds, 3600);

  const replay = await json(await create(req('/entries', body)));
  assert.equal(replay.status, 200, 'replay returns the existing entry');
  assert.equal(replay.body.id, first.body.id);

  const { rows } = await pool.query(
    'select count(*)::int as n from time_entries',
  );
  assert.equal(rows[0].n, 1, 'no duplicate was created');
});

test("a manual entry without isBillable takes the project's billable default", async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { POST: createProject } = await import(
    '../src/app/api/v1/projects/route.ts'
  );
  const { projectId: billable } = await seedClientAndProject();
  const internal = await json(
    await createProject(
      req('/projects', { name: 'Internal', isBillableDefault: false }),
    ),
  );

  let n = 10;
  const addOn = async (body: object) => {
    const res = await json(
      await create(
        req('/entries', {
          id: `018f0000-0000-7000-8000-0000000000${n++}`,
          taskName: 'x',
          startedAt: '2026-09-11T09:00:00Z',
          endedAt: '2026-09-11T10:00:00Z',
          ...body,
        }),
      ),
    );
    return res.body.isBillable;
  };

  assert.equal(await addOn({ projectId: internal.body.id }), false);
  assert.equal(await addOn({ projectId: billable }), true);
  assert.equal(await addOn({}), true, 'no project stays billable');
  assert.equal(
    await addOn({ projectId: internal.body.id, isBillable: true }),
    true,
    'a sent flag wins over the default',
  );
});

test('a manual entry ending before it starts is rejected', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const res = await json(
    await create(
      req('/entries', {
        id: '018f0000-0000-7000-8000-000000000002',
        taskName: 'bad',
        startedAt: '2026-09-11T10:00:00Z',
        endedAt: '2026-09-11T09:00:00Z',
      }),
    ),
  );
  assert.equal(res.status, 422);
});

test('editing an entry billed on a sent invoice returns 409 ENTRY_LOCKED', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { PATCH: patch, DELETE: del } = await import(
    '../src/app/api/v1/entries/[id]/route.ts'
  );

  const id = '018f0000-0000-7000-8000-000000000003';
  await create(
    req('/entries', {
      id,
      taskName: 'Billed',
      startedAt: '2026-09-11T09:00:00Z',
      endedAt: '2026-09-11T10:00:00Z',
    }),
  );

  await pool.query(`insert into clients (id,user_id,name) values ($1,$2,'C')`, [
    'cc000000-0000-4000-8000-000000000001',
    USER,
  ]);
  await pool.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status)
                    values ($1,$2,$3,'INV-0001',1,'sent')`,
    [
      'ff000000-0000-4000-8000-000000000001',
      USER,
      'cc000000-0000-4000-8000-000000000001',
    ],
  );
  await pool.query('update time_entries set invoice_id=$1 where id=$2', [
    'ff000000-0000-4000-8000-000000000001',
    id,
  ]);

  const ctx = { params: Promise.resolve({ id }) };
  const edit = await json(
    await patch(req(`/entries/${id}`, { taskName: 'Changed' }, 'PATCH'), ctx),
  );
  assert.equal(edit.status, 409);
  assert.equal(edit.body.code, 'ENTRY_LOCKED');

  const removed = await json(
    await del(req(`/entries/${id}`, undefined, 'DELETE'), {
      params: Promise.resolve({ id }),
    }),
  );
  assert.equal(removed.status, 409, 'deleting a billed entry is refused too');
  assert.equal(removed.body.code, 'ENTRY_LOCKED');
});

// ── billed elsewhere ───────────────────────────────────────────────
const BE = (n: number) =>
  `018f0000-0000-7000-8000-0000000be${String(n).padStart(3, '0')}`;
const BE_INVOICE = 'ff000000-0000-4000-8000-0000000be001';

/** Four of the user's entries on one project — two unbilled, one running,
 *  one on an invoice in `status` — and one of another user's. */
async function seedBilledElsewhere(status = 'sent') {
  const { clientId, projectId } = await seedClientAndProject();
  await pool.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status)
     values ($1,$2,$3,'INV-0001',1,$4)`,
    [BE_INVOICE, USER, clientId, status],
  );
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,invoice_id)
     values ($1,$6,$7,'One','2026-09-01T14:00:00Z','2026-09-01T15:00:00Z',null),
            ($2,$6,$7,'Two','2026-09-02T14:00:00Z','2026-09-02T16:00:00Z',null),
            ($3,$6,$7,'Running','2026-09-03T14:00:00Z',null,null),
            ($4,$6,$7,'Sent','2026-09-04T14:00:00Z','2026-09-04T15:00:00Z',$8),
            ($5,$9,null,'Theirs','2026-09-05T14:00:00Z','2026-09-05T15:00:00Z',null)`,
    [BE(1), BE(2), BE(3), BE(4), BE(5), USER, projectId, BE_INVOICE, OTHER],
  );
  return { clientId };
}

const flagged = async () =>
  (
    await pool.query(
      'select id from time_entries where invoiced_elsewhere order by id',
    )
  ).rows.map((r) => r.id);

test('billed elsewhere marks only the user’s finished, uninvoiced entries, and says which', async () => {
  const { POST } = await import(
    '../src/app/api/v1/entries/invoiced-elsewhere/route.ts'
  );
  await seedBilledElsewhere();

  const res = await json(
    await POST(
      req('/entries/invoiced-elsewhere', {
        ids: [BE(1), BE(2), BE(3), BE(4), BE(5)],
        invoicedElsewhere: true,
      }),
    ),
  );
  assert.equal(res.status, 200);
  assert.deepEqual([...res.body.ids].sort(), [BE(1), BE(2)]);
  assert.deepEqual(await flagged(), [BE(1), BE(2)]);
});

test('work marked billed elsewhere leaves Unbilled and the next invoice', async () => {
  const { POST } = await import(
    '../src/app/api/v1/entries/invoiced-elsewhere/route.ts'
  );
  const { POST: preview } = await import(
    '../src/app/api/v1/invoices/preview/route.ts'
  );
  const { clientId } = await seedBilledElsewhere();
  // Unbilled counts a running timer live, so it would move under the test.
  await pool.query('delete from time_entries where id = $1', [BE(3)]);
  const period = {
    clientId,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    tz: 'America/New_York',
  };
  const unbilled = async () =>
    (
      await pool.query(
        'select coalesce(sum(seconds),0)::int s from unbilled_by_client($1)',
        [USER],
      )
    ).rows[0].s;

  const before = await json(await preview(req('/invoices/preview', period)));
  assert.equal(before.body.entryCount, 2);
  assert.equal(await unbilled(), 3 * 3600);

  await POST(
    req('/entries/invoiced-elsewhere', {
      ids: [BE(1), BE(2)],
      invoicedElsewhere: true,
    }),
  );
  const after = await json(await preview(req('/invoices/preview', period)));
  assert.equal(after.body.entryCount, 0);
  assert.equal(await unbilled(), 0);
});

test('clearing billed elsewhere puts exactly those entries back', async () => {
  const { POST } = await import(
    '../src/app/api/v1/entries/invoiced-elsewhere/route.ts'
  );
  await seedBilledElsewhere();
  await pool.query(
    'update time_entries set invoiced_elsewhere = true where id = any($1)',
    [[BE(1), BE(2), BE(5)]],
  );

  const res = await json(
    await POST(
      req('/entries/invoiced-elsewhere', {
        ids: [BE(1), BE(5)],
        invoicedElsewhere: false,
      }),
    ),
  );
  assert.deepEqual(res.body.ids, [BE(1)]);
  assert.deepEqual(
    await flagged(),
    [BE(2), BE(5)],
    'another user’s entry is not cleared',
  );
});

test('billed elsewhere refuses an empty list', async () => {
  const { POST } = await import(
    '../src/app/api/v1/entries/invoiced-elsewhere/route.ts'
  );
  const res = await json(
    await POST(
      req('/entries/invoiced-elsewhere', { ids: [], invoicedElsewhere: true }),
    ),
  );
  assert.equal(res.status, 422);
});

test('an entry is marked or cleared billed elsewhere by its PATCH', async () => {
  const { PATCH } = await import('../src/app/api/v1/entries/[id]/route.ts');
  await seedBilledElsewhere();

  const marked = await json(
    await PATCH(
      req(`/entries/${BE(1)}`, { invoicedElsewhere: true }, 'PATCH'),
      ctx(BE(1)),
    ),
  );
  assert.equal(marked.status, 200);
  assert.equal(marked.body.invoicedElsewhere, true);

  const cleared = await json(
    await PATCH(
      req(`/entries/${BE(1)}`, { invoicedElsewhere: false }, 'PATCH'),
      ctx(BE(1)),
    ),
  );
  assert.equal(cleared.body.invoicedElsewhere, false);
});

test('marking a running timer billed elsewhere is refused by its PATCH: TIMER_ALREADY_RUNNING', async () => {
  const { PATCH } = await import('../src/app/api/v1/entries/[id]/route.ts');
  await seedBilledElsewhere();

  const res = await json(
    await PATCH(
      req(`/entries/${BE(3)}`, { invoicedElsewhere: true }, 'PATCH'),
      ctx(BE(3)),
    ),
  );
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'TIMER_ALREADY_RUNNING');
  assert.deepEqual(await flagged(), []);
});

/* Both orders of a mark racing an invoice: the routes filter out an entry
   already attached, and the database refuses to attach one already marked,
   which an invoice's read-then-attach would otherwise do. */
test('an entry billed elsewhere can’t be attached to an invoice: ENTRY_ALREADY_INVOICED', async () => {
  const { dbCode } = await import('../src/lib/errors.ts');
  await seedBilledElsewhere();
  await pool.query(
    'update time_entries set invoiced_elsewhere = true where id = $1',
    [BE(1)],
  );

  const refused = await pool
    .query('update time_entries set invoice_id = $1 where id = $2', [
      BE_INVOICE,
      BE(1),
    ])
    .then(
      () => null,
      (e: Error) => e,
    );
  assert.ok(refused, 'the attach is refused');
  assert.equal(dbCode(refused), 'ENTRY_ALREADY_INVOICED');
});

test('marking an entry on a sent invoice billed elsewhere is ENTRY_ALREADY_INVOICED', async () => {
  const { PATCH } = await import('../src/app/api/v1/entries/[id]/route.ts');
  await seedBilledElsewhere();

  const res = await json(
    await PATCH(
      req(`/entries/${BE(4)}`, { invoicedElsewhere: true }, 'PATCH'),
      ctx(BE(4)),
    ),
  );
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'ENTRY_ALREADY_INVOICED');
  assert.deepEqual(await flagged(), []);
});

test('reopening an entry while a timer runs is TIMER_ALREADY_RUNNING', async () => {
  const { PATCH: patch } = await import(
    '../src/app/api/v1/entries/[id]/route.ts'
  );
  const id = '018f0000-0000-7000-8000-000000000004';
  await pool.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at)
     values ($1,$2,'Done','2026-09-11T09:00:00Z','2026-09-11T10:00:00Z'),
            ($3,$2,'Running','2026-09-11T11:00:00Z',null)`,
    [id, USER, '018f0000-0000-7000-8000-000000000005'],
  );

  const reopen = await json(
    await patch(req(`/entries/${id}`, { endedAt: null }, 'PATCH'), {
      params: Promise.resolve({ id }),
    }),
  );
  assert.equal(reopen.status, 409);
  assert.equal(reopen.body.code, 'TIMER_ALREADY_RUNNING');
});

test('a missing entry is 404, not 500', async () => {
  const { GET: get } = await import('../src/app/api/v1/entries/[id]/route.ts');
  const id = '018f0000-0000-7000-8000-00000000dead';
  const res = await json(
    await get(req(`/entries/${id}`), { params: Promise.resolve({ id }) }),
  );
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'ENTRY_NOT_FOUND');
});

// ── summary ────────────────────────────────────────────────────────
test('summary folds the live timer into today and week totals', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { GET: summary } = await import('../src/app/api/v1/summary/route.ts');

  // This asserts on the UTC day, so both entries must START inside it — the
  // route counts an entry toward "today" by its start, and measures a
  // running entry's live portion against the server's real clock.
  //
  // Naive offsets break at the edges in both directions, which is how this
  // test failed in CI at 00:03 UTC: "two hours ago" was yesterday. A few
  // minutes past midnight UTC, "ten minutes ago" is yesterday too.
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const sinceDayStart = now.getTime() - dayStart.getTime();

  // Split whatever the day has elapsed so far: the completed entry sits in
  // the first half, the running one starts in the second. Both are then
  // inside the day and in the past, at any hour and in any zone.
  const half = Math.floor(sinceDayStart / 2);
  const completedStart = new Date(dayStart.getTime());
  const completedEnd = new Date(dayStart.getTime() + half);
  const completedSeconds = Math.floor(half / 1000);

  const runningStart = new Date(dayStart.getTime() + half);
  const liveSeconds = Math.floor(
    (now.getTime() - runningStart.getTime()) / 1000,
  );

  await create(
    req('/entries', {
      id: '018f0000-0000-7000-8000-000000000010',
      taskName: 'Earlier',
      startedAt: completedStart.toISOString(),
      endedAt: completedEnd.toISOString(),
    }),
  );
  await start(
    req('/timer/start', {
      taskName: 'Running',
      startedAt: runningStart.toISOString(),
    }),
  );

  const res = await json(await summary(req('/summary?tz=UTC')));
  assert.equal(res.status, 200);
  assert.ok(res.body.running, 'menu bar gets the running entry');
  const expected = completedSeconds + liveSeconds;
  assert.ok(
    res.body.todaySeconds >= expected - 10 &&
      res.body.todaySeconds <= expected + 10,
    `expected ~${expected}, got ${res.body.todaySeconds}`,
  );
  assert.ok(res.body.weekSeconds >= res.body.todaySeconds);
});

test('summary rejects a bogus timezone by falling back, not failing', async () => {
  const { GET: summary } = await import('../src/app/api/v1/summary/route.ts');
  const res = await json(await summary(req('/summary?tz=Not/AZone')));
  assert.equal(res.status, 200);
});

// ── clients & projects ─────────────────────────────────────────────
test('clients and projects create, list and archive', async () => {
  const { POST: createClient, GET: listClients } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { DELETE: archiveClient } = await import(
    '../src/app/api/v1/clients/[id]/route.ts'
  );
  const { POST: createProject, GET: listProjects } = await import(
    '../src/app/api/v1/projects/route.ts'
  );

  const c = await json(
    await createClient(req('/clients', { name: 'Northwind', hourlyRate: 150 })),
  );
  assert.equal(c.status, 201);
  assert.equal(
    c.body.hourlyRate,
    150,
    'numeric comes back as a number, not a string',
  );

  const p = await json(
    await createProject(
      req('/projects', {
        clientId: c.body.id,
        name: 'Lifecycle',
        hourlyRate: 175,
      }),
    ),
  );
  assert.equal(p.status, 201);
  assert.equal(p.body.clientId, c.body.id);

  const projects = await json(await listProjects(req('/projects')));
  assert.equal(projects.body.projects.length, 1);

  const archived = await json(
    await archiveClient(req(`/clients/${c.body.id}`, undefined, 'DELETE'), {
      params: Promise.resolve({ id: c.body.id }),
    }),
  );
  assert.equal(archived.status, 204);

  const active = await json(await listClients(req('/clients')));
  assert.equal(
    active.body.clients.length,
    0,
    'archived clients are hidden by default',
  );

  const all = await json(
    await listClients(req('/clients?includeArchived=true')),
  );
  assert.equal(
    all.body.clients.length,
    1,
    'but still retrievable — invoices reference them',
  );
});

/**
 * The `[id]` handlers for clients and projects. `req` above forces POST
 * whenever a body is present, so a PATCH is built directly.
 */
const patchReq = (url: string, body: unknown) =>
  new Request(`http://t${url}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

/** A client and a project on it, for the detail handlers to act on. */
async function seedClientAndProject() {
  const { POST: createClient } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { POST: createProject } = await import(
    '../src/app/api/v1/projects/route.ts'
  );
  const c = await json(
    await createClient(req('/clients', { name: 'Northwind', hourlyRate: 150 })),
  );
  const p = await json(
    await createProject(
      req('/projects', { clientId: c.body.id, name: 'Lifecycle' }),
    ),
  );
  return { clientId: c.body.id as string, projectId: p.body.id as string };
}

test('a client is read back by id, and 404s when unknown', async () => {
  const { GET } = await import('../src/app/api/v1/clients/[id]/route.ts');
  const { clientId } = await seedClientAndProject();

  const got = await json(await GET(req('/clients/x'), ctx(clientId)));
  assert.equal(got.status, 200);
  assert.equal(got.body.name, 'Northwind');
  // Numeric columns arrive from PostgREST as strings; `rows.ts` converts.
  assert.equal(got.body.hourlyRate, 150);

  const missing = await json(
    await GET(req('/clients/x'), ctx('cc000000-0000-4000-8000-0000000000ff')),
  );
  assert.equal(missing.status, 404);
});

test('a client patch changes only the fields it names', async () => {
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');
  const { clientId } = await seedClientAndProject();

  const res = await json(
    await PATCH(
      patchReq('/clients/x', { name: 'Northwind Ltd' }),
      ctx(clientId),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Northwind Ltd');
  /* The rate was not in the patch, so it must survive untouched — a
     converter that wrote every column would null it silently, and the next
     invoice would bill this client at the user's fallback rate instead. */
  assert.equal(res.body.hourlyRate, 150);
});

test('a client rate can be cleared to fall back, which is not the same as 0', async () => {
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');
  const { clientId } = await seedClientAndProject();

  const cleared = await json(
    await PATCH(patchReq('/clients/x', { hourlyRate: null }), ctx(clientId)),
  );
  assert.equal(cleared.body.hourlyRate, null, 'null means "fall back"');

  const zero = await json(
    await PATCH(patchReq('/clients/x', { hourlyRate: 0 }), ctx(clientId)),
  );
  /* `0` is a real rate — pro bono work billed at zero, not work that falls
     through to the user's default. Truthiness here would conflate them. */
  assert.equal(zero.body.hourlyRate, 0);
});

test('a patch naming no known field is rejected, not a silent no-op', async () => {
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');
  const { clientId } = await seedClientAndProject();

  const res = await json(
    await PATCH(patchReq('/clients/x', {}), ctx(clientId)),
  );
  assert.equal(res.status, 422);
});

/* The schedule sets a new invoice's period: a field the schema or the column
   list dropped would leave every client unscheduled, unseen. */
test('a client billing schedule round-trips, and is null until set', async () => {
  const { POST: createClient, GET: listClients } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');
  const weekly = { period: 'weekly', anchor: '2026-10-05' };

  const plain = await json(
    await createClient(req('/clients', { name: 'Northwind' })),
  );
  assert.equal(plain.body.billingSchedule, null);

  const semi = await json(
    await createClient(
      req('/clients', {
        name: 'Contoso',
        billingSchedule: { period: 'semimonthly' },
      }),
    ),
  );
  assert.deepEqual(semi.body.billingSchedule, { period: 'semimonthly' });

  const moved = await json(
    await PATCH(
      patchReq('/clients/x', { billingSchedule: weekly }),
      ctx(plain.body.id),
    ),
  );
  assert.deepEqual(moved.body.billingSchedule, weekly);

  const renamed = await json(
    await PATCH(
      patchReq('/clients/x', { name: 'Northwind Trading' }),
      ctx(plain.body.id),
    ),
  );
  assert.deepEqual(renamed.body.billingSchedule, weekly);

  const list = await json(await listClients(req('/clients')));
  assert.deepEqual(
    list.body.clients.map(
      (c: { billingSchedule: unknown }) => c.billingSchedule,
    ),
    [{ period: 'semimonthly' }, weekly],
  );

  const cleared = await json(
    await PATCH(
      patchReq('/clients/x', { billingSchedule: null }),
      ctx(plain.body.id),
    ),
  );
  assert.equal(cleared.body.billingSchedule, null);

  for (const bad of [
    { period: 'weekly' },
    { period: 'monthly', anchor: '2026-10-05' },
    { period: 'quarterly' },
  ]) {
    const refused = await json(
      await PATCH(
        patchReq('/clients/x', { billingSchedule: bad }),
        ctx(plain.body.id),
      ),
    );
    assert.equal(refused.status, 422, JSON.stringify(bad));
  }
});

/* A client's terms set its invoices' due dates: a field the schema or the
   column list dropped would put every client back on the user's. */
test('a client payment terms round-trip, and are null until set', async () => {
  const { POST: createClient } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');

  const plain = await json(
    await createClient(req('/clients', { name: 'Northwind' })),
  );
  assert.equal(plain.body.paymentTermsDays, null);

  const own = await json(
    await createClient(
      req('/clients', { name: 'Contoso', paymentTermsDays: 15 }),
    ),
  );
  assert.equal(own.body.paymentTermsDays, 15);

  const renamed = await json(
    await PATCH(
      patchReq('/clients/x', { name: 'Contoso Ltd' }),
      ctx(own.body.id),
    ),
  );
  assert.equal(renamed.body.paymentTermsDays, 15, 'omitted leaves it');

  const cleared = await json(
    await PATCH(
      patchReq('/clients/x', { paymentTermsDays: null }),
      ctx(own.body.id),
    ),
  );
  assert.equal(cleared.body.paymentTermsDays, null);

  for (const bad of [-1, 1.5, 366]) {
    const refused = await json(
      await PATCH(
        patchReq('/clients/x', { paymentTermsDays: bad }),
        ctx(own.body.id),
      ),
    );
    assert.equal(refused.status, 422, String(bad));
  }
});

/* Which payment profile a client's invoices carry: a field the route's schema
   must name, or Zod strips it and the write is silently lost. */
test('a client can be pointed at a payment profile, on create and on patch', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { POST: createClient } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');

  const a = await json(
    await createProfile(req('/payment-profiles', { name: 'Checking' })),
  );
  const b = await json(
    await createProfile(req('/payment-profiles', { name: 'Savings' })),
  );

  const created = await json(
    await createClient(
      req('/clients', { name: 'Northwind', paymentProfileId: a.body.id }),
    ),
  );
  assert.equal(created.body.paymentProfileId, a.body.id);

  const moved = await json(
    await PATCH(
      patchReq('/clients/x', { paymentProfileId: b.body.id }),
      ctx(created.body.id),
    ),
  );
  assert.equal(moved.body.paymentProfileId, b.body.id);
});

/* `.partial()` keeps a `.default()`, so an update schema that inherits
   `isDefault` turns every unrelated PATCH into a demotion — and the next
   invoice then renders with no bank details. */
test('editing a default profile does not demote it', async () => {
  const { POST: createProfile } = await import(
    '../src/app/api/v1/payment-profiles/route.ts'
  );
  const { PATCH } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const first = await json(
    await createProfile(req('/payment-profiles', { name: 'Checking' })),
  );
  await createProfile(req('/payment-profiles', { name: 'Savings' }));
  assert.equal(first.body.isDefault, true, 'the first profile is the default');

  const renamed = await json(
    await PATCH(
      patchReq('/payment-profiles/x', { name: 'Business checking' }),
      ctx(first.body.id),
    ),
  );
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.isDefault, true);
});

/* Each detail the form sends is a column the insert must name; one left out
   is dropped without an error, and the invoice prints without it. */
test('a new payment profile stores every detail it is given', async () => {
  const { POST } = await import('../src/app/api/v1/payment-profiles/route.ts');
  const details = {
    accountHolderName: 'Ada Lovelace',
    accountHolderAddress: '1 Main St, Springfield, IL',
    bankName: 'First Bank',
    bankAddress: '2 Bank St, Chicago, IL',
    accountNumber: '000123456789',
    routingNumber: '021000021',
    accountType: 'checking',
    iban: 'DE89370400440532013000',
    swiftBic: 'FBNKUS33',
    localCodeLabel: 'Sort code',
    localCode: '12-34-56',
    intermediaryBankName: 'Middle Bank',
    intermediarySwiftBic: 'MIDLUS33',
    intermediaryAccountNumber: '987654321',
    paymentLinkLabel: 'Pay online',
    paymentLinkUrl: 'https://pay.example.com/ada',
    currency: 'USD',
    feeAllocation: 'SHA',
    notes: 'Reference the invoice number.',
  };

  const res = await json(
    await POST(req('/payment-profiles', { name: 'Checking', ...details })),
  );
  assert.equal(res.status, 201);
  for (const [field, value] of Object.entries(details)) {
    assert.equal(res.body[field], value, field);
  }
});

/* A malformed routing number on an invoice risks a returned or misrouted
   ACH payment, and nothing downstream checks it again. */
test('a routing number that fails the ABA check is refused, on create and edit', async () => {
  const { POST } = await import('../src/app/api/v1/payment-profiles/route.ts');
  const { PATCH } = await import(
    '../src/app/api/v1/payment-profiles/[id]/route.ts'
  );

  const refused = await json(
    await POST(
      req('/payment-profiles', {
        name: 'Checking',
        routingNumber: '021000022',
      }),
    ),
  );
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'VALIDATION_FAILED');

  const saved = await json(
    await POST(req('/payment-profiles', { name: 'Checking' })),
  );
  const edited = await json(
    await PATCH(
      patchReq('/payment-profiles/x', { routingNumber: '02100002' }),
      ctx(saved.body.id),
    ),
  );
  assert.equal(edited.status, 422);
  assert.equal(edited.body.code, 'VALIDATION_FAILED');
});

test('a routing number is stored as its 9 digits', async () => {
  const { POST } = await import('../src/app/api/v1/payment-profiles/route.ts');

  const res = await json(
    await POST(
      req('/payment-profiles', {
        name: 'Checking',
        routingNumber: ' 021-000-021 ',
      }),
    ),
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.routingNumber, '021000021');
});

/* The route strips and checks it, but a write that skips the route (an
   import, the seed) would print whatever it stored. */
test('the database refuses a routing number that is not 9 digits', async () => {
  await assert.rejects(
    () =>
      pool.query(
        `insert into payment_profiles (user_id,name,routing_number)
         values ($1,'Checking','-031101334,')`,
        [USER],
      ),
    /payment_profiles_routing_number_digits/,
  );
});

test('a payment profile replayed with the same id is idempotent', async () => {
  const { POST } = await import('../src/app/api/v1/payment-profiles/route.ts');
  const body = {
    id: '33333333-0000-4000-8000-0000000000a1',
    name: 'Checking',
    bankName: 'First Bank',
  };

  const first = await json(await POST(req('/payment-profiles', body)));
  const replay = await json(await POST(req('/payment-profiles', body)));
  assert.equal(first.status, 201);
  assert.equal(replay.status, 200, 'replay returns the existing profile');
  assert.equal(replay.body.id, first.body.id);
  assert.equal(replay.body.bankName, 'First Bank');
});

/* `money` is `multipleOf(0.01)`. A third decimal is not a rate anyone can be
   billed at, and rounding it silently would misstate an invoice. */
test('a rate finer than a cent is rejected, not rounded', async () => {
  const { POST: createClient } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const res = await json(
    await createClient(
      req('/clients', { name: 'Northwind', hourlyRate: 10.005 }),
    ),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
});

/* Internal work is the documented case for a project with no client, so the
   field is omittable rather than merely nullable. */
test('a project needs only a name, and is then internal work', async () => {
  const { POST } = await import('../src/app/api/v1/projects/route.ts');

  const res = await json(await POST(req('/projects', { name: 'Admin' })));
  assert.equal(res.status, 201);
  assert.equal(res.body.clientId, null);
});

test('a project under another user’s client is the caller’s error, not a 500', async () => {
  const { POST } = await import('../src/app/api/v1/projects/route.ts');
  const theirs = '33333333-0000-4000-8000-0000000000c2';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Theirs')`,
    [theirs, OTHER],
  );

  const res = await json(
    await POST(req('/projects', { name: 'Borrowed', clientId: theirs })),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
});

test('a project is read back by id, and 404s when unknown', async () => {
  const { GET } = await import('../src/app/api/v1/projects/[id]/route.ts');
  const { clientId, projectId } = await seedClientAndProject();

  const got = await json(await GET(req('/projects/x'), ctx(projectId)));
  assert.equal(got.status, 200);
  assert.equal(got.body.name, 'Lifecycle');
  assert.equal(got.body.clientId, clientId);

  const missing = await json(
    await GET(req('/projects/x'), ctx('bb000000-0000-4000-8000-0000000000ff')),
  );
  assert.equal(missing.status, 404);
});

test('a project can be detached from its client, and that is not archiving', async () => {
  const { PATCH } = await import('../src/app/api/v1/projects/[id]/route.ts');
  const { projectId } = await seedClientAndProject();

  const res = await json(
    await PATCH(patchReq('/projects/x', { clientId: null }), ctx(projectId)),
  );
  assert.equal(res.status, 200);
  /* A null `client_id` is how internal work is modeled, so clearing it is a
     legitimate edit rather than a broken reference. */
  assert.equal(res.body.clientId, null);
  assert.equal(res.body.archivedAt ?? null, null);
});

test('isBillableDefault is the user answer, not inferred from the client', async () => {
  const { PATCH } = await import('../src/app/api/v1/projects/[id]/route.ts');
  const { projectId } = await seedClientAndProject();

  /* Detaching a project from its client must not flip it to non-billable:
     `client_id = null` covers internal, not-yet-assigned and speculative
     work alike, and only the user knows which. */
  const detached = await json(
    await PATCH(patchReq('/projects/x', { clientId: null }), ctx(projectId)),
  );
  assert.equal(detached.body.isBillableDefault, true);

  const answered = await json(
    await PATCH(
      patchReq('/projects/x', { isBillableDefault: false }),
      ctx(projectId),
    ),
  );
  assert.equal(answered.body.isBillableDefault, false);
});

test('archiving a project hides it from the list but keeps the row', async () => {
  const { DELETE } = await import('../src/app/api/v1/projects/[id]/route.ts');
  const { GET: list } = await import('../src/app/api/v1/projects/route.ts');
  const { projectId } = await seedClientAndProject();

  const res = await DELETE(
    req('/projects/x', undefined, 'DELETE'),
    ctx(projectId),
  );
  assert.equal(res.status, 204);

  const active = await json(await list(req('/projects')));
  assert.equal(active.body.projects.length, 0);

  /* Archive, don't delete: time entries and invoices reference this row, so
     it stays retrievable rather than orphaning them. */
  const all = await json(await list(req('/projects?includeArchived=true')));
  assert.equal(all.body.projects.length, 1);

  const { rows } = await pool.query(
    'select archived_at from projects where id=$1',
    [projectId],
  );
  assert.ok(rows[0].archived_at, 'the row survives, marked archived');
});

test("an archived client's projects leave the list, and come back with it", async () => {
  const clients = await import('../src/app/api/v1/clients/[id]/route.ts');
  const { GET: list, POST: create } = await import(
    '../src/app/api/v1/projects/route.ts'
  );
  const { clientId, projectId } = await seedClientAndProject();
  await create(req('/projects', { clientId: null, name: 'Admin' }));
  const names = async (url: string) =>
    (await json(await list(req(url)))).body.projects.map(
      (p: { name: string }) => p.name,
    );

  await clients.DELETE(req('/clients/x', undefined, 'DELETE'), ctx(clientId));

  // Not offered for new time; a project with no client still is.
  assert.deepEqual(await names('/projects'), ['Admin']);
  assert.deepEqual(await names(`/projects?clientId=${clientId}`), []);
  assert.deepEqual(await names('/projects?includeArchived=true'), [
    'Admin',
    'Lifecycle',
  ]);

  // Counted as archived, not written as archived.
  const { rows } = await pool.query(
    'select archived_at from projects where id=$1',
    [projectId],
  );
  assert.equal(rows[0].archived_at, null);

  await clients.PATCH(
    patchReq('/clients/x', { archived: false }),
    ctx(clientId),
  );
  assert.deepEqual(await names('/projects'), ['Admin', 'Lifecycle']);
});

test('archiving an unknown project is 404, not a silent 204', async () => {
  const { DELETE } = await import('../src/app/api/v1/projects/[id]/route.ts');
  const res = await DELETE(
    req('/projects/x', undefined, 'DELETE'),
    ctx('bb000000-0000-4000-8000-0000000000ff'),
  );
  assert.equal(res.status, 404);
});

test("another user's client is invisible to these handlers", async () => {
  const { GET } = await import('../src/app/api/v1/clients/[id]/route.ts');
  const { PATCH } = await import('../src/app/api/v1/clients/[id]/route.ts');

  const theirs = '33333333-0000-4000-8000-0000000000c1';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Theirs')`,
    [theirs, OTHER],
  );

  /* The route tests run with RLS disabled, so this is the handler's own
     `user_id` scoping under test — `rls.test.ts` covers the policy layer.
     Both exist because either alone would let the other's absence pass. */
  assert.equal(
    (await json(await GET(req('/clients/x'), ctx(theirs)))).status,
    404,
  );
  assert.equal(
    (
      await json(
        await PATCH(patchReq('/clients/x', { name: 'Mine' }), ctx(theirs)),
      )
    ).status,
    404,
  );

  const { rows } = await pool.query('select name from clients where id=$1', [
    theirs,
  ]);
  assert.equal(rows[0].name, 'Theirs', 'and it was not modified');
});

// ── settings ───────────────────────────────────────────────────────
test('settings update', async () => {
  const { GET: get, PATCH: patch } = await import(
    '../src/app/api/v1/settings/route.ts'
  );

  const before = await json(await get(req('/settings')));
  assert.equal(before.status, 200);
  assert.equal(before.body.maxEntryHours, null);

  const after = await json(
    await patch(
      req('/settings', { maxEntryHours: 10, defaultHourlyRate: 125 }, 'PATCH'),
    ),
  );
  assert.equal(after.status, 200);
  assert.equal(after.body.maxEntryHours, 10);
  assert.equal(after.body.defaultHourlyRate, 125);
});

test('the invoice template is Standard until chosen, and one of the four', async () => {
  const { GET: get, PATCH: patch } = await import(
    '../src/app/api/v1/settings/route.ts'
  );
  const set = (invoiceTemplate: string) =>
    patch(req('/settings', { invoiceTemplate }, 'PATCH')).then(json);

  assert.equal(
    (await json(await get(req('/settings')))).body.invoiceTemplate,
    'standard',
  );
  const chosen = await set('classic');
  assert.equal(chosen.status, 200);
  assert.equal(chosen.body.invoiceTemplate, 'classic');
  assert.equal(
    (await json(await get(req('/settings')))).body.invoiceTemplate,
    'classic',
  );

  const refused = await set('compact');
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'VALIDATION_FAILED');
  assert.equal(
    (await json(await get(req('/settings')))).body.invoiceTemplate,
    'classic',
    'a refused template changes nothing',
  );
});

/* A contractor who already sent invoices outside Stint starts past them,
   and can take a raise back. Only a number an invoice already holds, drafts
   included, is refused: the counter would step into it at Generate. The
   refusal changes nothing else in the patch. */
test('the next invoice number goes anywhere past the numbers invoices hold', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');
  const set = (body: object) =>
    patch(req('/settings', body, 'PATCH')).then(json);

  const ahead = await set({
    nextInvoiceNumber: 3,
    invoiceNumberPrefix: 'INV-',
  });
  assert.equal(ahead.status, 200);
  assert.equal(ahead.body.nextInvoiceNumber, 3);

  const undone = await set({ nextInvoiceNumber: 1 });
  assert.equal(undone.status, 200, 'a raise can be taken back');
  assert.equal(undone.body.nextInvoiceNumber, 1);

  await pool.query(`insert into clients (id,user_id,name) values ($1,$2,'C')`, [
    'cc000000-0000-4000-8000-000000000001',
    USER,
  ]);
  for (const seq of [1, 2]) {
    const { rows } = await pool.query(
      'select * from allocate_invoice_number($1)',
      [USER],
    );
    await pool.query(
      `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status)
                      values ($1,$2,$3,$4,$5,$6)`,
      [
        `ff000000-0000-4000-8000-00000000000${seq}`,
        USER,
        'cc000000-0000-4000-8000-000000000001',
        rows[0].invoice_number,
        rows[0].sequence_no,
        seq === 2 ? 'draft' : 'sent',
      ],
    );
  }

  const raised = await set({ nextInvoiceNumber: 7 });
  assert.equal(raised.status, 200);
  const back = await set({ nextInvoiceNumber: 3, maxEntryHours: 9 });
  assert.equal(back.status, 200, 'back to the lowest unheld number');
  assert.equal(back.body.maxEntryHours, 9);

  const held = await set({ nextInvoiceNumber: 2, maxEntryHours: 12 });
  assert.equal(held.status, 422);
  assert.equal(held.body.code, 'VALIDATION_FAILED');
  assert.equal(
    held.body.message,
    'Must be higher than INV-0002, your latest invoice.',
  );
  assert.deepEqual(held.body.details, {
    field: 'nextInvoiceNumber',
    current: 3,
  });

  const { rows } = await pool.query(
    'select next_invoice_number, max_entry_hours::int from user_settings where user_id=$1',
    [USER],
  );
  assert.deepEqual(rows[0], { next_invoice_number: 3, max_entry_hours: 9 });

  const { rows: alloc } = await pool.query(
    'select * from allocate_invoice_number($1)',
    [USER],
  );
  assert.equal(alloc[0].sequence_no, 3, 'the next invoice takes it');
});

/* The save checks the invoices, then writes. An invoice that takes the
   number in between must not let the counter be set back onto it: the
   write misses, and the save checks again against the new invoice. */
test('an invoice taken during the save makes the next number check again', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');
  await pool.query(
    "update user_settings set invoice_number_prefix='INV-' where user_id=$1",
    [USER],
  );
  await pool.query(`insert into clients (id,user_id,name) values ($1,$2,'C')`, [
    'cc000000-0000-4000-8000-000000000001',
    USER,
  ]);

  // A Generate in flight: it holds the counter's row lock and has taken 1.
  const generate = await pool.connect();
  try {
    await generate.query('begin');
    const { rows } = await generate.query(
      'select * from allocate_invoice_number($1)',
      [USER],
    );
    await generate.query(
      `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status)
                      values ($1,$2,$3,$4,$5,'draft')`,
      [
        'ff000000-0000-4000-8000-000000000001',
        USER,
        'cc000000-0000-4000-8000-000000000001',
        rows[0].invoice_number,
        rows[0].sequence_no,
      ],
    );

    // The save sees neither yet, so 1 passes its check and its write waits.
    const saving = patch(
      req('/settings', { nextInvoiceNumber: 1 }, 'PATCH'),
    ).then(json);
    for (;;) {
      const { rows: waiting } = await pool.query(
        'select 1 from pg_locks where not granted',
      );
      if (waiting.length) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    await generate.query('commit');

    const res = await saving;
    assert.equal(res.status, 422);
    assert.equal(
      res.body.message,
      'Must be higher than INV-0001, your latest invoice.',
    );
  } finally {
    generate.release();
  }

  const { rows } = await pool.query(
    'select next_invoice_number from user_settings where user_id=$1',
    [USER],
  );
  assert.equal(rows[0].next_invoice_number, 2, 'not set back onto INV-0001');
});

test('the next invoice number has a ceiling', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');

  const res = await json(
    await patch(req('/settings', { nextInvoiceNumber: 2147483647 }, 'PATCH')),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
  assert.deepEqual(
    res.body.details,
    { field: 'nextInvoiceNumber', current: 1 },
    'refused like a held number, so the form can say why at the field',
  );

  const { rows } = await pool.query(
    'select next_invoice_number from user_settings where user_id=$1',
    [USER],
  );
  assert.equal(rows[0].next_invoice_number, 1, 'the row is unchanged');
});

/* Every field the converter maps must survive a PATCH. Zod strips what its
   schema does not name, so a missing field is a 200 that discards the
   value. */
test('every settable field round-trips, rather than being silently dropped', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');

  const sent = {
    minEntrySeconds: 60,
    maxEntryHours: 10,
    businessAddress: '1 Main St\nAustin, TX 78701',
    invoiceNumberPrefix: 'STINT-',
  };

  const res = await json(await patch(req('/settings', sent, 'PATCH')));
  assert.equal(res.status, 200);
  for (const [field, value] of Object.entries(sent)) {
    assert.deepEqual(res.body[field], value, field);
  }
});

test('the user payment terms are whole days from 0 to 365', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');
  const set = (body: object) =>
    patch(req('/settings', body, 'PATCH')).then(json);

  const saved = await set({ paymentTermsDays: 45 });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.paymentTermsDays, 45);
  assert.equal((await set({ paymentTermsDays: 0 })).body.paymentTermsDays, 0);

  for (const bad of [-1, 1.5, 366]) {
    assert.equal(
      (await set({ paymentTermsDays: bad })).status,
      422,
      String(bad),
    );
  }
});

/* Old terms the migration couldn't read became 30 days; the Inbox shows
   what was written until the user saves their terms. */
test('stats asks about old payment terms until the user saves theirs', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  const ask = async () =>
    (await json(await stats(req('/stats?tz=UTC')))).body.attention
      .paymentTermsToCheck;

  assert.equal(await ask(), null);
  await pool.query(
    `update user_settings set legacy_payment_terms='Payment by check' where user_id=$1`,
    [USER],
  );
  assert.equal(await ask(), 'Payment by check');

  await patch(req('/settings', { maxEntryHours: 9 }, 'PATCH'));
  assert.equal(await ask(), 'Payment by check', 'another field leaves it');

  await patch(req('/settings', { paymentTermsDays: 30 }, 'PATCH'));
  assert.equal(await ask(), null);
});

/* The Inbox asks for a default rate while there is none. Zero is a rate,
   so it answers the question; clearing the rate asks it again. */
test('stats flags an account with no default rate, and zero counts as set', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  const flag = async () =>
    (await json(await stats(req('/stats?tz=UTC')))).body.attention
      .noDefaultRate;

  await patch(req('/settings', { defaultHourlyRate: null }, 'PATCH'));
  assert.equal(await flag(), true);

  await patch(req('/settings', { defaultHourlyRate: 0 }, 'PATCH'));
  assert.equal(await flag(), false);

  await patch(req('/settings', { defaultHourlyRate: null }, 'PATCH'));
  assert.equal(await flag(), true, 'clearing it asks again');
});

/* The welcome dialog shows while `welcomedAt` is null. The signup trigger
   leaves it null, so only an account made after the migration sees it. */
test('a new account is not yet welcomed, and welcoming it round-trips', async () => {
  const { GET: get, PATCH: patch } = await import(
    '../src/app/api/v1/settings/route.ts'
  );
  // The handlers always act as USER, so the signup trigger is read directly.
  const NEW = '33333333-3333-3333-3333-333333333333';
  await pool.query('delete from auth.users where id=$1', [NEW]);
  await pool.query(`insert into auth.users (id,email) values ($1,'new@test')`, [
    NEW,
  ]);
  const { rows } = await pool.query(
    'select welcomed_at from user_settings where user_id=$1',
    [NEW],
  );
  await pool.query('delete from auth.users where id=$1', [NEW]);
  assert.equal(rows[0].welcomed_at, null);

  await pool.query(
    'update user_settings set welcomed_at=null where user_id=$1',
    [USER],
  );
  assert.equal((await json(await get(req('/settings')))).body.welcomedAt, null);

  const at = '2026-10-20T15:00:00.000Z';
  const after = await json(
    await patch(req('/settings', { welcomedAt: at }, 'PATCH')),
  );
  assert.equal(after.status, 200);
  assert.equal(new Date(after.body.welcomedAt).toISOString(), at);
});

// ── calendar ───────────────────────────────────────────────────────
test('calendar groups entries by LOCAL day', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { GET: calendar } = await import('../src/app/api/v1/calendar/route.ts');

  // 01:30Z on the 12th is still the 11th in São Paulo (UTC-3).
  await create(
    req('/entries', {
      id: '018f0000-0000-7000-8000-000000000020',
      taskName: 'Late night',
      startedAt: '2026-09-12T01:30:00Z',
      endedAt: '2026-09-12T02:30:00Z',
    }),
  );

  const utc = await json(
    await calendar(
      req('/calendar?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z&tz=UTC'),
    ),
  );
  assert.equal(utc.body.days[0].date, '2026-09-12');

  const sp = await json(
    await calendar(
      req(
        '/calendar?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z&tz=America/Sao_Paulo',
      ),
    ),
  );
  assert.equal(
    sp.body.days[0].date,
    '2026-09-11',
    'the same entry files under the local date',
  );
  assert.equal(sp.body.days[0].totalSeconds, 3600);
});

test('the entry view splits an entry that crosses local midnight', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { GET: calendar } = await import('../src/app/api/v1/calendar/route.ts');

  // Friday 22:00 to Saturday 02:00 in New York (EDT, UTC-4).
  await create(
    req('/entries', {
      id: '018f0000-0000-7000-8000-000000000040',
      taskName: 'Overnight',
      startedAt: '2026-07-04T02:00:00Z',
      endedAt: '2026-07-04T06:00:00Z',
    }),
  );

  const tz = 'America/New_York';
  const totals = (days: { date: string; totalSeconds: number }[]) =>
    Object.fromEntries(days.map((d) => [d.date, d.totalSeconds]));

  // A range that starts Saturday still finds the entry begun Friday.
  const saturday = await json(
    await calendar(
      req(
        `/calendar?from=2026-07-04T04:00:00Z&to=2026-07-05T04:00:00Z&tz=${tz}`,
      ),
    ),
  );
  assert.equal(totals(saturday.body.days)['2026-07-04'], 7200);
  const entries = saturday.body.days.find(
    (d: { date: string }) => d.date === '2026-07-04',
  ).entries;
  assert.equal(entries.length, 1, 'the entry is drawn on Saturday too');
});

test('calendar rejects an inverted period', async () => {
  const { GET: calendar } = await import('../src/app/api/v1/calendar/route.ts');
  const res = await json(
    await calendar(
      req('/calendar?from=2026-09-30T00:00:00Z&to=2026-09-01T00:00:00Z'),
    ),
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_PERIOD');
});

test('client scale covers every client, not just the top few', async () => {
  const { POST: createClient, GET: listClients } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { POST: createProject } = await import(
    '../src/app/api/v1/projects/route.ts'
  );

  /* Seven clients, because /stats caps its rollup at five. That cap is right
     for a home card and wrong for a full list: a missing amount reads as
     "nothing owed" rather than "not shown", so the list must not inherit
     it. */
  const ids: string[] = [];
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    const c = await json(
      await createClient(req('/clients', { name, hourlyRate: 100 })),
    );
    assert.equal(c.status, 201);
    ids.push(c.body.id);
  }

  // Two projects on the last client, so the count is not incidentally 1.
  for (const name of ['One', 'Two']) {
    await createProject(req('/projects', { clientId: ids[6], name }));
  }

  const plain = await json(await listClients(req('/clients')));
  assert.equal(
    plain.body.clients[0].projectCount,
    undefined,
    'scale is opt-in: the plain list stays one query',
  );

  const scaled = await json(await listClients(req('/clients?withScale=true')));
  assert.equal(scaled.body.clients.length, 7);

  const last = scaled.body.clients.find((c: { id: string }) => c.id === ids[6]);
  assert.equal(last.projectCount, 2, 'the seventh client still gets a count');
  assert.equal(
    typeof last.unbilledAmount,
    'number',
    '0 is a real answer and must not arrive as null or a string',
  );

  const first = scaled.body.clients.find(
    (c: { id: string }) => c.id === ids[0],
  );
  assert.equal(first.projectCount, 0, 'a client with no projects reports 0');
});

// ── stats and the unbilled rollup ───────────────────────────────────
//
// `/stats` is every number on the home screen and had no handler test: the
// UI suite stubs the whole response, so the route was free to be wrong in
// exactly the way the invoice detail route was. `unbilled_by_client` is a
// THIRD implementation of rate resolution (after the TS resolver and
// `resolve_entry_rate`), and its own header says the coalesce chain must
// stay identical to the others.

/** An ended, billable entry `daysAgo` in the past. */
async function entryFor(opts: {
  id: string;
  projectId?: string | null;
  hours: number;
  daysAgo?: number;
  billable?: boolean;
  rateOverride?: number | null;
}) {
  const start = new Date(
    Date.UTC(2026, 8, 10) - (opts.daysAgo ?? 1) * 86_400_000,
  );
  const end = new Date(start.getTime() + opts.hours * 3_600_000);
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable,rate_override)
     values ($1,$2,$3,'work',$4,$5,$6,$7)`,
    [
      opts.id,
      USER,
      opts.projectId ?? null,
      start.toISOString(),
      end.toISOString(),
      opts.billable ?? true,
      opts.rateOverride ?? null,
    ],
  );
}

const S = (n: number) =>
  `018f0000-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;

/**
 * An ended, billable entry inside the CURRENT month.
 *
 * `entryFor` anchors to a fixed date, which is right for the aging assertions
 * that need a known number of days. Anything measured against `/stats`'s month
 * window cannot: the route derives that window from `new Date()`, so a fixed
 * date silently falls out of range once the real clock leaves that month and
 * the figure reads 0 while the test still describes real money.
 *
 * Noon UTC, so the entry stays inside the month in every timezone the suite
 * runs `tz` as, and clear of a DST boundary at either end.
 *
 * The day is the month's last BUSINESS day at or before today, never a fixed
 * 2nd. Pace's cumulative line is null past today and steps only on business
 * days, so an entry dated beyond the last such day sits past the line's end:
 * read on the 1st, or on a 2nd whose month opens at a weekend, the last
 * non-null point is 0 — and when no business day has elapsed the filter is
 * empty and `.at(-1)` is undefined.
 */
async function entryThisMonth(opts: {
  id: string;
  hours: number;
  projectId?: string | null;
  rateOverride?: number | null;
}) {
  const now = new Date();
  /* Walk back from today to the nearest weekday, then no earlier than the
     1st — a month opening Sat/Sun has none elapsed on day 1 or 2, and the
     1st still keeps the entry inside the window every figure here reads. */
  let day = now.getUTCDate();
  while (day > 1) {
    const dow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day),
    ).getUTCDay();
    if (dow !== 0 && dow !== 6) break;
    day -= 1;
  }
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 12, 0, 0),
  );
  const end = new Date(start.getTime() + opts.hours * 3_600_000);
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable,rate_override)
     values ($1,$2,$3,'work',$4,$5,true,$6)`,
    [
      opts.id,
      USER,
      opts.projectId ?? null,
      start.toISOString(),
      end.toISOString(),
      opts.rateOverride ?? null,
    ],
  );
}

test('unbilled groups by (client, RATE), not by client alone', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // One client, two rates: the client's 150 and a project override at 195.
  // This is the seed's Northwind case, which once reported $1755.00 where
  // $1462.50 was owed because the rollup took max(rate) per client.
  const c = '33333333-0000-4000-8000-000000000001';
  const pBase = '33333333-0000-4000-8000-0000000000a1';
  const pRush = '33333333-0000-4000-8000-0000000000a2';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Northwind',150)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'Base')`,
    [pBase, USER, c],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name,hourly_rate)
     values ($1,$2,$3,'Rush',195)`,
    [pRush, USER, c],
  );

  await entryFor({ id: S(1), projectId: pBase, hours: 6 }); //  6 * 150 = 900
  await entryFor({ id: S(2), projectId: pRush, hours: 3 }); //  3 * 195 = 585

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.status, 200);

  // 1485, not 9h at one rate (1350 at 150, or 1755 at 195).
  assert.equal(res.body.unbilled.total, 1485);
  assert.notEqual(res.body.unbilled.total, 1755, 'must not take the top rate');
  assert.notEqual(res.body.unbilled.total, 1350, 'nor the bottom one');

  // One ROW per client even though the rates were grouped separately.
  assert.equal(res.body.unbilled.byClient.length, 1);
  assert.equal(res.body.unbilled.byClient[0].amount, 1485);
  assert.equal(res.body.unbilled.byClient[0].seconds, 9 * 3600);
});

test('unbilled prices the printed hours, per entry, as an invoice does', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000002';
  const p = '33333333-0000-4000-8000-0000000000b1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Rounding',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );

  // 3 x 20 minutes at 100/h: 0.33 h each as printed, 0.99 h billed.
  for (const n of [3, 4, 5]) {
    await entryFor({ id: S(n), projectId: p, hours: 1 / 3 });
  }

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.unbilled.total, 99);
  assert.notEqual(
    res.body.unbilled.total,
    100,
    'priced the raw seconds, which the invoice never prints',
  );
});

test('unbilled resolves rates the same way an invoice does', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  /* The rollup duplicates `resolve_entry_rate`'s coalesce chain, and its
     header says the two must stay identical. Each level is exercised here so
     a divergence shows up as a wrong total rather than silently. */
  const c = '33333333-0000-4000-8000-000000000003';
  const p = '33333333-0000-4000-8000-0000000000c1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Chain',150)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );

  await entryFor({ id: S(6), projectId: p, hours: 1, rateOverride: 200 });
  await entryFor({ id: S(7), projectId: p, hours: 1 }); // client's 150
  await entryFor({ id: S(8), projectId: null, hours: 1 }); // user default 100

  const res = await json(await stats(req('/stats?tz=UTC')));
  // 200 + 150 under the client; 100 with no client at all.
  assert.equal(res.body.unbilled.total, 450);
  const named = res.body.unbilled.byClient.find(
    (r: { clientId: string | null }) => r.clientId === c,
  );
  assert.equal(named.amount, 350, 'override beats the client rate');
  const internal = res.body.unbilled.byClient.find(
    (r: { clientId: string | null }) => r.clientId === null,
  );
  assert.equal(internal.amount, 100, 'no client falls to the user default');
});

test('unrated work counts but adds no money', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // No rate anywhere: clear the user default so nothing resolves.
  await pool.query(
    'update user_settings set default_hourly_rate = null where user_id = $1',
    [USER],
  );
  await entryFor({ id: S(9), projectId: null, hours: 2 });

  const res = await json(await stats(req('/stats?tz=UTC')));
  const row = res.body.unbilled.byClient[0];
  assert.equal(row.unratedCount, 1, 'says the total is incomplete');
  assert.equal(row.amount, 0, 'and contributes nothing to it');
  assert.equal(row.seconds, 7200, 'while the hours are still real');
});

test('a running timer is unbilled so far; non-billable work is not', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000004';
  const p = '33333333-0000-4000-8000-0000000000d1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Excl',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );

  await entryFor({ id: S(10), projectId: p, hours: 1 }); // counts
  await entryFor({ id: S(11), projectId: p, hours: 1, billable: false });
  // Running for an hour: counted up to the request, as it would bill if
  // stopped now.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,is_billable)
     values ($1,$2,$3,'running',$4,true)`,
    [S(12), USER, p, new Date(Date.now() - 3600 * 1000).toISOString()],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(
    res.body.unbilled.total,
    200,
    'the ended hour and the running one, not the non-billable one',
  );
  assert.equal(res.body.unbilled.seconds, 7200);
});

/**
 * A running entry's start: half an hour ago, or just after UTC midnight when
 * that is sooner, so it always falls today. `seconds` is whole, so the
 * request's few milliseconds never round it to another figure.
 */
function runningToday() {
  const now = Date.now();
  const midnight = new Date(now).setUTCHours(0, 0, 0, 0);
  const seconds = Math.max(
    0,
    Math.min(1800, Math.floor((now - midnight) / 1000) - 1),
  );
  return { startedAt: new Date(now - seconds * 1000).toISOString(), seconds };
}

/** Dollars at $100/h, as the rollups price it: hours rounded to cents. */
const at100 = (seconds: number) => Math.round(seconds / 36);

test('Earned today counts a running timer up to the request, priced as it would bill', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000005';
  const rated = '33333333-0000-4000-8000-0000000000d2';
  const unrated = '33333333-0000-4000-8000-0000000000d3';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Live',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'Rated')`,
    [rated, USER, c],
  );
  // No client, and the user default is unset here: nothing resolves a rate.
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,null,'Unrated')`,
    [unrated, USER],
  );
  await pool.query(
    'update user_settings set default_hourly_rate = null where user_id = $1',
    [USER],
  );
  const { startedAt, seconds } = runningToday();
  const run = (projectId: string) =>
    pool.query(
      `insert into time_entries (id,user_id,project_id,task_name,started_at)
       values ($1,$2,$3,'running',$4)`,
      [S(13), USER, projectId, startedAt],
    );

  await run(rated);
  const live = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(live.body.earnedToday, at100(seconds), 'its hours at $100');

  await pool.query('delete from time_entries where id = $1', [S(13)]);
  await run(unrated);
  const none = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(
    none.body.earnedToday,
    0,
    'unrated time earns nothing it can name',
  );
});

test('the week, the month and its client strip count a running timer', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000006';
  const p = '33333333-0000-4000-8000-0000000000d4';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Week',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  const before = await json(await stats(req('/stats?tz=UTC')));
  const { startedAt, seconds } = runningToday();
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at)
     values ($1,$2,$3,'running',$4)`,
    [S(15), USER, p, startedAt],
  );
  const after = await json(await stats(req('/stats?tz=UTC')));

  const today = startedAt.slice(0, 10);
  const cents = at100(seconds) * 100;
  const bar = (r: typeof after) =>
    r.body.week.find((d: { date: string }) => d.date === today);
  assert.equal(bar(after).seconds - bar(before).seconds, seconds);
  assert.equal(
    Math.round(((bar(after).amount ?? 0) - (bar(before).amount ?? 0)) * 100),
    cents,
    "today's bar gains the session's amount",
  );
  assert.equal(
    Math.round((after.body.month.earned - before.body.month.earned) * 100),
    cents,
  );
  const strip = after.body.month.byClient.find(
    (b: { clientId: string }) => b.clientId === c,
  );
  assert.equal(strip?.amount ?? 0, at100(seconds));
});

test('a running timer started before midnight counts toward the day it started', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  // The $100 user default prices it.
  await pool.query(
    'update user_settings set default_hourly_rate = 100 where user_id = $1',
    [USER],
  );
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at)
     values ($1,$2,null,'overnight',$3)`,
    [S(16), USER, new Date(midnight.getTime() - 600 * 1000).toISOString()],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.earnedToday, 0, 'not today');
  assert.ok(res.body.unbilled.total > 0, 'yet unbilled so far');
});

test("a client's Unbilled counts its running timer, as /stats does", async () => {
  const { GET: listClients } = await import(
    '../src/app/api/v1/clients/route.ts'
  );
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000007';
  const p = '33333333-0000-4000-8000-0000000000d5';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Live',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at)
     values ($1,$2,$3,'running',$4)`,
    [S(17), USER, p, new Date(Date.now() - 1800 * 1000).toISOString()],
  );

  const clients = await json(await listClients(req('/clients?withScale=true')));
  const row = clients.body.clients.find((x: { id: string }) => x.id === c);
  assert.equal(row.unbilledAmount, 50);
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.unbilled.total, 50);
});

test('the entries list measures a running entry at the response', async () => {
  const { GET: list } = await import('../src/app/api/v1/entries/route.ts');
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at)
     values ($1,$2,null,'running',$3)`,
    [S(14), USER, new Date(Date.now() - 600 * 1000).toISOString()],
  );

  const res = await json(await list(req('/entries')));
  const row = res.body.entries.find((e: { id: string }) => e.id === S(14));
  assert.equal(row.endedAt, null, 'still running');
  assert.ok(
    Math.abs(row.durationSeconds - 600) <= 2,
    `measured at the response, got ${row.durationSeconds}`,
  );
});

test('the unbilled total covers every client, even past the row cap', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // Seven clients against a cap of five: the ROWS truncate, the TOTAL must
  // not — a headline that quietly omits two clients understates what is owed.
  for (let n = 0; n < 7; n++) {
    const c = `33333333-0000-4000-8000-00000000010${n}`;
    const p = `33333333-0000-4000-8000-00000000020${n}`;
    await pool.query(
      `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,$3,100)`,
      [c, USER, `C${n}`],
    );
    await pool.query(
      `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
      [p, USER, c],
    );
    await entryFor({ id: S(20 + n), projectId: p, hours: 1 });
  }

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.unbilled.byClient.length, 5, 'rows are capped');
  assert.equal(res.body.unbilled.moreClients, 2, 'and the rest are counted');
  assert.equal(res.body.unbilled.total, 700, 'but the total is all seven');
});

test('the month counts BUSINESS days, and needs no target to do it', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const res = await json(await stats(req('/stats?tz=UTC')));
  const month = res.body.month;

  assert.ok(month, 'the month is always present — there is no target to miss');
  assert.ok(
    month.businessDaysTotal >= 20 && month.businessDaysTotal <= 23,
    `a month has 20-23 business days, got ${month.businessDaysTotal}`,
  );
  assert.ok(month.businessDaysTotal < 28, 'business days, not calendar days');
  assert.ok(month.businessDaysElapsed <= month.businessDaysTotal);
  assert.equal(
    month.series.length,
    month.businessDaysTotal,
    'one point per business day',
  );
});

test('the month reports MONEY earned, never the hours behind it', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // 4h at an explicit 150/h, inside whatever month the clock says it is.
  await entryThisMonth({ id: S(70), hours: 4, rateOverride: 150 });

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.month.earned, 600);
  assert.notEqual(res.body.month.earned, 4, 'nor the hours themselves');
});

/* The screen that read these is gone and so are they: a field nothing
   renders is a payload every visitor pays for. */
test('the cards that left took their fields with them', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const res = await json(await stats(req('/stats?tz=UTC')));

  assert.equal(res.body.pace, undefined, 'the goal-derived field is gone');
  assert.equal(res.body.velocity, undefined);
  assert.equal(res.body.byProject, undefined);
  assert.equal(res.body.billableRatio, undefined);
});

test('earned counts invoiced work, before and after the invoice is voided', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await entryThisMonth({ id: S(71), hours: 2, rateOverride: 100 });

  const before = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(before.body.month.earned, 200, 'unbilled work is still earned');

  /* Invoicing does not change what was earned: the figure is work DONE, so
     it must not move when the paperwork happens. */
  const client = '018f0000-0000-7000-8000-0000000009c1';
  const invoice = '018f0000-0000-7000-8000-0000000009a1';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Voidable')`,
    [client, USER],
  );
  /* Dated from the clock, like the entry: the figure is bucketed by the
     ENTRY's date, so these only have to be self-consistent — but a fixed year
     here would still read as a claim about September forever. */
  await pool.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status,
                           issue_date,period_start,period_end,subtotal,tax_rate,
                           tax_amount,total,currency)
     values ($1,$2,$3,'INV-9001',9001,'sent',
             current_date, date_trunc('month', current_date),
             date_trunc('month', current_date) + interval '1 month' - interval '1 day',
             200,0,0,200,'USD')`,
    [invoice, USER, client],
  );
  await pool.query(`update time_entries set invoice_id=$1 where id=$2`, [
    invoice,
    S(71),
  ]);
  const sent = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(sent.body.month.earned, 200, 'invoicing it changes nothing');

  /* Voiding releases the entry, so it is unbilled work again: still done,
     still earned, and free for the corrected invoice to bill. */
  await pool.query(`update invoices set status='void' where id=$1`, [invoice]);
  const voided = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(voided.body.month.earned, 200, 'voiding changes nothing either');
});

test('an invoice is overdue only after the grace period', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000005';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Late Co')`,
    [c, USER],
  );

  const dayKey = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const mk = (id: string, num: string, due: string) =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
          due_date,subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
       values ($1,$2,$3,$4,$5,'sent',$6,$7,100,0,0,100,'USD','entry')`,
      [id, USER, c, num, Number(num.slice(-1)), dayKey(-40), due],
    );

  await mk('44444444-0000-4000-8000-000000000001', 'INV-0001', dayKey(-3));
  await mk('44444444-0000-4000-8000-000000000002', 'INV-0002', dayKey(-12));

  const res = await json(await stats(req('/stats?tz=UTC')));
  const numbers = res.body.attention.overdueInvoices.map(
    (i: { invoiceNumber: string }) => i.invoiceNumber,
  );
  assert.deepEqual(numbers, ['INV-0002'], '3 days late is not yet a problem');
  assert.equal(res.body.attention.overdueInvoices[0].daysLate, 12);
});

test('awaiting payment counts sent invoices and is never the unbilled total', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000006';
  const p = '33333333-0000-4000-8000-0000000000e1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Both',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await entryFor({ id: S(30), projectId: p, hours: 3 }); // 300 unbilled

  /* A paid invoice carries its payment date, which `paid_has_paid_at`
     enforces: collected money is bucketed by it, and a paid row without one
     is money that arrived on no day. */
  const mk = (id: string, num: string, status: string, total: number) =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
          period_start,period_end,
          subtotal,tax_rate,tax_amount,total,currency,grouping_mode,paid_at)
       values ($1,$2,$3,$4,$5,$6,'2026-09-01','2026-08-01','2026-08-31',
               $7,0,0,$7,'USD','entry',
               case when $6 = 'paid' then now() else null end)`,
      [id, USER, c, num, Number(num.slice(-1)), status, total],
    );
  await mk('44444444-0000-4000-8000-000000000003', 'INV-0003', 'sent', 900);
  await mk('44444444-0000-4000-8000-000000000004', 'INV-0004', 'draft', 400);
  await mk('44444444-0000-4000-8000-000000000005', 'INV-0005', 'paid', 700);

  /* Two different kinds of money. A draft has not been asked for and a paid
     one has arrived; only `sent` is outstanding. And unbilled is work not yet
     invoiced, so adding the two would double-count the same hours. */
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.awaitingPayment, 900);
  assert.equal(res.body.unbilled.total, 300);
  assert.notEqual(res.body.awaitingPayment, 1300, 'a draft is not outstanding');
  assert.notEqual(res.body.awaitingPayment, 1600, 'nor is a paid one');
  assert.equal(res.body.openInvoiceCount, 1, 'one invoice makes up the figure');
});

test('collected sums payments by when they were paid', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-00000000006c';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Paid',100)`,
    [c, USER],
  );

  /* Payments placed by `paid_at`, which is the only thing `collected` reads:
     `issue_date` is held constant, so a bucket following it rather than the
     payment would put all three in one month.

     Months back from the CURRENT UTC month, every step pinned to noon on the
     1st — including this one, which used to be the live instant and so could
     land within minutes of a month boundary, leaving the run's own clock to
     decide the bucket. Noon on the 1st is a day every month has and one the
     run can never be earlier than, so the newest payment is in this month and
     in the past whatever day the suite runs on. The request asks for UTC, so
     the fixture is built in UTC and the two agree where a month begins. */
  const anchor = new Date();
  anchor.setUTCDate(1);
  anchor.setUTCHours(12, 0, 0, 0);

  const paidAt = (monthsBack: number) => {
    const d = new Date(anchor);
    d.setUTCMonth(d.getUTCMonth() - monthsBack);
    return d.toISOString();
  };
  const mk = (id: string, num: string, total: number, monthsBack: number) =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
          subtotal,tax_rate,tax_amount,total,currency,grouping_mode,paid_at)
       values ($1,$2,$3,$4,$5,'paid','2026-09-01',$6,0,0,$6,'USD','entry',$7)`,
      [id, USER, c, num, Number(num.slice(-2)), total, paidAt(monthsBack)],
    );

  await mk('44444444-0000-4000-8000-000000000010', 'INV-0010', 500, 0);
  await mk('44444444-0000-4000-8000-000000000011', 'INV-0011', 300, 2);
  // Outside the twelve-month window, so it counts towards neither figure.
  await mk('44444444-0000-4000-8000-000000000012', 'INV-0012', 999, 14);

  const res = await json(await stats(req('/stats?tz=UTC')));
  const { collected } = res.body;

  assert.equal(collected.trailing12, 800, 'the window excludes the old one');
  assert.equal(collected.thisMonth, 500, 'and the month is its own figure');
  /* Whole CALENDAR days from the newest payment, which the fixture pins to
     the 1st — so the figure is today's date minus one, in the zone asked for,
     and never the elapsed-hours floor that reads last night as today. */
  assert.equal(
    collected.daysSincePaid,
    new Date().getUTCDate() - 1,
    'calendar days back to the newest payment',
  );

  /* Six buckets, oldest first, every month present. A month nobody paid in is
     a real zero rather than a missing point, or the plot draws a hole. */
  assert.equal(collected.byMonth.length, 6);
  const amounts = collected.byMonth.map((m: { amount: number }) => m.amount);
  assert.deepEqual(amounts, [0, 0, 0, 300, 0, 500]);
  assert.deepEqual(
    [...collected.byMonth].sort((a: { month: string }, b: { month: string }) =>
      a.month < b.month ? -1 : 1,
    ),
    collected.byMonth,
    'oldest first',
  );
});

test('collected counts only the user’s own currency', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-00000000006e';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Mixed',100)`,
    [c, USER],
  );

  /* Both paid on the same day, in two currencies. Money is not addable
     across them and the response carries ONE currency, so a euro summed in
     here is a euro reported as a dollar on the figure Home leads with. */
  // Noon UTC today, so both land in this month's bucket whatever hour the
  // suite runs at.
  const paidToday = `${new Date().toISOString().slice(0, 10)}T12:00:00Z`;
  const mk = (id: string, num: string, total: number, currency: string) =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
          subtotal,tax_rate,tax_amount,total,currency,grouping_mode,paid_at)
       values ($1,$2,$3,$4,$5,'paid','2026-09-01',$6,0,0,$6,$7,'entry',$8)`,
      [id, USER, c, num, Number(num.slice(-2)), total, currency, paidToday],
    );

  await mk('44444444-0000-4000-8000-000000000020', 'INV-0020', 500, 'USD');
  await mk('44444444-0000-4000-8000-000000000021', 'INV-0021', 1000, 'EUR');

  const res = await json(await stats(req('/stats?tz=UTC')));
  const { collected } = res.body;

  assert.equal(
    res.body.currency,
    'USD',
    'the settings currency is the figure’s',
  );
  assert.equal(collected.trailing12, 500, 'the euro invoice is not added in');
  assert.equal(collected.thisMonth, 500);
  assert.equal(
    collected.byMonth[collected.byMonth.length - 1]?.amount,
    500,
    'nor does it reach the plot',
  );
});

test('the last payment counted is one in the user’s currency', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-00000000006f';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Euro',100)`,
    [c, USER],
  );

  /* The only payment there is, and it is a euro one. `daysSincePaid` sits
     beside a figure that counts dollars, so "paid today" next to $0.00 is the
     screen describing money it did not report. */
  await pool.query(
    `insert into invoices
       (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
        subtotal,tax_rate,tax_amount,total,currency,grouping_mode,paid_at)
     values ($1,$2,$3,'INV-0022',22,'paid','2026-09-01',1000,0,0,1000,'EUR',
             'entry',$4)`,
    [
      '44444444-0000-4000-8000-000000000022',
      USER,
      c,
      `${new Date().toISOString().slice(0, 10)}T12:00:00Z`,
    ],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.currency, 'USD');
  assert.equal(res.body.collected.thisMonth, 0);
  assert.equal(
    res.body.collected.daysSincePaid,
    null,
    'a payment in another currency is not this figure’s last payment',
  );
});

test('a paid invoice cannot exist without its payment date', async () => {
  const c = '33333333-0000-4000-8000-00000000006d';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'NoDate',100)`,
    [c, USER],
  );

  /* The figure for money collected is bucketed by `paid_at`, so a paid row
     without one is money that arrived on no day — it would vanish from the
     trailing figure while still reading as paid everywhere else. */
  await assert.rejects(
    () =>
      pool.query(
        `insert into invoices
           (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
            subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
         values ('44444444-0000-4000-8000-000000000013',$1,$2,'INV-0013',13,
                 'paid','2026-09-01',100,0,0,100,'USD','entry')`,
        [USER, c],
      ),
    /paid_has_paid_at/,
  );
});

test('stats sees only its own user’s work', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const mine = '33333333-0000-4000-8000-000000000007';
  const theirs = '33333333-0000-4000-8000-000000000008';
  const pm = '33333333-0000-4000-8000-0000000000f1';
  const pt = '33333333-0000-4000-8000-0000000000f2';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Mine',100),($3,$4,'Theirs',100)`,
    [mine, USER, theirs, OTHER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P'),($4,$5,$6,'P')`,
    [pm, USER, mine, pt, OTHER, theirs],
  );
  await entryFor({ id: S(31), projectId: pm, hours: 2 });
  // The rollup takes p_user_id rather than relying on RLS, so a wrong
  // parameter would silently total someone else's work into this card.
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,$3,'theirs','2026-09-09T09:00:00Z','2026-09-09T17:00:00Z',true)`,
    [S(32), OTHER, pt],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.unbilled.total, 200, 'eight of their hours are absent');
  assert.equal(res.body.unbilled.byClient.length, 1);
});

// ── today's earnings ───────────────────────────────────────────────
//
// `earnedToday` comes out of the month's own by-day series, which is the
// same map the cumulative line is built from — so this also guards that
// map being keyed on the local date SQL grouped by.

test("today's earnings are today's work, bucketed in the caller's zone", async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '55555555-0000-4000-8000-000000000001';
  const p = '55555555-0000-4000-8000-0000000000b1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Today',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );

  /* Anchored to the RUNNING clock, not the fixture's fixed date: the figure
     is "today" as the server sees it, so a hardcoded day passes only on the
     day it was written. 09:00 and 11:00 local sit far enough from either
     midnight that no zone moves them onto another date. */
  const at = (hour: number, hours: number) => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
    );
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + hours * 3_600_000).toISOString(),
    };
  };

  const todayA = at(9, 1); //  1h at 100 = 100
  const todayB = at(11, 0.5); // 0.5h at 100 = 50
  for (const [id, span] of [
    [S(60), todayA],
    [S(61), todayB],
  ] as const) {
    await pool.query(
      `insert into time_entries
         (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
       values ($1,$2,$3,'work',$4,$5,true)`,
      [id, USER, p, span.start, span.end],
    );
  }

  // Yesterday's work, which the day's figure must not reach back for.
  await entryFor({ id: S(62), projectId: p, hours: 4, daysAgo: 1 });

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await json(await stats(req(`/stats?tz=${zone}`)));

  assert.equal(res.body.earnedToday, 150, "only today's two entries");
  assert.ok(
    res.body.unbilled.total > res.body.earnedToday,
    'the running total still carries every unbilled day',
  );
});

// ── the month's cumulative series ──────────────────────────────────

test('the series steps on business days, one point per day', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const res = await json(await stats(req('/stats?tz=UTC')));
  const series = res.body.month.series as {
    date: string;
    actual: number | null;
  }[];

  assert.equal(series.length, res.body.month.businessDaysTotal);
  for (const point of series) {
    const dow = new Date(`${point.date}T00:00:00Z`).getUTCDay();
    assert.ok(dow !== 0 && dow !== 6, `${point.date} is a weekend`);
  }

  /* The line stops at today rather than running flat to the 31st — a level
     line to month end reads as a month that stopped working. */
  const drawn = series.filter((s) => s.actual !== null);
  assert.equal(
    drawn.length,
    res.body.month.businessDaysElapsed,
    'null past today, and only past today',
  );
});

test('the cumulative line carries money, and ends on the month’s earned', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '44444444-0000-4000-8000-000000000005';
  const p = '44444444-0000-4000-8000-0000000000a6';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Rev',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await entryThisMonth({ id: S(46), hours: 4, projectId: p }); // 400

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.month.earned, 400);

  const series = res.body.month.series as { actual: number | null }[];
  const drawn = series.filter((s) => s.actual !== null);
  /* The line is null past today, so before the month's first business day
     there is no point to read. That is the series being right, not the money
     going missing — `month.earned` above carries the figure either way. */
  if (drawn.length > 0) {
    // The hero figure IS the line's last point: the projection extrapolates
    // that series, so a figure from a second source would disagree with it.
    assert.equal(
      drawn.at(-1)?.actual,
      400,
      'the cumulative line carries the money, not the hours',
    );
    assert.equal(drawn.at(-1)?.actual, res.body.month.earned);
  }
});

test('the projection is withheld until the month has a shape', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const res = await json(await stats(req('/stats?tz=UTC')));
  const { businessDaysElapsed, projected, projection } = res.body.month;

  /* Three business days is the floor. Earned-so-far over one elapsed day
     carried across twenty-two is one day's work times the month, a figure
     that swings by thousands on the second day. */
  if (businessDaysElapsed < 3) {
    assert.equal(projected, null, 'too early to extrapolate');
    assert.equal(projection, null, 'and nothing to draw the dashed leg to');
  } else {
    assert.notEqual(projected, null, 'three days in, the rate is carried');
    assert.ok(projection, 'and the dashed leg has both endpoints');
    assert.equal(projection.from.amount, res.body.month.earned);
    assert.equal(projection.to.amount, projected);
    assert.equal(
      projection.to.date,
      res.body.month.series.at(-1).date,
      'the leg lands on the last business day',
    );
  }
});

// ── the week's bars ────────────────────────────────────────────────
//
// Seven columns from the same rollup the month's line reads, over the week's
// own window — a week straddles the 1st, so the month's rows stop short of
// it. Height comes from `seconds` and the figure at the head from `amount`,
// and the two deliberately do not share a filter.

test('the week is always seven days, in order, from the week start', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const res = await json(await stats(req('/stats?tz=UTC')));
  const week = res.body.week as {
    date: string;
    seconds: number;
    amount: number | null;
  }[];

  assert.equal(week.length, 7, 'seven columns, worked or not');
  for (let i = 1; i < week.length; i += 1) {
    const prev = new Date(`${week[i - 1]!.date}T00:00:00Z`);
    const here = new Date(`${week[i]!.date}T00:00:00Z`);
    assert.equal(
      here.getTime() - prev.getTime(),
      86_400_000,
      'consecutive local days, no gaps',
    );
  }

  // The seed default is Monday, and the window must contain today.
  const todayKey = new Date().toISOString().slice(0, 10);
  assert.ok(
    week[0]!.date <= todayKey && todayKey <= week[6]!.date,
    `today ${todayKey} sits inside ${week[0]!.date}..${week[6]!.date}`,
  );
});

test('a worked day carries BOTH its seconds and its money', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '66666666-0000-4000-8000-000000000001';
  const p = '66666666-0000-4000-8000-0000000000a1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Week',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );

  // Today at 09:00 local, which every zone agrees is today.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9);
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,$3,'work',$4,$5,true)`,
    [
      S(80),
      USER,
      p,
      start.toISOString(),
      new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    ],
  );

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await json(await stats(req(`/stats?tz=${zone}`)));
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = (res.body.week as { date: string }[]).find(
    (d) => d.date === todayKey,
  ) as { seconds: number; amount: number } | undefined;

  assert.ok(today, `today ${todayKey} is one of the seven`);
  assert.equal(today.seconds, 2 * 3600, 'the height');
  assert.equal(today.amount, 200, 'and the figure at its head');
  assert.equal(
    today.amount,
    res.body.earnedToday,
    'the same day read two ways agrees',
  );
});

test('an unrated day keeps its height and prints no figure', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  /* No rate anywhere in the chain — including the user default the fixture
     sets, which would otherwise resolve for a project-less entry. The time
     was worked, so the bar stands at its true height, and the head prints
     nothing rather than $0, which would claim the work was free. */
  await pool.query(
    'update user_settings set default_hourly_rate = null where user_id = $1',
    [USER],
  );

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10);
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,null,'unrated',$3,$4,true)`,
    [
      S(81),
      USER,
      start.toISOString(),
      new Date(start.getTime() + 3_600_000).toISOString(),
    ],
  );

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await json(await stats(req(`/stats?tz=${zone}`)));
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = (res.body.week as { date: string }[]).find(
    (d) => d.date === todayKey,
  ) as { seconds: number; amount: number | null } | undefined;

  assert.ok(today);
  assert.equal(today.seconds, 3600, 'the honest record of the time');
  assert.equal(today.amount, null, 'never 0 — that would claim it was free');
});

test('a rate of exactly 0 is a rate: real seconds, and 0.00 of money', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '66666666-0000-4000-8000-000000000002';
  const p = '66666666-0000-4000-8000-0000000000a2';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Pro Bono',0)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11);
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,$3,'free',$4,$5,true)`,
    [
      S(82),
      USER,
      p,
      start.toISOString(),
      new Date(start.getTime() + 5 * 3_600_000).toISOString(),
    ],
  );

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await json(await stats(req(`/stats?tz=${zone}`)));
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = (res.body.week as { date: string }[]).find(
    (d) => d.date === todayKey,
  ) as { seconds: number; amount: number | null } | undefined;

  assert.ok(today);
  assert.equal(today.seconds, 5 * 3600);
  assert.equal(today.amount, 0, '0 is a rate; only NULL withholds the figure');
  assert.notEqual(today.amount, null, 'and 0 is not the same as unrated');
});

/* Home's bars are split by client from `/stats` itself, so the panel paints
   from one response. The split is billable seconds, so each day's
   parts add up to its bar. */
test('each week day splits its seconds by client', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000030';
  const p = '33333333-0000-4000-8000-0000000000e0';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Split',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const at = (s: number) =>
    new Date(midnight.getTime() + s * 1000).toISOString();
  const before = await json(await stats(req('/stats?tz=UTC')));
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,is_billable) values
       ($1,$2,$3,'billed',$4,$5,true),
       ($6,$2,$3,'not billed',$5,$7,false),
       ($8,$2,null,'no project',$7,$9,true)`,
    [S(40), USER, p, at(1), at(61), S(41), at(121), S(42), at(151)],
  );
  const after = await json(await stats(req('/stats?tz=UTC')));

  const today = midnight.toISOString().slice(0, 10);
  type Day = {
    date: string;
    seconds: number;
    byClient: Record<string, number>;
  };
  const day = (r: typeof after) =>
    (r.body.week as Day[]).find((d) => d.date === today)!;
  assert.equal(
    day(after).byClient[c]! - (day(before).byClient[c] ?? 0),
    60,
    'the billable minute, under its client',
  );
  assert.equal(
    (day(after).byClient[''] ?? 0) - (day(before).byClient[''] ?? 0),
    30,
    'work with no client keys as the empty string',
  );
  for (const d of after.body.week as Day[]) {
    const parts = Object.values(d.byClient).reduce((a, n) => a + n, 0);
    // A running session is measured to `now` twice, in SQL and in JS.
    assert.ok(
      Math.abs(parts - d.seconds) <= 1,
      `${d.date}: the parts add up to the bar`,
    );
  }
});

test('the week sees only its own user’s work', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const theirs = '66666666-0000-4000-8000-000000000003';
  const pt = '66666666-0000-4000-8000-0000000000a3';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Theirs',900)`,
    [theirs, OTHER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [pt, OTHER, theirs],
  );
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,$3,'theirs',$4,$5,true)`,
    [
      S(83),
      OTHER,
      pt,
      start.toISOString(),
      new Date(start.getTime() + 10 * 3_600_000).toISOString(),
    ],
  );

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await json(await stats(req(`/stats?tz=${zone}`)));
  const total = (res.body.week as { seconds: number }[]).reduce(
    (a, d) => a + d.seconds,
    0,
  );
  assert.equal(total, 0, 'ten hours of theirs is absent');
  assert.equal(res.body.month.earned, 0);
});

// ── stale drafts ───────────────────────────────────────────────────
// A draft has not been sent, so it is not money owed — it is a job half
// finished. It earns an inbox row once its period is long over: the work is
// done and billed to nobody.

test('a draft is stale only after a week, and the oldest sorts first', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000009';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Drafty')`,
    [c, USER],
  );

  const dayKey = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const mk = (id: string, num: string, ended: string, status = 'draft') =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,
          period_start,period_end,subtotal,tax_rate,tax_amount,total,currency,
          grouping_mode,tz)
       values ($1,$2,$3,$4,$5,$6,$7,$7,100,0,0,100,'USD','entry','UTC')`,
      [id, USER, c, num, Number(num.slice(-1)), status, ended],
    );

  await mk('45444444-0000-4000-8000-000000000001', 'INV-0001', dayKey(-2));
  await mk('45444444-0000-4000-8000-000000000002', 'INV-0002', dayKey(-9));
  await mk('45444444-0000-4000-8000-000000000003', 'INV-0003', dayKey(-30));
  // A SENT invoice of the same age is not a stale draft: it was finished and
  // delivered, and it belongs to the overdue rule instead.
  await mk(
    '45444444-0000-4000-8000-000000000004',
    'INV-0004',
    dayKey(-30),
    'sent',
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  const numbers = res.body.attention.staleDrafts.map(
    (d: { invoiceNumber: string }) => d.invoiceNumber,
  );

  /* Oldest first: the row least likely to still be in anyone's head. A
     period two days over is a draft someone is actively working on, not a
     forgotten one. */
  assert.deepEqual(numbers, ['INV-0003', 'INV-0002'], 'a 2-day draft is fine');
  assert.equal(res.body.attention.staleDrafts[0].ageDays, 30);
  assert.equal(res.body.attention.staleDrafts[1].ageDays, 9);
});

test('a stale draft carries the money and the client it belongs to', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-00000000000a';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Namely',100)`,
    [c, USER],
  );
  const p = '33333333-0000-4000-8000-0000000000a1';
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  /* Keeps the client present in the rollup, which is what supplies the
     name map. */
  await entryFor({ id: S(40), projectId: p, hours: 1 });

  await pool.query(
    `insert into invoices
       (id,user_id,client_id,invoice_number,sequence_no,status,period_start,
        period_end,currency,grouping_mode,tz)
     values ($1,$2,$3,'INV-0009',9,'draft','2026-09-01','2026-09-30','USD',
             'entry','UTC')`,
    ['45444444-0000-4000-8000-000000000009', USER, c],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  const [draft] = res.body.attention.staleDrafts;
  assert.equal(draft.clientName, 'Namely');
  assert.equal(draft.amount, 100, 'what its period’s hour comes to now');
  assert.equal(draft.currency, 'USD');
});

// ── unprojected work ───────────────────────────────────────────────
// Entries with no project cannot resolve a rate beyond the user default, so
// they are billable work heading for an invoice that cannot be generated.

test('unprojected is empty when everything has a project', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-00000000000b';
  const p = '33333333-0000-4000-8000-0000000000b1';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Tidy',100)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await entryFor({ id: S(41), projectId: p, hours: 2 });

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.unprojected, []);
});

test('unprojected is one row per entry, carrying what the row renders', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  await entryFor({ id: S(42), projectId: null, hours: 2 });
  await entryFor({ id: S(43), projectId: null, hours: 1 });

  const rows = (await json(await stats(req('/stats?tz=UTC')))).body.attention
    .unprojected;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows
      .map((r: { seconds: number }) => r.seconds)
      .sort((a: number, b: number) => a - b),
    [3600, 7200],
  );
  // The row renders a task name and a date without a second request.
  for (const r of rows) {
    assert.equal(typeof r.taskName, 'string');
    assert.ok(r.startedAt, 'carries its own date');
    assert.ok(r.entryId, 'names the entry it opens');
  }
});

test('unprojected sorts oldest first', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  // Inserted newest-first, so a query without an explicit order would very
  // plausibly hand back the wrong one.
  await entryFor({ id: S(49), projectId: null, hours: 1, daysAgo: 1 });
  await entryFor({ id: S(50), projectId: null, hours: 1, daysAgo: 9 });
  await entryFor({ id: S(51), projectId: null, hours: 1, daysAgo: 5 });

  /* Oldest first: that entry is closest to being invoiced without a rate,
     and it matches the overdue and stale rows, which both lead with the most
     urgent. */
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(
    res.body.attention.unprojected.map((r: { entryId: string }) => r.entryId),
    [S(50), S(51), S(49)],
  );
});

// ── strange durations ──────────────────────────────────────────────
// An entry that STOPPED at an implausible length. The long side is on at 12
// hours by default, which is how a timer left running overnight is caught; the
// short side is opt-in.

/**
 * A project for the strange-duration fixtures.
 *
 * These entries must HAVE a project: an unprojected entry is surfaced as that
 * row instead, so a fixture without one would test the suppression rather than
 * the threshold it means to.
 */
const DUR_PROJECT = '33333333-0000-4000-8000-0000000000d9';
async function durProject() {
  const c = '33333333-0000-4000-8000-0000000000d8';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Acme')
       on conflict (id) do nothing`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'Website')
       on conflict (id) do nothing`,
    [DUR_PROJECT, USER, c],
  );
  return DUR_PROJECT;
}

/** Seconds rather than hours: the short threshold is a minute. */
async function entrySeconds(id: string, seconds: number, daysAgo = 1) {
  const start = new Date(Date.UTC(2026, 8, 10) - daysAgo * 86_400_000);
  const end = new Date(start.getTime() + seconds * 1000);
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     values ($1,$2,$3,'work',$4,$5)`,
    [id, USER, await durProject(), start.toISOString(), end.toISOString()],
  );
}

const setThresholds = (min: number | null, max: number | null) =>
  pool.query(
    `update user_settings set min_entry_seconds=$2, max_entry_hours=$3 where user_id=$1`,
    [USER, min, max],
  );

test('a new account flags entries over 12 hours, and nothing short', async () => {
  const { rows } = await pool.query(
    `select column_name, column_default from information_schema.columns
      where table_name = 'user_settings'
        and column_name in ('min_entry_seconds', 'max_entry_hours')
      order by column_name`,
  );
  assert.deepEqual(rows, [
    { column_name: 'max_entry_hours', column_default: '12' },
    { column_name: 'min_entry_seconds', column_default: null },
  ]);
});

test('no thresholds means no strange-duration rows at all', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  await entrySeconds(S(60), 12); // a 12-second mis-tap
  await entryFor({ id: S(61), projectId: await durProject(), hours: 14 }); // an overnight timer

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.strangeDurations, []);
});

test('each threshold switches on only its own side', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  await entrySeconds(S(62), 12);
  await entryFor({ id: S(63), projectId: await durProject(), hours: 14 });

  await setThresholds(60, null);
  let rows = (await json(await stats(req('/stats?tz=UTC')))).body.attention
    .strangeDurations;
  assert.deepEqual(
    rows.map((r: { entryId: string }) => r.entryId),
    [S(62)],
    'short only',
  );

  await setThresholds(null, 8);
  rows = (await json(await stats(req('/stats?tz=UTC')))).body.attention
    .strangeDurations;
  assert.deepEqual(
    rows.map((r: { entryId: string }) => r.entryId),
    [S(63)],
    'long only',
  );
});

test('short and long each get their own row, and say which they are', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  const p = await durProject();
  await entrySeconds(S(64), 12, 2);
  await entryFor({ id: S(65), projectId: p, hours: 14, daysAgo: 1 });
  // Ordinary work between the two thresholds never fires.
  await entryFor({ id: S(66), projectId: p, hours: 3 });

  const rows = (await json(await stats(req('/stats?tz=UTC')))).body.attention
    .strangeDurations;
  assert.equal(rows.length, 2, 'one row each, never grouped');
  const byId = new Map(rows.map((r: { entryId: string }) => [r.entryId, r]));
  assert.equal((byId.get(S(64)) as { kind: string }).kind, 'short');
  assert.equal((byId.get(S(65)) as { kind: string }).kind, 'long');
});

test('a boundary length is ordinary, not strange', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  await entrySeconds(S(67), 60); // exactly the minimum
  await entryFor({ id: S(68), projectId: await durProject(), hours: 8 }); // exactly the maximum

  /* The thresholds are the shortest and longest ACCEPTABLE lengths. Firing on
     the boundary would question an entry the user set the threshold to
     allow. */
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.strangeDurations, []);
});

test('a running timer is never a strange duration', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  await pool.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at)
     values ($1,$2,'still going',$3,null)`,
    [S(69), USER, new Date(Date.UTC(2026, 8, 1)).toISOString()],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(
    res.body.attention.strangeDurations,
    [],
    'its length is still changing',
  );
});

test('answering the row with durationOk silences it', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  await entryFor({ id: S(70), projectId: await durProject(), hours: 14 });
  let res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.attention.strangeDurations.length, 1);

  await pool.query(`update time_entries set duration_ok=true where id=$1`, [
    S(70),
  ]);
  res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.strangeDurations, []);
});

test('editing the times asks the question again', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  await entryFor({ id: S(71), projectId: await durProject(), hours: 14 });
  await pool.query(`update time_entries set duration_ok=true where id=$1`, [
    S(71),
  ]);

  await pool.query(
    `update time_entries set ended_at = started_at + interval '20 hours' where id=$1`,
    [S(71)],
  );
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.attention.strangeDurations.length, 1, 'asks again');
});

test('an unprojected entry is one row, not two', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  // No project AND implausibly long: both facts hold of the same record.
  await entryFor({ id: S(73), projectId: null, hours: 14 });

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.attention.unprojected.length, 1);
  assert.deepEqual(
    res.body.attention.strangeDurations,
    [],
    'the inbox does not repeat itself',
  );
});

test('a projected entry of strange length still gets its row', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  const c = '33333333-0000-4000-8000-0000000000e9';
  const p = '33333333-0000-4000-8000-0000000000e8';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Acme')`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'Website')`,
    [p, USER, c],
  );
  await entryFor({ id: S(74), projectId: p, hours: 14 });

  // The suppression is narrow: it drops the duplicate, not the feature.
  const rows = (await json(await stats(req('/stats?tz=UTC')))).body.attention
    .strangeDurations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].projectName, 'Website');
  assert.equal(rows[0].clientName, 'Acme', 'the qualifier names the client');
});

test('an entry on an ISSUED invoice never fires the row', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  const c = '33333333-0000-4000-8000-0000000000d1';
  const inv = '45444444-0000-4000-8000-0000000000d1';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Billed')`,
    [c, USER],
  );
  await pool.query(
    `insert into invoices
       (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
        subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
     values ($1,$2,$3,'INV-0900',900,'sent','2026-09-01',100,0,0,100,'USD','entry')`,
    [inv, USER, c],
  );
  await entryFor({ id: S(72), projectId: await durProject(), hours: 14 });
  await pool.query(`update time_entries set invoice_id=$2 where id=$1`, [
    S(72),
    inv,
  ]);

  /* The row offers an edit, and an issued invoice locks the entry — so the
     row would be an action that cannot happen. */
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.strangeDurations, []);
});

test('entries can be filtered to those with NO project', async () => {
  const { GET: list } = await import('../src/app/api/v1/entries/route.ts');

  const c = '33333333-0000-4000-8000-00000000000e';
  const p = '33333333-0000-4000-8000-0000000000e1';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Has projects')`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await entryFor({ id: S(52), projectId: p, hours: 1 });
  await entryFor({ id: S(53), projectId: null, hours: 1 });

  /* `projectId=none`, not an absent parameter: absent already means "every
     entry", so there was no way to ask for the ones the inbox is about. */
  const res = await json(await list(req('/entries?projectId=none')));
  const ids = res.body.entries.map((e: { id: string }) => e.id);
  assert.deepEqual(ids, [S(53)], 'the projected entry is excluded');

  // And the uuid form still filters the other way.
  const byProject = await json(await list(req(`/entries?projectId=${p}`)));
  assert.deepEqual(
    byProject.body.entries.map((e: { id: string }) => e.id),
    [S(52)],
  );
});

test('unprojected ignores work that is billed, running or non-billable', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-00000000000c';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Mixed')`,
    [c, USER],
  );
  await pool.query(
    `insert into invoices
       (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
        subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
     values ($1,$2,$3,'INV-0010',10,'sent','2026-09-01',100,0,0,100,'USD','entry')`,
    ['45444444-0000-4000-8000-000000000010', USER, c],
  );

  // The one row that should count: unprojected, unbilled, billable, ended.
  await entryFor({ id: S(44), projectId: null, hours: 1 });

  // Already on an invoice — the rate question was settled at generation.
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable,invoice_id)
     values ($1,$2,null,'billed','2026-09-09T09:00:00Z','2026-09-09T12:00:00Z',
             true,$3)`,
    [S(45), USER, '45444444-0000-4000-8000-000000000010'],
  );

  // Non-billable: no rate is MEANT to resolve, so it is not a problem.
  await entryFor({ id: S(46), projectId: null, hours: 4, billable: false });

  // Still running, so it has no duration yet and the timer bar owns it.
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,is_billable)
     values ($1,$2,null,'running','2026-09-10T09:00:00Z',true)`,
    [S(47), USER],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.attention.unprojected.length, 1, 'only the open one');
  assert.equal(res.body.attention.unprojected[0].seconds, 3600);
});

test('attention rows are scoped to their own user', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const theirs = '33333333-0000-4000-8000-00000000000d';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Theirs')`,
    [theirs, OTHER],
  );
  // Their stale draft, their unprojected entry. Neither is ours to act on,
  // and an inbox that shows another user's money is the worst kind of wrong.
  await pool.query(
    `insert into invoices
       (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
        subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
     values ($1,$2,$3,'INV-0099',99,'draft','2026-01-01',500,0,0,500,'USD','entry')`,
    ['45444444-0000-4000-8000-000000000099', OTHER, theirs],
  );
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,null,'theirs','2026-09-09T09:00:00Z','2026-09-09T17:00:00Z',true)`,
    [S(48), OTHER],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.staleDrafts, []);
  assert.deepEqual(res.body.attention.unprojected, []);
});

// ── task name suggestions ──────────────────────────────────────────
const TASK_NAMES = '../src/app/api/v1/entries/task-names/route.ts';

/** An ended entry carrying a specific name; `daysAgo` sets the recency rank. */
async function namedEntry(opts: {
  id: string;
  name: string;
  projectId?: string | null;
  daysAgo: number;
  userId?: string;
}) {
  const start = new Date(Date.UTC(2026, 8, 10) - opts.daysAgo * 86_400_000);
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,$3,$4,$5,$6,true)`,
    [
      opts.id,
      opts.userId ?? USER,
      opts.projectId ?? null,
      opts.name,
      start.toISOString(),
      new Date(start.getTime() + 3_600_000).toISOString(),
    ],
  );
}

const names = (body: { taskNames: { taskName: string }[] }) =>
  body.taskNames.map((s) => s.taskName);

test('task names dedupe by case, keeping the most recent spelling', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  await namedEntry({ id: S(80), name: 'standup', daysAgo: 5 });
  await namedEntry({ id: S(81), name: 'Standup', daysAgo: 1 });

  /* Offering both spellings is offering the user their own typo, and the
     newer one is the one they have settled on. */
  const res = await json(await taskNames(req('/entries/task-names')));
  assert.deepEqual(names(res.body), ['Standup']);
});

test('task names exclude the empty name', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  // A timer started in a hurry has `''`, which is not a suggestion.
  await namedEntry({ id: S(82), name: '', daysAgo: 1 });
  await namedEntry({ id: S(83), name: 'Real work', daysAgo: 2 });

  const res = await json(await taskNames(req('/entries/task-names')));
  assert.deepEqual(names(res.body), ['Real work']);
});

test('task names exclude another user’s rows', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  await namedEntry({ id: S(84), name: 'Theirs', daysAgo: 1, userId: OTHER });
  await namedEntry({ id: S(85), name: 'Mine', daysAgo: 2 });

  const res = await json(await taskNames(req('/entries/task-names')));
  assert.deepEqual(names(res.body), ['Mine']);
});

test('the project preference ranks its own names first', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  const c = '33333333-0000-4000-8000-0000000000f0';
  const p = '33333333-0000-4000-8000-0000000000f1';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Acme')`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'Website')`,
    [p, USER, c],
  );

  // The project's name is OLDER, so recency alone would rank it last.
  await namedEntry({
    id: S(86),
    name: 'Project work',
    projectId: p,
    daysAgo: 9,
  });
  await namedEntry({ id: S(87), name: 'Newer internal', daysAgo: 1 });
  // No project at all: the comparison is NULL, which sorts FIRST under DESC
  // unless the function coalesces it.
  await namedEntry({ id: S(88), name: 'Unprojected', daysAgo: 2 });

  const preferred = await json(
    await taskNames(req(`/entries/task-names?projectId=${p}`)),
  );
  assert.equal(
    names(preferred.body)[0],
    'Project work',
    'the selected project outranks more recent work elsewhere',
  );
  assert.deepEqual(
    names(preferred.body).slice(1),
    ['Newer internal', 'Unprojected'],
    'everything else still follows, by recency — a preference is not a filter',
  );

  // Without the preference it is pure recency.
  const plain = await json(await taskNames(req('/entries/task-names')));
  assert.deepEqual(names(plain.body), [
    'Newer internal',
    'Unprojected',
    'Project work',
  ]);
});

test('task names honor limit', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  for (let i = 0; i < 5; i++) {
    await namedEntry({ id: S(90 + i), name: `Task ${i}`, daysAgo: i + 1 });
  }

  const res = await json(await taskNames(req('/entries/task-names?limit=2')));
  assert.deepEqual(names(res.body), ['Task 0', 'Task 1']);
});

test('task names accept a limit up to 1000 and reject one past it', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  const ok = await json(await taskNames(req('/entries/task-names?limit=1000')));
  assert.equal(ok.status, 200);

  const res = await json(
    await taskNames(req('/entries/task-names?limit=1001')),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
});

test('task names reject a non-uuid projectId', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  /* No `none` literal here: unlike `/entries`, the argument ranks rather
     than filters, so "no project" and "no preference" are one request. */
  const res = await json(
    await taskNames(req('/entries/task-names?projectId=none')),
  );
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
});

// ── import ─────────────────────────────────────────────────────────
const TOGGL = `User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (USD)
Me,me@x,Acme,Site,,Design,Yes,2026-03-10,09:00:00,2026-03-10,10:30:00,01:30:00,,150.00
Me,me@x,,Internal,,Admin,No,2026-03-10,11:00:00,2026-03-10,11:15:00,00:15:00,,
Me,me@x,Acme,Site,,Open,Yes,2026-03-11,09:00:00,,,,,
`;

const upload = (url: string, text: string) => {
  const form = new FormData();
  form.set('file', new File([text], 'export.csv', { type: 'text/csv' }));
  form.set('timeZone', 'America/New_York');
  return new Request(`http://t${url}`, { method: 'POST', body: form });
};

test('import preview writes nothing', async () => {
  const { POST } = await import('../src/app/api/v1/imports/preview/route.ts');
  const r = await json(await POST(upload('/imports/preview', TOGGL)));
  assert.equal(r.status, 200);
  assert.equal(r.body.summary.willWriteCount, 2);
  assert.equal(r.body.summary.excludedCount, 1);
  const { rows } = await pool.query('select count(*)::int n from time_entries');
  assert.equal(rows[0].n, 0);
});

test('import confirm writes once; the same file again adds nothing', async () => {
  const { POST } = await import('../src/app/api/v1/imports/confirm/route.ts');
  const first = await json(await POST(upload('/imports/confirm', TOGGL)));
  assert.equal(first.status, 200);
  assert.equal(first.body.written, 2);

  const { POST: preview } = await import(
    '../src/app/api/v1/imports/preview/route.ts'
  );
  const told = await json(await preview(upload('/imports/preview', TOGGL)));
  assert.equal(told.body.summary.newCount, 0, 'the preview says so first');
  assert.equal(told.body.summary.alreadyImportedCount, 2);

  const again = await json(await POST(upload('/imports/confirm', TOGGL)));
  assert.equal(again.body.written, 0);
  assert.equal(again.body.alreadyImported, 2);

  const counts = await pool.query(
    `select (select count(*)::int from time_entries) e,
            (select count(*)::int from projects) p,
            (select count(*)::int from clients) c,
            (select count(*)::int from time_entries where rate_override is not null) o`,
  );
  assert.deepEqual(counts.rows[0], { e: 2, p: 2, c: 1, o: 0 });
});

test('import refuses a file that is not an export, before writing', async () => {
  const { POST } = await import('../src/app/api/v1/imports/confirm/route.ts');
  const r = await json(await POST(upload('/imports/confirm', 'a,b\n1,2\n')));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'IMPORT_FILE_UNRECOGNIZED');
  const { rows } = await pool.query('select count(*)::int n from time_entries');
  assert.equal(rows[0].n, 0);
});

test('import: work invoiced elsewhere is earned but never unbilled or invoiceable', async () => {
  const { POST } = await import('../src/app/api/v1/imports/confirm/route.ts');
  const r = upload('/imports/confirm', TOGGL);
  const form = await r.formData();
  form.set(
    'clients',
    JSON.stringify({ acme: { invoicedThrough: '2026-03-10' } }),
  );
  const res = await json(
    await POST(
      new Request('http://t/imports/confirm', { method: 'POST', body: form }),
    ),
  );
  // Admin is Mar 10 too, but has no client, so no date reaches it.
  assert.equal(res.body.invoicedElsewhere, 1);

  const { rows } = await pool.query(
    'select coalesce(sum(seconds),0)::int s from unbilled_by_client($1)',
    [USER],
  );
  // The billable Mar 10 entry is invoiced elsewhere, so nothing is unbilled.
  assert.equal(rows[0].s, 0);
});

const withFields = async (
  url: string,
  fields: Record<string, string>,
): Promise<Request> => {
  const form = await upload(url, TOGGL).formData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(`http://t${url}`, { method: 'POST', body: form });
};

test("import confirm writes a new client's rate and color, and never an excluded row", async () => {
  // Admin (11:00–11:15 ET) lands on work already here.
  await pool.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at)
     values ('018f0000-0000-7000-8000-00000000b0b1',$1,'Call','2026-03-10T15:05:00Z','2026-03-10T15:10:00Z')`,
    [USER],
  );
  const { POST: preview } = await import(
    '../src/app/api/v1/imports/preview/route.ts'
  );
  const told = await json(await preview(upload('/imports/preview', TOGGL)));
  assert.deepEqual(
    told.body.overlaps.map((o: { taskName: string; otherInStint: boolean }) => [
      o.taskName,
      o.otherInStint,
    ]),
    [['Admin', true]],
  );

  const { POST } = await import('../src/app/api/v1/imports/confirm/route.ts');
  const res = await json(
    await POST(
      await withFields('/imports/confirm', {
        excluded: JSON.stringify([told.body.overlaps[0].sourceRowId]),
        clients: JSON.stringify({ acme: { hourlyRate: 0, color: '#DA8188' } }),
      }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.written, 1, 'Design only; Admin was excluded');

  const { rows } = await pool.query(
    `select (select count(*)::int from time_entries where task_name = 'Admin') admin,
            (select row(hourly_rate::float, color)::text from clients where name = 'Acme') acme`,
  );
  assert.deepEqual(rows[0], { admin: 0, acme: '(0,#DA8188)' });
});

test('import refuses malformed choices before writing', async () => {
  const { POST } = await import('../src/app/api/v1/imports/confirm/route.ts');
  for (const fields of [
    { clients: 'not json' },
    { clients: JSON.stringify({ acme: { hourlyRate: -1 } }) },
    { clients: JSON.stringify({ acme: { invoicedThrough: '3/10/2026' } }) },
    { clients: JSON.stringify({ acme: { color: 'red' } }) },
    { excluded: JSON.stringify([1]) },
  ] as Record<string, string>[]) {
    const r = await json(
      await POST(await withFields('/imports/confirm', fields)),
    );
    assert.equal(r.status, 422, JSON.stringify(fields));
    assert.equal(r.body.code, 'VALIDATION_FAILED');
  }
  const { rows } = await pool.query('select count(*)::int n from time_entries');
  assert.equal(rows[0].n, 0);
});

test('/stats lists entries sharing a minute or more, and editing one clears it', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  const a = '018f0000-0000-7000-8000-00000000a0a1';
  const b = '018f0000-0000-7000-8000-00000000a0a2';
  const c = '018f0000-0000-7000-8000-00000000a0a3';
  await pool.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at) values
       ($1,$4,'Foundation','2026-08-19T13:50:33Z','2026-08-19T15:03:00Z'),
       ($2,$4,'Standup',   '2026-08-19T15:00:00Z','2026-08-19T15:21:00Z'),
       ($3,$4,'Standup',   '2026-08-19T15:20:52Z','2026-08-19T15:22:37Z')`,
    [a, b, c, USER],
  );

  const before = await json(await stats(req('/stats?tz=UTC')));
  // Foundation/Standup share 3 minutes; the two Standups share 8 seconds.
  assert.deepEqual(
    before.body.attention.overlaps.map(
      (o: { entryId: string; otherEntryId: string; seconds: number }) => [
        o.entryId,
        o.otherEntryId,
        o.seconds,
      ],
    ),
    [[b, a, 180]],
  );

  await pool.query(
    `update time_entries set ended_at='2026-08-19T15:00:00Z' where id=$1`,
    [a],
  );
  const after = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(after.body.attention.overlaps, []);
});

test('/stats flags an entry that overlaps time already billed', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  const c = '33333333-0000-4000-8000-0000000000c1';
  const p = '33333333-0000-4000-8000-0000000000c2';
  const inv = 'ff000000-0000-4000-8000-0000000000c3';
  const billed = '018f0000-0000-7000-8000-00000000c0c1';
  const fresh = '018f0000-0000-7000-8000-00000000c0c2';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Northwind',150)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await pool.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status,sent_at)
     values ($1,$2,$3,'INV-0001',1,'sent',now())`,
    [inv, USER, c],
  );
  // 9-10 was billed on that invoice; 9:30-10:30 was added afterwards. The
  // new entry is the one to fix, and it can be — only the billed one is
  // locked. Left unflagged, the next invoice charges 9:30-10:00 twice.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,invoice_id) values
       ($1,$3,$4,'Billed', '2026-08-19T09:00:00Z','2026-08-19T10:00:00Z',$5),
       ($2,$3,$4,'Added',  '2026-08-19T09:30:00Z','2026-08-19T10:30:00Z',null)`,
    [billed, fresh, USER, p, inv],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(
    res.body.attention.overlaps.map(
      (o: {
        entryId: string;
        otherEntryId: string;
        otherInvoiceNumber: string | null;
        seconds: number;
      }) => [o.entryId, o.otherEntryId, o.otherInvoiceNumber, o.seconds],
    ),
    [[fresh, billed, 'INV-0001', 1800]],
    'the half hour already invoiced is about to be billed again',
  );
});

test('/stats pairs only billable work against billed time', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  const c = '33333333-0000-4000-8000-0000000000d1';
  const p = '33333333-0000-4000-8000-0000000000d2';
  const inv = 'ff000000-0000-4000-8000-0000000000d3';
  const billed = '018f0000-0000-7000-8000-00000000d0d1';
  const free = '018f0000-0000-7000-8000-00000000d0d2';
  const also = '018f0000-0000-7000-8000-00000000d0d3';
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,'Northwind',150)`,
    [c, USER],
  );
  await pool.query(
    `insert into projects (id,user_id,client_id,name) values ($1,$2,$3,'P')`,
    [p, USER, c],
  );
  await pool.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status,sent_at)
     values ($1,$2,$3,'INV-0001',1,'sent',now())`,
    [inv, USER, c],
  );
  // Non-billable work is never invoiced, so overlapping billed time bills
  // nothing twice; overlapping other unbilled work is still flagged.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,invoice_id,is_billable) values
       ($1,$4,$5,'Billed','2026-08-19T09:00:00Z','2026-08-19T10:00:00Z',$6,true),
       ($2,$4,$5,'Free',  '2026-08-19T09:30:00Z','2026-08-19T10:30:00Z',null,false),
       ($3,$4,$5,'Also',  '2026-08-19T10:00:00Z','2026-08-19T11:00:00Z',null,true)`,
    [billed, free, also, USER, p, inv],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(
    res.body.attention.overlaps.map(
      (o: { entryId: string; otherEntryId: string }) => [
        o.entryId,
        o.otherEntryId,
      ],
    ),
    [[also, free]],
  );
});

// ── reads past PostgREST's 1,000 rows ──────────────────────────────
// The shim caps a select the way PostgREST does, so a read that does not
// page fails here.
const fillMe = (n: number, from: string, projectId: string | null) =>
  fill(pool, { userId: USER, projectId, from, n });

const attention = async () => {
  const { GET } = await import('../src/app/api/v1/stats/route.ts');
  return (await json(await GET(req('/stats?tz=UTC')))).body.attention;
};

test('the inbox lists every unprojected entry', async () => {
  await fillMe(1001, '2026-08-01T00:00:00Z', null);
  assert.equal((await attention()).unprojected.length, 1001);
});

test('the inbox finds a strange duration past the first thousand', async () => {
  const project = await durProject();
  await fillMe(1000, '2026-08-01T00:00:00Z', project);
  // The newest, so the last row of a read ordered oldest first.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     values (gen_random_uuid(),$1,$2,'Overnight','2026-08-20T00:00:00Z','2026-08-20T14:00:00Z')`,
    [USER, project],
  );
  await pool.query(
    'update user_settings set max_entry_hours=8 where user_id=$1',
    [USER],
  );
  const rows = (await attention()).strangeDurations;
  assert.deepEqual(
    rows.map((r: { taskName: string }) => r.taskName),
    ['Overnight'],
  );
});

test('the inbox finds an overlap past the first thousand', async () => {
  const project = await durProject();
  await fillMe(1000, '2026-08-01T00:00:00Z', project);
  // Sharing half an hour, and written last.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at) values
       (gen_random_uuid(),$1,$2,'First', '2026-08-20T20:00:00Z','2026-08-20T21:00:00Z'),
       (gen_random_uuid(),$1,$2,'Second','2026-08-20T20:30:00Z','2026-08-20T21:30:00Z')`,
    [USER, project],
  );
  assert.equal((await attention()).overlaps.length, 1);
});

test('the calendar returns every entry in its range', async () => {
  const { GET } = await import('../src/app/api/v1/calendar/route.ts');
  await fillMe(1001, '2026-09-01T00:00:00Z', await durProject());

  const res = await json(
    await GET(
      req('/calendar?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z&tz=UTC'),
    ),
  );
  const entries = res.body.days.reduce(
    (n: number, d: { entries: unknown[] }) => n + d.entries.length,
    0,
  );
  assert.equal(entries, 1001);
});

test('an import preview sees an overlap with existing work past the first thousand', async () => {
  const { POST } = await import('../src/app/api/v1/imports/preview/route.ts');
  const project = await durProject();
  // Inside the window the preview reads, and over by the hour below.
  await fillMe(1000, '2026-03-09T00:00:00Z', project);
  // 20:00Z to 21:00Z, written last.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     values (gen_random_uuid(),$1,$2,'Existing','2026-03-10T20:00:00Z','2026-03-10T21:00:00Z')`,
    [USER, project],
  );

  // 16:00 in New York, daylight time: the same hour as the entry above.
  const form = new FormData();
  form.set(
    'file',
    new File(
      [
        `User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (USD)
Me,me@x,Acme,Site,,Design,Yes,2026-03-10,16:00:00,2026-03-10,17:00:00,01:00:00,,150.00
`,
      ],
      'export.csv',
      { type: 'text/csv' },
    ),
  );
  form.set('timeZone', 'America/New_York');
  const res = await json(
    await POST(
      new Request('http://t/imports/preview', { method: 'POST', body: form }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.overlappingCount, 1);
});

// ── health, and errors reaching Sentry ─────────────────────────────
/** A database client whose every query answers with `error`. */
const failingDb = (error: { code?: string; message: string }) => ({
  from: () => ({
    select: () => ({ limit: async () => ({ data: null, error }) }),
  }),
});

test('health answers 200 while the database answers', async () => {
  const { GET } = await import('../src/app/api/v1/health/route.ts');
  const res = await json(await GET());
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('health answers 200 when Postgres refuses anon, which is Postgres answering', async () => {
  const { GET } = await import('../src/app/api/v1/health/route.ts');
  (globalThis as any).__TEST_DB__ = failingDb({
    code: '42501',
    message: 'permission denied for table clients',
  });
  const res = await json(await GET());
  assert.equal(res.status, 200);
});

test('health answers 503 when the database does not, so the monitor alerts', async () => {
  const { GET } = await import('../src/app/api/v1/health/route.ts');
  (globalThis as any).__TEST_DB__ = failingDb({
    code: 'PGRST000',
    message: 'Could not connect',
  });
  const res = await json(await GET());
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { ok: false });
});

/** What each event `GET /clients` sends Sentry says it is, against `db`. */
async function sentryEventsFor(db: unknown) {
  const Sentry = await import('@sentry/nextjs');
  const { close } = await import('@sentry/core');
  const sent: {
    type?: string;
    value?: string;
    synthetic: boolean;
    fingerprint?: string[];
    user?: unknown;
  }[] = [];
  Sentry.init({
    dsn: 'https://key@o0.ingest.sentry.io/0',
    beforeSend(event) {
      const { type, value, mechanism } = event.exception?.values?.[0] ?? {};
      sent.push({
        type,
        value,
        synthetic: mechanism?.synthetic ?? false,
        fingerprint: event.fingerprint,
        user: event.user,
      });
      return null;
    },
  });
  const { GET } = await import('../src/app/api/v1/clients/route.ts');
  (globalThis as any).__TEST_DB__ = db;
  const res = await GET(req('/clients'));
  await close(1000);
  assert.equal(res.status, 500);
  return sent;
}

test('an unhandled route error reaches Sentry with its user, not only the log', async () => {
  const sent = await sentryEventsFor({
    from() {
      throw new Error('unexpected');
    },
  });
  assert.deepEqual(sent, [
    {
      type: 'Error',
      value: 'unexpected',
      synthetic: false,
      fingerprint: undefined,
      // The id alone: an email or name would put who they are in Sentry.
      user: { id: USER },
    },
  ]);
});

test('a database error object reaches Sentry titled and grouped by its message', async () => {
  const failed = () =>
    Promise.resolve({
      data: null,
      error: { message: 'Project not specified.' },
    });
  const query = { select: () => query, order: () => ({ is: failed }) };
  const sent = await sentryEventsFor({ from: () => query });
  assert.deepEqual(sent, [
    {
      type: 'Error',
      value: 'Project not specified.',
      synthetic: false,
      fingerprint: ['{{ default }}', 'Project not specified.'],
      user: { id: USER },
    },
  ]);
});

// ── feedback ───────────────────────────────────────────────────────
const FEEDBACK = {
  id: '018f0000-0000-7000-a000-000000000001',
  message: 'The Northwind total looks short.',
  screen: '/invoices',
  client: 'web',
  appVersion: '0.1.0-alpha.3',
};

const feedbackRows = async () =>
  (
    await pool.query(
      'select user_id, message, screen, client, app_version from feedback',
    )
  ).rows;

test('feedback is stored with the sender and the context it was sent with', async () => {
  const { POST } = await import('../src/app/api/v1/feedback/route.ts');

  const res = await json(
    await POST(req('/feedback', { ...FEEDBACK, userId: OTHER })),
  );
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { id: FEEDBACK.id });
  assert.deepEqual(await feedbackRows(), [
    {
      user_id: USER,
      message: FEEDBACK.message,
      screen: '/invoices',
      client: 'web',
      app_version: '0.1.0-alpha.3',
    },
  ]);
});

test('feedback trims its message and refuses an empty or overlong one', async () => {
  const { POST } = await import('../src/app/api/v1/feedback/route.ts');

  for (const message of ['', '   ', 'x'.repeat(2001)]) {
    const res = await POST(req('/feedback', { ...FEEDBACK, message }));
    assert.equal(res.status, 422, `"${message.slice(0, 5)}…" is refused`);
  }
  const ok = await POST(
    req('/feedback', { ...FEEDBACK, message: `  ${'x'.repeat(2000)}  ` }),
  );
  assert.equal(ok.status, 201, '2,000 characters after trimming is allowed');
  assert.equal((await feedbackRows())[0].message.length, 2000);
});

test('feedback refuses a missing screen or version and an unknown client', async () => {
  const { POST } = await import('../src/app/api/v1/feedback/route.ts');

  const { screen: _s, ...noScreen } = FEEDBACK;
  const { appVersion: _v, ...noVersion } = FEEDBACK;
  for (const body of [
    noScreen,
    noVersion,
    { ...FEEDBACK, client: 'ios' },
    { ...FEEDBACK, screen: 'invoices' },
  ]) {
    assert.equal((await POST(req('/feedback', body))).status, 422);
  }
  assert.equal((await feedbackRows()).length, 0);
});

test('a retried feedback send stores one message', async () => {
  const { POST } = await import('../src/app/api/v1/feedback/route.ts');

  assert.equal((await POST(req('/feedback', FEEDBACK))).status, 201);
  const again = await json(await POST(req('/feedback', FEEDBACK)));
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { id: FEEDBACK.id });
  assert.equal((await feedbackRows()).length, 1);
});

// ── billing ────────────────────────────────────────────────────────
const subscriptionRows = async () =>
  (
    await pool.query(
      `select user_id, stripe_customer_id, stripe_subscription_id, status,
              current_period_end, cancel_at_period_end
       from subscriptions order by user_id`,
    )
  ).rows;

/** A Stripe event, signed as Stripe signs it, delivered to the webhook. */
const deliver = async (
  type: string,
  object: Record<string, unknown>,
  signature?: string,
) => {
  const { POST } = await import('../src/app/api/v1/billing/webhook/route.ts');
  const payload = JSON.stringify({
    id: `evt_${type}`,
    object: 'event',
    type,
    data: { object },
  });
  return POST(
    new Request('http://t/billing/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature':
          signature ??
          Stripe.webhooks.generateTestHeaderString({
            payload,
            secret: WEBHOOK_SECRET,
          }),
      },
      body: payload,
    }),
  );
};

const billing = async () => {
  const { GET } = await import('../src/app/api/v1/billing/route.ts');
  return json(await GET(req('/billing')));
};

test('billing reads free with no subscription, and says whether Stripe is set up', async () => {
  const free = {
    available: false,
    plan: 'free',
    status: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    paymentFailed: false,
  };
  assert.deepEqual(await billing(), { status: 200, body: free });
  configureBilling();
  assert.deepEqual((await billing()).body, { ...free, available: true });
});

test('every billing write answers 503 until Stripe is set up', async () => {
  const { POST: checkout } = await import(
    '../src/app/api/v1/billing/checkout/route.ts'
  );
  const { POST: portal } = await import(
    '../src/app/api/v1/billing/portal/route.ts'
  );
  const { POST: sync } = await import(
    '../src/app/api/v1/billing/sync/route.ts'
  );
  for (const res of [
    await checkout(req('/billing/checkout', {})),
    await portal(req('/billing/portal', {})),
    await sync(req('/billing/sync', { sessionId: 'cs_1' })),
  ]) {
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'BILLING_UNAVAILABLE');
  }
  assert.equal(
    (await deliver('invoice.paid', { customer: 'cus_1' })).status,
    503,
  );
  assert.equal(stripeFake.state.created.length, 0);
});

test('the webhook refuses a missing or forged signature and changes nothing', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(subscription({ userId: USER }));
  const { POST } = await import('../src/app/api/v1/billing/webhook/route.ts');
  const unsigned = await POST(
    new Request('http://t/billing/webhook', { method: 'POST', body: '{}' }),
  );
  assert.equal(unsigned.status, 400);
  const forged = await deliver(
    'customer.subscription.updated',
    { customer: 'cus_1' },
    Stripe.webhooks.generateTestHeaderString({
      payload: '{}',
      secret: 'whsec_someone_else',
    }),
  );
  assert.equal(forged.status, 400);
  assert.deepEqual(await subscriptionRows(), []);
});

test('a subscription event stores what Stripe says now, for the user in its metadata', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(subscription({ userId: USER }));
  const res = await deliver('customer.subscription.created', {
    customer: 'cus_1',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await subscriptionRows(), [
    {
      user_id: USER,
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      status: 'active',
      current_period_end: new Date(1_830_000_000 * 1000)
        .toISOString()
        .replace('.000Z', '+00:00'),
      cancel_at_period_end: false,
    },
  ]);
  const read = await billing();
  assert.equal(read.body.plan, 'paid');
  assert.equal(
    read.body.periodEnd,
    new Date(1_830_000_000 * 1000).toISOString(),
  );
});

test('the same event twice leaves the same one row', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(subscription({ userId: USER }));
  await deliver('invoice.paid', { customer: 'cus_1' });
  const once = await subscriptionRows();
  await deliver('invoice.paid', { customer: 'cus_1' });
  assert.deepEqual(await subscriptionRows(), once);
  assert.equal(once.length, 1);
});

test('an old event arriving late still leaves the current state', async () => {
  configureBilling();
  const sub = subscription({ userId: USER });
  stripeFake.state.subscriptions.push(sub);
  sub.status = 'canceled';
  await deliver('customer.subscription.deleted', { customer: 'cus_1' });
  // The `created` event, delayed past the cancel, carries an active payload.
  await deliver('customer.subscription.created', {
    customer: 'cus_1',
    status: 'active',
  });
  assert.equal((await subscriptionRows())[0].status, 'canceled');
  assert.equal((await billing()).body.plan, 'free');
});

test('a cancel at period end stays paid, and says when it ends', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(
    subscription({ userId: USER, cancel_at: 1_820_000_000 }),
  );
  await deliver('customer.subscription.updated', { customer: 'cus_1' });
  const read = (await billing()).body;
  assert.equal(read.plan, 'paid');
  assert.equal(read.cancelAtPeriodEnd, true);
  assert.equal(read.periodEnd, new Date(1_820_000_000 * 1000).toISOString());
});

test('a failed renewal keeps the plan paid and says the payment failed', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(
    subscription({ userId: USER, status: 'past_due' }),
  );
  await deliver('invoice.payment_failed', { customer: 'cus_1' });
  const read = (await billing()).body;
  assert.equal(read.plan, 'paid');
  assert.equal(read.paymentFailed, true);
});

test('a current subscription wins over an older canceled one', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(
    subscription({ id: 'sub_old', userId: USER, status: 'canceled' }),
    subscription({ id: 'sub_new', userId: USER }),
  );
  await deliver('customer.subscription.created', { customer: 'cus_1' });
  assert.equal((await subscriptionRows())[0].stripe_subscription_id, 'sub_new');
});

test('an event for a customer with no subscription of ours is acknowledged and ignored', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(
    subscription({ customer: 'cus_stranger' }),
  );
  const unknown = await deliver('invoice.paid', { customer: 'cus_nobody' });
  assert.equal(unknown.status, 200);
  const noMetadata = await deliver('invoice.paid', {
    customer: 'cus_stranger',
  });
  assert.equal(noMetadata.status, 200);
  const unrelated = await deliver('charge.refunded', { customer: 'cus_1' });
  assert.equal(unrelated.status, 200);
  assert.deepEqual(await subscriptionRows(), []);
});

test('a subscription whose account is gone is canceled at Stripe, never charged again', async () => {
  configureBilling();
  // Paid, then the account deleted before any sync wrote the row, so
  // DELETE /account had nothing to cancel.
  stripeFake.state.subscriptions.push(
    subscription({ userId: '99999999-9999-9999-9999-999999999999' }),
  );
  const res = await deliver('customer.subscription.created', {
    customer: 'cus_1',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(stripeFake.state.canceled, ['sub_1']);
  assert.deepEqual(await subscriptionRows(), []);

  // Its own `deleted` event then finds it ended, and cancels nothing more.
  await deliver('customer.subscription.deleted', { customer: 'cus_1' });
  assert.deepEqual(stripeFake.state.canceled, ['sub_1']);
});

test('a second customer paying for the same user does not replace the first', async () => {
  configureBilling();
  // Two payment pages completed at once, each making its own customer.
  const first = subscription({ id: 'sub_a', customer: 'cus_a', userId: USER });
  stripeFake.state.subscriptions.push(
    first,
    subscription({ id: 'sub_b', customer: 'cus_b', userId: USER }),
  );
  await deliver('customer.subscription.created', { customer: 'cus_a' });
  await deliver('customer.subscription.created', { customer: 'cus_b' });
  const rows = await subscriptionRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stripe_customer_id, 'cus_a');

  // Once the first has ended, the second is the user's subscription.
  first.status = 'canceled';
  await deliver('customer.subscription.deleted', { customer: 'cus_a' });
  await deliver('invoice.paid', { customer: 'cus_b' });
  assert.equal((await subscriptionRows())[0].stripe_customer_id, 'cus_b');
});

test('checkout opens Stripe for the yearly price, with the user and the renewal stated', async () => {
  configureBilling();
  const { POST } = await import('../src/app/api/v1/billing/checkout/route.ts');
  const res = await json(await POST(req('/billing/checkout', {})));
  assert.equal(res.status, 200);
  assert.equal(res.body.url, 'https://checkout.stripe.test/1');
  const params = stripeFake.state.created[0] as any;
  assert.equal(params.mode, 'subscription');
  assert.deepEqual(params.line_items, [{ price: 'price_yearly', quantity: 1 }]);
  assert.equal(params.client_reference_id, USER);
  assert.deepEqual(params.subscription_data, { metadata: { user_id: USER } });
  assert.equal(params.customer, undefined, 'a first checkout makes a customer');
  assert.deepEqual(params.consent_collection, { terms_of_service: 'required' });
  assert.match(params.custom_text.submit.message, /Renews every year/);
  assert.equal(params.automatic_tax, undefined, 'no sales tax at launch');
  assert.equal(
    params.success_url,
    'http://t/settings?checkout={CHECKOUT_SESSION_ID}',
  );
  assert.equal(params.cancel_url, 'http://t/settings');
});

test("checkout reuses a returning subscriber's customer, and refuses a paid one", async () => {
  configureBilling();
  const { POST } = await import('../src/app/api/v1/billing/checkout/route.ts');
  await pool.query(
    `insert into subscriptions (user_id, stripe_customer_id,
       stripe_subscription_id, status, current_period_end)
     values ($1, 'cus_back', 'sub_gone', 'canceled', now())`,
    [USER],
  );
  await POST(req('/billing/checkout', {}));
  assert.equal((stripeFake.state.created[0] as any).customer, 'cus_back');

  await pool.query(`update subscriptions set status = 'active'`);
  const paid = await json(await POST(req('/billing/checkout', {})));
  assert.equal(paid.status, 409);
  assert.equal(paid.body.code, 'ALREADY_SUBSCRIBED');
  assert.equal(stripeFake.state.created.length, 1);
});

test('back from checkout, sync stores the paid plan without waiting on the webhook', async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(subscription({ userId: USER }));
  stripeFake.state.sessions.set('cs_mine', {
    id: 'cs_mine',
    client_reference_id: USER,
    customer: 'cus_1',
  });
  const { POST } = await import('../src/app/api/v1/billing/sync/route.ts');
  const res = await json(
    await POST(req('/billing/sync', { sessionId: 'cs_mine' })),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.plan, 'paid');
  assert.equal((await subscriptionRows()).length, 1);
});

test("sync answers another user's or an unknown checkout as not found", async () => {
  configureBilling();
  stripeFake.state.subscriptions.push(subscription({ userId: OTHER }));
  stripeFake.state.sessions.set('cs_theirs', {
    id: 'cs_theirs',
    client_reference_id: OTHER,
    customer: 'cus_1',
  });
  const { POST } = await import('../src/app/api/v1/billing/sync/route.ts');
  for (const sessionId of ['cs_theirs', 'cs_missing']) {
    const res = await json(await POST(req('/billing/sync', { sessionId })));
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'CHECKOUT_NOT_FOUND');
  }
  assert.deepEqual(await subscriptionRows(), []);
});

test('the portal opens for the stored customer, and refuses with none', async () => {
  configureBilling();
  const { POST } = await import('../src/app/api/v1/billing/portal/route.ts');
  const none = await json(await POST(req('/billing/portal', {})));
  assert.equal(none.status, 409);
  assert.equal(none.body.code, 'NOT_SUBSCRIBED');

  await pool.query(
    `insert into subscriptions (user_id, stripe_customer_id,
       stripe_subscription_id, status, current_period_end)
     values ($1, 'cus_1', 'sub_1', 'active', now())`,
    [USER],
  );
  const res = await json(await POST(req('/billing/portal', {})));
  assert.equal(res.status, 200);
  assert.equal(res.body.url, 'https://billing.stripe.test/session');
  assert.deepEqual(stripeFake.state.portals, [
    { customer: 'cus_1', return_url: 'http://t/settings' },
  ]);
});

test('deleting an account cancels its subscription first, and keeps the account if Stripe refuses', async () => {
  configureBilling();
  const { DELETE } = await import('../src/app/api/v1/account/route.ts');
  await pool.query(
    `insert into subscriptions (user_id, stripe_customer_id,
       stripe_subscription_id, status, current_period_end)
     values ($1, 'cus_1', 'sub_1', 'active', now())`,
    [USER],
  );
  // The shim cannot run `delete_account()` as a signed-in user; what this
  // asserts is the order: Stripe first, and no deletion past a failure.
  const deleted: string[] = [];
  const db = makeDb(pool, USER);
  (globalThis as any).__TEST_DB__ = {
    ...db,
    rpc: async (fn: string) => {
      deleted.push(fn);
      return { data: null, error: null };
    },
  };

  stripeFake.state.failCancel = true;
  assert.equal(
    (await DELETE(req('/account', undefined, 'DELETE'))).status,
    500,
  );
  assert.deepEqual(deleted, [], 'not deleted while still subscribed');

  stripeFake.state.failCancel = false;
  assert.equal(
    (await DELETE(req('/account', undefined, 'DELETE'))).status,
    204,
  );
  assert.deepEqual(stripeFake.state.canceled, ['sub_1']);
  assert.deepEqual(deleted, ['delete_account']);
});

test('deleting an account with an ended subscription does not call Stripe', async () => {
  const { DELETE } = await import('../src/app/api/v1/account/route.ts');
  await pool.query(
    `insert into subscriptions (user_id, stripe_customer_id,
       stripe_subscription_id, status, current_period_end)
     values ($1, 'cus_1', 'sub_1', 'canceled', now())`,
    [USER],
  );
  const db = makeDb(pool, USER);
  (globalThis as any).__TEST_DB__ = {
    ...db,
    rpc: async () => ({ data: null, error: null }),
  };
  assert.equal(
    (await DELETE(req('/account', undefined, 'DELETE'))).status,
    204,
  );
  assert.deepEqual(stripeFake.state.canceled, []);
});

// ── export ─────────────────────────────────────────────────────────
const EXPORT_CLIENT = '33333333-0000-4000-8000-0000000000e1';
const EXPORT_PROJECT = '33333333-0000-4000-8000-0000000000e2';

async function exportFixture() {
  await pool.query(
    `insert into clients (id,user_id,name,hourly_rate,archived_at)
     values ($1,$2,'Northwind',150,now())`,
    [EXPORT_CLIENT, USER],
  );
  // A project rate of 0 is a real rate, not a missing one.
  await pool.query(
    `insert into projects (id,user_id,client_id,name,hourly_rate)
     values ($1,$2,$3,'Pro bono',0)`,
    [EXPORT_PROJECT, USER, EXPORT_CLIENT],
  );
}

const exportInvoice = (
  id: string,
  n: number,
  status: string,
  user = USER,
  client = EXPORT_CLIENT,
) =>
  pool.query(
    `insert into invoices
       (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
        period_start,period_end,
        subtotal,tax_rate,tax_amount,total,currency,grouping_mode,paid_at)
     values ($1,$2,$3,$4,$5,$6,'2026-09-01','2026-08-01','2026-08-31',
             100,0,0,100,'USD','entry',$7)`,
    [
      id,
      user,
      client,
      `INV-000${n}`,
      n,
      status,
      status === 'paid' ? '2026-09-20T12:00:00Z' : null,
    ],
  );

const csvRows = async (r: Response) =>
  (await r.text()).slice(1).split('\r\n').slice(0, -1);

test('the invoices export is every invoice, any status, as a CSV attachment', async () => {
  const { GET } = await import('../src/app/api/v1/exports/invoices/route.ts');
  await exportFixture();
  await exportInvoice('44444444-0000-4000-8000-0000000000e1', 1, 'void');
  await exportInvoice('44444444-0000-4000-8000-0000000000e2', 2, 'paid');
  await exportInvoice('44444444-0000-4000-8000-0000000000e3', 3, 'draft');

  const theirClient = '33333333-0000-4000-8000-0000000000e9';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Theirs')`,
    [theirClient, OTHER],
  );
  await exportInvoice(
    '44444444-0000-4000-8000-0000000000e9',
    9,
    'sent',
    OTHER,
    theirClient,
  );
  await pool.query(`update clients set name = 'Renamed' where id = $1`, [
    EXPORT_CLIENT,
  ]);

  const res = await GET(req('/exports/invoices?tz=America/New_York'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(
    res.headers.get('content-disposition') ?? '',
    /^attachment; filename="stint-invoices-\d{4}-\d{2}-\d{2}\.csv"$/,
  );
  assert.equal(res.headers.get('cache-control'), 'private, no-store');

  const rows = await csvRows(res);
  assert.equal(rows.length, 4, 'a header and three invoices, none of theirs');
  assert.deepEqual(
    rows.slice(1).map((r) => r.split(',').slice(0, 3).join(',')),
    [
      'INV-0003,Northwind,Draft',
      'INV-0002,Northwind,Paid',
      'INV-0001,Northwind,Void',
    ],
    'an archived or renamed client exports by the name each invoice froze',
  );
  assert.equal(rows[2]!.split(',')[6], '09/20/2026', 'the paid date');
});

test('the entries export carries each finished entry with its resolved rate', async () => {
  const { GET } = await import('../src/app/api/v1/exports/entries/route.ts');
  await exportFixture();
  const inv = '44444444-0000-4000-8000-0000000000e4';
  await exportInvoice(inv, 4, 'draft');

  const entry = (id: string, start: string, end: string | null, extra = {}) =>
    pool.query(
      `insert into time_entries
         (id,user_id,project_id,task_name,started_at,ended_at,invoice_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        USER,
        EXPORT_PROJECT,
        'Pro bono work',
        start,
        end,
        (extra as { invoiceId?: string }).invoiceId ?? null,
      ],
    );
  await entry(S(1), '2026-09-01T13:00:00Z', '2026-09-01T14:00:00Z', {
    invoiceId: inv,
  });
  await entry(S(2), '2026-09-02T13:00:00Z', null);
  await pool.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at)
     values ($1,$2,'Theirs','2026-09-01T13:00:00Z','2026-09-01T14:00:00Z')`,
    [S(3), OTHER],
  );

  const res = await GET(req('/exports/entries?tz=UTC'));
  assert.equal(res.status, 200);
  assert.match(
    res.headers.get('content-disposition') ?? '',
    /filename="stint-entries-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  const rows = await csvRows(res);
  assert.equal(rows.length, 2, 'no running entry, nothing of theirs');
  assert.equal(
    rows[1],
    '09/01/2026,1:00 PM,2:00 PM,1.00,Northwind,Pro bono,Pro bono work,Yes,0.00,project,0.00,USD,INV-0004',
  );
});

test('the entries export reads past the 1,000-row page', async () => {
  const { GET } = await import('../src/app/api/v1/exports/entries/route.ts');
  await fill(pool, {
    userId: USER,
    projectId: null,
    from: '2026-01-01T00:00:00Z',
    n: 1200,
  });
  const rows = await csvRows(await GET(req('/exports/entries?tz=UTC')));
  assert.equal(rows.length, 1201);
  assert.match(
    rows[1]!,
    /,0\.02,,,Work,Yes,100\.00,default,2\.00,USD,$/,
    'one minute at the default',
  );
});

// ── signing in ─────────────────────────────────────────────────────
/* Every other test injects `__TEST_DB__`, which short-circuits
   `requireSession`, so a route that never called it would pass them all.
   The routes are read from disk, so a new one is covered the day it lands. */
const UNSIGNED_ROUTES = new Set([
  'health', // the uptime probe, answered for anyone
  'billing/webhook', // Stripe's call, proven by its signature instead
]);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

test('every route answers an unsigned request with 401', async () => {
  const { readdir } = await import('node:fs/promises');
  const api = new URL('../src/app/api/v1/', import.meta.url);
  const routes = (await readdir(api, { recursive: true }))
    .filter((f) => f.endsWith('route.ts'))
    .map((f) => f.slice(0, -'/route.ts'.length));
  (globalThis as any).__TEST_DB__ = null;
  // A client that is never reached: with no cookie there is no session to read.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:1';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'unused';

  const answers: string[] = [];
  for (const route of routes.filter((r) => !UNSIGNED_ROUTES.has(r))) {
    const handlers = await import(new URL(`${route}/route.ts`, api).href);
    for (const method of METHODS.filter((m) => handlers[m])) {
      const path = route.replaceAll('[id]', USER);
      const res = await handlers[method](
        new Request(`http://t/api/v1/${path}`, {
          method,
          body: method === 'GET' ? undefined : '{}',
        }),
        { params: Promise.resolve({ id: USER }) },
      );
      answers.push(`${method} ${path} ${res.status}`);
    }
  }
  assert.ok(answers.length > 40, `found only ${answers.length} handlers`);
  assert.deepEqual(
    answers.filter((a) => !a.endsWith(' 401')),
    [],
  );
});

// ── the macOS app's contract ───────────────────────────────────────
// `API.swift` restates the response shapes by hand. This test keeps each
// answer the app decodes in `apps/macos/Tests/StintTests/Fixtures`, which
// `ContractTests.swift` decodes. A changed shape rewrites its fixture and
// fails, so the change is committed and the Swift side made to decode it.

// A Monday noon, so `/stats`' week and month come out the same every run.
const NOW = '2026-10-19T12:00:00.000Z';
const HOUR_AGO = '2026-10-19T11:00:00.000Z';
const FIXTURES = new URL(
  '../../macos/Tests/StintTests/Fixtures/',
  import.meta.url,
);

const body = async (r: Response) => {
  assert.ok(r.ok, `${r.status} ${await r.clone().text()}`);
  return r.json();
};

/** A fixture not yet written reads as undefined. */
function readFixture(file: URL): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** Keys and JSON types, not values: ids differ every run. */
function shape(v: unknown): unknown {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.map(shape);
  if (typeof v === 'object') {
    /* A record keyed by id (a week day's `byClient`) has new keys every run;
       its shape is "id → value", whatever the ids are. */
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [
          UUID.test(k) ? '<id>' : k,
          shape((v as Record<string, unknown>)[k]),
        ]),
    );
  }
  return typeof v;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('every response the macOS app decodes matches its fixture', async (t) => {
  // Only Date: the pool's own timers must keep running.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
  const route = (path: string) => import(`../src/app/api/v1/${path}/route.ts`);
  const clients = await route('clients');
  const projects = await route('projects');
  const start = await route('timer/start');
  const current = await route('timer/current');
  const stop = await route('timer/stop');

  const client = await body(
    await clients.POST(
      req('/clients', { name: 'Northwind', color: '#3b82f6' }),
    ),
  );
  const project = await body(
    await projects.POST(
      req('/projects', { clientId: client.id, name: 'Site', hourlyRate: 150 }),
    ),
  );

  // The app's presses ask for the summary, so these are recorded as asked.
  const started = await body(
    await start.POST(
      req('/timer/start?include=summary&tz=UTC', {
        taskName: 'Draft',
        projectId: project.id,
        startedAt: HOUR_AGO,
      }),
    ),
  );

  // No route the app calls sets these, and a field null in every fixture
  // is never type-checked, so they are written directly.
  const archived = await body(
    await projects.POST(req('/projects', { clientId: client.id, name: 'Old' })),
  );
  await pool.query('update projects set archived_at = $1 where id = $2', [
    HOUR_AGO,
    archived.id,
  ]);
  const invoice = await pool.query(
    `insert into invoices
       (user_id, client_id, invoice_number, sequence_no, period_start, period_end)
     values ($1, $2, 'INV-1', 1, current_date, current_date) returning id`,
    [USER, client.id],
  );
  await pool.query(
    'update time_entries set rate_override = 200, invoice_id = $1 where id = $2',
    [invoice.rows[0].id, started.entry.id],
  );

  // Named as `ContractTests.swift` reads them.
  const responses: Record<string, unknown> = {
    'timer-start': started,
    'timer-current': await body(
      await current.PATCH(
        req('/timer/current', { taskName: 'Write copy' }, 'PATCH'),
      ),
    ),
    summary: await body(
      await (await route('summary')).GET(req('/summary?tz=UTC')),
    ),
    stats: await body(await (await route('stats')).GET(req('/stats?tz=UTC'))),
    clients: await body(
      await clients.GET(req('/clients?includeArchived=true')),
    ),
    // The app asks without archived projects; with them, `archivedAt` is checked.
    projects: await body(
      await projects.GET(req('/projects?includeArchived=true')),
    ),
    'timer-stop': await body(
      await stop.POST(
        req('/timer/stop?include=summary&tz=UTC', { endedAt: NOW }),
      ),
    ),
    'task-names': await body(
      await (await route('entries/task-names')).GET(
        req('/entries/task-names?limit=5'),
      ),
    ),
  };

  const changed = Object.entries(responses).flatMap(([name, response]) => {
    const file = new URL(`${name}.json`, FIXTURES);
    const prior = readFixture(file);
    if (
      prior !== undefined &&
      util.isDeepStrictEqual(shape(response), shape(prior))
    ) {
      return [];
    }
    writeFileSync(file, `${JSON.stringify(response, null, 2)}\n`);
    return [name];
  });
  assert.deepEqual(
    changed,
    [],
    'These responses changed shape and their fixtures were rewritten: commit them and make `swift test` pass.',
  );
});

// ── push devices, and pushing the timer to them ────────────────────
const ANDROID = { token: 'fcm-token-1', platform: 'android' };

const send = (method: string, url: string, body: unknown) =>
  new Request(`http://t${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const devices = async () =>
  (
    await pool.query(
      'select user_id, token, platform from push_devices order by token',
    )
  ).rows;

const register = async (device: unknown = ANDROID) => {
  const { POST } = await import('../src/app/api/v1/push-devices/route.ts');
  return POST(send('POST', '/push-devices', device));
};

const configurePush = () => {
  process.env.FCM_SERVICE_ACCOUNT = serviceAccount();
};

test('a phone registers once, however often it asks', async () => {
  assert.equal((await register()).status, 204);
  assert.equal((await register()).status, 204);
  assert.deepEqual(await devices(), [{ user_id: USER, ...ANDROID }]);
});

test('registering refuses another platform or no token', async () => {
  for (const device of [
    { token: 'x', platform: 'ios' },
    { platform: 'android' },
    { token: '', platform: 'android' },
  ]) {
    assert.equal((await register(device)).status, 422);
  }
  assert.deepEqual(await devices(), []);
});

test('a phone unregisters, and an unknown token is already gone', async () => {
  const { DELETE } = await import('../src/app/api/v1/push-devices/route.ts');
  await register();
  await pool.query(
    `insert into push_devices (user_id, token, platform) values ($1, $2, 'android')`,
    [OTHER, ANDROID.token],
  );
  const del = () =>
    DELETE(send('DELETE', '/push-devices', { token: ANDROID.token }));
  assert.equal((await del()).status, 204);
  assert.equal((await del()).status, 204);
  assert.deepEqual(
    await devices(),
    [{ user_id: OTHER, ...ANDROID }],
    'only the caller’s row goes',
  );
});

/** Each timer change, from a running timer where it needs one. */
async function timerChanges() {
  const route = (p: string) => import(`../src/app/api/v1/${p}/route.ts`);
  const start = (await route('timer/start')).POST;
  const stop = (await route('timer/stop')).POST;
  const current = (await route('timer/current')).PATCH;
  const entry = await route('entries/[id]');
  // A minute ago, so a stop in the same millisecond still lands after it.
  const startedAt = () => new Date(Date.now() - 60_000).toISOString();
  const started = async () =>
    (
      await json(
        await start(
          req('/timer/start', { taskName: 'Work', startedAt: startedAt() }),
        ),
      )
    ).body;
  const patch = (id: string, body: unknown) =>
    entry.PATCH(send('PATCH', `/entries/${id}`, body), {
      params: Promise.resolve({ id }),
    });
  /* The setup's own push, sent and forgotten. */
  const ready = async () => {
    await settled();
    fcmFake.state.sent = [];
  };
  return {
    start: () => started(),
    stop: async () => {
      await started();
      await ready();
      return stop(req('/timer/stop', {}));
    },
    retitle: async () => {
      await started();
      await ready();
      return current(send('PATCH', '/timer/current', { taskName: 'Other' }));
    },
    'edit the running entry': async () => {
      const { id } = await started();
      await ready();
      return patch(id, { taskName: 'Other' });
    },
    'stop it by editing': async () => {
      const { id, startedAt } = await started();
      await ready();
      const endedAt = new Date(Date.parse(startedAt) + 60_000).toISOString();
      return patch(id, { endedAt });
    },
    'delete the running entry': async () => {
      const { id } = await started();
      await ready();
      return entry.DELETE(
        new Request(`http://t/entries/${id}`, { method: 'DELETE' }),
        {
          params: Promise.resolve({ id }),
        },
      );
    },
  };
}

test('every change to the running timer pushes once to each phone', async () => {
  configurePush();
  await register();
  await register({ token: 'fcm-token-2', platform: 'android' });
  for (const [name, change] of Object.entries(await timerChanges())) {
    await pool.query('delete from time_entries');
    fcmFake.state.sent = [];
    await change();
    await settled();
    assert.deepEqual(
      fcmFake.state.sent.map((m) => m.token).sort(),
      ['fcm-token-1', 'fcm-token-2'],
      name,
    );
    assert.deepEqual(fcmFake.state.sent[0]?.data, { kind: 'timer' }, name);
  }
});

const STOPPED = '018f0000-0000-7000-a000-0000000000aa';

test('a change that leaves the running timer alone pushes nothing', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const entry = await import('../src/app/api/v1/entries/[id]/route.ts');
  configurePush();
  await register();
  await pool.query(
    `insert into time_entries (id, user_id, task_name, started_at, ended_at)
     values ($1, $2, 'Done', '2026-01-05T09:00:00Z', '2026-01-05T10:00:00Z')`,
    [STOPPED, USER],
  );
  const res = await entry.PATCH(
    send('PATCH', `/entries/${STOPPED}`, { taskName: 'Renamed' }),
    { params: Promise.resolve({ id: STOPPED }) },
  );
  assert.equal(res.status, 200);
  await json(await start(req('/timer/start', { taskName: 'One' })));
  await settled();
  fcmFake.state.sent = [];
  const refused = await start(req('/timer/start', { taskName: 'Two' }));
  assert.equal(refused.status, 409);
  await settled();
  assert.deepEqual(fcmFake.state.sent, []);
});

/** Starts a timer and returns its status, once its push has settled, and
 *  what reached Sentry meanwhile. */
async function startAndReport() {
  const Sentry = await import('@sentry/nextjs');
  const { close } = await import('@sentry/core');
  const reported: (string | undefined)[] = [];
  Sentry.init({
    dsn: 'https://key@o0.ingest.sentry.io/0',
    beforeSend(event) {
      reported.push(event.exception?.values?.[0]?.value);
      return null;
    },
  });
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const res = await start(req('/timer/start', { taskName: 'Work' }));
  await settled();
  await close(1000);
  return { status: res.status, reported };
}

test('a transient failure is retried once', async () => {
  configurePush();
  await register();
  fcmFake.state.answers = [{ status: 503 }];
  const { status, reported } = await startAndReport();
  assert.equal(status, 201);
  assert.equal(fcmFake.state.sent.length, 2);
  assert.deepEqual(reported, []);
});

test('a send that keeps failing reaches Sentry and never fails the write', async () => {
  configurePush();
  await register();
  fcmFake.state.answers = [{ status: 500 }, { status: 500 }];
  const { status, reported } = await startAndReport();
  assert.equal(status, 201);
  assert.equal(fcmFake.state.sent.length, 2);
  assert.equal(reported.length, 1);
  assert.match(reported[0] ?? '', /^Push not delivered/);
});

test('a token FCM calls unregistered is deleted, and nothing is reported', async () => {
  configurePush();
  await register();
  await register({ token: 'fcm-token-2', platform: 'android' });
  fcmFake.state.answers = [UNREGISTERED];
  const { reported } = await startAndReport();
  assert.deepEqual(reported, []);
  assert.equal((await devices()).length, 1);
});

test('a refused service account reaches Sentry', async () => {
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
    ...JSON.parse(serviceAccount()),
    private_key: (await import('node:crypto'))
      .generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
  await register();
  const { status, reported } = await startAndReport();
  assert.equal(status, 201);
  assert.match(
    reported[0] ?? '',
    /Google refused the FCM service account: 400/,
  );
  assert.deepEqual(fcmFake.state.sent, []);
});

test('with no service account, nothing is sent', async () => {
  await register();
  const { status, reported } = await startAndReport();
  assert.equal(status, 201);
  assert.deepEqual(fcmFake.state.sent, []);
  assert.equal(fcmFake.state.tokenRequests, 0);
  assert.deepEqual(reported, []);
});

test('the access token is fetched once for many sends', async () => {
  configurePush();
  await register();
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { POST: stop } = await import('../src/app/api/v1/timer/stop/route.ts');
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  await start(req('/timer/start', { taskName: 'Work', startedAt }));
  await settled();
  await stop(req('/timer/stop', {}));
  await settled();
  assert.equal(fcmFake.state.sent.length, 2);
  assert.equal(fcmFake.state.tokenRequests, 1);
});
