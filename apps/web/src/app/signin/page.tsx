import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase';
import { SignInForm } from '@/components/signin-form';

export const dynamic = 'force-dynamic';

/**
 * Signing in is for people who are not signed in.
 *
 * Reaching this page with a live session used to render the form anyway, which
 * is how two sign-ins ended up competing for one PKCE verifier — the bug that
 * made valid magic links fail. Redirecting also makes the local `signOut` in
 * the form safe: it can only run when there is no session to lose.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const db = await cookieClient();
  const { data } = await db.auth.getClaims();
  if (data?.claims?.sub) redirect('/');

  const { error } = await searchParams;
  return <SignInForm error={error} />;
}
