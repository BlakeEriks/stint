/**
 * Match migration filenames against the Supabase CLI's own tracking table.
 *
 * `supabase_migrations.schema_migrations` keys on the numeric prefix
 * (`00000000000001`), not the filename (`00000000000001_schema.sql`) that
 * `migrate.mjs`'s own `schema_migrations` keys on. Split out so `migrate.mjs`
 * stays a script and this stays testable without a database.
 */
export function cliAdoptedFiles(files, cliVersions) {
  const applied = new Set(cliVersions);
  return files.filter((f) => applied.has(f.split('_')[0]));
}
