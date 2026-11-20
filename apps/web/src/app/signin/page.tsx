import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase';
import { SignInForm } from '@/components/signin-form';

type Props = {
  searchParams: Promise<{ error?: string; deleted?: string; next?: string }>;
};

/* Reached by a full load, never a prefetched link, so the form streams in
   the same response and there is nothing to show before it. */
export default function Page({ searchParams }: Props) {
  return (
    <Suspense>
      <SignIn searchParams={searchParams} />
    </Suspense>
  );
}

/** Signing in is for people who are not signed in: a live session goes home. */
async function SignIn({ searchParams }: Props) {
  const { error, deleted, next } = await searchParams;

  const db = await cookieClient();
  const { data } = await db.auth.getClaims();
  if (data?.claims?.sub) redirect('/');

  return <SignInForm error={error} deleted={deleted != null} next={next} />;
}
