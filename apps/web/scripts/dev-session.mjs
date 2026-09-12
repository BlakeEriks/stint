#!/usr/bin/env node
/**
 * Sign in a throwaway user without an email round-trip.
 *
 *   node scripts/dev-session.mjs            # create + print credentials
 *   node scripts/dev-session.mjs --delete   # remove the user and its data
 *
 * Why this exists: the magic-link flow cannot be completed from inside a
 * headless or embedded browser — the link opens in the user's mail client, on
 * their machine. Without this, nobody can look at the signed-in app except by
 * hand, so UI changes to the nav, the timer hero, or any authenticated screen
 * go unreviewed.
 *
 * It uses the PUBLIC signup endpoint plus a direct Postgres confirm, so it
 * needs no service-role key. `SUPABASE_DB_URL` is already required by
 * `pnpm migrate`, and the confirm is exactly the state change that clicking
 * the emailed link would have produced.
 *
 * THIS TOUCHES THE REAL AUTH TABLE. The address is deliberately unroutable so
 * it cannot collide with a person, and `--delete` removes it. Do not point it
 * at an address anyone actually uses.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// example.com is RFC 2606 reserved and unroutable. Supabase rejects the
// .invalid TLD outright, so that is not an option here.
const EMAIL = 'dev-preview@example.com';
const PASSWORD = 'dev-preview-not-a-real-account';

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const base = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const dbUrl = env.SUPABASE_DB_URL;
if (!base || !key || !dbUrl) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, the publishable key and');
  console.error('SUPABASE_DB_URL in apps/web/.env.local.');
  process.exit(1);
}

const sql = async (text, values = []) => {
  const c = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    return await c.query(text, values);
  } finally {
    await c.end();
  }
};

if (process.argv.includes('--delete')) {
  // The cascade from auth.users clears settings, clients, projects, entries.
  const r = await sql('delete from auth.users where email = $1', [EMAIL]);
  console.log(r.rowCount ? `Deleted ${EMAIL}.` : `${EMAIL} did not exist.`);
  process.exit(0);
}

const post = (path, body) =>
  fetch(`${base}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// Signup is idempotent enough for this purpose: an existing user comes back as
// a 4xx we can ignore, because the sign-in below is the real check.
const signup = await post('signup', { email: EMAIL, password: PASSWORD });
if (!signup.ok) {
  const body = await signup.json().catch(() => ({}));
  const already = /already|exists|registered/i.test(JSON.stringify(body));
  if (!already) {
    console.error('Signup failed:', signup.status, JSON.stringify(body));
    console.error(
      '\nIf this says signups are disabled, enable them in Supabase ->\n' +
        'Authentication -> Sign In / Providers, or use a service-role key.',
    );
    process.exit(1);
  }
}

/* Clicking the emailed link is what sets this; there is no link to click
   here. Without a confirmed address GoTrue refuses the password grant. */
await sql(
  `update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmed_at       = coalesce(confirmed_at, now())
    where email = $1`,
  [EMAIL],
).catch(async (e) => {
  // `confirmed_at` is generated in some versions; retry without it.
  if (!/generated|cannot be updated/i.test(e.message)) throw e;
  await sql(
    `update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now())
      where email = $1`,
    [EMAIL],
  );
});

const signin = await post('token?grant_type=password', {
  email: EMAIL,
  password: PASSWORD,
});
if (!signin.ok) {
  console.error('Sign-in failed:', signin.status, await signin.text());
  process.exit(1);
}
const session = await signin.json();

const { rows } = await sql('select id from auth.users where email = $1', [
  EMAIL,
]);

console.log(
  JSON.stringify(
    {
      email: EMAIL,
      password: PASSWORD,
      userId: rows[0]?.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    },
    null,
    2,
  ),
);
