/**
 * The macOS app's contract with `/api/v1`.
 *
 * `API.swift` restates the response shapes by hand. This calls each route
 * the app calls and keeps its answer in `apps/macos/Tests/StintTests/Fixtures`,
 * which `swift test` decodes into the Swift types (`ContractTests.swift`).
 * A response whose shape no longer matches its fixture rewrites the fixture
 * and fails, so the change is committed and the Swift side is made to decode it.
 *
 * Requires DATABASE_URL pointing at a migrated database, like routes.test.ts.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import util from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { makeDb } from './shim.mjs';

// `requireSession`'s user while `__TEST_DB__` is set.
const USER = '11111111-1111-1111-1111-111111111111';
// A Monday noon, so `/stats`' week and month come out the same every run.
const NOW = '2026-10-19T12:00:00.000Z';
const HOUR_AGO = '2026-10-19T11:00:00.000Z';
const FIXTURES = new URL(
  '../../macos/Tests/StintTests/Fixtures/',
  import.meta.url,
);
let pool: pg.Pool;

before(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into auth.users (id,email) values ($1,'me@test')
     on conflict do nothing`,
    [USER],
  );
  // Invoices and expenses hold clients, so they go first.
  for (const sql of [
    'update time_entries set invoice_id = null',
    'update expenses set invoice_id = null',
    'delete from expenses',
    'delete from time_entries',
    'delete from invoices',
    'delete from projects',
    'delete from clients',
  ]) {
    await pool.query(sql);
  }
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
  // Only Date: the pool's own timers must keep running.
  mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
});

after(async () => {
  mock.timers.reset();
  await pool.end();
});

const req = (url: string, body?: unknown, method = body ? 'POST' : 'GET') =>
  new Request(`http://t${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

/**
 * The shim hands back Postgres' text for a `timestamptz`; PostgREST sends
 * its JSON form, which is what the app's date decoder reads.
 */
const asPostgrest = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d(?:\.\d+)?)\+00$/.exec(v);
    return m ? `${m[1]}T${m[2]}+00:00` : v;
  }
  if (Array.isArray(v)) return v.map(asPostgrest);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, asPostgrest(x)]),
    );
  }
  return v;
};

const body = async (r: Response) => {
  assert.ok(r.ok, `${r.status} ${await r.clone().text()}`);
  return asPostgrest(await r.json()) as any;
};

/** Keys and JSON types, not values: ids differ every run. */
function shape(v: unknown): unknown {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.map(shape);
  if (typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, shape((v as Record<string, unknown>)[k])]),
    );
  }
  return typeof v;
}

test('every response the macOS app decodes matches its fixture', async () => {
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

  const started = await body(
    await start.POST(
      req('/timer/start', {
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
    `insert into invoices (user_id, client_id, invoice_number, sequence_no)
     values ($1, $2, 'INV-1', 1) returning id`,
    [USER, client.id],
  );
  await pool.query(
    'update time_entries set rate_override = 200, invoice_id = $1 where id = $2',
    [invoice.rows[0].id, started.id],
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
      await stop.POST(req('/timer/stop', { endedAt: NOW })),
    ),
    'task-names': await body(
      await (await route('entries/task-names')).GET(
        req('/entries/task-names?limit=5'),
      ),
    ),
  };

  const changed = Object.entries(responses).flatMap(([name, response]) => {
    const file = new URL(`${name}.json`, FIXTURES);
    const prior = existsSync(file)
      ? JSON.parse(readFileSync(file, 'utf8'))
      : undefined;
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
