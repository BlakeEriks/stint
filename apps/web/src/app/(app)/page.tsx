import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase';
import { Home } from '@/components/home';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const db = await cookieClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect('/signin');

  return <Home />;
}
