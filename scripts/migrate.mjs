#!/usr/bin/env node
/**
 * Apply supabase/migrations to a Postgres database.
 *
 *   pnpm migrate                 # uses SUPABASE_DB_URL from the environment
 *   pnpm migrate --dry-run       # show what would run, change nothing
 *   pnpm migrate --url <url>     # explicit connection string
 *   pnpm dev:migrate             # this, pointed at the local stack, with
 *                                # --adopt-cli-history
 *
 * Applied migrations are recorded in `schema_migrations`, so re-running is a
 * no-op rather than an error. That table is the reason this is worth having
 * over pasting SQL into a dashboard: the dashboard cannot tell you what is
 * already applied, so a partial failure leaves you guessing.
 *
 * This table, not the CLI's `supabase_migrations.schema_migrations`, is what
 * CI and production check applied migrations against — so it is what `pnpm
 * dev:migrate` uses to catch a local database up too. `supabase db reset`
 * rebuilds from every migration plus `seed.sql` and takes local data with it;
 * this instead applies only what is new, the same way a merge migrates
 * production.
 *
 * Each file runs inside a transaction. A migration that fails rolls back
 * whole, so the database never sits half-migrated.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { connectionString, isLocal, short, sslFor } from './db-url.mjs';
import { cliAdoptedFiles } from './migrate-cli-history.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const adoptCli = args.includes('--adopt-cli-history');

const url = connectionString();
if (!url) {
  console.error(`No database URL. Pass one:

  pnpm migrate --url <connection string>

Production is migrated by release.yml on merge, never from here.`);
  process.exit(1);
}

if (adoptCli && !isLocal(url)) {
  console.error(
    `Refusing --adopt-cli-history against ${short(url)} — it marks migrations` +
      ' as applied without running them, which only the local stack should' +
      ' ever ask for. A hosted database (stint-test included) may still have' +
      " the CLI's tracking table left over from something else, and adopting" +
      ' it there would mark real migrations applied against an empty schema.',
  );
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
if (files.length === 0) {
  console.error(`No .sql files in ${dir}`);
  process.exit(1);
}

/**
 * The local stack tracks what `supabase db reset` has applied in its own
 * `supabase_migrations.schema_migrations`, keyed by the numeric prefix rather
 * than the filename. Passing `--adopt-cli-history` (only `dev:migrate` does)
 * adopts that history instead of trying to reapply migrations Postgres
 * already has — that collision ("relation already exists") is the drift
 * issue #9 describes.
 *
 * Opt-in and local-only on purpose: a hosted database can carry a leftover
 * `supabase_migrations` schema from something else — `preview-reset.mjs`
 * empties `stint-test`'s `public` schema but never touches that one — so
 * turning this on unconditionally would let an emptied hosted database get
 * marked fully migrated without a single file having run against it.
 *
 * Returns the set of adopted filenames without writing anything when
 * `dryRun` is set, so `--dry-run`'s "change nothing" promise holds even
 * through this step.
 */
async function adoptCliHistory(client, dryRun) {
  const { rows: existing } = await client.query(
    'select 1 from schema_migrations limit 1',
  );
  if (existing.length > 0) return new Set();

  const { rows: hasCli } = await client.query(`
    select 1 from information_schema.schemata
    where schema_name = 'supabase_migrations'
  `);
  if (hasCli.length === 0) return new Set();

  const { rows: cli } = await client.query(
    'select version from supabase_migrations.schema_migrations',
  );
  const adopted = cliAdoptedFiles(
    files,
    cli.map((r) => r.version),
  );
  if (adopted.length === 0) return new Set();

  if (dryRun) {
    console.log(
      `Would adopt ${adopted.length} migration(s) already applied by the Supabase CLI.`,
    );
    return new Set(adopted);
  }

  for (const f of adopted) {
    await client.query(
      'insert into schema_migrations (version) values ($1) on conflict do nothing',
      [f],
    );
  }
  console.log(
    `Adopted ${adopted.length} migration(s) already applied by the Supabase CLI.`,
  );
  return new Set(adopted);
}

const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });

try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect to ${short(url)}\n  ${err.message}`);
  process.exit(1);
}

try {
  await client.query(`
    create table if not exists schema_migrations (
      version     text primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const adopted = adoptCli ? await adoptCliHistory(client, dryRun) : new Set();

  const { rows } = await client.query('select version from schema_migrations');
  const done = new Set([...rows.map((r) => r.version), ...adopted]);
  const pending = files.filter((f) => !done.has(f));

  console.log(`${short(url)}`);
  for (const f of files) {
    if (done.has(f)) console.log(`  · ${f} (already applied)`);
  }
  if (pending.length === 0) {
    console.log('\nNothing to do — the database is up to date.');
    process.exit(0);
  }

  for (const f of pending) {
    if (dryRun) {
      console.log(`  → ${f} (would apply)`);
      continue;
    }
    const sql = readFileSync(join(dir, f), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into schema_migrations (version) values ($1)',
        [f],
      );
      await client.query('commit');
      console.log(`  ✓ ${f}`);
    } catch (err) {
      await client.query('rollback');
      console.error(`  ✗ ${f}\n    ${err.message}`);
      console.error('\nRolled back. The database is unchanged by this file.');
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log(
      `\n${pending.length} migration(s) would run. Nothing was changed.`,
    );
  } else {
    console.log(`\nApplied ${pending.length} migration(s).`);
  }
} finally {
  await client.end();
}
