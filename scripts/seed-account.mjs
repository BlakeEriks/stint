#!/usr/bin/env node
/**
 * Give an account something to look at.
 *
 * `supabase/seed.sql` belongs to `dev@localhost.test` — the test account, which
 * the e2e suite restores and which you should not be tracking real time in.
 * This puts a comparable shape of data under YOUR account instead, so a
 * second local user is useful from the first launch rather than an empty
 * timer screen.
 *
 *   node scripts/seed-account.mjs you@example.com
 *
 * Idempotent by client name: re-running replaces what it made last time
 * rather than stacking a second copy. It touches nothing it did not create,
 * so entries you logged yourself are safe.
 *
 * Dates are relative to today, not fixed like `seed.sql`'s — a screen with
 * "last worked on: three months ago" teaches you nothing about how the app
 * looks in use.
 */
import pg from 'pg';

const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/seed-account.mjs <email> [--clear]');
  console.error('\nThe account must already exist — sign in once first.');
  process.exit(1);
}

const clearOnly = process.argv.includes('--clear');

/** Everything this script creates, tagged so it can find them again. */
const CLIENTS = [
  {
    name: 'Northwind Trading',
    email: 'ap@northwind.test',
    rate: 150,
    color: '#6FA8FF',
    projects: [
      { name: 'Warehouse dashboard', rate: null },
      { name: 'Rush: peak season fixes', rate: 195 },
    ],
  },
  {
    name: 'Meridian Labs',
    email: 'billing@meridian.test',
    rate: null, // inherits the user default — worth seeing resolved
    color: '#C58AF9',
    projects: [{ name: 'Data pipeline audit', rate: null }],
  },
];

/** Internal work: no client, which is how unbillable time is tracked. */
const INTERNAL = 'Admin and invoicing';

const db = new pg.Client({
  connectionString: process.env.SEED_DATABASE_URL ?? DEFAULT_URL,
});
await db.connect();

try {
  const { rows } = await db.query(
    'select id from auth.users where email = $1',
    [email],
  );
  if (rows.length === 0) {
    console.error(`No account for ${email}.`);
    console.error('Sign in through the app once, then run this again.');
    process.exit(1);
  }
  const userId = rows[0].id;

  await db.query('begin');

  /* Remove a previous run before writing a new one. Scoped to the client
     names above and to the internal project, so anything you logged yourself
     survives — this must never be the thing that eats your own work. */
  const names = CLIENTS.map((c) => c.name);
  await db.query(
    `delete from time_entries
      where user_id = $1
        and (project_id in (
              select p.id from projects p
               left join clients c on c.id = p.client_id
               where p.user_id = $1 and (c.name = any($2) or p.name = $3))
             or (project_id is null and task_name like 'Seeded:%'))`,
    [userId, names, INTERNAL],
  );
  await db.query(
    `delete from projects
      where user_id = $1
        and (client_id in (select id from clients where user_id = $1 and name = any($2))
             or (client_id is null and name = $3))`,
    [userId, names, INTERNAL],
  );
  await db.query('delete from clients where user_id = $1 and name = any($2)', [
    userId,
    names,
  ]);

  if (clearOnly) {
    await db.query('commit');
    console.log(`Cleared seeded data for ${email}.`);
    process.exit(0);
  }

  // A default rate, so a client with none has something to inherit.
  await db.query(
    `update user_settings
        set default_hourly_rate = coalesce(default_hourly_rate, 125)
      where user_id = $1`,
    [userId],
  );

  const projectIds = [];
  for (const client of CLIENTS) {
    const {
      rows: [{ id: clientId }],
    } = await db.query(
      `insert into clients (user_id, name, email, hourly_rate, currency, color)
       values ($1, $2, $3, $4, 'USD', $5) returning id`,
      [userId, client.name, client.email, client.rate, client.color],
    );
    for (const project of client.projects) {
      const {
        rows: [{ id }],
      } = await db.query(
        `insert into projects (user_id, client_id, name, hourly_rate, is_billable_default)
         values ($1, $2, $3, $4, true) returning id`,
        [userId, clientId, project.name, project.rate],
      );
      projectIds.push(id);
    }
  }

  const {
    rows: [{ id: internalId }],
  } = await db.query(
    `insert into projects (user_id, client_id, name, is_billable_default)
     values ($1, null, $2, false) returning id`,
    [userId, INTERNAL],
  );

  /* Two weeks of weekdays, a few hours a day across the projects. Enough for
     the calendar to have shape and for the unbilled rollup to have something
     to total, without pretending to be a full history. */
  const TASKS = [
    'Filter panel and saved views',
    'Inventory sync edge cases',
    'Reviewed the API contract',
    'Pairing on the ingest job',
    'Query performance pass',
    'Client call and follow-ups',
  ];

  /* The last weekday in range, which is NOT necessarily today: run this on a
     Sunday and `back === 0` is skipped by the weekend filter, so the entry
     meant to be left running never gets created and the app opens on a dead
     screen. Found by running it on a Sunday. */
  let lastWorkedBack = null;
  for (let back = 13; back >= 0; back -= 1) {
    const probe = new Date();
    probe.setDate(probe.getDate() - back);
    const dow = probe.getDay();
    if (dow !== 0 && dow !== 6) lastWorkedBack = back;
  }

  const { rows: alreadyRunning } = await db.query(
    'select 1 from time_entries where user_id = $1 and ended_at is null',
    [userId],
  );
  const someoneIsRunning = alreadyRunning.length > 0;

  let entries = 0;
  for (let back = 13; back >= 0; back -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - back);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // weekends stay empty

    // One or two blocks a day, starting at 09:00 local.
    const blocks = back % 3 === 0 ? 2 : 1;
    for (let b = 0; b < blocks; b += 1) {
      const start = new Date(day);
      start.setHours(9 + b * 4, b === 0 ? 0 : 30, 0, 0);
      const hours = 1.5 + ((back + b) % 3) * 0.75;
      const end = new Date(start.getTime() + hours * 3_600_000);

      /* The final block of the most recent worked day is left running, so the
         app opens on a live timer rather than a stopped screen.

         Skipped entirely when a timer is ALREADY running — one running timer
         per user is enforced by a partial unique index, so a second insert
         is a constraint violation, and seeding must never be the thing that
         breaks an invariant the whole app rests on. */
      const running =
        !someoneIsRunning && back === lastWorkedBack && b === blocks - 1;
      const projectId =
        (back + b) % 5 === 0
          ? internalId
          : projectIds[(back + b) % projectIds.length];

      await db.query(
        `insert into time_entries
           (id, user_id, project_id, task_name, started_at, ended_at, is_billable)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [
          userId,
          projectId,
          TASKS[(back + b) % TASKS.length],
          start.toISOString(),
          running ? null : end.toISOString(),
          projectId !== internalId,
        ],
      );
      entries += 1;
      if (running) break;
    }
  }

  await db.query('commit');
  console.log(`Seeded ${email}:`);
  console.log(
    `  ${CLIENTS.length} clients, ${projectIds.length + 1} projects, ${entries} entries`,
  );
  console.log('  the most recent entry is left running, so the timer is live');
} catch (error) {
  await db.query('rollback').catch(() => {});
  throw error;
} finally {
  await db.end().catch(() => {});
}
