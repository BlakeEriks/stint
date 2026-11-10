import { ApiError } from './errors';

/**
 * The apps a user approved through Supabase's OAuth server, read and
 * revoked through Auth's REST API with the user's own token.
 * `auth.oauth.listGrants()` would need a stored session, which a bearer
 * caller never has.
 */
export interface ConnectedApp {
  clientId: string;
  name: string;
  grantedAt: string;
}

interface Grant {
  client: { id: string; name: string };
  granted_at: string;
}

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
