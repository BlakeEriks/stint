#!/usr/bin/env node
/**
 * Invite someone to Stint, which is invite-only (`docs/setup.md`).
 *
 *   pnpm invite friend@example.com           # production
 *   pnpm invite friend@example.com --local   # the local stack, into Mailpit
 *
 * Production's URL and secret key come from the Keychain, never a file —
 * the secret key bypasses RLS, like the production database string. Store
 * them once:
 *
 *   security add-generic-password -s dev.stint.prod-supabase-url -a stint -w https://<ref>.supabase.co
 *   security add-generic-password -s dev.stint.prod-supabase-secret -a stint -w sb_secret_...
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const local = args.includes('--local');
const email = args.find((a) => !a.startsWith('--'));

if (!email?.includes('@')) {
  console.error('usage: pnpm invite <email> [--local]');
  process.exit(1);
}

const out = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

function keychain(service) {
  try {
    return out('security', ['find-generic-password', '-s', service, '-w']);
  } catch {
    console.error(`No ${service} in the Keychain. Add it once:

  security add-generic-password -s ${service} -a stint -w <value>

See the top of scripts/invite.mjs.`);
    process.exit(1);
  }
}

function localStack() {
  const env = Object.fromEntries(
    out('pnpm', ['exec', 'supabase', 'status', '-o', 'env'])
      .split('\n')
      .map((line) => line.match(/^(\w+)="(.*)"$/)?.slice(1))
      .filter(Boolean),
  );
  return { url: env.API_URL, secret: env.SECRET_KEY };
}

const { url, secret } = local
  ? localStack()
  : {
      url: keychain('dev.stint.prod-supabase-url'),
      secret: keychain('dev.stint.prod-supabase-secret'),
    };

/* The invite link lands on the sign-in page, not `/auth/callback`: GoTrue's
   invite link uses the implicit flow, which the callback doesn't handle. The
   account exists by then, so the normal magic link signs them in. */
const app = local ? 'http://localhost:3100' : 'https://app.runstint.com';

// `auth.admin.inviteUserByEmail`, without installing supabase-js here.
// GoTrue reads the redirect from the query string, as supabase-js sends it.
const redirect = encodeURIComponent(`${app}/signin`);
const res = await fetch(`${url}/auth/v1/invite?redirect_to=${redirect}`, {
  method: 'POST',
  headers: {
    apikey: secret,
    authorization: `Bearer ${secret}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ email }),
});
const body = await res.json();

if (res.ok) {
  console.log(`Invited ${email}.`);
} else if (body.error_code === 'email_exists') {
  console.log(`${email} already has an account.`);
} else {
  console.error(
    `Invite failed (${res.status}): ${body.msg ?? JSON.stringify(body)}`,
  );
  process.exit(1);
}
