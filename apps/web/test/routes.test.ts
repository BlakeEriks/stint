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
import pg from 'pg';
import { makeDb } from './shim.mjs';

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
  await pool.query('delete from invoice_line_items');
  // Detach first: the immutability trigger refuses to delete an entry that
  // is still billed on a non-draft invoice — which is the behaviour under
  // test elsewhere, so the fixture works around it rather than disabling it.
  await pool.query('update time_entries set invoice_id = null');
  await pool.query('delete from time_entries');
  await pool.query('delete from invoices');
  await pool.query('delete from projects');
  await pool.query('delete from clients');
  await pool.query('delete from payment_profiles');
  await pool.query(
    `update user_settings set default_hourly_rate=100, max_timer_hours=8,
                    week_starts_on=1, next_invoice_number=1,
                    -- Null is the shipped default: the strange-duration row
                    -- does not exist until a threshold is set.
                    min_entry_seconds=null, max_entry_hours=null
     where user_id=$1`,
    [USER],
  );
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
});

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
  assert.equal(now.body.exceedsThreshold, false);
  assert.ok(now.body.serverTime, 'serverTime lets clients correct clock skew');

  const stopped = await json(await stop(req('/timer/stop', {})));
  assert.equal(stopped.status, 200);
  assert.ok(stopped.body.endedAt, 'stopping sets endedAt');
  assert.ok(stopped.body.durationSeconds >= 0);

  const after = await json(await current(req('/timer/current')));
  assert.equal(after.body.entry, null, 'no timer running after stop');
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

test('runaway timer past the threshold is flagged but never auto-edited', async () => {
  const { POST: start } = await import(
    '../src/app/api/v1/timer/start/route.ts'
  );
  const { GET: current } = await import(
    '../src/app/api/v1/timer/current/route.ts'
  );

  const long = new Date(Date.now() - 16 * 3600 * 1000).toISOString();
  const started = await json(
    await start(req('/timer/start', { taskName: 'Forgot', startedAt: long })),
  );

  const now = await json(await current(req('/timer/current')));
  assert.equal(now.body.exceedsThreshold, true, 'surfaced to the client');
  assert.equal(now.body.entry.id, started.body.id);
  assert.equal(
    now.body.entry.startedAt,
    started.body.startedAt,
    'the entry is untouched — the app never silently edits billing data',
  );
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
test('settings update, and nextInvoiceNumber cannot be moved by a client', async () => {
  const { GET: get, PATCH: patch } = await import(
    '../src/app/api/v1/settings/route.ts'
  );

  const before = await json(await get(req('/settings')));
  assert.equal(before.status, 200);
  assert.equal(before.body.maxTimerHours, 8);

  const after = await json(
    await patch(
      req(
        '/settings',
        { maxTimerHours: 10, defaultHourlyRate: 125, nextInvoiceNumber: 9999 },
        'PATCH',
      ),
    ),
  );
  assert.equal(after.status, 200);
  assert.equal(after.body.maxTimerHours, 10);
  assert.equal(after.body.defaultHourlyRate, 125);
  assert.equal(
    after.body.nextInvoiceNumber,
    1,
    'gapless numbering is not a client-settable field',
  );
});

/* Every field the converter maps must survive a PATCH. Zod strips what its
   schema does not name, so a missing field is a 200 that discards the
   value. */
test('every settable field round-trips, rather than being silently dropped', async () => {
  const { PATCH: patch } = await import('../src/app/api/v1/settings/route.ts');

  const sent = {
    minEntrySeconds: 60,
    maxEntryHours: 10,
    taxId: '12-3456789',
    businessAddress: '1 Main St\nAustin, TX 78701',
    paymentNotice: 'Details never change. Verify by phone.',
    invoiceNumberPrefix: 'STINT-',
  };

  const res = await json(await patch(req('/settings', sent, 'PATCH')));
  assert.equal(res.status, 200);
  for (const [field, value] of Object.entries(sent)) {
    assert.deepEqual(res.body[field], value, field);
  }
});

// ── calendar ───────────────────────────────────────────────────────
test('calendar groups entries by LOCAL day', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { GET: calendar } = await import('../src/app/api/v1/calendar/route.ts');

  // 02:30Z on the 12th is still the 11th in São Paulo (UTC-3).
  await create(
    req('/entries', {
      id: '018f0000-0000-7000-8000-000000000020',
      taskName: 'Late night',
      startedAt: '2026-09-12T02:30:00Z',
      endedAt: '2026-09-12T03:30:00Z',
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

/* The week's bar height is billable seconds (`revenue_by_day`), and its stack
   divides that height. If `byClient` counted non-billable work too, internal
   time would take a share of a bar it did not raise. */
test('the day split counts billable work only', async () => {
  const { POST: create } = await import('../src/app/api/v1/entries/route.ts');
  const { GET: calendar } = await import('../src/app/api/v1/calendar/route.ts');

  await create(
    req('/entries', {
      id: '018f0000-0000-7000-8000-000000000031',
      taskName: 'Billable',
      startedAt: '2026-09-14T09:00:00Z',
      endedAt: '2026-09-14T11:00:00Z',
    }),
  );
  await create(
    req('/entries', {
      id: '018f0000-0000-7000-8000-000000000032',
      taskName: 'Not billable',
      startedAt: '2026-09-14T13:00:00Z',
      endedAt: '2026-09-14T14:00:00Z',
      isBillable: false,
    }),
  );

  const res = await json(
    await calendar(
      req(
        '/calendar?from=2026-09-14T00:00:00Z&to=2026-09-15T00:00:00Z&granularity=day&tz=UTC',
      ),
    ),
  );

  const day = res.body.days.find(
    (d: { date: string }) => d.date === '2026-09-14',
  );
  const split = Object.values(day.byClient as Record<string, number>).reduce(
    (sum: number, n) => sum + (n as number),
    0,
  );

  // The day's whole load stays unfiltered: the calendar draws all of it.
  assert.equal(day.totalSeconds, 10_800);
  assert.equal(split, 7200, 'but the split leaves the non-billable hour out');
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

test('unbilled rounds once per (client, rate), not per entry', async () => {
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

  // 3 x 20 minutes at 100/h.
  for (const n of [3, 4, 5]) {
    await entryFor({ id: S(n), projectId: p, hours: 1 / 3 });
  }

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.unbilled.total, 100);
  assert.notEqual(res.body.unbilled.total, 99.99, 'drifted by rounding early');
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

test('a running timer and billed work stay out of unbilled', async () => {
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
  // A running entry: ended_at is null, so it is not billable work yet.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,is_billable)
     values ($1,$2,$3,'running',now(),true)`,
    [S(12), USER, p],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(
    res.body.unbilled.total,
    100,
    'only the one ended billable hour',
  );
  assert.equal(res.body.unbilled.seconds, 3600, 'and only its hour');

  /* Note what this does NOT prove. The rollup's `ended_at is not null` clause
     is currently unobservable: `duration_seconds` is a generated column, so a
     running entry contributes null seconds and null money, and it does not
     raise `unratedCount` either because its rate still resolves. Removing the
     clause produces byte-identical output — verified. The clause is worth
     keeping as a statement of intent, but no assertion here can pin it, and
     writing one that passes either way would be decoration. The
     `is_billable` guard beside it IS load-bearing, and the non-billable entry
     above covers it. */
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

test('earned counts invoiced work, and drops it when the invoice is voided', async () => {
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

  /* Voiding releases the entries, so the work stops counting — otherwise a
     voided invoice would leave revenue claiming money nobody owes. */
  await pool.query(`update invoices set status='void' where id=$1`, [invoice]);
  const voided = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(voided.body.month.earned, 0, 'a voided invoice earns nothing');
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
          subtotal,tax_rate,tax_amount,total,currency,grouping_mode,paid_at)
       values ($1,$2,$3,$4,$5,$6,'2026-09-01',$7,0,0,$7,'USD','entry',
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
// A draft holds no invoice number and has not been sent, so it is not money
// owed — it is a job half finished. It earns an inbox row because the work is
// already billed to nobody: entries sit locked to a draft that never went out.

test('a draft is stale only after a week, and the oldest sorts first', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const c = '33333333-0000-4000-8000-000000000009';
  await pool.query(
    `insert into clients (id,user_id,name) values ($1,$2,'Drafty')`,
    [c, USER],
  );

  const dayKey = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const mk = (id: string, num: string, issued: string, status = 'draft') =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
          subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
       values ($1,$2,$3,$4,$5,$6,$7,100,0,0,100,'USD','entry')`,
      [id, USER, c, num, Number(num.slice(-1)), status, issued],
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

  /* Oldest first: the row least likely to still be in anyone's head. Two days
     old is a draft someone is actively working on, not a forgotten one. */
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
       (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
        subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
     values ($1,$2,$3,'INV-0009',9,'draft',$4,400,0,0,400,'USD','entry')`,
    [
      '45444444-0000-4000-8000-000000000009',
      USER,
      c,
      new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10),
    ],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  const [draft] = res.body.attention.staleDrafts;
  assert.equal(draft.clientName, 'Namely');
  assert.equal(draft.amount, 400);
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
// An entry that STOPPED at an implausible length. Not the runaway row: that
// one is about a timer still running, this is about a record already written.
// Both thresholds are opt-in, so the row does not exist until asked for.

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

test('no thresholds means no strange-duration rows at all', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  await entrySeconds(S(60), 12); // a 12-second mis-tap
  await entryFor({ id: S(61), projectId: await durProject(), hours: 14 }); // an overnight timer

  /* Both columns default to null, so nobody gets a new inbox row without
     asking for it. */
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

test('a running timer is a runaway, never a strange duration', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await setThresholds(60, 8);

  await pool.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at)
     values ($1,$2,'still going',$3,null)`,
    [S(69), USER, new Date(Date.UTC(2026, 8, 1)).toISOString()],
  );

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.deepEqual(res.body.attention.strangeDurations, [], 'never both');
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

test('task names honour limit', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  for (let i = 0; i < 5; i++) {
    await namedEntry({ id: S(90 + i), name: `Task ${i}`, daysAgo: i + 1 });
  }

  const res = await json(await taskNames(req('/entries/task-names?limit=2')));
  assert.deepEqual(names(res.body), ['Task 0', 'Task 1']);
});

test('task names reject a limit outside the range', async () => {
  const { GET: taskNames } = await import(TASK_NAMES);

  const res = await json(await taskNames(req('/entries/task-names?limit=99')));
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
