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
    return { userId: await verify(db, 'Invalid or expired token'), db };
  }

  const db = await cookieClient();
  return { userId: await verify(db, 'Not signed in'), db };
}

/**
 * Establish who the caller is, from the JWT's own signature.
 *
 * `getClaims()` rather than `getUser()`: with asymmetric signing keys (the
 * default for new projects) it verifies the ES256 signature locally against
 * a cached JWKS, so identity costs no network round-trip. `getUser()` calls
 * the Auth server on *every* request — and this runs before every route, on
 * a timer that reconciles each minute across three clients.
 *
 * It is never worse: on a project still using a symmetric secret it falls
 * back to a server call, exactly what `getUser()` would have done.
 *
 * `getSession()` would be wrong here. It reads the cookie without
 * revalidating, and a cookie is forgeable — it must never gate authorization
 * on the server.
 */
async function verify(db: SupabaseClient, message: string): Promise<string> {
  const { data, error } = await db.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) {
    throw new ApiError('UNAUTHORIZED', message);
  }
  return sub;
}
