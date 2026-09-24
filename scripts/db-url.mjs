/**
 * Where `pnpm migrate` and `pnpm verify:schema` get their connection.
 *
 * `--url` beats the environment. Nothing on disk holds the production string,
 * so nothing run on this machine reaches production without it being passed.
 */
export function connectionString(argv = process.argv) {
  const i = argv.indexOf('--url');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.env.SUPABASE_DB_URL ?? null;
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
