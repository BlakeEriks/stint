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
  await pool.query(
    `update user_settings set default_hourly_rate=100, max_timer_hours=8,
                    week_starts_on=1, next_invoice_number=1 where user_id=$1`,
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
  // Completed hour + the live timer, in ONE request — the menu bar toggles
  // between modes without a second call.
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
