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
                    week_starts_on=1, next_invoice_number=1,
                    monthly_target=null, monthly_target_unit=null
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

  // 3 x 20 minutes at 100/h. Rounding per entry gives 33.33 x 3 = 99.99;
  // rounding once from the summed seconds gives 100.00.
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

test('pace measures against BUSINESS days, and hides with no target', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  const none = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(none.body.pace, null, 'no target, no card');

  await pool.query(
    `update user_settings set monthly_target=120, monthly_target_unit='hours'
     where user_id=$1`,
    [USER],
  );
  const res = await json(await stats(req('/stats?tz=UTC')));
  const pace = res.body.pace;

  /* A 120-hour target is six hours a WORKING day. Reading "behind" on a
     Monday because the weekend passed would be noise pretending to be
     signal, so the denominator is business days, not calendar days. */
  assert.equal(pace.unit, 'hours');
  assert.equal(pace.target, 120);
  assert.ok(
    pace.businessDaysTotal >= 20 && pace.businessDaysTotal <= 23,
    `a month has 20-23 business days, got ${pace.businessDaysTotal}`,
  );
  assert.ok(pace.businessDaysTotal < 28, 'business days, not calendar days');
  assert.ok(pace.businessDaysElapsed <= pace.businessDaysTotal);
  assert.equal(pace.delta, pace.actual - pace.expected);
});

test('a revenue target reports no figure rather than hours in dollars', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');
  await pool.query(
    `update user_settings set monthly_target=10000, monthly_target_unit='revenue'
     where user_id=$1`,
    [USER],
  );

  /* Revenue is invoiced plus unbilled-at-resolved-rate — a different query.
     Showing hours against a money target is a category error, so the card is
     told the figure is unavailable instead of being given a wrong bar. */
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.pace.unit, 'revenue');
  assert.equal(res.body.pace.target, 10000);
  assert.equal(res.body.pace.actual, null);
  assert.equal(res.body.pace.expected, null);
  assert.equal(res.body.pace.delta, null);
  // The denominators still come back, so the card can say WHY it is empty.
  assert.ok(res.body.pace.businessDaysTotal > 0);
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

  // Net 30 with a client who pays on day 32 is ordinary. Firing the moment
  // due_date passes trains the user to clear the list without reading it,
  // which is how the one genuinely late invoice gets dismissed with the rest.
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

  const mk = (id: string, num: string, status: string, total: number) =>
    pool.query(
      `insert into invoices
         (id,user_id,client_id,invoice_number,sequence_no,status,issue_date,
          subtotal,tax_rate,tax_amount,total,currency,grouping_mode)
       values ($1,$2,$3,$4,$5,$6,'2026-09-01',$7,0,0,$7,'USD','entry')`,
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
  /* The rollup only returns clients with UNBILLED work, so the name map is
     built from it — a client whose work is entirely invoiced is absent and
     the row falls back to null. This entry keeps it present, which is the
     path the inbox actually renders. */
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

test('unprojected is null rather than a zero row when everything has a project', async () => {
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

  /* NULL, not `{count: 0}`. The UI renders the row from the object's
     existence, so a zero row would print "0 entries, no project" — an inbox
     item reporting that there is nothing to report. */
  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.attention.unprojected, null);
});

test('unprojected counts the entries and their seconds', async () => {
  const { GET: stats } = await import('../src/app/api/v1/stats/route.ts');

  await entryFor({ id: S(42), projectId: null, hours: 2 });
  await entryFor({ id: S(43), projectId: null, hours: 1 });

  const res = await json(await stats(req('/stats?tz=UTC')));
  assert.equal(res.body.attention.unprojected.count, 2);
  assert.equal(res.body.attention.unprojected.seconds, 3 * 3600);
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
  assert.equal(res.body.attention.unprojected.count, 1, 'only the open one');
  assert.equal(res.body.attention.unprojected.seconds, 3600);
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
  assert.equal(res.body.attention.unprojected, null);
});
