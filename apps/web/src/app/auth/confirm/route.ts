import { NextResponse } from 'next/server';
import { cookieClient } from '@/lib/supabase';

/**
 * Invite landing. Verifies the emailed token hash into a cookie session and
 * redirects home.
 *
 * Not `/auth/callback`: that route's PKCE exchange needs the verifier the
 * sign-in form leaves in the browser, and an invite is sent from the
 * dashboard, so no browser holds one (`supabase/templates/invite.html`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');

  if (!tokenHash) {
    return NextResponse.redirect(
      new URL('/signin?error=missing_code', url.origin),
    );
  }

  const db = await cookieClient();
  const { error } = await db.auth.verifyOtp({
    type: 'invite',
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(
      new URL('/signin?error=invalid_link', url.origin),
    );
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
