/**
 * The fake `/api/v1` the Storybook stories render against
 * (`src/mocks/derive.ts`) must compute what the real routes compute.
 *
 * The stories' own account is written into a real, migrated Postgres, and
 * each route's answer is compared with the fake's for the same instant and
 * zone. A rollup rewritten in one place and not the other fails here, rather
 * than as a story showing numbers the app would never show.
 *
 * Requires DATABASE_URL pointing at a migrated database, like routes.test.ts.
 */
import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { makeDb } from './shim.mjs';
import { addDays, localDateKey, startOfLocalDate } from '@stint/core';
import type { Db } from '../src/mocks/fixtures.ts';
import { getDb, resetDb, type Scenario } from '../src/mocks/db.ts';
import {
  calendar,
  invoicePreview,
  stats,
  summary,
  taskNames,
} from '../src/mocks/derive.ts';
import { ids } from '../src/mocks/fixtures.ts';
import { NOW, ZONE } from '../src/mocks/time.mts';

// The user `requireSession` answers with while `__TEST_DB__` is set.
const USER = '11111111-1111-1111-1111-111111111111';
let pool: pg.Pool;

(globalThis as any).__TEST_DB__ = null;

before(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into auth.users (id,email) values ($1,'me@test')
     on conflict do nothing`,
    [USER],
  );
  // Only Date: the pool's own timers must keep running.
  mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
});

after(async () => {
  mock.timers.reset();
  await pool.end();
});

beforeEach(async () => {
  for (const sql of [
    'delete from invoice_line_items where invoice_id in (select id from invoices where user_id = $1)',
    'update time_entries set invoice_id = null where user_id = $1',
    'update expenses set invoice_id = null where user_id = $1',
    'delete from expenses where user_id = $1',
    'delete from time_entries where user_id = $1',
    'delete from invoices where user_id = $1',
    'delete from projects where user_id = $1',
    'delete from clients where user_id = $1',
  ])
    await pool.query(sql, [USER]);
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
});

/** The fake account, written row for row into Postgres. */
async function write(db: Db) {
  const s = db.settings;
  await pool.query(
    `insert into user_settings (user_id) values ($1) on conflict do nothing`,
    [USER],
  );
  await pool.query(
    `update user_settings set default_hourly_rate=$2, currency=$3,
       week_starts_on=$4, min_entry_seconds=$5, max_entry_hours=$6
     where user_id=$1`,
    [
      USER,
      s.defaultHourlyRate,
      s.currency,
      s.weekStartsOn,
      s.minEntrySeconds,
      s.maxEntryHours,
    ],
  );
  for (const c of db.clients)
    await pool.query(
      `insert into clients (id,user_id,name,hourly_rate,tax_rate,currency,color,archived_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        c.id,
        USER,
        c.name,
        c.hourlyRate,
        c.taxRate,
        c.currency,
        c.color,
        c.archivedAt,
      ],
    );
  for (const p of db.projects)
    await pool.query(
      `insert into projects (id,user_id,client_id,name,hourly_rate,is_billable_default,archived_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        p.id,
        USER,
        p.clientId,
        p.name,
        p.hourlyRate,
        p.isBillableDefault,
        p.archivedAt,
      ],
    );
  // Drafts first: an issued invoice's entries are locked by a trigger, so
  // they are attached while it is a draft and it is issued after.
  for (const i of db.invoices)
    await pool.query(
      `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,status,
         issue_date,due_date,period_start,period_end,subtotal,expenses_subtotal,total,currency)
       values ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        i.id,
        USER,
        i.clientId,
        i.invoiceNumber,
        i.sequenceNo,
        i.issueDate,
        i.dueDate,
        i.periodStart,
        i.periodEnd,
        i.subtotal,
        i.expensesSubtotal,
        i.total,
        i.currency,
      ],
    );
  // Billed while its invoice is still a draft, like entries below.
  for (const e of db.expenses)
    await pool.query(
      `insert into expenses (id,user_id,client_id,recurring,spent_on,description,
         amount,note,invoice_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        e.id,
        USER,
        e.clientId,
        e.recurring,
        e.spentOn,
        e.description,
        e.amount,
        e.note,
        e.invoiceId,
      ],
    );
  for (const e of db.entries)
    await pool.query(
      `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,
         is_billable,rate_override,invoice_id,duration_ok)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        e.id,
        USER,
        e.projectId,
        e.taskName,
        e.startedAt,
        e.endedAt,
        e.isBillable,
        e.rateOverride,
        e.invoiceId,
        e.durationOk,
      ],
    );
  for (const i of db.invoices)
    if (i.status !== 'draft')
      await pool.query(
        `update invoices set status=$2, sent_at=$3, paid_at=$4 where id=$1`,
        [i.id, i.status, i.sentAt, i.paidAt],
      );
}

/* Timestamps compared as instants: the test shim hands back Postgres' text
   (`2026-09-14 21:00:00+00`) where PostgREST, and the fake, send ISO. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const instants = (_: string, v: unknown) =>
  typeof v === 'string' && TIMESTAMP.test(v) ? new Date(v).toISOString() : v;

/** A response, or the fake's answer, as JSON carries it. */
const wire = (value: unknown) => JSON.parse(JSON.stringify(value), instants);

const get = async (route: string, url: string) => {
  const { GET } = await import(`../src/app/api/v1/${route}/route.ts`);
  const res: Response = await GET(new Request(`http://t${url}`));
  assert.equal(res.status, 200, `${url} answered ${res.status}`);
  return wire(await res.json());
};

const scenarios: Scenario[] = ['seeded', 'running', 'empty'];

for (const scenario of scenarios)
  test(`the fake API agrees with the routes: ${scenario}`, async () => {
    resetDb(new Date(NOW), scenario);
    const db = getDb();
    await write(db);
    const tz = encodeURIComponent(ZONE);

    assert.deepEqual(
      await get('summary', `/api/v1/summary?tz=${tz}`),
      wire(summary(db, ZONE)),
    );
    assert.deepEqual(
      await get('stats', `/api/v1/stats?tz=${tz}`),
      wire(stats(db, ZONE)),
    );

    // The six weeks the account covers, in both shapes the calendar serves.
    const today = localDateKey(new Date(NOW), ZONE);
    const from = startOfLocalDate(addDays(today, -44), ZONE).toISOString();
    const to = startOfLocalDate(addDays(today, 1), ZONE).toISOString();
    for (const granularity of [null, 'day'])
      assert.deepEqual(
        (
          await get(
            'calendar',
            `/api/v1/calendar?from=${from}&to=${to}&tz=${tz}${granularity ? `&granularity=${granularity}` : ''}`,
          )
        ).days,
        wire(calendar(db, { from, to, tz: ZONE, granularity })),
      );

    for (const projectId of [null, ids.rush])
      assert.deepEqual(
        (
          await get(
            'entries/task-names',
            `/api/v1/entries/task-names${projectId ? `?projectId=${projectId}` : ''}`,
          )
        ).taskNames,
        wire(taskNames(db, projectId, 8)),
      );

    // Expenses, monthly ones produced first on both sides.
    const fake = await import('../src/mocks/handlers.ts');
    const fakeGet = async (name: keyof typeof fake.handlers, url: string) => {
      const res = await (fake.handlers[name] as any).resolver({
        request: new Request(`http://t${url}`),
        params: {},
      });
      return wire(await res.json());
    };
    for (const q of ['', 'status=unbilled', `clientId=${ids.northwind}`])
      assert.deepEqual(
        await get('expenses', `/api/v1/expenses?${q}`),
        await fakeGet('expenses', `/api/v1/expenses?${q}`),
        `expenses?${q}`,
      );

    if (scenario === 'empty') return;
    const { POST } = await import(
      '../src/app/api/v1/invoices/preview/route.ts'
    );
    const body = {
      clientId: ids.northwind,
      periodStart: addDays(today, -30),
      periodEnd: today,
      groupingMode: 'task' as const,
      tz: ZONE,
    };
    const res: Response = await POST(
      new Request('http://t/api/v1/invoices/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    assert.deepEqual(
      wire(await res.json()),
      wire(invoicePreview(db, body, ZONE)),
    );
  });
