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
  const adminUrl = process.env.DATABASE_URL;
  // Both, or neither. Falling back to the tenant URL gave `admin` the
  // `authenticated` role, which cannot seed auth.users — surfacing as
  // "permission denied for table users", which reads like a broken policy.
  if (!url || !adminUrl) {
    throw new Error(
      'RLS tests need RLS_DATABASE_URL (the `authenticated` role) and ' +
        'DATABASE_URL (a superuser on the same database). Run `pnpm verify:db`, ' +
        'which supplies both.',
    );
  }

  admin = new pg.Pool({ connectionString: adminUrl });
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
  await admin.query('delete from push_devices');
  await admin.query('delete from feedback');
  await admin.query('delete from subscriptions');
  await admin.query('update expenses set invoice_id = null');
  await admin.query('delete from expenses');
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
  app = false,
): Promise<T[]> {
  const client = await tenant.connect();
  try {
    await client.query('begin');
    await client.query(`set local request.jwt.claim.sub = '${userId}'`);
    // A connected app's token: the user's, plus the OAuth client.
    if (app) {
      await client.query(
        `set local request.jwt.claims = '{"sub":"${userId}","client_id":"c"}'`,
      );
    }
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

/** One expense each, on each user's client. Call after `seedBoth`. */
const ALICE_EXPENSE = '018f0000-0000-7000-9000-00000000000a';
const BOB_EXPENSE = '018f0000-0000-7000-9000-00000000000b';
async function seedExpenses() {
  await admin.query(
    `insert into expenses (id,user_id,client_id,spent_on,description,amount) values
       ($1,$3,'cc000000-0000-4000-8000-00000000000a','2026-09-12','Alice license',199),
       ($2,$4,'cc000000-0000-4000-8000-00000000000b','2026-09-12','Bob license',299)`,
    [ALICE_EXPENSE, BOB_EXPENSE, ALICE, BOB],
  );
}

/** One feedback message each. */
const ALICE_FEEDBACK = '018f0000-0000-7000-a000-00000000000a';
const BOB_FEEDBACK = '018f0000-0000-7000-a000-00000000000b';
async function seedFeedback() {
  await admin.query(
    `insert into feedback (id,user_id,message,screen,client,app_version) values
       ($1,$3,'Alice says','/','web','0.1.0'),
       ($2,$4,'Bob says','/','web','0.1.0')`,
    [ALICE_FEEDBACK, BOB_FEEDBACK, ALICE, BOB],
  );
}

/** One subscription each. Only the server writes these. */
async function seedSubscriptions() {
  await admin.query(
    `insert into subscriptions (user_id,stripe_customer_id,stripe_subscription_id,status,current_period_end) values
       ($1,'cus_alice','sub_alice','canceled',now()),
       ($2,'cus_bob','sub_bob','active',now())`,
    [ALICE, BOB],
  );
}

/** One phone each. */
async function seedPushDevices() {
  await admin.query(
    `insert into push_devices (user_id,token,platform) values
       ($1,'alice-phone','android'), ($2,'bob-phone','android')`,
    [ALICE, BOB],
  );
}

// ── reads ──────────────────────────────────────────────────────────
test('every user-scoped table shows the caller only their own rows', async () => {
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
  await admin.query(
    `insert into invoice_line_items (invoice_id,description,unit,quantity,unit_price,amount) values
       ('ff000000-0000-4000-8000-00000000000a','Alice line','hour',1,150,150),
       ('ff000000-0000-4000-8000-00000000000b','Bob line','hour',1,200,200)`,
  );
  await seedExpenses();
  await seedFeedback();
  await seedSubscriptions();
  await seedPushDevices();

  /* Deliberately no `where user_id = ...`: this is the query a route would
     issue if its scoping were dropped. RLS alone must contain it. */
  for (const table of [
    'clients',
    'projects',
    'time_entries',
    'invoices',
    'payment_profiles',
    'user_settings',
    'expenses',
    'feedback',
    'subscriptions',
    'push_devices',
    // No user_id at all: its policy joins through the invoice.
    'invoice_line_items',
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

// ── writes ─────────────────────────────────────────────────────────
test('a row cannot be written on another user’s behalf', async () => {
  await seedBoth();
  await seedExpenses();

  // Each table's WITH CHECK rejects a forged user_id.
  for (const sql of [
    `insert into clients (user_id,name) values ($1,'Forged')`,
    `insert into expenses (user_id,client_id,spent_on,description,amount)
     values ($1,'cc000000-0000-4000-8000-00000000000b','2026-09-12','Forged',1)`,
    `insert into feedback (id,user_id,message,screen,client,app_version)
     values ('${ALICE_FEEDBACK}',$1,'Forged','/','web','0.1.0')`,
    `insert into push_devices (user_id,token,platform) values ($1,'forged','android')`,
  ])
    await assert.rejects(
      () => asUser(ALICE, sql, [BOB]),
      /row-level security/i,
      sql,
    );

  // Nor can a row be moved out of the caller's scope.
  await assert.rejects(
    () =>
      asUser(ALICE, `update clients set user_id = $1 where user_id = $2`, [
        BOB,
        ALICE,
      ]),
    /row-level security/i,
    'a client reassigned',
  );
  await assert.rejects(
    () =>
      asUser(ALICE, `update expenses set user_id = $1 where id = $2`, [
        BOB,
        ALICE_EXPENSE,
      ]),
    /row-level security|expense_client_same_owner/i,
    'an expense reassigned',
  );
});

test('an update or delete reaches only the caller’s rows', async () => {
  await seedBoth();
  await seedExpenses();
  await seedPushDevices();

  // The attack a broken route enables: a valid id belonging to someone else.
  for (const [table, set, id] of [
    ['clients', `name = 'Hijacked'`, 'cc000000-0000-4000-8000-00000000000b'],
    ['expenses', 'amount = 1', BOB_EXPENSE],
  ]) {
    const updated = await asUser(
      ALICE,
      `update ${table} set ${set} where id = $1 returning id`,
      [id],
    );
    const deleted = await asUser(
      ALICE,
      `delete from ${table} where id = $1 returning id`,
      [id],
    );
    assert.deepEqual([updated.length, deleted.length], [0, 0], table);
  }
  const { rows: bob } = await admin.query(
    `select (select name from clients where id = $1) as client,
            (select amount::float from expenses where id = $2) as expense`,
    ['cc000000-0000-4000-8000-00000000000b', BOB_EXPENSE],
  );
  assert.deepEqual(bob[0], { client: 'Bob Client', expense: 299 });

  // The worst case: a route that forgets its WHERE entirely.
  for (const table of ['time_entries', 'push_devices']) {
    await asUser(ALICE, `delete from ${table}`);
    const { rows } = await admin.query(`select user_id from ${table}`);
    assert.deepEqual(
      rows.map((r) => r.user_id),
      [BOB],
      table,
    );
  }
});

test('feedback, phones and subscriptions refuse the writes their grants leave out', async () => {
  await seedFeedback();
  await seedPushDevices();
  await seedSubscriptions();

  /* Refused on the grant, before any policy runs: sent feedback is final,
     even to its sender; a phone is registered again rather than edited; and
     only the server writes a subscription, so no user can make themselves
     paid. Alice's is canceled. */
  for (const sql of [
    `update feedback set message = 'Rewritten' where id = '${ALICE_FEEDBACK}'`,
    `delete from feedback where id = '${ALICE_FEEDBACK}'`,
    `update push_devices set token = 'moved'`,
    `update subscriptions set status = 'active' where user_id = '${ALICE}'`,
    `insert into subscriptions (user_id,stripe_customer_id,stripe_subscription_id,status,current_period_end)
       values ('${ALICE}','cus_x','sub_x','active',now())`,
    `delete from subscriptions where user_id = '${BOB}'`,
  ])
    await assert.rejects(() => asUser(ALICE, sql), /permission denied/i, sql);

  const { rows } = await admin.query(
    'select user_id, status from subscriptions order by user_id',
  );
  assert.deepEqual(rows, [
    { user_id: ALICE, status: 'canceled' },
    { user_id: BOB, status: 'active' },
  ]);
  const { rows: feedback } = await admin.query(
    'select message from feedback where id = $1',
    [ALICE_FEEDBACK],
  );
  assert.equal(feedback[0].message, 'Alice says');
});

/** Whether Realtime lets `userId` join `topic`: it sets the topic and asks
 *  whether the user's select on `realtime.messages` sees a row. */
async function mayJoin(userId: string, topic: string) {
  const client = await tenant.connect();
  try {
    await client.query('begin');
    await client.query(`set local request.jwt.claim.sub = '${userId}'`);
    await client.query(`select set_config('realtime.topic', $1, true)`, [
      topic,
    ]);
    const { rows } = await client.query(
      'select count(*)::int n from realtime.messages',
    );
    return rows[0].n > 0;
  } finally {
    await client.query('rollback');
    client.release();
  }
}

test('a user joins only their own timer topic', async () => {
  await admin.query('delete from realtime.messages');
  await admin.query(
    `insert into realtime.messages (topic, extension) values ($1, 'broadcast')`,
    [`user:${ALICE}`],
  );
  assert.equal(await mayJoin(ALICE, `user:${ALICE}`), true);
  assert.equal(await mayJoin(BOB, `user:${ALICE}`), false);
  assert.equal(await mayJoin(ALICE, `user:${BOB}`), false);
  await admin.query('delete from realtime.messages');
});

test('an invoice carries the plan it was generated on, and no user can claim another', async () => {
  await seedBoth();
  await seedSubscriptions();
  const insert = (user: string, client: string, id: string) =>
    asUser(
      user,
      `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,period_start,period_end,issued_subscription_status)
       values ('${id}','${user}','${client}','INV-0001',1,'2026-09-01','2026-09-30','active')`,
    );
  // Alice's subscription is canceled; she claims `active` and gets her own.
  await insert(
    ALICE,
    'cc000000-0000-4000-8000-00000000000a',
    'aa000000-0000-4000-8000-00000000000a',
  );
  await insert(
    BOB,
    'cc000000-0000-4000-8000-00000000000b',
    'aa000000-0000-4000-8000-00000000000b',
  );
  await assert.rejects(
    () =>
      asUser(
        ALICE,
        `update invoices set issued_subscription_status = 'active' where user_id = '${ALICE}'`,
      ),
    /keeps the plan it was generated on/,
  );

  const { rows } = await admin.query(
    'select user_id, issued_subscription_status from invoices order by user_id',
  );
  assert.deepEqual(rows, [
    { user_id: ALICE, issued_subscription_status: 'canceled' },
    { user_id: BOB, issued_subscription_status: 'active' },
  ]);
});

// ── references across a tenant boundary ────────────────────────────
// RLS scopes what a query can SEE. It says nothing about what a row may
// POINT AT, so these are a foreign key's job rather than a policy's — and
// the hole they close returned 201 before `entry_project_same_owner`.
test('a row cannot point at another user’s row', async () => {
  await issueAliceInvoice('draft');

  for (const { name, as, sql, constraint } of [
    {
      name: 'an entry inserted under their project',
      as: ALICE,
      sql: `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
            values ('018f0000-0000-7000-8000-00000000000c','${ALICE}','bb000000-0000-4000-8000-00000000000b','Borrowed','2026-09-11T09:00:00Z','2026-09-11T10:00:00Z')`,
      constraint: 'entry_project_same_owner',
    },
    {
      // The column is writable by three routes; the constraint covers all.
      name: 'an entry moved onto their project',
      as: ALICE,
      sql: `update time_entries set project_id = 'bb000000-0000-4000-8000-00000000000b'
            where id = '${ALICE_ENTRY}'`,
      constraint: 'entry_project_same_owner',
    },
    {
      name: 'an expense under their client',
      as: ALICE,
      sql: `insert into expenses (user_id,client_id,spent_on,description,amount)
            values ('${ALICE}','cc000000-0000-4000-8000-00000000000b','2026-09-12','Borrowed',1)`,
      constraint: 'expense_client_same_owner',
    },
    {
      name: 'an invoice to their client',
      as: ALICE,
      sql: `insert into invoices (user_id,client_id,invoice_number,sequence_no)
            values ('${ALICE}','cc000000-0000-4000-8000-00000000000b','INV-0002',2)`,
      constraint: 'invoice_client_same_owner',
    },
    {
      name: 'a project under their client',
      as: ALICE,
      sql: `insert into projects (user_id,client_id,name)
            values ('${ALICE}','cc000000-0000-4000-8000-00000000000b','Borrowed')`,
      constraint: 'project_client_same_owner',
    },
    {
      name: 'their draft holding my entry',
      as: BOB,
      sql: `update time_entries set draft_id = '${ALICE_INVOICE}'
            where id = '018f0000-0000-7000-8000-00000000000b'`,
      constraint: 'time_entries_draft_same_owner',
    },
  ])
    await assert.rejects(() => asUser(as, sql), new RegExp(constraint), name);
});

test('a project cannot be handed to another user while entries reference it', async () => {
  await seedBoth();

  // `on update restrict`, not cascade. `user_id` is half the referenced key,
  // so a cascade would WRITE time_entries.user_id — moving another user's
  // records in one statement, and past `guard_billed_entry`, which does not
  // list a column nothing could previously change.
  await assert.rejects(
    () =>
      admin.query('update projects set user_id = $1 where id = $2', [
        BOB,
        'bb000000-0000-4000-8000-00000000000a',
      ]),
    /entry_project_same_owner/,
    'the transfer must fail rather than carry the entries across',
  );

  const { rows } = await admin.query(
    'select user_id from time_entries where id = $1',
    ['018f0000-0000-7000-8000-00000000000a'],
  );
  assert.equal(rows[0].user_id, ALICE, 'the entry did not change hands');
});

test('an entry keeps its owner when its project is deleted', async () => {
  await seedBoth();

  // `on delete set null (project_id)` names the column. A bare `set null`
  // would null `user_id` too, which is `not null` — so deleting a project
  // would fail on its own entries.
  await asUser(ALICE, 'delete from projects where id = $1', [
    'bb000000-0000-4000-8000-00000000000a',
  ]);

  const { rows } = await admin.query(
    'select user_id, project_id from time_entries where id = $1',
    ['018f0000-0000-7000-8000-00000000000a'],
  );
  assert.equal(rows[0].project_id, null, 'the reference is cleared');
  assert.equal(rows[0].user_id, ALICE, 'the entry is still Alice’s');
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
test('a missing or malformed claim fails closed', async () => {
  await seedBoth();

  const client = await tenant.connect();
  try {
    // No claim: auth.uid() is null, so `user_id = null` is never true.
    const { rows } = await client.query('select count(*)::int n from clients');
    assert.equal(rows[0].n, 0, 'a missing claim must fail closed, not open');

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

// ── an issued invoice is frozen ────────────────────────────────────
// The entry and expense locks read the invoice's status, so these hold
// only if the invoice itself cannot be rewritten by the path that would
// rewrite them: a PostgREST call with the user's own JWT.
const ALICE_INVOICE = 'ff000000-0000-4000-8000-00000000000a';
const ALICE_ENTRY = '018f0000-0000-7000-8000-00000000000a';

/** Alice's invoice with one line, billing her entry and her expense. */
async function issueAliceInvoice(status: 'draft' | 'sent') {
  await seedBoth();
  await seedExpenses();
  await admin.query(
    `insert into invoices (id,user_id,client_id,invoice_number,sequence_no,total)
     values ($1,$2,'cc000000-0000-4000-8000-00000000000a','INV-0001',1,150)`,
    [ALICE_INVOICE, ALICE],
  );
  await admin.query(
    `insert into invoice_line_items (invoice_id,description,unit,quantity,unit_price,amount)
     values ($1,'Alice line','hour',1,150,150)`,
    [ALICE_INVOICE],
  );
  await admin.query(`update time_entries set invoice_id=$1 where id=$2`, [
    ALICE_INVOICE,
    ALICE_ENTRY,
  ]);
  await admin.query(`update expenses set invoice_id=$1 where id=$2`, [
    ALICE_INVOICE,
    ALICE_EXPENSE,
  ]);
  if (status === 'sent')
    await admin.query(
      `update invoices set status='sent', sent_at=now() where id=$1`,
      [ALICE_INVOICE],
    );
}

const asAlice = (sql: string) => asUser(ALICE, sql, [ALICE_INVOICE]);

test('an issued invoice and its lines cannot be rewritten in the database', async () => {
  await issueAliceInvoice('sent');

  await assert.rejects(
    () => asAlice(`update invoices set total = 0 where id = $1`),
    /is sent and cannot be modified/,
  );
  await assert.rejects(
    () => asAlice(`update invoices set notes = 'Paid in full' where id = $1`),
    /is sent and cannot be modified/,
  );
  await assert.rejects(
    () =>
      asAlice(`update invoice_line_items set amount = 0 where invoice_id = $1`),
    /its lines cannot be modified/,
  );
  await assert.rejects(
    () => asAlice(`delete from invoice_line_items where invoice_id = $1`),
    /its lines cannot be modified/,
  );
  await assert.rejects(
    () =>
      asAlice(
        `insert into invoice_line_items (invoice_id,description,unit,quantity,unit_price,amount)
         values ($1,'Extra','fixed',1,500,500)`,
      ),
    /its lines cannot be modified/,
  );
  await assert.rejects(
    () => asAlice(`update invoices set status = 'draft' where id = $1`),
    /cannot move from sent to draft/,
  );
  await assert.rejects(
    () => asAlice(`delete from invoices where id = $1`),
    /is sent and cannot be deleted/,
  );

  const [inv] = (
    await admin.query(
      `select status, total::float from invoices where id = $1`,
      [ALICE_INVOICE],
    )
  ).rows;
  assert.deepEqual(inv, { status: 'sent', total: 150 });
  const [entry] = (
    await admin.query(`select invoice_id from time_entries where id = $1`, [
      ALICE_ENTRY,
    ])
  ).rows;
  assert.equal(entry.invoice_id, ALICE_INVOICE, 'the entry stays billed');
});

test('deleting the account takes a sent invoice with it', async () => {
  await issueAliceInvoice('sent');

  // `delete_account()` runs as its definer, which the delete guard lets by.
  await asUser(ALICE, 'select delete_account()');

  const { rows } = await admin.query(
    'select count(*)::int n from invoices where user_id = $1',
    [ALICE],
  );
  assert.equal(rows[0].n, 0);
  // Alice back, for the tests after this one.
  await admin.query(
    `insert into auth.users (id,email) values ($1,'alice@test')`,
    [ALICE],
  );
});

test('a status moves only along the transition table', async () => {
  await issueAliceInvoice('draft');

  await assert.rejects(
    () =>
      asAlice(
        `update invoices set status = 'paid', paid_at = now() where id = $1`,
      ),
    /cannot move from draft to paid/,
  );
  await asAlice(
    `update invoices set status = 'sent', sent_at = now() where id = $1`,
  );
  await asAlice(
    `update invoices set status = 'paid', paid_at = now() where id = $1`,
  );
  await asAlice(`update invoices set status = 'void' where id = $1`);
  for (const status of ['draft', 'sent', 'paid'])
    await assert.rejects(
      () => asAlice(`update invoices set status = '${status}' where id = $1`),
      new RegExp(`cannot move from void to ${status}`),
    );
});

/* `send_draft` runs as the caller: another user's draft is out of its
   reach, and an invoice already sent can't be sent again through it. */
test('send_draft reaches only the caller’s own drafts', async () => {
  const send = `select send_draft($1, '{"lines": [], "subtotal": 0, "tax_rate": 0, "tax_amount": 0, "expenses_subtotal": 0, "total": 0, "issue_date": "2026-10-01", "tz": "UTC"}'::jsonb, '{}', '{}', now())`;

  await issueAliceInvoice('draft');
  await assert.rejects(() => asUser(BOB, send, [ALICE_INVOICE]), /not found/);
  const [still] = (
    await admin.query(`select status from invoices where id = $1`, [
      ALICE_INVOICE,
    ])
  ).rows;
  assert.equal(still.status, 'draft', 'another user cannot send it');

  await asAlice(send);
  const [sent] = (
    await admin.query(`select status from invoices where id = $1`, [
      ALICE_INVOICE,
    ])
  ).rows;
  assert.equal(sent.status, 'sent', 'the owner sends it');

  await assert.rejects(() => asAlice(send), /is sent and cannot be sent/);
});

/* `update_draft` runs as the caller too: another user's draft is out of its
   reach, and a sent invoice isn't a draft to edit. */
test('update_draft reaches only the caller’s own drafts', async () => {
  const edit = `select update_draft($1, '{"period_start": "2026-09-01", "period_end": "2026-09-30", "grouping_mode": "entry", "notes": "Edited", "tz": "UTC", "manual_lines": []}'::jsonb)`;
  const notes = async () =>
    (
      await admin.query(`select notes from invoices where id = $1`, [
        ALICE_INVOICE,
      ])
    ).rows[0].notes;

  await issueAliceInvoice('draft');
  await assert.rejects(() => asUser(BOB, edit, [ALICE_INVOICE]), /not found/);
  assert.equal(await notes(), null, 'another user cannot edit it');

  await asAlice(edit);
  assert.equal(await notes(), 'Edited', 'the owner edits it');

  await admin.query(`update invoices set status = 'sent' where id = $1`, [
    ALICE_INVOICE,
  ]);
  await assert.rejects(() => asAlice(edit), /is sent and cannot be edited/);
});

/* A connected app's token is the user's own JWT plus `client_id`, so the
   Data API is fenced here, not only in the routes. */
test('a connected app writes only what its tools do', async () => {
  await issueAliceInvoice('sent');
  await admin.query(
    `insert into time_entries (id,user_id,task_name,started_at,ended_at)
     values ('018f0000-0000-7000-8000-0000000000aa',$1,'Free','2026-09-11T09:00:00Z','2026-09-11T10:00:00Z')`,
    [ALICE],
  );
  const asApp = (sql: string) => asUser(ALICE, sql, [], true);

  assert.equal((await asApp('select id from time_entries')).length, 2);
  assert.equal((await asApp('select id from clients')).length, 1);
  assert.equal((await asApp('select id from invoices')).length, 0);
  await seedPushDevices();
  assert.equal(
    (await asApp('select token from push_devices')).length,
    1,
    'a rename of the running entry still reaches the phone',
  );

  await asApp(`update projects set name = 'Renamed'`);
  await asApp(
    `update time_entries set task_name = 'Renamed' where id = '018f0000-0000-7000-8000-0000000000aa'`,
  );
  const renamed = await admin.query(
    `select (select name from projects where user_id = $1) p,
            (select task_name from time_entries where id = '018f0000-0000-7000-8000-0000000000aa') t`,
    [ALICE],
  );
  assert.deepEqual(renamed.rows[0], { p: 'Renamed', t: 'Renamed' });

  // It adds clients and projects, and edits a client's details.
  await asApp(
    `insert into clients (id,user_id,name) values ('cc000000-0000-4000-8000-0000000000aa','${ALICE}','Added')`,
  );
  await asApp(
    `insert into projects (id,user_id,client_id,name) values ('bb000000-0000-4000-8000-0000000000aa','${ALICE}','cc000000-0000-4000-8000-0000000000aa','Added')`,
  );
  await asApp(`update clients set hourly_rate = 175, payment_terms_days = 15`);
  const added = await admin.query(
    `select (select count(*)::int from projects where user_id = $1) p,
            (select count(*)::int from clients where user_id = $1 and hourly_rate = 175) c`,
    [ALICE],
  );
  assert.deepEqual(added.rows[0], { p: 2, c: 2 });

  for (const [sql, refusal] of [
    [
      `update time_entries set task_name = 'x' where id = '${ALICE_ENTRY}'`,
      /billed on a sent invoice/,
    ],
    [`update projects set hourly_rate = 1`, /may change only name/],
    [`update clients set archived_at = now()`, /may change only name, email/],
    [
      `update time_entries set ended_at = now() where id = '018f0000-0000-7000-8000-0000000000aa'`,
      /may change only task_name/,
    ],
    [
      `insert into time_entries (id,user_id,started_at) values ('018f0000-0000-7000-8000-0000000000ab','${ALICE}',now())`,
      /row-level security/,
    ],
    [`select delete_account()`, /Not signed in/],
    [
      `insert into push_devices (user_id,token,platform) values ('${ALICE}','app-phone','android')`,
      /row-level security/,
    ],
    [`select allocate_invoice_number('${ALICE}')`, /No settings row/],
  ] as const) {
    await assert.rejects(() => asApp(sql), refusal, sql);
  }
  // A restrictive policy hides the rows from a delete rather than raising.
  await asApp('delete from time_entries');
  const { rows } = await admin.query(
    'select count(*)::int n from time_entries where user_id = $1',
    [ALICE],
  );
  assert.equal(rows[0].n, 2, 'nothing deleted');
});

/* Deny by default: a table a later migration adds is closed to a connected
   app until its own `no_connected_app` policy says what it may do. */
test('every table a user reaches fences connected apps', async () => {
  const { rows } = await admin.query(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and has_table_privilege('authenticated', c.oid, 'select, insert, update, delete')
       and not exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname
           and p.policyname like 'no_connected_app%')
     order by 1`,
  );
  assert.deepEqual(
    rows.map((r) => r.relname),
    [],
  );
});
