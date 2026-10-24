import { NextResponse } from 'next/server';
import { cookieClient } from '@/lib/supabase';

/**
 * Magic-link and invite landing. Either becomes a cookie session, then home.
 *
 * A magic link brings a PKCE `code`, matched by the verifier the sign-in form
 * left in this browser. An invite is sent from the dashboard, so no browser
 * holds a verifier: its email brings a `token_hash` the server verifies
 * instead (`supabase/templates/invite.html`).
 *
 * `/` is the app's own root here: auth lives on the app subdomain, where the
 * marketing page is not routed at all.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');

  if (!code && !tokenHash) {
    return NextResponse.redirect(
      new URL('/signin?error=missing_code', url.origin),
    );
  }

  const db = await cookieClient();
  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : await db.auth.verifyOtp({ type: 'invite', token_hash: tokenHash! });

  if (error) {
    return NextResponse.redirect(
      new URL('/signin?error=invalid_link', url.origin),
    );
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
