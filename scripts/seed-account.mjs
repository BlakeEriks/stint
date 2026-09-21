#!/usr/bin/env node
/**
 * Give an account something to look at — including one of every inbox row.
 *
 * `supabase/seed.sql` belongs to `dev@localhost.test` — the test account, which
 * the e2e suite restores and which you should not be tracking real time in.
 * This puts a comparable shape of data under YOUR account instead, so a
 * second local user is useful from the first launch rather than an empty
 * timer screen.
 *
 *   pnpm seed you@example.com
 *   pnpm seed you@example.com --clear     # remove it again
 *
 * **The account is created if it does not exist**, so this works before you
 * have ever signed in. Sign in afterwards with a magic link and pick it up
 * from Mailpit on `:54324` — mail is captured locally, never sent.
 *
 * **Every inbox scenario is represented**, because the inbox is the hardest
 * surface to exercise by hand: each row needs a condition that takes days to
 * arrive naturally. See `SCENARIOS` below for the four and what each requires.
 *
 * Idempotent by client name: re-running replaces what it made last time
 * rather than stacking a second copy. It touches nothing it did not create,
 * so entries and invoices you made yourself are safe.
 *
 * Dates are relative to today, not fixed like `seed.sql`'s — a screen with
 * "last worked on: three months ago" teaches you nothing about how the app
 * looks in use, and a fixed date drifts further into the past every day the
 * file is not touched.
 */
import pg from 'pg';

const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/* Local stack only — this script reaches a database on 127.0.0.1 by default
   and has no business anywhere else. Matches `seed.sql`'s dev account. */
const LOCAL_PASSWORD = 'devpassword123';

/** Whether this run had to create the account, for the closing report. */
let created = false;

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/seed-account.mjs <email> [--clear]');
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

/**
 * One of every inbox row, and what each needs to appear.
 *
 * These are the numbers the server checks (`api/v1/stats/route.ts` and
 * `/summary`), not guesses — a row that needs 7 days gets 12, so the seed is
 * not sitting on the boundary where a timezone rounds it the wrong way.
 *
 * | Row                 | Condition                                    |
 * |---------------------|----------------------------------------------|
 * | Runaway timer       | a running entry past `max_timer_hours` (8)   |
 * | Overdue invoice     | `sent`, `due_date` more than 7 days past     |
 * | Stale draft         | `draft`, issued more than 7 days ago         |
 * | Unprojected entries | ended, billable, unbilled, no project        |
 *
 * The inbox is the one surface that is genuinely hard to exercise by hand:
 * every row needs a condition that takes days of real time to arrive.
 */
const OVERDUE_DAYS = 19; // 12 past a 7-day grace
const STALE_DRAFT_DAYS = 12; // 5 past the 7-day threshold
const RUNAWAY_HOURS = 11; // 3 past the 8-hour default

/**
 * Invoices the seed writes, so the inbox has something to be about.
 *
 * **Hours, never a total.** The total is `seconds × the resolved rate`, in
 * that direction: a seeded total with the rate back-derived from it produces
 * a line item whose `unit_price` is a number `resolve_rate()` would never
 * return for the client it is billed to, and rate resolution is the one thing
 * this data exists to let you see working.
 */
const INVOICES = [
  {
    status: 'sent',
    /* Overdue: the row that carries `danger` and sorts first among invoices.
       Issued a month ago on 30-day terms, so it is genuinely late rather
       than merely unpaid. */
    issuedDaysAgo: OVERDUE_DAYS + 30,
    dueDaysAgo: OVERDUE_DAYS,
    hours: 15.6,
    description: 'Warehouse dashboard — October',
  },
  {
    status: 'sent',
    /* Sent and NOT yet due, so `awaitingPayment` has something the overdue
       row does not — the two are different money and must never be summed. */
    issuedDaysAgo: 6,
    dueDaysAgo: -24,
    hours: 7.5,
    description: 'Peak season fixes — November',
  },
  {
    /* Stale draft: generated and then forgotten, which is the case the row
       exists to catch. A draft holds no number with a client yet. */
    status: 'draft',
    issuedDaysAgo: STALE_DRAFT_DAYS,
    dueDaysAgo: STALE_DRAFT_DAYS - 30,
    hours: 5.2,
    description: 'Data pipeline audit — partial',
  },
  {
    /* Paid, so the invoice list has all three states and the home cards are
       not reporting every invoice as outstanding. */
    status: 'paid',
    issuedDaysAgo: 45,
    dueDaysAgo: 15,
    hours: 21.3,
    description: 'Warehouse dashboard — September',
  },
];

/**
 * The account, created if this is the first time you have asked for it.
 *
 * Inserted directly rather than through the signup endpoint, exactly as
 * `supabase/seed.sql` does it: signup sends a confirmation email and the
 * point of this script is that you have not signed in yet.
 * `create_default_settings` fires on the insert, so `user_settings` appears
 * the same way it would for a real signup.
 *
 * **The four token columns must be empty strings, never NULL.** GoTrue scans
 * them into non-nullable Go strings, so a NULL fails every later lookup with
 * "Database error finding user" and a 500 — which looks like a broken magic
 * link, not like a bad row. Only hand-written inserts hit this; the
 * dashboard's own do the same thing.
 *
 * `email_confirmed_at` is set because nothing here can click a confirmation
 * link. The password is set too, so the account is reachable either way, but
 * the app signs in by magic link — the link lands in Mailpit on :54324.
 */
async function findUser(address) {
  const { rows } = await db.query(
    'select id from auth.users where email = $1',
    [address],
  );
  return rows[0]?.id ?? null;
}

async function findOrCreateUser(address) {
  const existing = await findUser(address);
  if (existing != null) return existing;

  const {
    rows: [{ id }],
  } = await db.query(
    `insert into auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at,
       raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change_token_new, email_change
     )
     values (
       gen_random_uuid(),
       '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated',
       $1, crypt($2, gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', ''
     )
     returning id`,
    [address, LOCAL_PASSWORD],
  );
  created = true;
  return id;
}

/**
 * Local stack only, checked before anything connects.
 *
 * This script inserts a confirmed `auth.users` row with a fixed, published
 * password. Against a hosted database that is an account anyone who has read
 * this file can sign in as, so the override is refused rather than trusted:
 * the only addresses it accepts are the local Postgres the dev stack runs.
 */
const connectionString = process.env.SEED_DATABASE_URL ?? DEFAULT_URL;
{
  const { hostname, port } = new URL(connectionString);
  if (!['localhost', '127.0.0.1'].includes(hostname) || port !== '54322') {
    console.error(
      `Refusing to seed ${hostname}:${port || '(default)'} — this script writes a known password and runs only against localhost:54322.`,
    );
    process.exit(1);
  }
}

const db = new pg.Client({ connectionString });
await db.connect();

try {
  await db.query('begin');

  /* `--clear` never creates: asking to remove data from an account that does
     not exist is a typo, and answering it by creating the account is the
     opposite of what was asked. */
  const userId = clearOnly
    ? await findUser(email)
    : await findOrCreateUser(email);
  if (userId == null) {
    console.error(`No account for ${email} — nothing to clear.`);
    await db.query('rollback');
    process.exit(1);
  }

  /* Remove a previous run before writing a new one. Scoped to the client
     names above and to the internal project, so anything you logged yourself
     survives — this must never be the thing that eats your own work. */
  const names = CLIENTS.map((c) => c.name);

  /* Invoices first: a time entry cannot be deleted while it is billed to a
     non-draft invoice — `guard_billed_entry_delete` raises — and detaching
     is the only way past that, which is exactly what voiding does in the
     app. Deleting the invoice releases its entries by the same FK rule
     (`on delete set null`), so the entry delete below then succeeds.

     Scoped to this seed's own clients, so an invoice you generated yourself
     is never touched. */
  await db.query(
    `delete from invoices
      where user_id = $1
        and client_id in (select id from clients where user_id = $1 and name = any($2))`,
    [userId, names],
  );

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

  /* A default rate, so a client with none has something to inherit. */
  await db.query(
    `update user_settings
        set default_hourly_rate = coalesce(default_hourly_rate, 125)
      where user_id = $1`,
    [userId],
  );

  const projectIds = [];
  const clientIds = [];
  for (const client of CLIENTS) {
    const {
      rows: [{ id: clientId }],
    } = await db.query(
      `insert into clients (user_id, name, email, hourly_rate, currency, color)
       values ($1, $2, $3, $4, 'USD', $5) returning id`,
      [userId, client.name, client.email, client.rate, client.color],
    );
    clientIds.push(clientId);
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

    /* One or two blocks a day, starting at 09:00 local. The most recent
       worked day takes one more: its last block is left running and has
       earned nothing yet, so without the extra the day reads $0.00 on a
       screen whose subject is what you earned. */
    const blocks = (back % 3 === 0 ? 2 : 1) + (back === lastWorkedBack ? 1 : 0);
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

  /* ── the inbox ──────────────────────────────────────────────────────
     Everything above gives the app shape. This gives the INBOX one of each
     row, which is the part that cannot be produced by using the app for ten
     minutes: every condition needs days of real elapsed time. */

  /* Unprojected entries: billable, ended, unbilled, and with no project, so
     no rate resolves beyond the user default. Two of them, on different
     days, because one is a special case that hides an off-by-one in the
     count and they must not all fall on today. */
  const unprojected = [
    { daysAgo: 3, hours: 0.75, task: 'Seeded: call with a prospective client' },
    { daysAgo: 9, hours: 1.5, task: 'Seeded: scoping notes, unfiled' },
  ];
  for (const u of unprojected) {
    const start = new Date();
    start.setDate(start.getDate() - u.daysAgo);
    start.setHours(14, 0, 0, 0);
    await db.query(
      `insert into time_entries
         (id, user_id, project_id, task_name, started_at, ended_at, is_billable)
       values (gen_random_uuid(), $1, null, $2, $3, $4, true)`,
      [
        userId,
        u.task,
        start.toISOString(),
        new Date(start.getTime() + u.hours * 3_600_000).toISOString(),
      ],
    );
    entries += 1;
  }

  /* The runaway timer, which replaces the ordinary running entry above when
     nothing else is running. Started far enough back to be past
     `max_timer_hours`, so the inbox offers keep / adjust / discard.

     `update`, not `insert`: one running timer per user is a partial unique
     index, so the entry the loop already left running is backdated rather
     than joined by a second one. */
  let runaway = false;
  if (!someoneIsRunning) {
    const startedAt = new Date(Date.now() - RUNAWAY_HOURS * 3_600_000);
    const { rowCount } = await db.query(
      `update time_entries set started_at = $2
        where user_id = $1 and ended_at is null`,
      [userId, startedAt.toISOString()],
    );
    runaway = rowCount > 0;
  }

  /* Invoices: overdue, awaiting payment, stale draft, and paid. Each carries
     one line item, because an invoice with no lines renders a total of zero
     and reads as broken rather than as seeded. */
  const firstClientId = clientIds[0];
  let invoiceNo = 0;
  const { rows: settingsRows } = await db.query(
    'select next_invoice_number, invoice_number_prefix from user_settings where user_id = $1',
    [userId],
  );
  const prefix = settingsRows[0]?.invoice_number_prefix ?? 'INV-';
  const nextNumber = settingsRows[0]?.next_invoice_number ?? 1;

  /* The rate these lines bill at, resolved off the chain the app bills on —
     read back from the rows just inserted rather than assumed, so a change to
     `CLIENTS` or to the default above cannot leave the seeded rate behind.
     Mirrors `resolveRate()` in `@stint/core` and `resolve_rate()` in SQL: no
     project on these lines, so it is the client's rate, else the user's
     default. `0` is a valid rate throughout, hence `??` and never `||`. */
  const { rows: rateRows } = await db.query(
    `select c.hourly_rate as client_rate, s.default_hourly_rate as user_rate
       from clients c
       join user_settings s on s.user_id = c.user_id
      where c.id = $1`,
    [firstClientId],
  );
  const resolvedRate =
    rateRows[0]?.client_rate ?? rateRows[0]?.user_rate ?? null;
  if (resolvedRate == null) {
    throw new Error(
      'No rate resolves for the seeded client — an invoice line needs one.',
    );
  }
  /** Cents, once, at the end — as `lineAmount()` does. */
  const lineAmount = (seconds) =>
    Math.round((seconds / 3600) * Number(resolvedRate) * 100) / 100;

  for (const inv of INVOICES) {
    /* Seconds first, then money: the line's amount is what those seconds are
       worth at the resolved rate, which is the direction the app computes in
       and the only one that leaves `unit_price` truthful. */
    const seconds = Math.round(inv.hours * 3600);
    const total = lineAmount(seconds);
    const issued = new Date();
    issued.setDate(issued.getDate() - inv.issuedDaysAgo);
    const due = new Date();
    due.setDate(due.getDate() - inv.dueDaysAgo);

    /* The month of work the invoice bills, ending the day it was issued —
       which is what "generate for this period" produces in the app. */
    const periodEnd = new Date(issued);
    const periodStart = new Date(issued);
    periodStart.setDate(periodStart.getDate() - 30);

    const seq = nextNumber + invoiceNo;
    const {
      rows: [{ id: invoiceId }],
    } = await db.query(
      /* `period_start`/`period_end` are NOT optional in practice. The column
         is nullable and `POST /invoices` always sets them, so a real invoice
         never has them null — but this script wrote them null and the detail
         page threw on `shortDate(null)`. A seed that produces data the API
         could not have produced is testing the wrong app. */
      `insert into invoices
         (user_id, client_id, invoice_number, sequence_no, status, issue_date,
          due_date, period_start, period_end, subtotal, tax_rate, tax_amount,
          total, currency, grouping_mode, sent_at, paid_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$10,'USD','entry',$11,$12)
       returning id`,
      [
        userId,
        firstClientId,
        `${prefix}${String(seq).padStart(4, '0')}`,
        seq,
        inv.status,
        issued.toISOString().slice(0, 10),
        due.toISOString().slice(0, 10),
        periodStart.toISOString().slice(0, 10),
        periodEnd.toISOString().slice(0, 10),
        total,
        inv.status === 'draft' ? null : issued.toISOString(),
        inv.status === 'paid' ? due.toISOString() : null,
      ],
    );
    await db.query(
      `insert into invoice_line_items
         (invoice_id, description, unit, quantity, unit_price, amount, sort_order)
       values ($1, $2, 'hour', $3, $4, $5, 0)`,
      [
        invoiceId,
        inv.description,
        Math.round((seconds / 3600) * 100) / 100,
        resolvedRate,
        total,
      ],
    );
    invoiceNo += 1;
  }

  /* Numbering is gapless and allocated from here, so a seed that writes
     invoices must move the counter past what it used. Leaving it behind
     makes the next real invoice collide on `invoice_number`. */
  await db.query(
    'update user_settings set next_invoice_number = $2 where user_id = $1',
    [userId, nextNumber + invoiceNo],
  );

  await db.query('commit');
  console.log(`Seeded ${email}${created ? ' (new account)' : ''}:`);
  console.log(
    `  ${CLIENTS.length} clients, ${projectIds.length + 1} projects, ${entries} entries`,
  );
  console.log(`  ${INVOICES.length} invoices (overdue, sent, draft, paid)`);
  console.log('\n  Inbox:');
  console.log(
    `    runaway timer      ${runaway ? 'yes' : 'skipped — one was already running'}`,
  );
  console.log('    overdue invoice    yes');
  console.log('    stale draft        yes');
  console.log(`    unprojected work   yes (${unprojected.length} entries)`);
  if (created) {
    console.log(
      `\n  Sign in at /signin and click the link in Mailpit (:54324).`,
    );
  }
} catch (error) {
  await db.query('rollback').catch(() => {});
  throw error;
} finally {
  await db.end().catch(() => {});
}
