#!/usr/bin/env node
/**
 * One-off: tell `schema_migrations` that a migration file was renamed.
 *
 *   node scripts/record-rename.mjs <old-filename> <new-filename> [--url ...]
 *
 * `migrate.mjs` keys applied versions on the filename, so renaming a file
 * that has already shipped makes it look unapplied and the runner tries to
 * apply it again. For an `init` migration that means `create table` against
 * tables that already exist: the release gate fails and the deploy stops.
 *
 * This is bookkeeping only — it changes no schema. It is deliberately NOT a
 * migration: `migrate.mjs` reads `schema_migrations` once, before applying
 * anything, so a fix-up file cannot run early enough to help itself.
 *
 * Renaming a shipped migration is normally the wrong move (see the
 * forward-only rules in CLAUDE.md). It was forced here: the Supabase CLI
 * reserves the name `init` and silently skips any migration using it, so the
 * local stack came up with no tables at all.
 */
import pg from 'pg';
import { connectionString, sslFor } from './db-url.mjs';

const args = process.argv.slice(2);
const [oldName, newName] = args.filter((a) => !a.startsWith('--'));

if (!oldName || !newName) {
  console.error('Usage: record-rename.mjs <old.sql> <new.sql> [--url <conn>]');
  process.exit(1);
}

const url = connectionString();

if (!url) {
  console.error('No SUPABASE_DB_URL.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: sslFor(url),
});
await client.connect();

try {
  const { rows: before } = await client.query(
    'select version from schema_migrations where version = any($1)',
    [[oldName, newName]],
  );
  const has = (n) => before.some((r) => r.version === n);

  if (has(newName)) {
    console.log(`${newName} is already recorded. Nothing to do.`);
  } else if (!has(oldName)) {
    console.log(`${oldName} is not recorded either — nothing to rename.`);
    console.log('A database that never saw the old name needs no correction.');
  } else {
    const r = await client.query(
      'update schema_migrations set version = $1 where version = $2',
      [newName, oldName],
    );
    console.log(`Recorded ${oldName} -> ${newName} (${r.rowCount} row).`);
  }

  const { rows } = await client.query(
    'select version from schema_migrations order by version',
  );
  console.log('\nschema_migrations now:');
  for (const r of rows) console.log(`  ${r.version}`);
} finally {
  await client.end();
}
