#!/usr/bin/env node
/**
 * Invite someone to Stint, which is invite-only (`docs/setup.md`).
 *
 *   pnpm invite friend@example.com           # production
 *   pnpm invite friend@example.com --local   # the local stack, into Mailpit
 */
import { keychain, localStack } from './keys.mjs';

const args = process.argv.slice(2);
const local = args.includes('--local');
const email = args.find((a) => !a.startsWith('--'));

if (!email?.includes('@')) {
  console.error('usage: pnpm invite <email> [--local]');
  process.exit(1);
}

const HINT = 'docs/setup.md §4b has both values.';

const { url, secret } = local
  ? localStack()
  : {
      url: keychain('dev.stint.prod-supabase-url', HINT),
      secret: keychain('dev.stint.prod-supabase-secret', HINT),
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
