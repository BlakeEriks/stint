/**
 * Rate resolution parity: `resolveRate()` bills invoices, `resolve_rate()` and
 * the rollups that call it feed the home screen, and nothing in the type
 * system connects them. This is what stops the Unbilled card and an invoice
 * preview reporting different money for the same work.
 *
 * Requires DATABASE_URL pointing at a migrated database.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildLineItems, resolveRate, uuidv7 } from '@stint/core';
import type { BillableEntry } from '@stint/core';

const USER = '11111111-1111-1111-1111-111111111111';

/**
 * Unset, zero, and a level-distinct rate, so a wrong level is visible and a
 * truthiness bug on the zero shows up in exactly one cell.
 */
const LEVELS = {
  entry: [null, 0, 11],
  project: [null, 0, 23],
  client: [null, 0, 37],
  default: [null, 0, 53],
} as const;

interface Fixture {
  id: string;
  clientId: string | null;
  projectId: string | null;
  rateOverride: number | null;
  projectRate: number | null;
  clientRate: number | null;
  isBillable: boolean;
  durationSeconds: number;
}

let pool: pg.Pool;
let fixtures: Fixture[] = [];
let userDefaultRate: number | null = null;

/** The window every fixture entry falls inside, for month_revenue. */
const FROM = '2026-03-01T00:00:00Z';
const TO = '2026-04-01T00:00:00Z';

before(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into auth.users (id,email) values ($1,'rates@test')
     on conflict do nothing`,
    [USER],
  );
});

after(async () => {
  await pool.end();
});

/**
 * One client per clientRate and two projects per projectRate under it, so the
 * rollup's group-by sees several projects per client and two clients that
 * differ only in their rate.
 */
async function seed(defaultRate: number | null): Promise<void> {
  userDefaultRate = defaultRate;
  fixtures = [];

  await pool.query('update expenses set invoice_id = null');
  await pool.query('delete from expenses');
  await pool.query('delete from invoice_line_items');
  // Detach before deleting: the immutability trigger refuses to delete an
  // entry still billed on a non-draft invoice.
  await pool.query('update time_entries set invoice_id = null');
  await pool.query('delete from time_entries');
  await pool.query('delete from invoices');
  await pool.query('delete from projects');
  await pool.query('update clients set payment_profile_id = null');
  await pool.query('delete from payment_profiles');
  await pool.query('delete from clients');
  await pool.query(
    'update user_settings set default_hourly_rate=$2 where user_id=$1',
    [USER, defaultRate],
  );

  let minute = 0;
  for (const clientRate of LEVELS.client) {
    const clientId = uuidv7();
    await pool.query(
      `insert into clients (id,user_id,name,hourly_rate) values ($1,$2,$3,$4)`,
      [clientId, USER, `Client ${clientRate ?? 'null'}`, clientRate],
    );

    for (const projectRate of LEVELS.project) {
      // The rollup must fold these into one (client, rate) bucket.
      for (const suffix of ['a', 'b']) {
        const projectId = uuidv7();
        await pool.query(
          `insert into projects (id,user_id,client_id,name,hourly_rate)
           values ($1,$2,$3,$4,$5)`,
          [
            projectId,
            USER,
            clientId,
            `P${projectRate ?? 'null'}${suffix}`,
            projectRate,
          ],
        );

        for (const rateOverride of LEVELS.entry) {
          for (const isBillable of [true, false]) {
            const id = uuidv7();
            // Not an even fraction of an hour, and not a whole number of
            // minutes either: 3603 s at $150 is the half-cent case that
            // split the two languages before hours were priced as printed.
            const durationSeconds = 1200 + (minute % 7) * 60 + (minute % 5) * 3;
            const startedAt = new Date(
              Date.parse(FROM) + minute * 3_600_000,
            ).toISOString();
            const endedAt = new Date(
              Date.parse(startedAt) + durationSeconds * 1000,
            ).toISOString();
            minute += 1;

            await pool.query(
              `insert into time_entries
                 (id,user_id,project_id,task_name,started_at,ended_at,
                  is_billable,rate_override)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                id,
                USER,
                projectId,
                'Work',
                startedAt,
                endedAt,
                isBillable,
                rateOverride,
              ],
            );

            fixtures.push({
              id,
              clientId,
              projectId,
              rateOverride,
              projectRate,
              clientRate,
              isBillable,
              durationSeconds,
            });
          }
        }
      }
    }
  }

  // No project: the chain skips project AND client, since the rollups reach
  // the client only through the project.
  const orphan = uuidv7();
  await pool.query(
    `insert into time_entries
       (id,user_id,project_id,task_name,started_at,ended_at,is_billable)
     values ($1,$2,null,'Internal',$3,$4,true)`,
    [orphan, USER, '2026-03-20T09:00:00Z', '2026-03-20T10:30:00Z'],
  );
  fixtures.push({
    id: orphan,
    clientId: null,
    projectId: null,
    rateOverride: null,
    projectRate: null,
    clientRate: null,
    isBillable: true,
    durationSeconds: 5400,
  });
}

const ctxOf = (f: Fixture) => ({
  entryRateOverride: f.rateOverride,
  projectRate: f.projectRate,
  clientRate: f.clientRate,
  userDefaultRate,
});

/** Numerics arrive from pg as strings; null stays null. */
const num = (v: unknown): number | null => (v == null ? null : Number(v));

beforeEach(async () => {
  await seed(100);
});

test('resolve_entry_rate matches resolveRate for every combination', async () => {
  for (const defaultRate of LEVELS.default) {
    await seed(defaultRate);

    const { rows } = await pool.query(
      `select id, resolve_entry_rate(id) as rate from time_entries`,
    );
    const sql = new Map(rows.map((r) => [r.id, num(r.rate)]));

    assert.equal(sql.size, fixtures.length, 'every fixture entry was resolved');

    for (const f of fixtures) {
      assert.equal(
        sql.get(f.id),
        resolveRate(ctxOf(f)),
        `default=${defaultRate} client=${f.clientRate} project=${f.projectRate} entry=${f.rateOverride}`,
      );
    }
  }
});

test('0 at a level is a rate, not a fall-through', async () => {
  await seed(100);

  const zeroProject = fixtures.find(
    (f) =>
      f.rateOverride === null && f.projectRate === 0 && f.clientRate === 37,
  );
  assert.ok(
    zeroProject,
    'the matrix contains a zero-rate project under a paid client',
  );

  const { rows } = await pool.query('select resolve_entry_rate($1) as rate', [
    zeroProject.id,
  ]);
  assert.equal(num(rows[0].rate), 0, 'SQL keeps the pro-bono 0');
  assert.equal(resolveRate(ctxOf(zeroProject)), 0, 'TS keeps the pro-bono 0');
});

/** What buildLineItems would bill for these entries, per client. */
function tsUnbilledByClient(): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  const clients = new Set(fixtures.map((f) => f.clientId));

  for (const clientId of clients) {
    const entries: BillableEntry[] = fixtures
      .filter((f) => f.clientId === clientId)
      .map((f) => ({
        id: f.id,
        taskName: 'Work',
        projectId: null,
        projectName: null,
        startedAt: FROM,
        durationSeconds: f.durationSeconds,
        isBillable: f.isBillable,
        rateOverride: f.rateOverride,
        projectRate: f.projectRate,
        clientRate: f.clientRate,
        userDefaultRate,
      }));

    const { lineItems } = buildLineItems(entries, { groupingMode: 'project' });
    totals.set(
      clientId,
      Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100,
    );
  }
  return totals;
}

test('unbilled_by_client totals match buildLineItems', async () => {
  for (const defaultRate of LEVELS.default) {
    await seed(defaultRate);

    const { rows } = await pool.query(
      'select client_id, amount from unbilled_by_client($1)',
      [USER],
    );
    const sql = new Map(rows.map((r) => [r.client_id, Number(r.amount)]));
    const ts = tsUnbilledByClient();

    for (const [clientId, amount] of ts) {
      assert.equal(
        sql.get(clientId) ?? 0,
        amount,
        `client ${clientId} at default=${defaultRate}`,
      );
    }
  }
});

/** What buildLineItems would bill for these entries, per project. */
function tsByProject(): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  const projects = new Set(fixtures.map((f) => f.projectId));

  for (const projectId of projects) {
    const entries: BillableEntry[] = fixtures
      .filter((f) => f.projectId === projectId)
      .map((f) => ({
        id: f.id,
        taskName: 'Work',
        projectId: null,
        projectName: null,
        startedAt: FROM,
        durationSeconds: f.durationSeconds,
        isBillable: f.isBillable,
        rateOverride: f.rateOverride,
        projectRate: f.projectRate,
        clientRate: f.clientRate,
        userDefaultRate,
      }));

    const { lineItems } = buildLineItems(entries, { groupingMode: 'project' });
    totals.set(
      projectId,
      Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100,
    );
  }
  return totals;
}

test('revenue_by_project totals match buildLineItems', async () => {
  for (const defaultRate of LEVELS.default) {
    await seed(defaultRate);

    const { rows } = await pool.query(
      'select project_id, invoiced, unbilled from revenue_by_project($1,$2,$3)',
      [USER, FROM, TO],
    );
    // Nothing here is invoiced, but the split is summed rather than assumed:
    // the project tier's money is both columns, whichever side it sits on.
    const sql = new Map(
      rows.map((r) => [r.project_id, Number(r.invoiced) + Number(r.unbilled)]),
    );
    const ts = tsByProject();

    for (const [projectId, amount] of ts) {
      assert.equal(
        sql.get(projectId) ?? 0,
        amount,
        `project ${projectId} at default=${defaultRate}`,
      );
    }
  }
});

test('month_revenue matches the TS total across every client', async () => {
  for (const defaultRate of LEVELS.default) {
    await seed(defaultRate);

    const { rows } = await pool.query(
      'select month_revenue($1,$2,$3) as total',
      [USER, FROM, TO],
    );
    const expected =
      Math.round(
        [...tsUnbilledByClient().values()].reduce((a, b) => a + b, 0) * 100,
      ) / 100;

    assert.equal(Number(rows[0].total), expected, `default=${defaultRate}`);
  }
});

test('non-billable entries reach neither rollup', async () => {
  await seed(100);

  const billableOnly = fixtures.filter((f) => f.isBillable);
  assert.ok(
    billableOnly.length < fixtures.length,
    'the matrix contains non-billable entries',
  );

  const totals = async () => {
    const revenue = await pool.query('select month_revenue($1,$2,$3) as t', [
      USER,
      FROM,
      TO,
    ]);
    const unbilled = await pool.query(
      'select coalesce(sum(seconds),0) as s from unbilled_by_client($1)',
      [USER],
    );
    return {
      revenue: Number(revenue.rows[0].t),
      unbilledSeconds: Number(unbilled.rows[0].s),
    };
  };

  const before = await totals();

  // If the filter were missing these would already be counted, and flipping
  // them would move nothing.
  await pool.query(
    'update time_entries set is_billable = true where not is_billable',
  );
  const after = await totals();

  assert.notEqual(
    after.revenue,
    before.revenue,
    'month_revenue filters is_billable',
  );
  assert.notEqual(
    after.unbilledSeconds,
    before.unbilledSeconds,
    'unbilled_by_client filters is_billable',
  );
});

test('a running timer counts up to now, priced as it would be stopped now', async () => {
  await seed(100);

  /* One transaction, so `now()` is one instant for every read: the running
     entry's measure and the stop below land on the same second. The fixtures
     sit in March, so the window around now holds only the running entry. */
  const db = await pool.connect();
  try {
    await db.query('begin');
    const figures = async () => {
      const day = await db.query(
        `select coalesce(sum(seconds),0) as s, coalesce(sum(amount),0) as a
         from revenue_by_day($1, now() - interval '1 day', now() + interval '1 day', 'UTC')`,
        [USER],
      );
      const client = await db.query(
        `select coalesce(sum(unbilled),0) as a
         from revenue_by_client($1, now() - interval '1 day', now() + interval '1 day')`,
        [USER],
      );
      const unbilled = await db.query(
        `select coalesce(sum(seconds),0) as s, coalesce(sum(amount),0) as a
         from unbilled_by_client($1)`,
        [USER],
      );
      return {
        daySeconds: Number(day.rows[0].s),
        dayAmount: Number(day.rows[0].a),
        clientAmount: Number(client.rows[0].a),
        unbilledSeconds: Number(unbilled.rows[0].s),
        unbilledAmount: Number(unbilled.rows[0].a),
      };
    };

    const before = await figures();
    const id = uuidv7();
    // 1234 s is 0.34 h as the invoice prints it: $34.00 at the $100 default.
    await db.query(
      `insert into time_entries (id,user_id,project_id,task_name,started_at)
       values ($1,$2,null,'Running',now() - interval '1234 seconds')`,
      [id, USER],
    );
    const running = await figures();

    assert.equal(running.daySeconds, 1234);
    assert.equal(running.dayAmount, 34);
    assert.equal(running.clientAmount, 34);
    assert.equal(running.unbilledSeconds - before.unbilledSeconds, 1234);
    assert.equal(
      Math.round((running.unbilledAmount - before.unbilledAmount) * 100),
      3400,
    );

    await db.query('update time_entries set ended_at = now() where id = $1', [
      id,
    ]);
    assert.deepEqual(await figures(), running, 'stopping changes no figure');
  } finally {
    await db.query('rollback');
    db.release();
  }
});
