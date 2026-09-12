import { NextResponse } from 'next/server';
import { cookieClient } from '@/lib/supabase';

/**
 * Magic-link landing. Exchanges the one-time code for a cookie session and
 * redirects home.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(
      new URL('/signin?error=missing_code', url.origin),
    );
  }

  const db = await cookieClient();
  const { error } = await db.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL('/signin?error=invalid_link', url.origin),
    );
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
