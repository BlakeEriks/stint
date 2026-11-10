import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { ConsentForm } from '@/components/consent-form';
import { Providers } from '@/components/providers';
import { cookieClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Where Supabase's OAuth server sends a user to approve an app
 * (`authorization_url_path` in `supabase/config.toml`).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: id = '' } = await searchParams;
  const db = await cookieClient();

  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) {
    const here = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;
    redirect(`/signin?next=${encodeURIComponent(here)}`);
  }

  const { data, error } = id
    ? await db.auth.oauth.getAuthorizationDetails(id)
    : { data: null, error: null };
  // Auth refusing the id is an unusable link; Auth unreachable is a failure.
  if (isAuthRetryableFetchError(error)) throw error;
  // An app approved before comes back with where to send the browser.
  if (data && 'redirect_url' in data) redirect(data.redirect_url);

  // The form writes through the Query cache, which only the app shell mounts.
  return (
    <Providers persist={false}>
      <ConsentForm
        authorizationId={id}
        app={data?.client.name ?? null}
        email={String(claims.claims.email ?? '')}
      />
    </Providers>
  );
}
