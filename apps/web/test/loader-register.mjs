import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/* These suites delete every row in every table, so they refuse any database
   but a local one — the same rule `seed-account.mjs` keeps. */
for (const name of ['DATABASE_URL', 'RLS_DATABASE_URL']) {
  const url = process.env[name];
  if (!url) continue;
  const { hostname } = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    console.error(
      `Refusing to test against ${hostname}: ${name} must be localhost.`,
    );
    process.exit(1);
  }
}

register('./loader.mjs', pathToFileURL(import.meta.filename));
