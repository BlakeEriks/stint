#!/usr/bin/env node
/**
 * Assert the live database is shaped the way the app assumes.
 *
 *   pnpm verify:schema
 *
 * The check that matters is RLS. The anon key is public — it ships in the
 * browser bundle — so RLS is the only thing standing between one user's rows
 * and everyone else's. A table that reaches production without it exposes
 * client bank details, and nothing else in the stack would notice.
 */
import pg from 'pg';
import { connectionString, sslFor } from './db-url.mjs';

const EXPECTED = [
  'clients',
  'invoice_line_items',
  'invoices',
  'payment_profiles',
  'projects',
  'time_entries',
  'user_settings',
];

const url = connectionString();
if (!url) {
  console.error('No SUPABASE_DB_URL. See `pnpm migrate` for where to get one.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
await client.connect();

let failed = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed += 1;
};

try {
  // ── tables exist, with RLS on ────────────────────────────────────
  const { rows: tables } = await client.query(
    `select tablename, rowsecurity from pg_tables
     where schemaname = 'public' order by tablename`,
  );
  const byName = new Map(tables.map((t) => [t.tablename, t.rowsecurity]));

  console.log('\n  tables and row level security\n');
  for (const name of EXPECTED) {
    if (!byName.has(name)) {
      fail(`${name} — MISSING. Run \`pnpm migrate\`.`);
    } else if (byName.get(name) !== true) {
      fail(
        `${name} — RLS IS OFF. Every user can read every other user's rows.`,
      );
    } else {
      console.log(`  ✓ ${name}`);
    }
  }

  // A table nobody expected is worth knowing about, since "expose new
  // tables" may have published it to the API.
  const extra = tables
    .map((t) => t.tablename)
    .filter((n) => !EXPECTED.includes(n) && n !== 'schema_migrations');
  if (extra.length > 0) {
    console.log(`\n  note: unexpected public tables — ${extra.join(', ')}`);
  }

  // ── policies actually exist ──────────────────────────────────────
  // RLS with no policies denies everything, which fails closed but means a
  // working app is impossible. Both directions are bugs.
  const { rows: policies } = await client.query(
    `select tablename, count(*)::int as n from pg_policies
     where schemaname = 'public' group by tablename`,
  );
  const policyCount = new Map(policies.map((p) => [p.tablename, p.n]));

  console.log('\n  policies\n');
  for (const name of EXPECTED) {
    const n = policyCount.get(name) ?? 0;
    if (n === 0)
      fail(
        `${name} — RLS is on but NO policies exist; every query returns nothing.`,
      );
    else console.log(`  ✓ ${name} (${n})`);
  }

  // ── the timer invariant ──────────────────────────────────────────
  const { rows: idx } = await client.query(
    `select indexdef from pg_indexes
     where schemaname = 'public' and indexname = 'one_running_timer_per_user'`,
  );
  console.log('\n  invariants\n');
  if (idx.length === 0) {
    fail(
      'one_running_timer_per_user index is missing — overlapping timers become possible.',
    );
  } else if (!/where \(ended_at IS NULL\)/i.test(idx[0].indexdef)) {
    fail(
      `one_running_timer_per_user exists but is not partial:\n      ${idx[0].indexdef}`,
    );
  } else {
    console.log('  ✓ one running timer per user (partial unique index)');
  }

  // ── an entry cannot borrow another user's project ────────────────
  // RLS scopes reads; it does not constrain what a row points at. If this
  // constraint is dropped, cross-tenant writes start succeeding again and
  // nothing else in the schema notices.
  const { rows: fk } = await client.query(
    `select pg_get_constraintdef(oid) def from pg_constraint
     where conrelid = 'time_entries'::regclass
       and conname  = 'entry_project_same_owner'`,
  );
  if (fk.length === 0) {
    fail(
      'entry_project_same_owner is missing — an entry may reference another user\u2019s project.',
    );
  } else if (!/SET NULL \(project_id\)/i.test(fk[0].def)) {
    fail(
      `entry_project_same_owner must clear only project_id on delete:\n      ${fk[0].def}`,
    );
  } else {
    console.log('  ✓ an entry\u2019s project belongs to the same user');
  }

  // ── settings are created on signup ───────────────────────────────
  const { rows: trg } = await client.query(
    `select tgname from pg_trigger
     where tgrelid = 'auth.users'::regclass and not tgisinternal`,
  );
  if (!trg.some((t) => t.tgname === 't_new_user_settings')) {
    fail(
      't_new_user_settings is missing — a new user would have no settings row.',
    );
  } else {
    console.log('  ✓ new users get default settings');
  }
} finally {
  await client.end();
}

if (failed > 0) {
  console.error(
    `\n  ${failed} problem(s). Do not use this database until they are fixed.\n`,
  );
  process.exit(1);
}
console.log('\n  schema is sound\n');
