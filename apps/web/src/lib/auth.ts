import type { SupabaseClient } from '@supabase/supabase-js';
import { cookieClient, bearerClient } from './supabase';
import { ApiError } from './errors';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

export interface Session {
  userId: string;
  db: SupabaseClient;
}

/**
 * Resolves the caller from either a bearer token (Expo, macOS) or a cookie
 * session (web). Both paths end up with an RLS-scoped client, so downstream
 * queries cannot reach another user's rows even if a filter is forgotten.
 */
export async function requireSession(req: Request): Promise<Session> {
  // Test seam: integration tests inject a query-builder backed by a real
  // Postgres instance, so the handlers below are the ones that ship.
  const injected = (globalThis as { __TEST_DB__?: unknown }).__TEST_DB__;
  if (injected) {
    return { userId: TEST_USER_ID, db: injected as SupabaseClient };
  }

  const header = req.headers.get('authorization');

  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    const db = bearerClient(token);
    // The token must be passed EXPLICITLY — see verify().
    return { userId: await verify(db, 'Invalid or expired token', token), db };
  }

  const db = await cookieClient();
  return { userId: await verify(db, 'Not signed in'), db };
}

/**
 * Establish who the caller is, from the JWT's own signature.
 *
 * `getClaims()` verifies the ES256 signature locally against a cached JWKS,
 * so identity costs no round-trip; `getUser()` calls the Auth server on
 * *every* request, and this runs before every route. On a project still
 * using a symmetric secret it falls back to that same server call.
 *
 * `getSession()` would be wrong: it reads the cookie without revalidating,
 * and a cookie is forgeable.
 *
 * `token` MUST be passed for the bearer path. `getClaims()` reads the stored
 * session, not the `Authorization` header that `bearerClient` sets via
 * `global.headers` — with no stored session it returns `{ data: null, error:
 * null }`, so the call *succeeds* while yielding no claims and every bearer
 * request 401s. Nothing raises, and the route tests inject `__TEST_DB__` and
 * never take this path.
 */
async function verify(
  db: SupabaseClient,
  message: string,
  token?: string,
): Promise<string> {
  const { data, error } = await db.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub) {
    throw new ApiError('UNAUTHORIZED', message);
  }
  return sub;
}
