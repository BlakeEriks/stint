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
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) {
      throw new ApiError('UNAUTHORIZED', 'Invalid or expired token');
    }
    return { userId: data.user.id, db };
  }

  const db = await cookieClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    throw new ApiError('UNAUTHORIZED', 'Not signed in');
  }
  return { userId: data.user.id, db };
}
