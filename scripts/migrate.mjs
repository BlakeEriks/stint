#!/usr/bin/env node
/**
 * Apply supabase/migrations to a Postgres database.
 *
 *   pnpm migrate                 # uses SUPABASE_DB_URL from apps/web/.env.local
 *   pnpm migrate --dry-run       # show what would run, change nothing
 *   pnpm migrate --url <url>     # explicit connection string
 *
 * Applied migrations are recorded in `schema_migrations`, so re-running is a
 * no-op rather than an error. That table is the reason this is worth having
 * over pasting SQL into a dashboard: the dashboard cannot tell you what is
 * already applied, so a partial failure leaves you guessing.
 *
 * Each file runs inside a transaction. A migration that fails rolls back
 * whole, so the database never sits half-migrated.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const urlFlag = args.indexOf('--url');

function connectionString() {
  if (urlFlag !== -1 && args[urlFlag + 1]) return args[urlFlag + 1];
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;

  // Convenience: read it out of the web app's env file.
  const envPath = join(root, 'apps', 'web', '.env.local');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('SUPABASE_DB_URL='));
    if (line) return line.slice('SUPABASE_DB_URL='.length).trim();
  }
  return null;
}

const url = connectionString();
if (!url) {
  console.error(`No database URL.

Add it to apps/web/.env.local:

  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

Supabase dashboard -> Project Settings -> Database -> Connection string ->
choose "Session pooler" (IPv4-friendly) and swap in your database password.

This is a SECRET: it is full database access, bypassing RLS entirely. It is
only ever used by this script, never by the app, and .env.local is gitignored.`);
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
if (files.length === 0) {
  console.error(`No .sql files in ${dir}`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates TLS with its own CA; the connection is still
  // encrypted, we just do not pin the chain.
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
});

const short = (u) => u.replace(/:[^:@/]+@/, ':***@');

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
