#!/usr/bin/env node
/**
 * Empty `stint-test` so `pnpm migrate` can rebuild it from one branch.
 *
 *   SUPABASE_DB_URL=<stint-test pooler> node scripts/preview-reset.mjs
 *   ... node scripts/preview-reset.mjs --applied   # list, change nothing
 *
 * `--applied` prints the migrations stint-test has applied, one per line —
 * none if it has no `schema_migrations` yet. Any other failure exits non-zero
 * rather than reading as an empty database, which would reset every run.
 *
 * `.github/workflows/preview-db.yml` runs this when a PR's migrations change
 * the schema, then migrates and reseeds every open PR's account. A migration
 * cannot be un-applied, so the only way back to one branch's schema is
 * through empty.
 *
 * Drops what the migrations create in `public` — tables, views, types and
 * functions — and every `pr-<n>@preview.test` user. Extensions' objects and
 * event-trigger functions stay: Supabase's automatic RLS lives in one, and no
 * migration recreates either.
 */
import pg from 'pg';
import { connectionString, isPreviewDb, short, sslFor } from './db-url.mjs';

const url = connectionString();
if (!url || !isPreviewDb(url)) {
  console.error(
    `Refusing to reset ${url ? short(url) : '(no URL)'} — this empties a database, and stint-test is the only one it may.`,
  );
  process.exit(1);
}

const db = new pg.Client({ connectionString: url, ssl: sslFor(url) });
await db.connect();

if (process.argv.includes('--applied')) {
  try {
    const { rows } = await db.query(
      'select version from schema_migrations order by version collate "C"',
    );
    for (const r of rows) console.log(r.version);
  } catch (error) {
    if (error.code !== '42P01') throw error; // undefined_table: never migrated
  } finally {
    await db.end();
  }
  process.exit(0);
}

try {
  await db.query('begin');
  await db.query(`
    do $$
    declare r record;
    begin
      for r in select format('%I', viewname) as name
                 from pg_views where schemaname = 'public' loop
        execute 'drop view if exists public.' || r.name || ' cascade';
      end loop;
      for r in select format('%I', tablename) as name
                 from pg_tables where schemaname = 'public' loop
        execute 'drop table if exists public.' || r.name || ' cascade';
      end loop;
      for r in select p.oid::regprocedure as sig
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.prokind in ('f', 'p')
                  and p.prorettype <> 'event_trigger'::regtype
                  and not exists (select 1 from pg_depend d
                                   where d.objid = p.oid and d.deptype = 'e') loop
        execute 'drop routine if exists ' || r.sig || ' cascade';
      end loop;
      for r in select format('%I', t.typname) as name
                 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                where n.nspname = 'public'
                  and (t.typtype in ('e', 'd')
                       or (t.typtype = 'c' and (select relkind from pg_class
                                                 where oid = t.typrelid) = 'c'))
                  and not exists (select 1 from pg_depend d
                                   where d.objid = t.oid and d.deptype = 'e') loop
        execute 'drop type if exists public.' || r.name || ' cascade';
      end loop;
    end $$;
  `);
  const { rowCount } = await db.query(
    `delete from auth.users where email like 'pr-%@preview.test'`,
  );
  await db.query('commit');
  console.log(
    `Emptied ${short(url)}: public schema, ${rowCount} PR account(s).`,
  );
} catch (error) {
  await db.query('rollback').catch(() => {});
  throw error;
} finally {
  await db.end();
}
