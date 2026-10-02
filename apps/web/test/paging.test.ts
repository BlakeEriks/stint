/**
 * Reads that can return more rows than PostgREST's `max_rows` (1,000): each
 * route here is given 1,001 rows and must see every one. The shim caps a
 * select the way PostgREST does, so a read that does not page fails here.
 *
 * Same approach as routes.test.ts: the real handlers against real Postgres.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { makeDb } from './shim.mjs';

const USER = '11111111-1111-1111-1111-111111111111';
const PROJECT = 'bb000000-0000-4000-8000-000000000002';

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
  await pool.query('update expenses set invoice_id = null');
  await pool.query('delete from expenses');
  await pool.query('delete from invoice_line_items');
  await pool.query('update time_entries set invoice_id = null');
  await pool.query('delete from time_entries');
  await pool.query('delete from invoices');
  await pool.query('delete from projects');
  await pool.query('delete from clients');
  await pool.query(
    `update user_settings set min_entry_seconds=null, max_entry_hours=null
     where user_id=$1`,
    [USER],
  );
  await pool.query(
    `insert into projects (id,user_id,name) values ($1,$2,'Site')`,
    [PROJECT, USER],
  );
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
});

const json = async (r: Response) => ({
  status: r.status,
  body: await r.json(),
});

/** `n` stopped one-minute entries two minutes apart, the first at `from`. */
async function fill(n: number, from: string, projectId: string | null) {
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     select gen_random_uuid(), $1, $2, 'Work',
            $3::timestamptz + (i * interval '2 minutes'),
            $3::timestamptz + (i * interval '2 minutes') + interval '1 minute'
     from generate_series(0, $4 - 1) i`,
    [USER, projectId, from, n],
  );
}

const stats = async () => {
  const { GET } = await import('../src/app/api/v1/stats/route.ts');
  return (await json(await GET(new Request('http://t/stats?tz=UTC')))).body;
};

test('the inbox lists every unprojected entry', async () => {
  await fill(1001, '2026-08-01T00:00:00Z', null);
  assert.equal((await stats()).attention.unprojected.length, 1001);
});

test('the inbox finds a strange duration past the first thousand', async () => {
  await fill(1000, '2026-08-01T00:00:00Z', PROJECT);
  // The newest, so the last row of a read ordered oldest first.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     values (gen_random_uuid(),$1,$2,'Overnight','2026-08-20T00:00:00Z','2026-08-20T14:00:00Z')`,
    [USER, PROJECT],
  );
  await pool.query(
    'update user_settings set max_entry_hours=8 where user_id=$1',
    [USER],
  );
  const rows = (await stats()).attention.strangeDurations;
  assert.deepEqual(
    rows.map((r: { taskName: string }) => r.taskName),
    ['Overnight'],
  );
});

test('the inbox finds an overlap past the first thousand', async () => {
  await fill(1000, '2026-08-01T00:00:00Z', PROJECT);
  // Sharing half an hour, and written last.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at) values
       (gen_random_uuid(),$1,$2,'First', '2026-08-20T20:00:00Z','2026-08-20T21:00:00Z'),
       (gen_random_uuid(),$1,$2,'Second','2026-08-20T20:30:00Z','2026-08-20T21:30:00Z')`,
    [USER, PROJECT],
  );
  assert.equal((await stats()).attention.overlaps.length, 1);
});

test('the calendar returns every entry in its range', async () => {
  const { GET } = await import('../src/app/api/v1/calendar/route.ts');
  await fill(1001, '2026-09-01T00:00:00Z', PROJECT);

  const res = await json(
    await GET(
      new Request(
        'http://t/calendar?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z&tz=UTC',
      ),
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
  // Inside the window the preview reads, and over by the hour below.
  await fill(1000, '2026-03-09T00:00:00Z', PROJECT);
  // 20:00Z to 21:00Z, written last.
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     values (gen_random_uuid(),$1,$2,'Existing','2026-03-10T20:00:00Z','2026-03-10T21:00:00Z')`,
    [USER, PROJECT],
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
