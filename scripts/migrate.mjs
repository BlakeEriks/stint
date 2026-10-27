#!/usr/bin/env node
/**
 * Apply supabase/migrations to a Postgres database.
 *
 *   pnpm migrate                 # uses SUPABASE_DB_URL from the environment
 *   pnpm migrate --dry-run       # show what would run, change nothing
 *   pnpm migrate --rehearse      # run what is pending, then roll it back
 *   pnpm migrate --url <url>     # explicit connection string
 *
 * Applied migrations are recorded in `schema_migrations`, so re-running is a
 * no-op rather than an error. That table is the reason this is worth having
 * over pasting SQL into a dashboard: the dashboard cannot tell you what is
 * already applied, so a partial failure leaves you guessing.
 *
 * Each file runs inside a transaction. A migration that fails rolls back
 * whole, so the database never sits half-migrated.
 *
 * A rehearsal is how release.yml learns whether production's data accepts a
 * migration before asking for approval. Every pending file runs in
 * one transaction, as a later one may need an earlier, and it always rolls
 * back. Its output reaches a public Actions log, and Postgres puts a failing
 * row in an error's detail, so a failure prints only what names no data.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { connectionString, short, sslFor } from './db-url.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rehearse = args.includes('--rehearse');

const url = connectionString();
if (!url) {
  console.error(`No database URL. Pass one:

  pnpm migrate --url <connection string>

Production is migrated by release.yml on merge, never from here.`);
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
if (files.length === 0) {
  console.error(`No .sql files in ${dir}`);
  process.exit(1);
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

  const { rows } = await client.query('select version from schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !done.has(f));

  console.log(`${short(url)}`);
  for (const f of files) {
    if (done.has(f)) console.log(`  · ${f} (already applied)`);
  }
  if (pending.length === 0) {
    console.log('\nNothing to do — the database is up to date.');
    process.exit(0);
  }

  if (rehearse) process.exit(await rehearsal(pending));

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

/** Runs `pending` and rolls back, answering the exit code. */
async function rehearsal(pending) {
  await client.query('begin');
  // Gives up rather than queue live requests behind a lock it waits on.
  await client.query("set local lock_timeout = '2s'");
  await client.query("set local statement_timeout = '60s'");
  try {
    for (const f of pending) {
      try {
        await client.query(readFileSync(join(dir, f), 'utf8'));
        console.log(`  ✓ ${f}`);
      } catch (err) {
        if (!err.code) throw err;
        console.error(`  ✗ ${f}\n    ${named(err)}`);
        console.error('\nRolled back. The database is unchanged.');
        return 1;
      }
    }
    console.log(
      `\n${pending.length} migration(s) would apply. Rolled back, nothing changed.`,
    );
    return 0;
  } finally {
    await client.query('rollback');
  }
}

/** A Postgres error by its code and the objects it names: never its message
 *  or detail, which can quote a row. */
function named(err) {
  const where = ['constraint', 'table', 'column']
    .filter((k) => err[k])
    .map((k) => `${k} ${err[k]}`);
  const busy = err.code === '55P03' ? ': production was busy, re-run' : '';
  return [`Postgres error ${err.code}${busy}`, ...where].join(', ');
}
