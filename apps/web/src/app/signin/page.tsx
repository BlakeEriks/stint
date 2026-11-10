import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase';
import { SignInForm } from '@/components/signin-form';

export const dynamic = 'force-dynamic';

/**
 * Signing in is for people who are not signed in.
 *
 * Redirecting a live session away keeps two sign-ins from competing for one
 * PKCE verifier, which makes valid magic links fail. It also makes the local
 * `signOut` in the form safe: it can only run with no session to lose.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; next?: string }>;
}) {
  const { error, deleted, next } = await searchParams;

  const db = await cookieClient();
  const { data } = await db.auth.getClaims();
  if (data?.claims?.sub) redirect('/');

  return (
    <SignInForm
      error={error}
      deleted={deleted != null}
      captchaSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      next={next}
    />
  );
}
