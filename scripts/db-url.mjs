/**
 * Where `pnpm migrate` and `pnpm verify:schema` get their connection.
 *
 * `--url` beats the environment beats `apps/web/.env.local` — the flag is how
 * CI and a throwaway Postgres point the same scripts somewhere else.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function connectionString(argv = process.argv) {
  const i = argv.indexOf('--url');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;

  const envPath = join(root, 'apps', 'web', '.env.local');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('SUPABASE_DB_URL='));
    if (line) return line.slice('SUPABASE_DB_URL='.length).trim();
  }
  return null;
}

/**
 * Supabase terminates TLS with its own CA; the connection is still
 * encrypted, we just do not pin the chain.
 */
export function sslFor(url) {
  return url.includes('localhost') ? false : { rejectUnauthorized: false };
}

/** A URL safe to print: the password is what must never reach a log. */
export function short(url) {
  return url.replace(/:[^:@/]+@/, ':***@');
}
