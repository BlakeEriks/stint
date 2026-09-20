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

  // ── anon cannot execute the app's functions ──────────────────────
  // A function with no explicit grant runs on Postgres's default, which is
  // execute for PUBLIC — so a new rollup that forgets its revoke/grant tail
  // is reachable without a session. Found by OWNER rather than by name, so
  // that a function added later is covered without editing this list.
  //
  // Extension functions are excluded by asking whether they BELONG to an
  // extension (`pg_depend.deptype = 'e'`), not by owner. Verified against a
  // bare `postgres:16` built by `ci-db.sh`, not only the local stack: an
  // owner test passes locally and flags 36 pgcrypto functions there. pgcrypto installs
  // into public, and who ends up owning it differs by environment: on the
  // Supabase image it is `supabase_admin`, but CI runs a bare postgres
  // container where `create extension` runs as the migration role and no
  // such role exists — so an owner test excludes nothing there and every
  // pgcrypto function reports as a failure.
  //
  // Trigger AND event-trigger functions are exempt: privilege is not
  // consulted when either fires, and neither can be called directly — the
  // call fails on the return type whoever the caller is. Production carries
  // an `rls_auto_enable` event trigger that no migration created and that
  // this check flagged on its first run against a database it had not seen.
  //
  // `to_regrole` guards the privilege call: `has_function_privilege` RAISES
  // on a role that does not exist, and this script takes a `--url` to
  // arbitrary databases. Crashing mid-run would skip the check below it and
  // report a Postgres stack trace instead of one of this script's own lines.
  const { rows: fns } = await client.query(
    `select p.proname, pg_get_function_identity_arguments(p.oid) args,
            p.prokind, p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and not exists (
         select 1 from pg_depend d
         where d.objid = p.oid
           and d.classid = 'pg_proc'::regclass
           and d.deptype = 'e'
       )
       and to_regrole('anon') is not null
       and has_function_privilege('anon', p.oid, 'execute')
     order by 1`,
  );
  if (fns.length > 0) {
    for (const f of fns) {
      // Name what was found, not a diagnosis. This check runs against
      // production in the release gate, where it meets objects no migration
      // created and no test environment has — the first one it met was an
      // event trigger set up in the dashboard, and calling that "missing its
      // revoke/grant tail" sent a real release chasing a fix that did not
      // exist. A caller is only genuinely exposed if it can CALL the thing.
      fail(
        `anon holds execute on ${f.proname}(${f.args}).\n` +
          '      If this is ours, give it the revoke/grant tail every\n' +
          '      function in 00000000000010 onward carries. If it is not —\n' +
          '      check `docs/setup.md` for a dashboard setting that created\n' +
          '      it, and whether it is callable at all.',
      );
    }
  } else {
    console.log('  ✓ anon cannot execute any application function');
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
