import { NextResponse } from 'next/server';
import { cookieClient } from '@/lib/supabase';
import { sameOriginURL } from '@/lib/preview';

/**
 * Sign-in link landing. Turns the emailed token into a cookie session and
 * redirects to `next` on this site, or home.
 *
 * The token hash is verified here, so the link works in any browser: nothing
 * the browser that asked for it stored is needed.
 *
 * `/` is the app's own root here: auth lives on the app subdomain, where the
 * marketing page is not routed at all.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  if (tokenHash === null) return fromVerify(url);

  const db = await cookieClient();
  const { error } = await db.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  });
  return land(url, !error);
}

/**
 * The landing of an email whose link is `{{ .ConfirmationURL }}`: it goes
 * through GoTrue's `/verify` first and arrives with a PKCE code, or with
 * `error` when the link was spent. A hosted project's templates are pasted
 * by hand (`docs/setup.md` §5), so one can still send that link.
 */
async function fromVerify(url: URL) {
  const code = url.searchParams.get('code');
  if (!code) {
    const reason = url.searchParams.has('error')
      ? 'invalid_link'
      : 'missing_code';
    return NextResponse.redirect(
      new URL(`/signin?error=${reason}`, url.origin),
    );
  }

  const db = await cookieClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  return land(url, !error);
}

function land(url: URL, signedIn: boolean) {
  return NextResponse.redirect(
    signedIn
      ? sameOriginURL(url.searchParams.get('next'), url.origin)
      : new URL('/signin?error=invalid_link', url.origin),
  );
}
