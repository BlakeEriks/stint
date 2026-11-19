import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase';
import { SignInForm } from '@/components/signin-form';

export const dynamic = 'force-dynamic';

/** Signing in is for people who are not signed in: a live session goes home. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; next?: string }>;
}) {
  const { error, deleted, next } = await searchParams;

  const db = await cookieClient();
  const { data } = await db.auth.getClaims();
  if (data?.claims?.sub) redirect('/');

  return <SignInForm error={error} deleted={deleted != null} next={next} />;
}
