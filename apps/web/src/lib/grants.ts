import type { ConnectedApp } from '@stint/schema';
import { ApiError } from './errors';

interface Grant {
  client: { id: string; name: string };
  granted_at: string;
}

/**
 * Auth's grants API with the user's own token, which
 * `auth.oauth.listGrants()` can't take: it needs a stored session, and a
 * bearer caller never has one.
 */
function grants(token: string, query = '', method = 'GET') {
  return fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user/oauth/grants${query}`,
    {
      method,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        authorization: `Bearer ${token}`,
      },
    },
  );
}

export async function listApps(token: string): Promise<ConnectedApp[]> {
  const res = await grants(token);
  if (!res.ok) throw new Error(`Auth refused the grants list: ${res.status}`);
  return ((await res.json()) as Grant[]).map((g) => ({
    clientId: g.client.id,
    name: g.client.name,
    grantedAt: g.granted_at,
  }));
}

export async function revokeApp(token: string, clientId: string) {
  const res = await grants(
    token,
    `?client_id=${encodeURIComponent(clientId)}`,
    'DELETE',
  );
  if (res.status === 404 || res.status === 400) {
    throw new ApiError('ENTRY_NOT_FOUND', 'No connected app with that id');
  }
  if (!res.ok) throw new Error(`Auth refused the revoke: ${res.status}`);
}
