/**
 * Row Level Security.
 *
 * The other test files connect as a superuser with RLS disabled, because
 * their subject is route logic. That leaves RLS — the safety net beneath the
 * API — completely unexercised, which is exactly how a safety net fails
 * silently.
 *
 * These tests connect as a NON-superuser role with RLS left on, setting
 * `request.jwt.claim.sub` per transaction the way PostgREST does. So
 * `auth.uid()` resolves for real and the policies actually run.
 *
 * The scenario throughout: the route handler's own `user_id` filter has been
 * removed or bypassed. RLS alone must still contain the query.
 *
 * Requires RLS_DATABASE_URL pointing at a migrated database with an
 * `authenticated` role — see the RLS setup step in .github/workflows/ci.yml.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

let admin: pg.Pool; // superuser: seeds and verifies ground truth
let tenant: pg.Pool; // the `authenticated` role: RLS applies

before(async () => {
  const url = process.env.RLS_DATABASE_URL;
  if (!url) throw new Error('RLS_DATABASE_URL is not set');

  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? url });
  tenant = new pg.Pool({ connectionString: url });

  // Fail loudly rather than passing vacuously: a superuser or a
  // BYPASSRLS role would make every assertion below meaningless.
  const { rows } = await tenant.query(
    'select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user',
  );
  assert.equal(rows[0].rolsuper, false, 'the RLS role must not be a superuser');
  assert.equal(
    rows[0].rolbypassrls,
    false,
    'the RLS role must not have BYPASSRLS',
  );

  await admin.query(
    `insert into auth.users (id,email) values ($1,'alice@test'),($2,'bob@test')
     on conflict do nothing`,
    [ALICE, BOB],
  );
});

after(async () => {
  await admin.end();
  await tenant.end();
});

beforeEach(async () => {
  await admin.query('delete from invoice_line_items');
  await admin.query('update time_entries set invoice_id = null');
  await admin.query('delete from time_entries');
  await admin.query('delete from invoices');
  await admin.query('delete from projects');
  await admin.query('update clients set payment_profile_id = null');
  await admin.query('delete from payment_profiles');
  await admin.query('delete from clients');
});

/**
 * Runs a query as a signed-in user, the way PostgREST does: one transaction
 * with the JWT subject claim set locally.
 */
async function asUser<T = any>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await tenant.connect();
  try {
    await client.query('begin');
    await client.query(`set local request.jwt.claim.sub = '${userId}'`);
    const result = await client.query(sql, params);
    await client.query('commit');
    return result.rows as T[];
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Seeds one client + project + entry for each user. */
async function seedBoth() {
  await admin.query(
    `insert into clients (id,user_id,name,hourly_rate) values
       ('cc000000-0000-4000-8000-00000000000a',$1,'Alice Client',150),
       ('cc000000-0000-4000-8000-00000000000b',$2,'Bob Client',200)`,
    [ALICE, BOB],
  );
  await admin.query(
    `insert into projects (id,user_id,client_id,name) values
       ('bb000000-0000-4000-8000-00000000000a',$1,'cc000000-0000-4000-8000-00000000000a','Alice Project'),
       ('bb000000-0000-4000-8000-00000000000b',$2,'cc000000-0000-4000-8000-00000000000b','Bob Project')`,
    [ALICE, BOB],
  );
  await admin.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at) values
       ('018f0000-0000-7000-8000-00000000000a',$1,'bb000000-0000-4000-8000-00000000000a','Alice work','2026-09-10T09:00:00Z','2026-09-10T10:00:00Z'),
       ('018f0000-0000-7000-8000-00000000000b',$2,'bb000000-0000-4000-8000-00000000000b','Bob work','2026-09-10T09:00:00Z','2026-09-10T10:00:00Z')`,
    [ALICE, BOB],
  );
}

// ── reads ──────────────────────────────────────────────────────────
test('an unfiltered select returns only the caller’s rows', async () => {
  await seedBoth();

  // Deliberately no `where user_id = ...`: this is the query a route would
  // issue if its scoping were dropped. RLS alone must contain it.
  const alice = await asUser(ALICE, 'select name from clients');
  const bob = await asUser(BOB, 'select name from clients');

  assert.deepEqual(
    alice.map((r) => r.name),
    ['Alice Client'],
  );
  assert.deepEqual(
    bob.map((r) => r.name),
    ['Bob Client'],
  );

  const { rows: all } = await admin.query(
    'select count(*)::int n from clients',
  );
  assert.equal(all[0].n, 2, 'both rows exist; RLS is filtering, not the seed');
});

test('every user-scoped table is isolated', async () => {
  await seedBoth();
  await admin.query(
    `insert into payment_profiles (id,user_id,name,is_default,account_number) values
       ('dd000000-0000-4000-8000-00000000000a',$1,'Alice ACH',true,'1111'),
       ('dd000000-0000-4000-8000-00000000000b',$2,'Bob ACH',true,'2222')`,
    [ALICE, BOB],
  );
  await admin.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no) values
       ('ff000000-0000-4000-8000-00000000000a',$1,'cc000000-0000-4000-8000-00000000000a','INV-0001',1),
       ('ff000000-0000-4000-8000-00000000000b',$2,'cc000000-0000-4000-8000-00000000000b','INV-0001',1)`,
    [ALICE, BOB],
  );

  for (const table of [
    'clients',
    'projects',
    'time_entries',
    'invoices',
    'payment_profiles',
    'user_settings',
  ]) {
    const seen = await asUser(ALICE, `select count(*)::int n from ${table}`);
    const total = await admin.query(`select count(*)::int n from ${table}`);
    assert.equal(
      seen[0].n,
      1,
      `${table}: caller should see exactly their own row`,
    );
    assert.equal(total.rows[0].n, 2, `${table}: both rows exist`);
  }
});

test('targeting another user’s row by id returns nothing, not their data', async () => {
  await seedBoth();

  // The attack a broken route enables: a valid id belonging to someone else.
  const rows = await asUser(ALICE, 'select name from clients where id = $1', [
    'cc000000-0000-4000-8000-00000000000b',
  ]);
  assert.equal(
    rows.length,
    0,
    'a known-good id must not leak another tenant’s row',
  );
});

test('invoice line items inherit isolation from their invoice', async () => {
  await seedBoth();
  await admin.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no) values
       ('ff000000-0000-4000-8000-00000000000a',$1,'cc000000-0000-4000-8000-00000000000a','INV-0001',1),
       ('ff000000-0000-4000-8000-00000000000b',$2,'cc000000-0000-4000-8000-00000000000b','INV-0001',1)`,
    [ALICE, BOB],
  );
  await admin.query(
    `insert into invoice_line_items (invoice_id,description,quantity_seconds,resolved_rate,amount) values
       ('ff000000-0000-4000-8000-00000000000a','Alice line',3600,150,150),
       ('ff000000-0000-4000-8000-00000000000b','Bob line',3600,200,200)`,
  );

  // invoice_line_items has no user_id at all — its policy joins through the
  // invoice, so this is the one table where isolation is indirect.
  const alice = await asUser(
    ALICE,
    'select description from invoice_line_items',
  );
  assert.deepEqual(
    alice.map((r) => r.description),
    ['Alice line'],
  );
});

// ── writes ─────────────────────────────────────────────────────────
test('a row cannot be inserted on another user’s behalf', async () => {
  await assert.rejects(
    () =>
      asUser(ALICE, `insert into clients (user_id,name) values ($1,'Forged')`, [
        BOB,
      ]),
    /row-level security/i,
    'the WITH CHECK clause must reject a forged user_id',
  );

  const { rows } = await admin.query('select count(*)::int n from clients');
  assert.equal(rows[0].n, 0, 'nothing was written');
});

test('an update cannot reach another user’s row', async () => {
  await seedBoth();

  const updated = await asUser(
    ALICE,
    `update clients set name = 'Hijacked' where id = $1 returning id`,
    ['cc000000-0000-4000-8000-00000000000b'],
  );
  assert.equal(updated.length, 0, 'the update matched no visible row');

  const { rows } = await admin.query('select name from clients where id = $1', [
    'cc000000-0000-4000-8000-00000000000b',
  ]);
  assert.equal(rows[0].name, 'Bob Client', 'Bob’s row is untouched');
});

test('an update cannot reassign a row to another user', async () => {
  await seedBoth();

  await assert.rejects(
    () =>
      asUser(ALICE, `update clients set user_id = $1 where user_id = $2`, [
        BOB,
        ALICE,
      ]),
    /row-level security/i,
    'WITH CHECK must reject moving a row out of the caller’s scope',
  );
});

test('a delete cannot reach another user’s row', async () => {
  await seedBoth();

  const deleted = await asUser(
    ALICE,
    'delete from clients where id = $1 returning id',
    ['cc000000-0000-4000-8000-00000000000b'],
  );
  assert.equal(deleted.length, 0);

  const { rows } = await admin.query('select count(*)::int n from clients');
  assert.equal(rows[0].n, 2, 'both rows survive');
});

test('an unqualified delete removes only the caller’s rows', async () => {
  await seedBoth();

  // The worst-case bug: a route that forgets its WHERE entirely.
  await asUser(ALICE, 'delete from time_entries');

  const { rows } = await admin.query('select user_id from time_entries');
  assert.equal(rows.length, 1, 'only Alice’s entry was deleted');
  assert.equal(rows[0].user_id, BOB);
});

// ── the invariant under RLS ────────────────────────────────────────
test('the one-running-timer index is per user, not global', async () => {
  await seedBoth();

  await asUser(
    ALICE,
    `insert into time_entries (id,user_id,task_name,started_at)
     values ('018f0000-0000-7000-8000-0000000000a1',$1,'Alice running',now())`,
    [ALICE],
  );

  // Bob starting a timer must not collide with Alice's.
  await asUser(
    BOB,
    `insert into time_entries (id,user_id,task_name,started_at)
     values ('018f0000-0000-7000-8000-0000000000b1',$1,'Bob running',now())`,
    [BOB],
  );

  const { rows } = await admin.query(
    'select count(*)::int n from time_entries where ended_at is null',
  );
  assert.equal(rows[0].n, 2, 'two users may each have a running timer');

  // But Alice still cannot start a second one.
  await assert.rejects(
    () =>
      asUser(
        ALICE,
        `insert into time_entries (id,user_id,task_name,started_at)
         values ('018f0000-0000-7000-8000-0000000000a2',$1,'Alice second',now())`,
        [ALICE],
      ),
    /one_running_timer_per_user/,
  );
});

// ── no claim at all ────────────────────────────────────────────────
test('an unauthenticated connection sees nothing', async () => {
  await seedBoth();

  // No `request.jwt.claim.sub` set: auth.uid() is null, so `user_id = null`
  // is never true and every policy denies.
  const client = await tenant.connect();
  try {
    const { rows } = await client.query('select count(*)::int n from clients');
    assert.equal(rows[0].n, 0, 'a missing claim must fail closed, not open');
  } finally {
    client.release();
  }
});

test('a malformed claim fails closed rather than erroring open', async () => {
  await seedBoth();

  const client = await tenant.connect();
  try {
    await client.query('begin');
    await client.query(`set local request.jwt.claim.sub = 'not-a-uuid'`);
    await assert.rejects(
      () => client.query('select count(*) from clients'),
      'a non-uuid claim must not resolve to a readable scope',
    );
    await client.query('rollback');
  } finally {
    client.release();
  }
});
