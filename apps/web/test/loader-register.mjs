import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/* These suites delete every row they reach, so they refuse any target but
   the local stack — the rule `seed-account.mjs` keeps. `?host=` overrides a
   URL's host in pg, and PGHOST is where pg goes when no URL is set. */
const LOCAL = ['localhost', '127.0.0.1'];
const refuse = (what) => {
  console.error(`Refusing to test against ${what}: only localhost is allowed.`);
  process.exit(1);
};
for (const name of ['DATABASE_URL', 'RLS_DATABASE_URL', 'SUPABASE_URL']) {
  const url = process.env[name];
  if (!url) continue;
  const { hostname, searchParams } = new URL(url);
  if (
    !LOCAL.includes(hostname) ||
    searchParams.has('host') ||
    searchParams.has('hostaddr')
  ) {
    refuse(name);
  }
}
for (const name of ['PGHOST', 'PGHOSTADDR']) {
  if (process.env[name] && !LOCAL.includes(process.env[name])) refuse(name);
}

register('./loader.mjs', pathToFileURL(import.meta.filename));
