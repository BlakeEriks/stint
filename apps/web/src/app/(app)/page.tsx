import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase';
import { Home } from '@/components/home';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const db = await cookieClient();
  // getClaims verifies the JWT signature locally; getUser would call the
  // Auth server on every render of the most-visited page in the app.
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect('/signin');

  return <Home />;
}
